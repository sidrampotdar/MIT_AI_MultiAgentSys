"""API-level tests for the endpoints that back the web application."""

ONBOARD = {"name": "Priya Nair", "email": "priya.nair@example.test", "previous_employer": "Tech Innovators Inc",
           "previous_designation": "Engineer", "reporting_manager": "Ravi Kumar", "joining_date": "2026-12-01"}


def _start(api, **overrides):
    return api.post("/api/workflows/onboarding", json={**ONBOARD, **overrides}, headers=api.login("hr")).json()


def _approve(api, wid, action, role="hr", comment=""):
    pending = api.get("/api/approvals/pending", params={"workflow_id": wid}, headers=api.login("viewer")).json()
    approval = next(a for a in pending if a["requested_action"] == action)
    return api.post(f"/api/approvals/{approval['approval_id']}/approve", json={"comment": comment}, headers=api.login(role))


def test_dashboard_reflects_real_state_and_starts_empty(api):
    viewer = api.login("viewer")
    empty = api.get("/api/dashboard/summary", headers=viewer).json()
    assert empty["workflows_total"] == 0 and empty["pending_approvals"] == 0 and empty["recent_activity"] == []
    wf = _start(api)
    data = api.get("/api/dashboard/summary", headers=viewer).json()
    assert data["workflows_total"] == 1 and data["workflows_active"] == 1
    assert data["pending_approvals"] == 2  # education + employment requests
    assert data["active_verifications"] == 0  # nothing sent yet: not fabricated
    assert data["recent_activity"] and data["recent_activity"][0]["workflow_id"] == wf["workflow_id"]
    assert any(a["agent"] == "document_agent" for a in data["agent_summary"])


def test_idempotency_key_prevents_duplicate_workflows(api):
    hr = {**api.login("hr"), "Idempotency-Key": "form-123"}
    a = api.post("/api/workflows/onboarding", json=ONBOARD, headers=hr).json()
    b = api.post("/api/workflows/onboarding", json=ONBOARD, headers=hr).json()
    assert a["workflow_id"] == b["workflow_id"]
    assert len(api.get("/api/workflows", headers=hr).json()) == 1


def test_onboard_validates_input(api):
    hr = api.login("hr")
    assert api.post("/api/workflows/onboarding", json={"name": "A", "email": "not-an-email"}, headers=hr).status_code == 422
    assert api.post("/api/workflows/onboarding", json={"email": "a@b.test"}, headers=hr).status_code == 422
    assert api.post("/api/workflows/onboarding", json={**ONBOARD, "annual_ctc": -5}, headers=hr).status_code == 422


def test_workflow_view_exposes_plan_metadata_progress_and_agent_activity(api):
    wf = _start(api)
    wid = wf["workflow_id"]
    detail = api.get(f"/api/workflows/{wid}", headers=api.login("viewer")).json()
    task = next(t for t in detail["tasks"] if t["task_id"] == "education")
    assert task["description"] and task["priority"] and task["depends_on"] == ["extraction"] and "retry_count" in task
    assert detail["progress"]["total"] == len(detail["tasks"]) and 0 < detail["progress"]["percent"] < 100
    activity = {a["name"]: a for a in api.get(f"/api/workflows/{wid}/agent-activity", headers=api.login("viewer")).json()}
    assert activity["document_agent"]["status"] == "completed" and activity["document_agent"]["started_at"]
    assert activity["education_verification_agent"]["status"] == "waiting"
    assert activity["finance_agent"]["status"] == "idle"  # no fake activity
    assert activity["planner_agent"]["messages_sent"] > 0
    messages = api.get(f"/api/workflows/{wid}/agent-messages", headers=api.login("viewer")).json()
    assert messages and {"sender_agent", "recipient_agent", "message_type", "task_id", "correlation_id", "processing_status"} <= set(messages[0])
    assert api.get(f"/api/workflows/{wid}/state", headers=api.login("viewer")).json()["documents"]["value"]["status"] == "complete"
    assert api.get(f"/api/workflows/{wid}/tool-executions", headers=api.login("viewer")).json()


def test_approval_detail_contains_evidence_roles_and_audit(api):
    wid = _start(api)["workflow_id"]
    pending = api.get("/api/approvals/pending", headers=api.login("viewer")).json()
    edu = next(a for a in pending if a["requested_action"] == "send_education_verification")
    assert edu["employee"]["name"] == "Priya Nair" and edu["required_roles"] == ["hr"] and edu["risk"]
    detail = api.get(f"/api/approvals/{edu['approval_id']}", headers=api.login("viewer")).json()
    assert detail["parameters"]["recipient"] == "registrar@abc-engineering.edu.test"
    assert detail["evidence"]["approved_contact"] is True and detail["agent_recommendation"] and detail["audit_history"]
    assert api.get("/api/approvals/history", headers=api.login("viewer")).status_code == 200


