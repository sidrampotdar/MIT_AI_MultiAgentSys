"""Read models derived from persisted workflow state.

Everything here is computed from the database (tasks, audit events, approvals,
verifications, ...). Nothing is hardcoded or fabricated: an agent with no recorded
activity is reported as ``idle``.
"""

from __future__ import annotations

from typing import Any

from app.auth import approval_roles_for
from app.core.service import OnboardingService, SATISFIED

TERMINAL = {"completed", "cancelled", "failed"}
ACTIVE = {"pending", "ready", "in_progress", "waiting_approval", "waiting_reply", "blocked", "escalated", "paused"}

APPROVAL_CATEGORIES: dict[str, tuple[str, str]] = {
    # action -> (category label, risk)
    "send_education_verification": ("Education verification email", "medium"),
    "send_employment_verification": ("Employment verification email", "medium"),
    "education_discrepancy_review": ("Education verification discrepancy", "high"),
    "employment_discrepancy_review": ("Employment verification discrepancy", "high"),
    "finalize_salary_profile": ("Salary structure", "high"),
    "finalize_payroll_profile": ("Payroll profile finalization", "high"),
    "request_privileged_access": ("Privileged account access", "critical"),
    "compliance_exception": ("Compliance exception", "high"),
    "equipment_substitution": ("Equipment substitution", "low"),
    "final_onboarding_approval": ("Final onboarding approval", "medium"),
    "send_welcome_email": ("Welcome communication", "low"),
    "send_external_email": ("External email", "medium"),
}


def enrich_workflow(service: OnboardingService, workflow: dict[str, Any]) -> dict[str, Any]:
    """Merge plan metadata into tasks and compute progress counters."""
    plan = {p["task_id"]: p for p in workflow.get("plan", [])}
    tasks = workflow.get("tasks") or service.state.tasks(workflow["workflow_id"])
    enriched = []
    for task in tasks:
        spec = plan.get(task["task_id"], {})
        enriched.append({
            **task,
            "description": spec.get("description", task["task_id"]),
            "priority": spec.get("priority", 2),
            "tool": spec.get("tool"),
            "approval_action": spec.get("approval_action"),
            "retry_count": max(0, (task.get("attempts") or 0) - 1),
        })
    total = len(enriched)
    done = sum(1 for t in enriched if t["status"] in SATISFIED)
    counts = {
        "total": total,
        "completed": done,
        "pending": sum(1 for t in enriched if t["status"] in {"pending", "ready", "in_progress", "waiting_approval", "waiting_reply"}),
        "failed": sum(1 for t in enriched if t["status"] == "failed"),
        "blocked": sum(1 for t in enriched if t["status"] in {"blocked", "escalated"}),
    }
    pending_approvals = service.state.list_approvals(workflow_id=workflow["workflow_id"], status="pending")
    return {
        **workflow,
        "tasks": enriched,
        "progress": {**counts, "percent": round(100 * done / total) if total else 0},
        "pending_approvals": len(pending_approvals),
    }


def agent_activity(service: OnboardingService, workflow_id: str) -> list[dict[str, Any]]:
    """Per-agent execution status derived from task rows and the audit log."""
    workflow = service.state.workflow(workflow_id)
    tasks = enrich_workflow(service, workflow)["tasks"]
    events = service.state.audit_events(workflow_id)
    messages = service.state.list_agent_messages(workflow_id)
    result = []
    for agent in service.dispatcher.list_agents():
        name = agent["name"]
        mine = [t for t in tasks if t["agent"] == name]
        running = [t for t in mine if t["status"] in {"in_progress", "waiting_approval", "waiting_reply"}]
        errors = [t["error"] for t in mine if t.get("error") and t["status"] in {"failed", "blocked", "escalated"}]
        failed = any(t["status"] in {"failed", "escalated"} for t in mine)
        if running:
            status = "waiting" if all(t["status"] != "in_progress" for t in running) else "active"
        elif failed:
            status = "failed"
        elif any(t["status"] == "blocked" for t in mine):
            status = "blocked"
        elif mine and all(t["status"] in SATISFIED for t in mine):
            status = "completed"
        elif any(t["status"] in SATISFIED for t in mine):
            status = "partial"
        else:
            status = "idle"
        started = [t["started_at"] for t in mine if t.get("started_at")]
        completed = [t["completed_at"] for t in mine if t.get("completed_at")]
        last = next((t for t in reversed(mine) if t["status"] in SATISFIED), None)
        agent_events = [e for e in events if e["actor"] == name]
        result.append({
            "name": name,
            "role": agent["role"],
            "status": status,
            "current_task": (running[0]["task_id"] if running else None),
            "tasks": [{"task_id": t["task_id"], "status": t["status"]} for t in mine],
            "started_at": min(started) if started else None,
            "completed_at": max(completed) if completed and status == "completed" else None,
            "result_summary": _summarise(last["result"]) if last and last.get("result") else None,
            "errors": errors,
            "event_count": len(agent_events),
            "messages_sent": sum(1 for m in messages if m["sender_agent"] == name),
            "messages_received": sum(1 for m in messages if m["recipient_agent"] == name),
        })
    return result


