"""Authentication and role-based access control.

Passwords are hashed with PBKDF2-HMAC-SHA256 (stdlib). Access tokens are signed
HS256 JWTs carrying the username and role with a hard expiry. The role used for
authorization is always re-read from the user store, so a role change or account
deactivation takes effect without waiting for token expiry.

There is no default user and no default role: a request without a valid bearer
token is rejected with 401, and a valid user without the required role with 403.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Callable

import jwt
from fastapi import Depends, HTTPException, Query, Request, status

logger = logging.getLogger("auth")

PBKDF2_ITERATIONS = 310_000
JWT_ALGORITHM = "HS256"


class Role(str, Enum):
    ADMIN = "admin"
    HR = "hr"
    FINANCE = "finance"
    IT = "it"
    SECURITY = "security"
    COMPLIANCE = "compliance"
    VIEWER = "viewer"


ALL_ROLES = {r.value for r in Role}

# Roles allowed to decide an approval, keyed by the approval action. Admin is
# deliberately absent: system administration does not imply the authority to
# approve salary, privileged access or compliance exceptions.
APPROVAL_ROLES: dict[str, set[str]] = {
    "send_education_verification": {"hr"},
    "send_employment_verification": {"hr"},
    "education_discrepancy_review": {"hr"},
    "employment_discrepancy_review": {"hr"},
    "approve_salary_structure": {"finance"},
    "finalize_salary_profile": {"finance"},
    "finalize_payroll_profile": {"finance"},
    "request_privileged_access": {"security"},
    "compliance_exception": {"compliance"},
    "equipment_substitution": {"it", "hr"},
    "final_onboarding_approval": {"hr"},
    "send_welcome_email": {"hr"},
}
DEFAULT_APPROVAL_ROLES = {"hr"}


def approval_roles_for(action: str) -> set[str]:
    return APPROVAL_ROLES.get(action, DEFAULT_APPROVAL_ROLES)


# --- Passwords ---

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt_hex, digest_hex = stored.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
    except ValueError:
        return False
    return hmac.compare_digest(candidate.hex(), digest_hex)


# Cost-equivalent hash used when the username is unknown (see login).
DUMMY_PASSWORD_HASH = hash_password(secrets.token_urlsafe(16))

STREAM_AUDIENCE = "workflow-stream"
STREAM_TICKET_TTL = timedelta(seconds=60)


# --- Tokens ---

_generated_secret: str | None = None


def _jwt_secret() -> str:
    global _generated_secret
    secret = os.getenv("JWT_SECRET")
    if secret:
        return secret
    if _generated_secret is None:
        _generated_secret = secrets.token_urlsafe(48)
        logger.warning("JWT_SECRET is not set; using an ephemeral secret. Tokens will not survive a restart.")
    return _generated_secret


def token_ttl() -> timedelta:
    return timedelta(minutes=int(os.getenv("AUTH_TOKEN_TTL_MINUTES", "60")))


def create_access_token(username: str, role: str, ttl: timedelta | None = None) -> tuple[str, datetime]:
    expires = datetime.now(timezone.utc) + (ttl if ttl is not None else token_ttl())
    token = jwt.encode(
        {"sub": username, "role": role, "exp": expires, "iat": datetime.now(timezone.utc)},
        _jwt_secret(),
        algorithm=JWT_ALGORITHM,
    )
    return token, expires


def decode_access_token(token: str) -> dict:
    # No audience is accepted here, so stream tickets (which carry one) are rejected.
    return jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM], options={"require": ["exp", "sub"]})


def create_stream_ticket(username: str, workflow_id: str) -> tuple[str, datetime]:
    expires = datetime.now(timezone.utc) + STREAM_TICKET_TTL
    ticket = jwt.encode(
        {"sub": username, "wid": workflow_id, "aud": STREAM_AUDIENCE, "exp": expires},
        _jwt_secret(),
        algorithm=JWT_ALGORITHM,
    )
    return ticket, expires


def decode_stream_ticket(ticket: str) -> dict:
    return jwt.decode(
        ticket, _jwt_secret(), algorithms=[JWT_ALGORITHM], audience=STREAM_AUDIENCE,
        options={"require": ["exp", "sub", "aud", "wid"]},
    )


# --- Request dependencies ---

@dataclass(frozen=True)
class CurrentUser:
    username: str
    role: str
    full_name: str
    stream_workflow_id: str | None = None


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _resolve_user(token: str | None) -> CurrentUser:
    # Imported lazily: app.api owns the service singleton and imports this module.
    from app.api import get_service

    if not token:
        raise _unauthorized("Authentication required")
    try:
        claims = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Token has expired")
    except jwt.InvalidTokenError:
        raise _unauthorized("Invalid token")
    return _resolve_user_by_name(claims["sub"])


def _resolve_user_by_name(username: str) -> CurrentUser:
    from app.api import get_service

    try:
        user = get_service().state.user(username)
    except KeyError:
        raise _unauthorized("Unknown user")
    if not user["is_active"]:
        raise _unauthorized("User is deactivated")
    return CurrentUser(user["username"], user["role"], user["full_name"])


def get_current_user(request: Request) -> CurrentUser:
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    return _resolve_user(token if scheme.lower() == "bearer" else None)


def get_current_user_for_stream(request: Request, ticket: str | None = Query(default=None)) -> CurrentUser:
    """Bearer header, or a short-lived workflow-scoped ticket (EventSource cannot set headers)."""
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() == "bearer" and token:
        return _resolve_user(token)
    if not ticket:
        raise _unauthorized("Authentication required")
    try:
        claims = decode_stream_ticket(ticket)
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Stream ticket has expired")
    except jwt.InvalidTokenError:
        raise _unauthorized("Invalid stream ticket")
    user = _resolve_user_by_name(claims["sub"])
    return CurrentUser(user.username, user.role, user.full_name, stream_workflow_id=claims["wid"])


def require_roles(*roles: Role) -> Callable[..., CurrentUser]:
    allowed = {r.value for r in roles}

    def dependency(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role}' is not permitted to perform this operation",
            )
        return user

    return dependency


def allowed_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [o.strip() for o in raw.split(",") if o.strip() and o.strip() != "*"]


def bootstrap_admin(state) -> None:
    """Create the first admin from ADMIN_USERNAME / ADMIN_PASSWORD if no users exist."""
    username, password = os.getenv("ADMIN_USERNAME"), os.getenv("ADMIN_PASSWORD")
    if not username or not password or state.list_users():
        return
    state.create_user(username, hash_password(password), Role.ADMIN.value, "System Administrator")
    logger.info("Bootstrapped initial admin user '%s'", username)
