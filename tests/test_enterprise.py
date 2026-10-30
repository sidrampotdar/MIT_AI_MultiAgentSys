from app.enterprise import EnterpriseOnboardingWorkflow, run_demo
from app.tools.store import EnterpriseStore


def test_successful_workflow_has_required_approvals_and_audit_history():
    workflow = run_demo("success")
    snapshot = workflow.snapshot()

    assert snapshot["workflow"]["status"] == "completed"
    assert {approval["action"] for approval in snapshot["approvals"]} == {
        "send_education_verification_email", "finalize_salary_profile"
    }
    assert all(approval["status"] == "approved" for approval in snapshot["approvals"])
    assert len(snapshot["audit_events"]) >= 15


def test_education_email_cannot_send_without_matching_approval():
    workflow = EnterpriseOnboardingWorkflow(store=EnterpriseStore())
    workflow.collect_documents()
    drafted = workflow.draft_education_email()

    blocked = workflow.send_education_email(drafted.data["approval_id"])

    assert blocked.status == "blocked"
    assert workflow.store.sent_emails == []


def test_discrepancy_blocks_finalization():
    workflow = run_demo("discrepancy")
    snapshot = workflow.snapshot()

    assert snapshot["workflow"]["status"] == "blocked"
    assert snapshot["workflow"]["tasks"]["education_verification"]["status"] == "escalated"