def _summarise(result: dict[str, Any]) -> str:
    for key in ("status", "verification_status", "message"):
        if result.get(key):
            return f"{key}: {result[key]}"
    return ", ".join(sorted(k for k in result if k != "success"))[:120]


def agent_messages(service: OnboardingService, workflow_id: str) -> list[dict[str, Any]]:
    tasks = {t["task_id"]: t["status"] for t in service.state.tasks(workflow_id)}
    out = []
    for m in service.state.list_agent_messages(workflow_id):
        status = {"completed": "processed", "skipped": "processed"}.get(tasks.get(m["task_id"]), "delivered")
        out.append({**m, "processing_status": "processed" if tasks.get(m["task_id"]) in SATISFIED else status})
    return out


def approval_view(service: OnboardingService, approval: dict[str, Any], detail: bool = False) -> dict[str, Any]:
    action = approval["action"]
    category, risk = APPROVAL_CATEGORIES.get(action, (action.replace("_", " ").title(), "medium"))
    try:
        employee = service.state.workflow(approval["workflow_id"])["employee"]
    except KeyError:
        employee = {}
    payload = approval["payload"]
    view = {
        "approval_id": approval["approval_id"],
        "workflow_id": approval["workflow_id"],
        "task_id": approval["task_id"],
        "employee": {"name": employee.get("name"), "email": employee.get("email"),
                     "department": employee.get("department"), "designation": employee.get("designation")},
        "requested_action": action,
        "category": category,
        "risk": risk,
        "requesting_agent": approval["requested_by"],
        "requested_at": approval["created_at"],
        "status": approval["status"],
        "required_roles": sorted(approval_roles_for(action)),
        "reviewed_by": approval.get("reviewed_by"),
        "reviewed_at": approval.get("reviewed_at"),
        "comment": approval.get("comment"),
        "parameters_version": payload.get("parameters_version"),
    }
    if detail:
        view.update({
            "description": f"{category} for {employee.get('name', 'employee')}",
            "reason": "This action is sensitive and must be approved by a human before it executes.",
            "agent_recommendation": payload.get("agent_recommendation"),
            "parameters": {k: v for k, v in payload.items() if k not in {"evidence", "agent_recommendation", "tool"}},
            "evidence": payload.get("evidence", {}),
            "tool": payload.get("tool"),
            "audit_history": [e for e in service.state.audit_events(approval["workflow_id"])
                              if e["task_id"] == approval["task_id"] or approval["approval_id"] in str(e["input"])],
        })
    return view