def test_email_cannot_be_sent_before_approval_and_lifecycle_is_traceable(api):
    hr = api.login("hr")
    wid = _start(api)["workflow_id"]
    draft = api.post("/api/email/drafts", headers=hr, json={
        "workflow_id": wid, "recipient": ONBOARD["email"], "subject": "Hello", "body": "Welcome", "purpose": "note"}).json()
    assert draft["status"] == "waiting_approval"
    assert api.post(f"/api/email/send/{draft['message_id']}", headers=hr).status_code == 409
    approval = next(a for a in api.get("/api/approvals/pending", headers=hr).json() if a["requested_action"] == "send_external_email")
    assert api.post(f"/api/approvals/{approval['approval_id']}/approve", json={}, headers=api.login("finance")).status_code == 403
    assert api.post(f"/api/approvals/{approval['approval_id']}/approve", json={}, headers=hr).status_code == 200
    sent = api.post(f"/api/email/send/{draft['message_id']}", headers=hr).json()
    assert sent["status"] == "sent" and sent["metadata"]["simulated"] is True


def test_email_to_unapproved_recipient_is_rejected(api):
    wid = _start(api)["workflow_id"]
    r = api.post("/api/email/drafts", headers=api.login("hr"), json={
        "workflow_id": wid, "recipient": "attacker@evil.example", "subject": "x", "body": "y", "purpose": "z"})
    assert r.status_code == 422


def test_verification_center_shows_request_history_reply_and_discrepancy(api):
    wid = _start(api)["workflow_id"]
    assert _approve(api, wid, "send_education_verification").status_code == 200
    ver = next(v for v in api.get("/api/verifications", params={"workflow_id": wid}, headers=api.login("viewer")).json() if v["kind"] == "education")
    assert ver["status"] == "waiting_reply" and ver["request_history"][0]["status"] == "waiting_reply" and ver["evidence_basis"] == "simulated"
    reply = api.post("/api/email/mock-replies", headers=api.login("hr"), json={"workflow_id": wid, "kind": "education", "outcome": "year_mismatch"})
    assert reply.status_code == 201 and reply.json()["status"] == "discrepancy"
    ver = next(v for v in api.get("/api/verifications", params={"workflow_id": wid}, headers=api.login("viewer")).json() if v["kind"] == "education")
    assert ver["status"] == "discrepancy" and ver["discrepancies"] and ver["response"]["outcome"] == "year_mismatch"
    assert ver["extracted_fields"]["source"] == "simulated" and any(h["action"] == "education_discrepancy_review" for h in ver["human_review"])
    # Unsupported outcomes and replies with no open request are 409/422-style errors, not silent success.
    assert api.post("/api/email/mock-replies", headers=api.login("hr"), json={"workflow_id": wid, "kind": "employment", "outcome": "confirmed"}).status_code == 409


def test_finance_view_is_backend_computed_and_blocks_unauthorised_approval(api):
    wid = _start(api, annual_ctc=1_500_000)["workflow_id"]
    _approve(api, wid, "send_education_verification")
    api.post("/api/email/mock-replies", headers=api.login("hr"), json={"workflow_id": wid, "kind": "education", "outcome": "confirmed"})
    view = api.get(f"/api/finance/workflows/{wid}", headers=api.login("viewer")).json()
    s = view["structure"]
    assert s["annual_ctc"] == 1_500_000 and view["monthly"]["basic"] == round(s["basic"] / 12)
    assert s["basic"] + s["hra"] + s["special_allowance"] + s["employer_pf"] + s["other_benefits"] == 1_500_000
    assert view["validation"]["ctc_reconciled"] is True and view["finance_approval"]["status"] == "pending"
    assert view["payroll"]["status"] == "not_started" or view["payroll"]["status"] == "pending"
    assert _approve(api, wid, "finalize_salary_profile", role="hr").status_code == 403
    overview = api.get("/api/finance/overview", headers=api.login("viewer")).json()
    assert overview[0]["finance_approval_status"] == "pending"
    corr = api.post(f"/api/finance/workflows/{wid}/request-correction", json={"reason": "Band mismatch"}, headers=api.login("finance"))
    assert corr.status_code == 200
    after = api.get(f"/api/finance/workflows/{wid}", headers=api.login("viewer")).json()
    assert after["finance_approval"]["status"] == "rejected" and "Correction requested" in after["finance_approval"]["comment"]
    assert api.post(f"/api/finance/workflows/{wid}/request-correction", json={"reason": "again please"}, headers=api.login("hr")).status_code == 403


