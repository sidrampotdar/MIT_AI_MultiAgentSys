"""Integration tests for the integrated onboarding workflow (documents, verification, payroll, final review)."""

import pytest

from app.core.service import OnboardingService, default_employee
from tests.test_scenarios import _approve, _get_pending_approval_id, drive_to_completion


@pytest.fixture
def service(tmp_path):
    return OnboardingService(tmp_path / "wf.db", provider="offline")


def _tasks(service, wid):
    return {t["task_id"]: t["status"] for t in service.status(wid)["tasks"]}


def _through_verification(service, wid):
    _approve(service, wid, "send_education_verification")
    service.process_education_reply(wid, "confirmed")
    _approve(service, wid, "send_employment_verification")
    service.process_employment_reply(wid, "confirmed")


def test_plan_contains_document_and_employment_tasks_with_dependencies(service):
    wid = service.start("Onboard", default_employee())
    wf = service.status(wid)
    plan = {t["task_id"]: t for t in wf["plan"]}
    assert {"documents", "extraction", "education", "employment", "payroll", "orientation", "final_review"} <= set(plan)
    assert plan["extraction"]["depends_on"] == ["documents"]
    assert plan["education"]["depends_on"] == ["extraction"]
    assert plan["employment"]["depends_on"] == ["documents"]
    assert {"salary", "employment"} <= set(plan["hr_record"]["depends_on"])
    assert all(plan[t]["description"] and plan[t]["priority"] for t in plan)
    # Document collection ran as part of the workflow and persisted shared state.
    assert _tasks(service, wid)["documents"] == "completed" and _tasks(service, wid)["extraction"] == "completed"
    assert service.state.get_state(wid)["documents"]["value"]["status"] == "complete"


def test_no_previous_employer_drops_employment_task(service):
    emp = default_employee()
    emp["previous_employer"] = ""
    wid = service.start("Onboard fresher", emp)
    assert "employment" not in _tasks(service, wid)


def test_planner_cannot_bypass_policy(service):
    plan, adj = service._canonical_plan([{"task_id": "documents", "agent": "document_agent", "tool": "validate_documents"},
                                         {"task_id": "evil", "agent": "hr_agent", "tool": "rm_rf"}], default_employee())
    ids = [t["task_id"] for t in plan]
    assert "evil" not in ids and "final_review" in ids and "payroll" in ids


def test_simulated_documents_are_labelled_and_never_authentic(service):
    wid = service.start("Onboard", default_employee())
    docs = service.state.list_documents(workflow_id=wid)
    assert docs and all(d["source"] == "simulated" and d["authenticity"] == "unverified" for d in docs)
    assert service.state.get_state(wid)["extraction"]["value"]["authenticity"] == "unverified"


def test_missing_documents_block_then_upload_resumes(service, monkeypatch):
    emp = default_employee()
    emp["missing_documents"] = ["education_certificate"]
    wid = service.start("Onboard", emp)
    assert _tasks(service, wid)["documents"] == "blocked"
    assert service.state.get_state(wid)["missing_documents_followup"]["value"]["missing"] == ["education_certificate"]
    followup = service.state.email_message(service.state.get_state(wid)["missing_documents_followup"]["value"]["message_id"])
    assert followup["status"] == "drafted"  # not sent without approval
    service.state.save_document(emp["email"], "education_certificate", "cert.pdf", "application/pdf", 10, "ab", None, "uploaded", wid)
    emp2 = {**emp, "missing_documents": []}
    service.state.update_workflow_employee(wid, emp2)
    service.on_document_uploaded(emp["email"])
    assert _tasks(service, wid)["documents"] == "completed"


def test_registry_refuses_sensitive_tools_without_a_valid_approval(service):
    wid = service.start("Onboard", default_employee())
    emp = default_employee()
    denied = service.registry.execute("education_verification_agent", "send_education_verification", {"employee": emp}, "k1")
    assert denied["error_code"] == "APPROVAL_REQUIRED"
    pending = _get_pending_approval_id(service, wid, "send_education_verification")
    still = service.registry.execute("education_verification_agent", "send_education_verification", {"employee": emp}, "k2", approval_id=pending)
    assert still["error_code"] == "APPROVAL_REQUIRED"  # pending is not approved
    wrong = service.registry.execute("finance_agent", "create_payroll_profile", {"employee": emp}, "k3", approval_id=pending)
    assert wrong["error_code"] == "APPROVAL_REQUIRED"  # approval is for a different tool