def dashboard(service: OnboardingService) -> dict[str, Any]:
    state = service.state
    workflows = state.list_workflows(limit=500)
    by_status: dict[str, int] = {}
    failed_or_blocked = 0
    agent_runs: dict[str, dict[str, int]] = {}
    for wf in workflows:
        by_status[wf["status"]] = by_status.get(wf["status"], 0) + 1
        for task in state.tasks(wf["workflow_id"]):
            if task["status"] in {"failed", "blocked", "escalated"}:
                failed_or_blocked += 1
            stats = agent_runs.setdefault(task["agent"], {"completed": 0, "active": 0, "failed": 0, "blocked": 0})
            if task["status"] in SATISFIED:
                stats["completed"] += 1
            elif task["status"] in {"in_progress", "waiting_approval", "waiting_reply", "pending"}:
                stats["active"] += 1
            elif task["status"] == "failed":
                stats["failed"] += 1
            else:
                stats["blocked"] += 1
    flags = state.list_red_flags(status="active")
    verifications = state.list_verifications()
    recent = []
    for wf in workflows[:5]:
        recent.extend(state.audit_events(wf["workflow_id"])[-6:])
    recent.sort(key=lambda e: e["timestamp"], reverse=True)
    return {
        "employees_total": len(state.list_employees()),
        "employees_onboarded": by_status.get("completed", 0),
        "workflows_total": len(workflows),
        "workflows_active": sum(c for s, c in by_status.items() if s not in TERMINAL),
        "workflows_completed": by_status.get("completed", 0),
        "workflows_by_status": by_status,
        "pending_approvals": len(state.list_approvals(status="pending")),
        "active_verifications": sum(1 for v in verifications if v["status"] in {"waiting_reply", "waiting_approval", "discrepancy", "additional_documents_requested", "no_response", "request_drafted"}),
        "red_flags_critical": sum(1 for f in flags if f["severity"] == "critical"),
        "red_flags_high": sum(1 for f in flags if f["severity"] == "high"),
        "failed_or_blocked_tasks": failed_or_blocked,
        "agent_summary": [{"agent": a, **s} for a, s in sorted(agent_runs.items())],
        "recent_activity": [
            {"workflow_id": e["workflow_id"], "timestamp": e["timestamp"], "actor": e["actor"],
             "event_type": e["event_type"], "status": e["status"], "task_id": e["task_id"]}
            for e in recent[:15]
        ],
    }


def verification_views(service: OnboardingService, workflow_id: str | None = None) -> list[dict[str, Any]]:
    state = service.state
    workflows = [state.workflow(workflow_id)] if workflow_id else state.list_workflows(limit=200)
    out = []
    for wf in workflows:
        wid, emp = wf["workflow_id"], wf["employee"]
        ver_by_type = {v["verification_type"]: v for v in state.list_verifications(wid)}
        tasks = {t["task_id"]: t for t in state.tasks(wid)}
        flags = state.list_red_flags(workflow_id=wid)
        approvals = state.list_approvals(workflow_id=wid)
        for kind in ("education", "employment"):
            if kind not in tasks:
                continue
            ver = ver_by_type.get(kind)
            thread = f"{'EDU' if kind == 'education' else 'EMP'}-{wid}"
            emails = state.get_email_thread(thread)
            discrepancy_flags = [f for f in flags if f["category"] == kind or (f["category"] == "email" and kind in str(f["evidence"]))]
            review = [a for a in approvals if a["action"] in {f"{kind}_discrepancy_review", f"send_{kind}_verification"}]
            claimed = (
                {"institution": emp.get("university"), "degree": emp.get("degree"), "branch": emp.get("branch"),
                 "graduation_year": emp.get("graduation_year"), "enrollment_number": emp.get("enrollment_number")}
                if kind == "education" else
                {"employer": emp.get("previous_employer"), "designation": emp.get("previous_designation"),
                 "employment_dates": emp.get("employment_dates")}
            )
            inbound = [m for m in emails if m["direction"] == "inbound"]
            out.append({
                "workflow_id": wid, "kind": kind,
                "employee": {"name": emp.get("name"), "email": emp.get("email")},
                "claimed": claimed,
                "task_status": tasks[kind]["status"],
                "status": ver["status"] if ver else ("not_started" if tasks[kind]["status"] == "pending" else tasks[kind]["status"]),
                "verification_id": ver["verification_id"] if ver else None,
                "details": ver["details"] if ver else {},
                "thread_id": thread if emails else None,
                "request_history": emails,
                "response": inbound[-1] if inbound else None,
                "extracted_fields": _extracted_from_reply(inbound[-1]) if inbound else None,
                "discrepancies": discrepancy_flags,
                "human_review": [{"approval_id": a["approval_id"], "action": a["action"], "status": a["status"], "reviewed_by": a.get("reviewed_by")} for a in review],
                "evidence_basis": "simulated" if emails else "none",
                "documents": [d for d in state.list_documents(workflow_id=wid)] if kind == "education" else [],
            })
    return out


