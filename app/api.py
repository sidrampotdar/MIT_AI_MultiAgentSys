"""Enterprise Autonomous Onboarding & Verification System FastAPI Application.

Exposes the complete AI pipeline, multi-agent dispatcher, planner, tool registry,
deterministic salary engine, red-flag engine, recovery manager, approval gatekeeper,
and SSE event stream.
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Literal
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.responses import StreamingResponse

from app.auth import (
    ALL_ROLES,
    CurrentUser,
    Role,
    allowed_origins,
    approval_roles_for,
    bootstrap_admin,
    create_access_token,
    get_current_user,
    get_current_user_for_stream,
    DUMMY_PASSWORD_HASH,
    create_stream_ticket,
    hash_password,
    require_roles,
    verify_password,
)
from app.core.llm import Message, create_provider
from app.core.salary import SalaryCalculationEngine
from app import views
from app.core.contacts import directory, employer_contact, institution_contact
from app.core.service import OnboardingService, default_employee
from app.models.enums import RedFlagCategory, RedFlagSeverity
from app.models.schemas import AppBaseModel


# --- Request & Response Schemas ---

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class OnboardPayload(AppBaseModel):
    goal: str = "Complete employee onboarding with controlled approvals."
    objective: str = ""
    name: str = Field(min_length=1)
    email: str = Field(pattern=EMAIL_PATTERN)
    phone: str = ""
    department: str = "Engineering"
    designation: str = "Software Engineer"
    reporting_manager: str = ""
    joining_date: str | None = None
    employment_type: str = "full_time"
    annual_ctc: int = Field(default=1_200_000, gt=0)
    laptop_available: bool = True
    missing_documents: list[str] = Field(default_factory=list)
    university: str = "ABC Engineering College"
    enrollment_number: str = "SYN-2020-1045"
    degree: str = "BTech"
    branch: str = "Computer Science Engineering"
    graduation_year: int = 2024
    previous_employer: str = ""
    previous_designation: str = ""
    employment_dates: str = ""
    consent_to_verify: bool = True
    privileged_access_role: str = ""


class ApprovalPayload(AppBaseModel):
    """Reviewer identity is never accepted from the client; it comes from the access token."""

    comment: str = ""


class LoginPayload(AppBaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class UserCreatePayload(AppBaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8)
    role: str
    full_name: str = Field(min_length=1)


class UserUpdatePayload(AppBaseModel):
    role: str | None = None
    is_active: bool | None = None


class ReplanPayload(AppBaseModel):
    reason: str = "Adjust workflow based on updated verification requirements."


class LLMTestPayload(AppBaseModel):
    provider: Literal["groq", "gemini", "offline"] = "offline"
    prompt: str = "Say hello in 3 words"
    system_message: str = "You are an enterprise AI assistant."


class EmployeeCreatePayload(AppBaseModel):
    first_name: str
    last_name: str
    email: str = Field(pattern=EMAIL_PATTERN)
    phone: str = ""
    department: str = "Engineering"
    designation: str = "Software Engineer"
    reporting_manager: str = ""
    joining_date: str | None = None
    employment_type: str = "full_time"
    annual_ctc: int = Field(default=1_200_000, gt=0)
    location: str = "Bengaluru"
    university: str = ""
    degree: str = ""
    branch: str = ""
    graduation_year: int | None = None
    previous_employer: str = ""
    previous_designation: str = ""
    employment_dates: str = ""


class EmployeeUpdatePayload(AppBaseModel):
    first_name: str | None = None
    last_name: str | None = None
    department: str | None = None
    designation: str | None = None
    annual_ctc: int | None = None
    location: str | None = None


class SalaryCalculatePayload(AppBaseModel):
    annual_ctc: int = Field(gt=0)
    designation: str = "Software Engineer"
    tax_regime: str = "new"
    allow_grade_override: bool = False


class SalaryValidatePayload(AppBaseModel):
    structure: dict[str, Any]
    approved_ctc: int


class PayrollPreparePayload(AppBaseModel):
    workflow_id: str
    employee_email: str
    annual_ctc: int


class EmailDraftPayload(AppBaseModel):
    workflow_id: str
    recipient: str
    subject: str
    body: str
    purpose: str


class MockEmailReplyPayload(AppBaseModel):
    workflow_id: str
    kind: Literal["education", "employment"] = "education"
    sender: str = ""
    subject: str = ""
    body: str = ""
    outcome: str = "confirmed"


class WorkflowEmployeeUpdatePayload(AppBaseModel):
    annual_ctc: int | None = Field(default=None, gt=0)
    designation: str | None = None
    department: str | None = None
    reporting_manager: str | None = None
    joining_date: str | None = None
    university: str | None = None
    degree: str | None = None
    branch: str | None = None
    graduation_year: int | None = None
    enrollment_number: str | None = None
    previous_employer: str | None = None
    previous_designation: str | None = None
    employment_dates: str | None = None


class CorrectionPayload(AppBaseModel):
    reason: str = Field(min_length=3)


class EducationVerificationPayload(AppBaseModel):
    workflow_id: str
    candidate_name: str
    institution: str
    enrollment_number: str
    degree: str
    branch: str
    graduation_year: int


class EmploymentVerificationPayload(AppBaseModel):
    workflow_id: str
    candidate_name: str
    previous_employer: str
    designation: str
    employment_dates: str


class RedFlagResolvePayload(AppBaseModel):
    """Resolver identity comes from the access token, never from the request body."""

    resolution_comment: str = Field(min_length=3)


# --- Service Dependency ---

_global_service: OnboardingService | None = None


def get_service(_user: CurrentUser = Depends(get_current_user)) -> OnboardingService:
    global _global_service
    db_path = os.getenv("WORKFLOW_DATABASE", "enterprise_onboarding.db")
    provider_name = os.getenv("LLM_PROVIDER", "groq")
    if _global_service is None or _global_service.state.path != str(db_path):
        _global_service = OnboardingService(db_path, provider_name)
    return _global_service


# --- Application Lifecycle ---

@asynccontextmanager
async def lifespan(app: FastAPI):
    bootstrap_admin(get_service().state)
    yield


app = FastAPI(
    title="Enterprise Autonomous Onboarding & Verification System API",
    description="Multi-agent AI pipeline orchestrating HR, IT, Finance, Compliance, and Background Verifications.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Last-Event-ID"],
)


def _workflow_or_404(service: OnboardingService, workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    try:
        return service.status(workflow_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ============================================================================
# 0. Authentication and User Management
# ============================================================================

@app.post("/api/auth/login", tags=["0. Auth"])
def login_api(payload: LoginPayload) -> dict[str, Any]:
    service = get_service()
    try:
        user = service.state.user(payload.username)
    except KeyError:
        user = None
    # Always pay for one password hash so response time does not reveal whether the
    # account exists or is active; unknown, inactive and wrong-password look identical.
    password_ok = verify_password(payload.password, user["password_hash"] if user else DUMMY_PASSWORD_HASH)
    if not user or not user["is_active"] or not password_ok:
        raise HTTPException(status_code=401, detail="Invalid username or password", headers={"WWW-Authenticate": "Bearer"})
    token, expires = create_access_token(user["username"], user["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expires.isoformat(),
        "user": {"username": user["username"], "role": user["role"], "full_name": user["full_name"]},
    }


@app.post("/api/auth/stream-ticket", tags=["0. Auth"])
def stream_ticket_api(workflow_id: str = Query(...), user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """Short-lived ticket for EventSource, which cannot send an Authorization header.

    The ticket is scoped to one workflow and ~60 seconds and is rejected by every
    other endpoint, so the long-lived access token never appears in a URL.
    """
    _workflow_or_404(get_service(), workflow_id)
    ticket, expires = create_stream_ticket(user.username, workflow_id)
    return {"ticket": ticket, "expires_at": expires.isoformat()}


@app.get("/api/auth/me", tags=["0. Auth"])
def me_api(user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return {"username": user.username, "role": user.role, "full_name": user.full_name}


def _public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {k: user[k] for k in ("username", "role", "full_name", "is_active", "created_at")}


@app.get("/api/users", tags=["0. Auth"])
def list_users_api(_user: CurrentUser = Depends(require_roles(Role.ADMIN))) -> list[dict[str, Any]]:
    return [_public_user(u) for u in get_service().state.list_users()]


@app.post("/api/users", status_code=201, tags=["0. Auth"])
def create_user_api(payload: UserCreatePayload, _user: CurrentUser = Depends(require_roles(Role.ADMIN))) -> dict[str, Any]:
    if payload.role not in ALL_ROLES:
        raise HTTPException(status_code=422, detail=f"Unknown role '{payload.role}'")
    try:
        return _public_user(get_service().state.create_user(
            payload.username, hash_password(payload.password), payload.role, payload.full_name
        ))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.patch("/api/users/{username}", tags=["0. Auth"])
def update_user_api(username: str, payload: UserUpdatePayload, admin: CurrentUser = Depends(require_roles(Role.ADMIN))) -> dict[str, Any]:
    if payload.role is not None and payload.role not in ALL_ROLES:
        raise HTTPException(status_code=422, detail=f"Unknown role '{payload.role}'")
    if username == admin.username and (payload.is_active is False or (payload.role and payload.role != Role.ADMIN.value)):
        raise HTTPException(status_code=409, detail="Admins cannot demote or deactivate themselves")
    try:
        return _public_user(get_service().state.update_user(username, payload.role, payload.is_active))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


# ============================================================================
# A. System and LLM APIs
# ============================================================================

@app.get("/health", tags=["A. System"])
@app.get("/api/health", tags=["A. System"])
def health() -> dict[str, str]:
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/api/system/info", tags=["A. System"])
def system_info(_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    service = get_service()
    return {
        "system": "Enterprise Autonomous Onboarding System",
        "version": "2.0.0",
        "primary_provider": getattr(service.provider, "model", "configured"),
        "database_backend": "SQLite (Persistent)",
        "registered_agents_count": len(service.agents()),
        "registered_tools_count": len(service.registry.list_tools()),
    }


@app.get("/api/llm/providers", tags=["A. System"])
def llm_providers(_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "providers": [
            {"id": "groq", "name": "Groq LPU", "description": "High-throughput inference"},
            {"id": "gemini", "name": "Google Gemini API", "description": "Multimodal structured reasoning"},
            {"id": "offline", "name": "Deterministic Offline Provider", "description": "Zero-network rule-based provider for hermetic testing"},
        ],
        "default": os.getenv("LLM_PROVIDER", "groq"),
    }


@app.get("/api/llm/models", tags=["A. System"])
def llm_models(_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return {
        "gemini": ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"],
        "groq": ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"],
        "offline": ["rule-based"],
    }


@app.post("/api/llm/test", tags=["A. System"])
def llm_test(payload: LLMTestPayload, _user: CurrentUser = Depends(require_roles(Role.ADMIN))) -> dict[str, Any]:
    try:
        provider = create_provider(payload.provider, with_fallback=False)
        messages = [
            Message("system", payload.system_message),
            Message("user", payload.prompt),
        ]
        res = provider.complete(messages)
        return {
            "provider": res.provider,
            "model": res.model,
            "content": res.content,
            "usage": res.usage,
            "latency_ms": round(res.latency_ms, 2),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LLM Test failed: {exc}")


# ============================================================================
# B. Employee APIs
# ============================================================================

@app.post("/api/employees", status_code=201, tags=["B. Employees"])
def create_employee_api(payload: EmployeeCreatePayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    try:
        return service.state.create_employee_record(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


@app.get("/api/employees", tags=["B. Employees"])
def list_employees_api(_user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    return get_service().state.list_employees()


@app.get("/api/employees/{employee_id}", tags=["B. Employees"])
def get_employee_api(employee_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    try:
        return get_service().state.get_employee_record(employee_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.patch("/api/employees/{employee_id}", tags=["B. Employees"])
def update_employee_api(employee_id: str, payload: EmployeeUpdatePayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    try:
        return get_service().state.update_employee_record(employee_id, updates)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/workflows", status_code=201, tags=["C. Workflows"])
@app.post("/api/workflows/onboarding", status_code=201, tags=["C. Workflows"])
def create_workflow_api(
    payload: OnboardPayload,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", max_length=128),
    _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN)),
) -> dict[str, Any]:
    service = get_service()
    if idempotency_key:
        # A repeated submission (double click, retry) returns the original workflow.
        existing = service.state.request_key_workflow(f"{_user.username}:{idempotency_key}")
        if existing:
            return views.enrich_workflow(service, service.state.workflow(existing))
    emp = default_employee(payload.name, payload.email)
    emp.update(payload.model_dump())
    workflow_id = service.start(payload.goal if not payload.objective else f"{payload.goal} {payload.objective}", emp)
    if idempotency_key:
        service.state.save_request_key(f"{_user.username}:{idempotency_key}", workflow_id)
    return views.enrich_workflow(service, service.state.workflow(workflow_id))


@app.get("/workflows", tags=["C. Workflows"])
@app.get("/api/workflows", tags=["C. Workflows"])
def list_workflows_api(limit: int = Query(default=20, le=100), _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    service = get_service()
    return [views.enrich_workflow(service, w) for w in service.state.list_workflows(limit=limit)]


@app.get("/workflows/{workflow_id}", tags=["C. Workflows"])
@app.get("/api/workflows/{workflow_id}", tags=["C. Workflows"])
def workflow_status_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    service = get_service()
    return views.enrich_workflow(service, _workflow_or_404(service, workflow_id))


@app.get("/api/workflows/{workflow_id}/tasks", tags=["C. Workflows"])
def workflow_tasks_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return service.state.tasks(workflow_id)


@app.get("/api/workflows/{workflow_id}/status", tags=["C. Workflows"])
def workflow_status_summary_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    wf = _workflow_or_404(get_service(), workflow_id)
    tasks = wf.get("tasks", [])
    return {
        "workflow_id": workflow_id,
        "status": wf["status"],
        "total_tasks": len(tasks),
        "completed_tasks": sum(1 for t in tasks if t["status"] == "completed"),
        "pending_tasks": sum(1 for t in tasks if t["status"] == "pending"),
        "waiting_approval_tasks": sum(1 for t in tasks if t["status"] == "waiting_approval"),
        "blocked_tasks": sum(1 for t in tasks if t["status"] in {"blocked", "escalated", "failed"}),
    }


@app.post("/api/workflows/{workflow_id}/pause", tags=["C. Workflows"])
def pause_workflow_api(workflow_id: str, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return service.pause(workflow_id)


@app.post("/workflows/{workflow_id}/resume", tags=["C. Workflows"])
@app.post("/api/workflows/{workflow_id}/resume", tags=["C. Workflows"])
def resume_workflow_api(workflow_id: str, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return views.enrich_workflow(service, service.resume_paused(workflow_id))


@app.post("/api/workflows/{workflow_id}/cancel", tags=["C. Workflows"])
def cancel_workflow_api(workflow_id: str, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return service.cancel(workflow_id)


@app.post("/api/workflows/{workflow_id}/replan", tags=["C. Workflows"])
def replan_workflow_api(workflow_id: str, payload: ReplanPayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return service.replan(workflow_id, reason=payload.reason)


SSE_POLL_SECONDS = float(os.getenv("SSE_POLL_SECONDS", "1.0"))
SSE_HEARTBEAT_SECONDS = float(os.getenv("SSE_HEARTBEAT_SECONDS", "15"))
SSE_RETRY_MS = 3000


def _sse(event: str, data: dict[str, Any], event_id: int | None = None) -> str:
    head = f"id: {event_id}\n" if event_id is not None else ""
    return f"{head}event: {event}\ndata: {json.dumps(data)}\n\n"


async def workflow_event_stream(
    service: OnboardingService,
    workflow_id: str,
    last_event_id: int,
    is_disconnected,
    poll_seconds: float = SSE_POLL_SECONDS,
    heartbeat_seconds: float = SSE_HEARTBEAT_SECONDS,
) -> AsyncGenerator[str, None]:
    """Stream persisted workflow events, resumable from ``last_event_id``.

    Events are read from the durable audit log (sequence = rowid) instead of an
    in-memory subscription, so a reconnecting client resumes without gaps or
    duplicates, nothing is registered that needs cleanup, and the stream lives
    until the client disconnects.
    """
    yield f"retry: {SSE_RETRY_MS}\n" + _sse("connected", {
        "workflow_id": workflow_id,
        "resumed_from": last_event_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    cursor = last_event_id
    idle = 0.0
    while not await is_disconnected():
        events = await asyncio.to_thread(service.state.audit_events_since, workflow_id, cursor)
        if events:
            for event in events:
                cursor = event["seq"]
                yield _sse("workflow.event", event, event["seq"])
            idle = 0.0
            continue
        await asyncio.sleep(poll_seconds)
        idle += poll_seconds
        if idle >= heartbeat_seconds:
            idle = 0.0
            yield ": heartbeat\n\n"


@app.get("/api/workflows/{workflow_id}/events", tags=["C. Workflows"])
async def sse_workflow_events(
    workflow_id: str,
    request: Request,
    last_event_id: int | None = Query(default=None, ge=0),
    _user: CurrentUser = Depends(get_current_user_for_stream),
) -> StreamingResponse:
    if _user.stream_workflow_id not in (None, workflow_id):
        raise HTTPException(status_code=403, detail="Stream ticket is not valid for this workflow")
    """Long-lived, reconnectable Server-Sent Events stream of persisted workflow events."""
    service = get_service()
    _workflow_or_404(service, workflow_id)
    header = request.headers.get("last-event-id", "")
    cursor = last_event_id if last_event_id is not None else (int(header) if header.isdigit() else 0)
    return StreamingResponse(
        workflow_event_stream(service, workflow_id, cursor, request.is_disconnected),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive", "Referrer-Policy": "no-referrer"},
    )


@app.patch("/api/workflows/{workflow_id}/employee", tags=["C. Workflows"])
def update_workflow_employee_api(
    workflow_id: str,
    payload: WorkflowEmployeeUpdatePayload,
    user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN)),
) -> dict[str, Any]:
    """Correct candidate data; pending approvals for the changed parameters become stale."""
    service = get_service()
    _workflow_or_404(service, workflow_id)
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    return views.enrich_workflow(service, service.update_workflow_employee(workflow_id, updates, user.username))


@app.get("/api/workflows/{workflow_id}/agent-activity", tags=["E. Agents"])
def workflow_agent_activity_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return views.agent_activity(service, workflow_id)


@app.get("/api/workflows/{workflow_id}/state", tags=["C. Workflows"])
def workflow_shared_state_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return service.state.get_state(workflow_id)


@app.get("/api/workflows/{workflow_id}/tool-executions", tags=["F. Tools"])
def workflow_tool_executions_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return service.state.list_tool_executions(workflow_id)


@app.get("/api/workflows/{workflow_id}/report", tags=["C. Workflows"])
def workflow_final_report_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return service.final_report(workflow_id)


@app.get("/api/dashboard/summary", tags=["C. Workflows"])
def dashboard_summary_api(_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return views.dashboard(get_service())


@app.get("/api/contacts", tags=["B. Employees"])
def approved_contacts_api(_user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return directory()


# ============================================================================
# D. Planner APIs
# ============================================================================

@app.post("/api/planner/create-plan", tags=["D. Planner"])
def create_plan_api(payload: OnboardPayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    from app.core.planner import Planner
    from app.core.service import PLAN
    service = get_service()
    emp = default_employee(payload.name, payload.email)
    emp.update(payload.model_dump())
    planner = Planner(service.provider, PLAN)
    plan, metadata = planner.create_plan(payload.goal, emp)
    return {"plan": plan, "metadata": metadata}


@app.get("/api/planner/plans/{workflow_id}", tags=["D. Planner"])
def get_workflow_plan_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    wf = _workflow_or_404(get_service(), workflow_id)
    return wf.get("plan", [])


@app.post("/api/planner/replan/{workflow_id}", tags=["D. Planner"])
def replan_plan_api(workflow_id: str, payload: ReplanPayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return service.replan(workflow_id, reason=payload.reason)


# ============================================================================
# E. Agent APIs
# ============================================================================

@app.get("/agents", tags=["E. Agents"])
@app.get("/api/agents", tags=["E. Agents"])
def list_agents_api(_user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    return get_service().dispatcher.list_agents()


@app.get("/api/agents/{agent_name}", tags=["E. Agents"])
def get_agent_api(agent_name: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    agent = get_service().dispatcher.get_agent(agent_name)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
    return {
        "name": agent.name,
        "role": agent.role,
        "responsibilities": agent.responsibilities,
        "allowed_tools": agent.allowed_tools,
    }


@app.get("/api/agents/{agent_name}/status", tags=["E. Agents"])
def get_agent_status_api(agent_name: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    """Registration status only. Live per-workflow activity is /workflows/{id}/agent-activity."""
    agent = get_service().dispatcher.get_agent(agent_name)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
    return {"agent": agent_name, "registered": True}


@app.get("/api/workflows/{workflow_id}/agents", tags=["E. Agents"])
def get_workflow_agents_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    wf = _workflow_or_404(get_service(), workflow_id)
    tasks = wf.get("tasks", [])
    used_agents = {t["agent"] for t in tasks}
    return [
        a for a in get_service().dispatcher.list_agents()
        if a["name"] in used_agents
    ]


@app.get("/api/workflows/{workflow_id}/agent-messages", tags=["E. Agents"])
def get_agent_messages_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return views.agent_messages(service, workflow_id)


# ============================================================================
# F. Tool APIs
# ============================================================================

@app.get("/api/tools", tags=["F. Tools"])
def list_tools_api(_user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    return get_service().registry.list_tools()


@app.get("/api/tools/agents/permissions", tags=["F. Tools"])
def get_tool_permissions_api(_user: CurrentUser = Depends(get_current_user)) -> dict[str, list[str]]:
    service = get_service()
    permissions: dict[str, list[str]] = {}
    for agent in service.agents():
        defs = service.registry.definitions_for(agent)
        permissions[agent] = [d["function"]["name"] for d in defs]
    return permissions


@app.get("/api/tools/{tool_name}", tags=["F. Tools"])
def get_tool_api(tool_name: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    tool = get_service().registry.get_tool(tool_name)
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")
    return {
        "name": tool.name,
        "description": tool.description,
        "allowed_agents": list(tool.allowed_agents),
        "risk_level": tool.risk_level,
        "requires_approval": tool.requires_approval,
        "schema": tool.schema,
    }


# ============================================================================
# G. Education Verification APIs
# ============================================================================

@app.post("/api/verification/education", status_code=201, tags=["G. Education Verification"])
def submit_education_verification_api(payload: EducationVerificationPayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, payload.workflow_id)
    vid = service.state.save_verification(
        workflow_id=payload.workflow_id,
        verification_type="education",
        candidate_name=payload.candidate_name,
        target_entity=payload.institution,
        status="waiting_approval",
        details=payload.model_dump(),
    )
    return service.state.verification(vid)


@app.get("/api/verification/education/{verification_id}", tags=["G. Education Verification"])
def get_education_verification_api(verification_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    try:
        return get_service().state.verification(verification_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/api/verification/education/{verification_id}/process-reply", tags=["G. Education Verification"])
def process_education_reply_api(
    verification_id: str,
    outcome: str = "confirmed",
    _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN)),
) -> dict[str, Any]:
    service = get_service()
    try:
        ver = service.state.verification(verification_id)
        return service.process_education_reply(ver["workflow_id"], outcome=outcome)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


# ============================================================================
# H. Employment Verification APIs
# ============================================================================

@app.post("/api/verification/employment", status_code=201, tags=["H. Employment Verification"])
def submit_employment_verification_api(payload: EmploymentVerificationPayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, payload.workflow_id)
    vid = service.state.save_verification(
        workflow_id=payload.workflow_id,
        verification_type="employment",
        candidate_name=payload.candidate_name,
        target_entity=payload.previous_employer,
        status="waiting_approval",
        details=payload.model_dump(),
    )
    return service.state.verification(vid)


@app.post("/api/verification/employment/{verification_id}/process-reply", tags=["H. Employment Verification"])
def process_employment_reply_api(
    verification_id: str,
    outcome: str = "confirmed",
    _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN)),
) -> dict[str, Any]:
    service = get_service()
    try:
        ver = service.state.verification(verification_id)
        return service.process_employment_reply(ver["workflow_id"], outcome=outcome)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/verification/employment/{verification_id}", tags=["H. Employment Verification"])
def get_employment_verification_api(verification_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    try:
        return get_service().state.verification(verification_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.get("/api/verifications", tags=["G. Education Verification"])
def list_verifications_api(workflow_id: str | None = None, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    service = get_service()
    if workflow_id:
        _workflow_or_404(service, workflow_id)
    return views.verification_views(service, workflow_id)


def _validate_recipient(service: OnboardingService, workflow_id: str, recipient: str) -> None:
    """External messages may only go to approved contacts, internal addresses or the candidate."""
    wanted = recipient.strip().lower()
    candidate = service.state.workflow(workflow_id)["employee"].get("email", "").lower()
    approved = {c["contact"].lower() for c in (*directory_contacts(),)}
    if wanted == candidate or wanted in approved or wanted.endswith("@enterprise.test"):
        return
    raise HTTPException(status_code=422, detail=f"Recipient '{recipient}' is not an approved contact")


def directory_contacts() -> list[dict[str, str]]:
    from app.core import contacts

    return [*contacts.INSTITUTIONS.values(), *contacts.EMPLOYERS.values()]


@app.post("/api/email/drafts", status_code=201, tags=["I. Email"])
def create_email_draft_api(payload: EmailDraftPayload, user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, payload.workflow_id)
    _validate_recipient(service, payload.workflow_id, payload.recipient)
    mid = service.state.save_email_message(
        thread_id=f"THREAD-{payload.workflow_id}",
        workflow_id=payload.workflow_id,
        direction="outbound",
        sender="hr@enterprise.test",
        recipient=payload.recipient,
        subject=payload.subject,
        body=payload.body,
        status="drafted",
        metadata={"purpose": payload.purpose, "requested_by": user.username, "simulated": True, "channel": "simulated"},
    )
    service.request_email_approval(mid, requested_by=user.username)
    return service.state.email_message(mid)


@app.get("/api/email/drafts", tags=["I. Email"])
def list_email_drafts_api(workflow_id: str | None = None, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    """Outgoing messages that have not been sent yet (drafted -> waiting approval -> approved)."""
    unsent = {"draft", "drafted", "waiting_approval", "approved", "rejected"}
    return [m for m in get_service().state.list_email_messages(workflow_id, direction="outbound") if m["status"] in unsent]


@app.get("/api/email/messages", tags=["I. Email"])
def list_email_messages_api(
    workflow_id: str | None = None,
    direction: Literal["inbound", "outbound"] | None = None,
    _user: CurrentUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
    return get_service().state.list_email_messages(workflow_id, direction=direction)


@app.get("/api/email/threads", tags=["I. Email"])
def list_email_threads_api(workflow_id: str | None = None, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    threads: dict[str, list[dict[str, Any]]] = {}
    for m in reversed(get_service().state.list_email_messages(workflow_id)):
        threads.setdefault(m["thread_id"], []).append(m)
    return [{"thread_id": t, "workflow_id": msgs[0]["workflow_id"], "subject": msgs[0]["subject"],
             "messages": msgs, "last_status": msgs[-1]["status"]} for t, msgs in threads.items()]


@app.post("/api/email/drafts/{draft_id}/request-approval", tags=["I. Email"])
def request_email_approval_api(draft_id: str, user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    try:
        msg = service.state.email_message(draft_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if msg["status"] != "drafted":
        raise HTTPException(status_code=409, detail=f"Message is '{msg['status']}', not a draft")
    _validate_recipient(service, msg["workflow_id"], msg["recipient"])
    service.request_email_approval(draft_id, requested_by=user.username)
    return service.state.email_message(draft_id)


@app.get("/api/email/inbox", tags=["I. Email"])
def get_email_inbox_api(workflow_id: str | None = None, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    return get_service().state.list_email_messages(workflow_id, direction="inbound")


@app.get("/api/email/messages/{message_id}", tags=["I. Email"])
def get_email_message_api(message_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    try:
        return get_service().state.email_message(message_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.get("/api/email/threads/{thread_id}", tags=["I. Email"])
def get_email_thread_api(thread_id: str, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    return get_service().state.get_email_thread(thread_id)


@app.post("/api/email/send/{draft_id}", tags=["I. Email"])
def send_email_api(draft_id: str, user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    """Send a message. External sending is only possible after an approved approval."""
    service = get_service()
    try:
        return service.send_approved_email(draft_id, user.username)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/email/mock-replies", status_code=201, tags=["I. Email"])
def inject_mock_reply_api(payload: MockEmailReplyPayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    """Inject a SIMULATED counterparty reply. Replies are untrusted input and are scanned, never executed."""
    service = get_service()
    _workflow_or_404(service, payload.workflow_id)
    handler = service.process_education_reply if payload.kind == "education" else service.process_employment_reply
    try:
        return handler(payload.workflow_id, outcome=payload.outcome, custom_body=payload.body or None)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/email/status/{message_id}", tags=["I. Email"])
def get_email_status_api(message_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    msg = get_service().state.email_message(message_id)
    return {"message_id": message_id, "status": msg["status"], "outcome": msg.get("outcome")}


# ============================================================================
# J. Salary and Finance APIs
# ============================================================================

@app.post("/api/finance/salary/calculate", tags=["J. Finance"])
def calculate_salary_api(payload: SalaryCalculatePayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.FINANCE, Role.ADMIN))) -> dict[str, Any]:
    try:
        res = SalaryCalculationEngine.calculate(
            annual_ctc=payload.annual_ctc,
            designation=payload.designation,
            tax_regime=payload.tax_regime,
            allow_grade_override=payload.allow_grade_override,
        )
        return res.model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@app.get("/api/finance/overview", tags=["J. Finance"])
def finance_overview_api(_user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    service = get_service()
    rows = []
    for wf in service.state.list_workflows(limit=100):
        view = views.finance_view(service, wf["workflow_id"])
        rows.append({
            "workflow_id": view["workflow_id"], "employee": view["employee"], "approved_annual_ctc": view["approved_annual_ctc"],
            "salary_calculation_status": view["salary_calculation_status"],
            "finance_approval_status": (view["finance_approval"] or {}).get("status", "not_requested"),
            "payroll_status": view["payroll"]["status"], "ctc_reconciled": view["validation"]["ctc_reconciled"],
        })
    return rows


@app.get("/api/finance/workflows/{workflow_id}", tags=["J. Finance"])
def finance_workflow_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return views.finance_view(service, workflow_id)


@app.post("/api/finance/workflows/{workflow_id}/request-correction", tags=["J. Finance"])
def request_salary_correction_api(
    workflow_id: str,
    payload: CorrectionPayload,
    user: CurrentUser = Depends(require_roles(Role.FINANCE)),
) -> dict[str, Any]:
    """Reject the pending salary approval with a correction request; HR fixes the data and retries."""
    service = get_service()
    _workflow_or_404(service, workflow_id)
    pending = [a for a in service.state.list_approvals(workflow_id=workflow_id, status="pending") if a["action"] == "finalize_salary_profile"]
    if not pending:
        raise HTTPException(status_code=409, detail="No pending salary approval for this workflow")
    return service.decide_approval(pending[0]["approval_id"], user.username, "rejected", f"Correction requested: {payload.reason}", reviewer_role=user.role)


@app.get("/api/finance/salary/{employee_id}", tags=["J. Finance"])
def get_employee_salary_api(employee_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    try:
        return get_service().state.salary_profile(employee_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/api/finance/salary/validate", tags=["J. Finance"])
def validate_salary_api(payload: SalaryValidatePayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.FINANCE, Role.ADMIN))) -> dict[str, Any]:
    return SalaryCalculationEngine.validate_structure(payload.structure, payload.approved_ctc)


@app.post("/api/finance/payroll/prepare", status_code=201, tags=["J. Finance"])
def prepare_payroll_api(payload: PayrollPreparePayload, _user: CurrentUser = Depends(require_roles(Role.FINANCE, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, payload.workflow_id)
    structure = SalaryCalculationEngine.calculate(payload.annual_ctc, allow_grade_override=True)
    pid = service.state.save_salary_profile(
        workflow_id=payload.workflow_id,
        employee_email=payload.employee_email,
        structure=structure.model_dump(),
        status="pending_approval",
    )
    return service.state.salary_profile(pid)


@app.get("/api/finance/payroll/{employee_id}", tags=["J. Finance"])
def get_payroll_profile_api(employee_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    try:
        return get_service().state.salary_profile(employee_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.get("/api/approvals", tags=["K. Human Approvals"])
def list_approvals_api(
    status: str | None = None,
    workflow_id: str | None = None,
    _user: CurrentUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
    service = get_service()
    return [views.approval_view(service, a) for a in service.state.list_approvals(workflow_id=workflow_id, status=status)]


@app.get("/api/approvals/pending", tags=["K. Human Approvals"])
def get_pending_approvals_api(workflow_id: str | None = None, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    service = get_service()
    return [views.approval_view(service, a) for a in service.state.list_approvals(workflow_id=workflow_id, status="pending")]


@app.get("/api/approvals/history", tags=["K. Human Approvals"])
def list_approvals_history_api(workflow_id: str | None = None, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    service = get_service()
    return [views.approval_view(service, a) for a in service.state.list_approvals(workflow_id=workflow_id) if a["status"] != "pending"]


@app.get("/api/approvals/{approval_id}", tags=["K. Human Approvals"])
def get_approval_api(approval_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    service = get_service()
    try:
        return views.approval_view(service, service.state.approval(approval_id), detail=True)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


def _decide(approval_id: str, decision: str, payload: ApprovalPayload, user: CurrentUser) -> dict[str, Any]:
    service = get_service()
    try:
        approval = service.state.approval(approval_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    allowed = approval_roles_for(approval["action"])
    if user.role not in allowed:
        service.state.audit(
            approval["workflow_id"], approval["task_id"], user.username, "approval_denied_unauthorized",
            "forbidden", {"approval_id": approval_id, "role": user.role}, {"required_roles": sorted(allowed)},
        )
        raise HTTPException(
            status_code=403,
            detail=f"Action '{approval['action']}' requires one of roles: {', '.join(sorted(allowed))}",
        )
    if decision == "rejected" and not payload.comment.strip():
        raise HTTPException(status_code=422, detail="A comment is required when rejecting an approval")
    try:
        workflow = service.decide_approval(approval_id, user.username, decision, payload.comment, reviewer_role=user.role)
        return {"approval": views.approval_view(service, service.state.approval(approval_id), detail=True),
                "workflow": views.enrich_workflow(service, workflow)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/approvals/{approval_id}", tags=["K. Human Approvals"])
@app.post("/api/approvals/{approval_id}/approve", tags=["K. Human Approvals"])
def approve_request_api(approval_id: str, payload: ApprovalPayload, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return _decide(approval_id, "approved", payload, user)


@app.post("/api/approvals/{approval_id}/reject", tags=["K. Human Approvals"])
def reject_request_api(approval_id: str, payload: ApprovalPayload, user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return _decide(approval_id, "rejected", payload, user)


# ============================================================================
# L. Red Flag APIs
# ============================================================================

@app.get("/api/red-flags", tags=["L. Red Flags"])
def list_red_flags_api(status: str | None = None, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    return get_service().state.list_red_flags(status=status)


@app.get("/api/red-flags/{flag_id}", tags=["L. Red Flags"])
def get_red_flag_api(flag_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    try:
        return get_service().state.red_flag(flag_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.get("/api/workflows/{workflow_id}/red-flags", tags=["L. Red Flags"])
def get_workflow_red_flags_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return service.state.list_red_flags(workflow_id=workflow_id)


@app.post("/api/red-flags/{flag_id}/resolve", tags=["L. Red Flags"])
def resolve_red_flag_api(flag_id: str, payload: RedFlagResolvePayload, user: CurrentUser = Depends(require_roles(Role.HR, Role.COMPLIANCE, Role.SECURITY, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    try:
        return service.resolve_red_flag(flag_id, user.username, payload.resolution_comment)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))



# ============================================================================
# O. Document APIs
# ============================================================================

ALLOWED_DOC_TYPES = {"identity_proof", "address_proof", "education_certificate", "employment_letter", "experience_letter", "salary_slip"}
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))
SIGNATURES = {"application/pdf": (b"%PDF",), "image/png": (b"\x89PNG",), "image/jpeg": (b"\xff\xd8\xff",)}


def _sniff(content: bytes) -> str | None:
    for content_type, prefixes in SIGNATURES.items():
        if content.startswith(prefixes):
            return content_type
    try:
        content.decode("utf-8")
        return "text/plain"
    except UnicodeDecodeError:
        return None


@app.post("/api/employees/{email}/documents", status_code=201, tags=["O. Documents"])
async def upload_document_api(
    email: str,
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN)),
) -> dict[str, Any]:
    """Store an uploaded document. Format is checked from file content, not the client's claim."""
    import hashlib
    from pathlib import Path

    service = get_service()
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=422, detail=f"doc_type must be one of {sorted(ALLOWED_DOC_TYPES)}")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_UPLOAD_BYTES} bytes")
    if not content:
        raise HTTPException(status_code=422, detail="File is empty")
    detected = _sniff(content)
    if detected is None:
        raise HTTPException(status_code=415, detail="Unsupported file format; upload PDF, PNG, JPEG or UTF-8 text")
    digest = hashlib.sha256(content).hexdigest()
    folder = Path(os.getenv("UPLOAD_DIR", "uploads"))
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / digest  # content-addressed: the client-supplied filename is never used on disk
    path.write_bytes(content)
    document = service.state.save_document(
        email, doc_type, Path(file.filename or "upload").name[:120], detected, len(content), digest, str(path), "uploaded",
        status="validated",
    )
    if detected == "text/plain":
        fields = {}
        for line in content.decode("utf-8").splitlines():
            key, sep, value = line.partition(":")
            if sep and key.strip():
                fields[key.strip().lower().replace(" ", "_")] = value.strip()
        service.state.update_document(document["document_id"], extraction={"fields": fields, "method": "text_parse", "authenticity": "unverified"})
    # Document is now on file; clear any "missing" hint and re-run blocked document tasks.
    for wf in service.state.list_workflows(limit=200):
        if wf["employee"].get("email", "").lower() == email.lower():
            hints = [d for d in wf["employee"].get("missing_documents", []) if d != doc_type]
            service.state.update_workflow_employee(wf["workflow_id"], {**wf["employee"], "missing_documents": hints})
    service.on_document_uploaded(email)
    return service.state.document(document["document_id"])