def test_document_upload_validates_content_and_resumes_blocked_workflow(api, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    hr = api.login("hr")
    wid = _start(api, missing_documents=["education_certificate"])["workflow_id"]
    assert next(t for t in api.get(f"/api/workflows/{wid}", headers=hr).json()["tasks"] if t["task_id"] == "documents")["status"] == "blocked"
    url = f"/api/employees/{ONBOARD['email']}/documents"
    bad = api.post(url, headers=hr, data={"doc_type": "education_certificate"}, files={"file": ("x.exe", b"\x00\x01\x02\xff\xfe", "application/pdf")})
    assert bad.status_code == 415  # content sniffed, not the claimed MIME type
    assert api.post(url, headers=hr, data={"doc_type": "nope"}, files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")}).status_code == 422
    assert api.post(url, headers=api.login("viewer"), data={"doc_type": "education_certificate"}, files={"file": ("a.pdf", b"%PDF-1.4", "application/pdf")}).status_code == 403
    cert = (b"Candidate: Priya Nair\nUniversity: ABC Engineering College\nDegree: BTech\nGraduation Year: 2023\n")
    ok = api.post(url, headers=hr, data={"doc_type": "education_certificate"}, files={"file": ("../../cert.txt", cert, "text/plain")})
    assert ok.status_code == 201 and ok.json()["authenticity"] == "unverified" and ok.json()["filename"] == "cert.txt"
    detail = api.get(f"/api/workflows/{wid}", headers=hr).json()
    tasks = {t["task_id"]: t["status"] for t in detail["tasks"]}
    assert tasks["documents"] == "completed" and tasks["extraction"] == "completed"
    # The parsed certificate disagrees with the declared graduation year: surfaced as an inconsistency + flag.
    state = api.get(f"/api/workflows/{wid}/state", headers=hr).json()
    assert state["extraction"]["value"]["inconsistencies"][0]["field"] == "graduation_year"
    assert any(f["category"] == "education" for f in api.get("/api/red-flags", headers=hr).json())


def test_red_flag_resolution_uses_authenticated_identity(api):
    hr = api.login("hr")
    wid = _start(api)["workflow_id"]
    _approve(api, wid, "send_education_verification")
    api.post("/api/email/mock-replies", headers=hr, json={"workflow_id": wid, "kind": "education", "outcome": "year_mismatch"})
    flag = api.get(f"/api/workflows/{wid}/red-flags", headers=hr).json()[0]
    assert api.post(f"/api/red-flags/{flag['flag_id']}/resolve", json={"resolution_comment": "ok"}, headers=api.login("viewer")).status_code == 403
    assert api.post(f"/api/red-flags/{flag['flag_id']}/resolve", json={"resolved_by": "Boss", "resolution_comment": "ok ok"}, headers=hr).status_code == 422
    resolved = api.post(f"/api/red-flags/{flag['flag_id']}/resolve", json={"resolution_comment": "Transcript verified"}, headers=hr).json()
    assert resolved["resolved_by"] == "hr" and resolved["status"] == "resolved"


def test_pause_resume_cancel_and_retry_endpoints(api):
    hr = api.login("hr")
    wid = _start(api)["workflow_id"]
    assert api.post(f"/api/workflows/{wid}/pause", headers=hr).json()["status"] == "paused"
    assert api.post(f"/api/workflows/{wid}/resume", headers=hr).json()["status"] == "waiting_approval"
    assert api.post(f"/api/workflows/{wid}/pause", headers=api.login("viewer")).status_code == 403
    assert api.post(f"/api/recovery/tasks/documents/retry", params={"workflow_id": wid}, headers=hr).status_code == 409
    assert api.post(f"/api/workflows/{wid}/cancel", headers=hr).json()["status"] == "cancelled"


def test_final_report_and_full_flow_through_api(api):
    hr, fin = api.login("hr"), api.login("finance")
    wid = _start(api)["workflow_id"]
    _approve(api, wid, "send_education_verification")
    api.post("/api/email/mock-replies", headers=hr, json={"workflow_id": wid, "kind": "education", "outcome": "confirmed"})
    _approve(api, wid, "send_employment_verification")
    api.post("/api/email/mock-replies", headers=hr, json={"workflow_id": wid, "kind": "employment", "outcome": "confirmed"})
    _approve(api, wid, "finalize_salary_profile", "finance")
    _approve(api, wid, "finalize_payroll_profile", "finance")
    _approve(api, wid, "send_welcome_email")
    assert api.get(f"/api/workflows/{wid}/report", headers=hr).json()["final_hr_approval"] is None
    done = _approve(api, wid, "final_onboarding_approval").json()
    assert done["workflow"]["status"] == "completed"
    report = api.get(f"/api/workflows/{wid}/report", headers=hr).json()
    assert report["all_conditions_met"] and report["final_hr_approval"]["approved_by"] == "hr" and report["payroll_profile_id"]
    assert api.get("/api/dashboard/summary", headers=hr).json()["workflows_completed"] == 1