def _extracted_from_reply(message: dict[str, Any]) -> dict[str, Any]:
    """Structured interpretation of an inbound reply (never authoritative; email is untrusted)."""
    return {
        "classification": message.get("outcome"),
        "quarantined": message.get("status") == "quarantined",
        "source": "simulated" if (message.get("metadata") or {}).get("simulated") else "external",
    }


def finance_view(service: OnboardingService, workflow_id: str) -> dict[str, Any]:
    state = service.state
    wf = enrich_workflow(service, state.workflow(workflow_id))
    emp = wf["employee"]
    structure = service._salary_structure(emp)
    validation = service_validate(structure, int(emp.get("annual_ctc", 0)))
    approvals = [a for a in state.list_approvals(workflow_id=workflow_id) if a["action"] in {"finalize_salary_profile", "finalize_payroll_profile"}]
    salary_approval = next((a for a in approvals if a["action"] == "finalize_salary_profile"), None)
    payroll_approval = next((a for a in approvals if a["action"] == "finalize_payroll_profile"), None)
    profile = service._salary_profile(workflow_id)
    memory = state.get_state(workflow_id)
    tasks = {t["task_id"]: t for t in wf["tasks"]}
    ctc_ok = validation.get("valid", False)
    salary_version = service._digest(structure)
    approved_version = memory.get("salary_version", {}).get("value")
    return {
        "workflow_id": workflow_id,
        "employee": {"name": emp.get("name"), "email": emp.get("email"), "department": emp.get("department"),
                     "designation": emp.get("designation"), "employee_id": _employee_id(state, emp.get("email", ""))},
        "approved_annual_ctc": int(emp.get("annual_ctc", 0)),
        "structure": structure,
        "monthly": _monthly(structure),
        "validation": {"ctc_reconciled": ctc_ok, "result": validation, "missing_inputs": [k for k in ("annual_ctc", "designation") if not emp.get(k)],
                       "policy_violations": [], "red_flags": [f for f in state.list_red_flags(workflow_id=workflow_id) if f["category"] == "finance"]},
        "assumptions": structure.get("tax_assumptions", {}),
        "salary_version": salary_version,
        "approved_salary_version": approved_version,
        "approval_is_current": bool(approved_version) and approved_version == salary_version,
        "salary_calculation_status": tasks.get("salary", {}).get("status", "not_started"),
        "finance_approval": {"approval_id": salary_approval["approval_id"], "status": salary_approval["status"],
                             "reviewed_by": salary_approval.get("reviewed_by"), "comment": salary_approval.get("comment")} if salary_approval else None,
        "payroll": {
            "status": tasks.get("payroll", {}).get("status", "not_started"),
            "profile_id": memory.get("payroll_profile_id", {}).get("value"),
            "approval": {"approval_id": payroll_approval["approval_id"], "status": payroll_approval["status"]} if payroll_approval else None,
            "created_at": tasks.get("payroll", {}).get("completed_at") if memory.get("payroll_profile_id") else None,
            "blocked_reason": (tasks.get("payroll", {}).get("error")),
        },
        "salary_profile": profile,
        "audit": [e for e in state.audit_events(workflow_id) if e["task_id"] in {"salary", "payroll"}],
    }


def service_validate(structure: dict[str, Any], ctc: int) -> dict[str, Any]:
    from app.core.salary import SalaryCalculationEngine

    return SalaryCalculationEngine.validate_structure(structure, ctc)


def _monthly(structure: dict[str, Any]) -> dict[str, int]:
    return {k: round(structure[k] / 12) for k in ("basic", "hra", "special_allowance", "employer_pf", "employee_pf", "other_benefits", "annual_ctc")}


def _employee_id(state, email: str) -> str | None:
    try:
        return state.get_employee_record(email)["employee_id"]
    except KeyError:
        return None