@app.get("/api/documents", tags=["O. Documents"])
def list_documents_api(
    employee_email: str | None = None,
    workflow_id: str | None = None,
    _user: CurrentUser = Depends(get_current_user),
) -> list[dict[str, Any]]:
    return get_service().state.list_documents(employee_email=employee_email, workflow_id=workflow_id)


# ============================================================================
# M. Recovery APIs
# ============================================================================

@app.get("/api/recovery/failed-tasks", tags=["M. Recovery"])
def get_failed_tasks_api(_user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    service = get_service()
    workflows = service.state.list_workflows()
    failed = []
    for wf in workflows:
        for t in wf.get("tasks", []):
            if t["status"] in {"failed", "escalated", "blocked"}:
                failed.append({**t, "workflow_id": wf["workflow_id"]})
    return failed


@app.get("/api/recovery/history", tags=["M. Recovery"])
def get_recovery_history_api(workflow_id: str | None = None, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    return get_service().state.list_recovery_records(workflow_id)


@app.post("/api/recovery/tasks/{task_id}/retry", tags=["M. Recovery"])
def retry_task_api(task_id: str, workflow_id: str = Query(...), _user: CurrentUser = Depends(require_roles(Role.HR, Role.IT, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    try:
        return views.enrich_workflow(service, service.retry_task(workflow_id, task_id))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/recovery/tasks/{task_id}/escalate", tags=["M. Recovery"])
def escalate_task_api(
    task_id: str,
    workflow_id: str = Query(...),
    reason: str = Query(default="Manual escalation"),
    _user: CurrentUser = Depends(require_roles(Role.HR, Role.IT, Role.ADMIN)),
) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    service.state.update_task(workflow_id, task_id, "escalated", error=reason)
    service.state.update_workflow_status(workflow_id, "blocked")
    service.state.audit(workflow_id, task_id, "recovery_manager", "task_failed", "escalated", {"reason": reason})
    return service.state.workflow(workflow_id)


# ============================================================================
# N. Audit APIs
# ============================================================================

@app.get("/api/audit", tags=["N. Audit"])
def list_all_audit_api(workflow_id: str | None = None, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    service = get_service()
    if workflow_id:
        return service.audit(workflow_id)
    workflows = service.state.list_workflows(limit=10)
    all_events = []
    for w in workflows:
        all_events.extend(service.audit(w["workflow_id"]))
    return all_events


@app.get("/workflows/{workflow_id}/audit", tags=["N. Audit"])
@app.get("/api/workflows/{workflow_id}/audit", tags=["N. Audit"])
def get_workflow_audit_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    service = get_service()
    _workflow_or_404(service, workflow_id)
    return service.audit(workflow_id)


@app.get("/api/workflows/{workflow_id}/timeline", tags=["N. Audit"])
def get_workflow_timeline_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    events = get_workflow_audit_api(workflow_id, _user)
    timeline = []
    for e in events:
        timeline.append({
            "timestamp": e["timestamp"],
            "actor": e["actor"],
            "event": e["event_type"],
            "status": e.get("status"),
            "task_id": e.get("task_id"),
            "summary": e.get("output", {}).get("message") or e.get("input", {}).get("goal") or e.get("event_type"),
        })
    return timeline