def test_rejected_approval_stays_blocked_and_tool_never_runs(service):
    wid = service.start("Onboard", default_employee())
    apid = _get_pending_approval_id(service, wid, "send_education_verification")
    service.decide_approval(apid, "HR", "rejected", "no consent")
    assert _tasks(service, wid)["education"] == "blocked"
    assert not [e for e in service.state.list_tool_executions(wid) if e["tool"] == "send_education_verification"]
    with pytest.raises(ValueError):
        service.decide_approval(apid, "HR", "approved")  # a decided approval cannot be flipped
    assert service.status(wid)["status"] == "blocked"


def test_stale_salary_approval_cannot_authorise_modified_ctc(service):
    wid = service.start("Onboard", default_employee())
    _through_verification(service, wid)
    old = _get_pending_approval_id(service, wid, "finalize_salary_profile")
    service.update_workflow_employee(wid, {"annual_ctc": 2_400_000}, "hr")
    assert service.state.approval(old)["status"] == "stale"
    with pytest.raises(ValueError):
        service.decide_approval(old, "Finance", "approved")
    fresh = _get_pending_approval_id(service, wid, "finalize_salary_profile")
    assert fresh != old
    assert service.state.approval(fresh)["payload"]["annual_ctc"] == 2_400_000


def test_payroll_waits_for_approval_and_is_created_exactly_once(service):
    wid = service.start("Onboard", default_employee())
    _through_verification(service, wid)
    _approve(service, wid, "finalize_salary_profile", "Finance")
    assert _tasks(service, wid)["payroll"] == "waiting_approval"
    assert "payroll_profile_id" not in service.state.get_state(wid)
    _approve(service, wid, "finalize_payroll_profile", "Finance")
    profile_id = service.state.get_state(wid)["payroll_profile_id"]["value"]
    assert profile_id.startswith("PAY-")
    # Re-running the task is a no-op that does not create a second profile.
    service.state.update_task(wid, "payroll", "pending")
    service.resume(wid)
    assert [e for e in service.state.list_tool_executions(wid) if e["tool"] == "create_payroll_profile"].__len__() == 1


def test_payroll_blocked_when_salary_rejected(service):
    wid = service.start("Onboard", default_employee())
    _through_verification(service, wid)
    service.decide_approval(_get_pending_approval_id(service, wid, "finalize_salary_profile"), "Finance", "rejected", "over budget")
    assert _tasks(service, wid)["payroll"] == "pending"
    assert service.status(wid)["status"] == "blocked"


def test_full_onboarding_requires_final_hr_approval_and_completes(service):
    wid = service.start("Onboard", default_employee())
    _through_verification(service, wid)
    _approve(service, wid, "finalize_salary_profile", "Finance")
    for action in ("finalize_payroll_profile", "send_welcome_email"):
        _approve(service, wid, action)
    assert _tasks(service, wid)["final_review"] == "waiting_approval"
    assert service.status(wid)["status"] == "waiting_approval"  # never silently completed
    review = service.state.approval(_get_pending_approval_id(service, wid, "final_onboarding_approval"))["payload"]["evidence"]["review"]
    assert review["passed"] and all(c["passed"] for c in review["checks"])
    _approve(service, wid, "final_onboarding_approval", "HR Head")
    assert service.status(wid)["status"] == "completed"
    report = service.final_report(wid)
    assert report["all_conditions_met"] and report["final_hr_approval"]["approved_by"] == "HR Head"
    assert report["orientation"]["simulated_calendar"] is True
    sent = [m for m in service.state.list_email_messages(wid) if m["status"] == "sent"]
    assert {m["metadata"]["purpose"] for m in sent if "purpose" in m["metadata"]} >= {"welcome", "first_day", "manager_notice", "orientation"}


def test_education_discrepancy_pauses_then_human_resolution_resumes(service):
    wid = service.start("Onboard", default_employee())
    _approve(service, wid, "send_education_verification")
    res = service.process_education_reply(wid, "year_mismatch")
    assert res["status"] == "discrepancy" and service.status(wid)["status"] == "blocked"
    review = _get_pending_approval_id(service, wid, "education_discrepancy_review")
    flags = service.state.list_red_flags(workflow_id=wid, status="active")
    assert flags and flags[0]["evidence"]["received_year"] != flags[0]["evidence"]["expected_year"]
    service.decide_approval(review, "HR Investigator", "approved", "Transcript verified")
    assert _tasks(service, wid)["education"] == "completed"
    assert service.state.list_red_flags(workflow_id=wid, status="active") == []
    assert service.status(wid)["status"] != "blocked"
    assert service.status(wid)["tasks"][2]["result"]["exception"] is True


