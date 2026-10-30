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

from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
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
    hash_password,
    require_roles,
    verify_password,
)
from app.core.llm import Message, create_provider
from app.core.salary import SalaryCalculationEngine
from app.core.service import OnboardingService, default_employee
from app.models.enums import RedFlagCategory, RedFlagSeverity
from app.models.schemas import AppBaseModel


# --- Request & Response Schemas ---

class OnboardPayload(AppBaseModel):
    goal: str = "Complete employee onboarding with controlled approvals."
    name: str = "Alice Chen"
    email: str = "alice.chen@example.test"
    department: str = "Engineering"
    designation: str = "Software Engineer"
    annual_ctc: int = Field(default=1_200_000, gt=0)
    laptop_available: bool = True
    missing_documents: list[str] = Field(default_factory=list)
    university: str = "ABC Engineering College"
    enrollment_number: str = "SYN-2020-1045"
    degree: str = "BTech"
    branch: str = "Computer Science Engineering"
    graduation_year: int = 2024
    previous_employer: str = "Tech Innovators Inc"
    previous_designation: str = "Junior Engineer"
    consent_to_verify: bool = True


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
    email: str
    department: str = "Engineering"
    designation: str = "Software Engineer"
    annual_ctc: int = 1_200_000
    location: str = "Bengaluru"


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
    sender: str
    subject: str
    body: str
    outcome: Literal["confirmed", "year_mismatch", "ambiguous", "prompt_injection"] = "confirmed"


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
    resolved_by: str
    resolution_comment: str


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
    # Same response for unknown user, wrong password and deactivated account.
    if not user or not user["is_active"] or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password", headers={"WWW-Authenticate": "Bearer"})
    token, expires = create_access_token(user["username"], user["role"])
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expires.isoformat(),
        "user": {"username": user["username"], "role": user["role"], "full_name": user["full_name"]},
    }


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


# ============================================================================
# C. Workflow APIs
# ============================================================================