def test_employment_discrepancy_and_reply_outcomes(service):
    wid = service.start("Onboard", default_employee())
    _approve(service, wid, "send_employment_verification")
    assert service.process_employment_reply(wid, "no_response")["status"] == "no_response"
    assert _tasks(service, wid)["employment"] == "waiting_reply"
    assert service.process_employment_reply(wid, "not_confirmed")["status"] == "discrepancy"
    assert _tasks(service, wid)["employment"] == "escalated"


def test_prompt_injection_reply_is_quarantined_not_executed(service):
    wid = service.start("Onboard", default_employee())
    _approve(service, wid, "send_employment_verification")
    res = service.process_employment_reply(wid, "prompt_injection")
    assert res["status"] == "quarantined"
    inbound = [m for m in service.state.list_email_messages(wid, direction="inbound")]
    assert inbound[0]["status"] == "quarantined" and inbound[0]["metadata"]["untrusted"] is True


def test_privileged_access_rejection_does_not_block_standard_onboarding(service):
    emp = default_employee()
    emp["privileged_access_role"] = "production_admin"
    wid = service.start("Onboard", emp)
    _through_verification(service, wid)
    _approve(service, wid, "finalize_salary_profile", "Finance")
    priv = _get_pending_approval_id(service, wid, "request_privileged_access")
    service.decide_approval(priv, "Security", "rejected", "No justification")
    assert _tasks(service, wid)["privileged_access"] == "denied"
    assert any(f["category"] == "access" for f in service.state.list_red_flags(workflow_id=wid))
    final = drive_to_completion(service, wid)
    assert final["status"] == "completed"
    assert service.final_report(wid)["exceptions"] == ["privileged_access"]


def test_email_failure_retries_are_recorded_and_not_duplicated(service):
    from app.tools.store import store

    store.failures.email_fail_first_attempt = True
    try:
        emp = default_employee("Retry Person", "retry.person@example.test")
        wid = service.start("Onboard", emp)
        _through_verification(service, wid)
        _approve(service, wid, "finalize_salary_profile")
        _approve(service, wid, "finalize_payroll_profile")
        _approve(service, wid, "send_welcome_email")
    finally:
        store.failures.email_fail_first_attempt = False
    assert _tasks(service, wid)["welcome"] == "completed"
    assert any(r["action_taken"] == "retry_attempt" for r in service.state.list_recovery_records(wid))
    ok = [e for e in service.state.list_tool_executions(wid) if e["tool"] == "send_welcome_email" and e["success"]]
    assert len(ok) == 1


def test_crash_mid_task_is_recovered_without_rerunning_completed_work(tmp_path):
    db = tmp_path / "crash.db"
    first = OnboardingService(db, provider="offline")
    wid = first.start("Onboard", default_employee())
    done_before = {t["task_id"] for t in first.status(wid)["tasks"] if t["status"] == "completed"}
    first.state.update_task(wid, "extraction", "in_progress")  # simulate a crash while running
    second = OnboardingService(db, provider="offline")
    second.resume(wid)
    assert _tasks(second, wid)["extraction"] == "completed"
    docs_runs = [e for e in second.state.list_tool_executions(wid) if e["tool"] == "validate_documents"]
    assert len(docs_runs) == 1 and "documents" in done_before


def test_pause_resume_cancel_and_retry(service):
    wid = service.start("Onboard", default_employee())
    service.pause(wid)
    assert service.status(wid)["status"] == "paused"
    service.resume(wid)
    assert service.status(wid)["status"] == "paused"  # plain resume never leaves paused
    service.resume_paused(wid)
    assert service.status(wid)["status"] == "waiting_approval"
    service.cancel(wid)
    wf = service.status(wid)
    assert wf["status"] == "cancelled" and not service.state.list_approvals(workflow_id=wid, status="pending")


def test_unapproved_recipient_is_escalated(service):
    emp = default_employee()
    emp["university"] = "Unknown University"
    wid = service.start("Onboard", emp)
    assert _tasks(service, wid)["education"] == "escalated"
    assert any(f["category"] == "email" for f in service.state.list_red_flags(workflow_id=wid))