@app.post("/workflows", status_code=201, tags=["C. Workflows"])
@app.post("/api/workflows/onboarding", status_code=201, tags=["C. Workflows"])
def create_workflow_api(payload: OnboardPayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    emp = default_employee(payload.name, payload.email)
    emp.update(payload.model_dump())
    workflow_id = service.start(payload.goal, emp)
    return _workflow_or_404(service, workflow_id)


@app.get("/workflows", tags=["C. Workflows"])
@app.get("/api/workflows", tags=["C. Workflows"])
def list_workflows_api(limit: int = Query(default=20, le=100), _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    return get_service().state.list_workflows(limit=limit)


@app.get("/workflows/{workflow_id}", tags=["C. Workflows"])
@app.get("/api/workflows/{workflow_id}", tags=["C. Workflows"])
def workflow_status_api(workflow_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    return _workflow_or_404(get_service(), workflow_id)


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
    return service.resume(workflow_id)


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


@app.get("/api/workflows/{workflow_id}/events", tags=["C. Workflows"])
async def sse_workflow_events(workflow_id: str, _user: CurrentUser = Depends(get_current_user_for_stream)) -> StreamingResponse:
    """Live Server-Sent Events (SSE) stream for real-time frontend monitoring."""
    service = get_service()
    _workflow_or_404(service, workflow_id)

    async def event_generator(_user: CurrentUser = Depends(get_current_user)) -> AsyncGenerator[str, None]:
        # Send initial connected event
        yield f"event: connected\ndata: {json.dumps({'workflow_id': workflow_id, 'timestamp': datetime.now(timezone.utc).isoformat()})}\n\n"
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

        def listener(payload: dict[str, Any]):
            if payload.get("workflow_id") == workflow_id:
                queue.put_nowait(payload)

        service.dispatcher.subscribe("*", listener)
        try:
            for _ in range(15):  # stream active updates
                try:
                    event_data = await asyncio.wait_for(queue.get(), timeout=1.5)
                    yield f"event: workflow.update\ndata: {json.dumps(event_data)}\n\n"
                except asyncio.TimeoutError:
                    yield f": heartbeat\n\n"
        finally:
            pass

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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
    agent = get_service().dispatcher.get_agent(agent_name)
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_name}' not found")
    return {"agent": agent_name, "status": "active", "health": "healthy"}


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
    return service.state.list_agent_messages(workflow_id)


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
    outcome: Literal["confirmed", "year_mismatch", "ambiguous", "prompt_injection"] = "confirmed"
) -> dict[str, Any]:
    service = get_service()
    ver = service.state.verification(verification_id)
    return service.process_education_reply(ver["workflow_id"], outcome=outcome)


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


@app.get("/api/verification/employment/{verification_id}", tags=["H. Employment Verification"])
def get_employment_verification_api(verification_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    try:
        return get_service().state.verification(verification_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


# ============================================================================
# I. Email APIs
# ============================================================================

@app.post("/api/email/drafts", status_code=201, tags=["I. Email"])
def create_email_draft_api(payload: EmailDraftPayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, payload.workflow_id)
    mid = service.state.save_email_message(
        thread_id=f"THREAD-{payload.workflow_id}",
        workflow_id=payload.workflow_id,
        direction="outbound",
        sender="hr@enterprise.test",
        recipient=payload.recipient,
        subject=payload.subject,
        body=payload.body,
        status="draft",
        metadata={"purpose": payload.purpose},
    )
    return service.state.email_message(mid)


@app.get("/api/email/drafts", tags=["I. Email"])
def list_email_drafts_api(workflow_id: str | None = None, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    return [m for m in get_service().state.list_email_messages(workflow_id) if m["status"] == "draft"]


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
def send_email_api(draft_id: str, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    msg = service.state.email_message(draft_id)
    if msg["status"] == "sent":
        return msg
    # Update status to sent
    service.state.update_email_status(draft_id, "sent")
    return service.state.email_message(draft_id)


@app.post("/api/email/mock-replies", status_code=201, tags=["I. Email"])
def inject_mock_reply_api(payload: MockEmailReplyPayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    _workflow_or_404(service, payload.workflow_id)
    return service.process_education_reply(
        workflow_id=payload.workflow_id,
        outcome=payload.outcome,
        custom_body=payload.body,
    )


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


# ============================================================================
# K. Human Approval APIs
# ============================================================================

@app.get("/api/approvals/pending", tags=["K. Human Approvals"])
def get_pending_approvals_api(workflow_id: str | None = None, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    return get_service().state.list_approvals(workflow_id=workflow_id, status="pending")


@app.get("/api/approvals/history", tags=["K. Human Approvals"])
def list_approvals_history_api(workflow_id: str | None = None, _user: CurrentUser = Depends(get_current_user)) -> list[dict[str, Any]]:
    return get_service().state.list_approvals(workflow_id=workflow_id)


@app.get("/api/approvals/{approval_id}", tags=["K. Human Approvals"])
def get_approval_api(approval_id: str, _user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    try:
        return get_service().state.approval(approval_id)
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
        return service.decide_approval(approval_id, user.username, decision, payload.comment, reviewer_role=user.role)
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
def resolve_red_flag_api(flag_id: str, payload: RedFlagResolvePayload, _user: CurrentUser = Depends(require_roles(Role.HR, Role.COMPLIANCE, Role.SECURITY, Role.ADMIN))) -> dict[str, Any]:
    service = get_service()
    try:
        flag = service.state.resolve_red_flag(flag_id, payload.resolved_by, payload.resolution_comment)
        # Check if workflow can now resume if no active critical flags remain
        if not service.red_flags.has_critical_flags(flag["workflow_id"]):
            service.resume(flag["workflow_id"])
        return flag
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))


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
    service.state.update_task(workflow_id, task_id, "pending", error=None)
    return service.resume(workflow_id)


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
