from app.core.llm import Message, OfflineProvider
from app.core.service import OnboardingService, default_employee, load_system_prompt


def _pending_approval(service: OnboardingService, workflow_id: str) -> str:
    for event in service.audit(workflow_id):
        if event["event_type"] == "approval_requested":
            approval_id = event["output"]["approval_id"]
            if service.state.approval(approval_id)["status"] == "pending":
                return approval_id
    raise AssertionError("Expected a pending approval")


def test_workflow_persists_and_resumes_after_each_approval(tmp_path):
    database = tmp_path / "workflows.db"
    service = OnboardingService(database, provider="offline")
    workflow_id = service.start("Onboard Alice", default_employee())
    assert service.status(workflow_id)["status"] == "waiting_approval"

    service.decide_approval(_pending_approval(service, workflow_id), "HR Manager", "approved")
    assert service.status(workflow_id)["status"] == "waiting_approval"

    # This new service instance proves a process can read the durable workflow.
    restarted_service = OnboardingService(database, provider="offline")
    restarted_service.decide_approval(_pending_approval(restarted_service, workflow_id), "Finance Manager", "approved")
    assert restarted_service.status(workflow_id)["status"] == "completed"


def test_registry_denies_unknown_and_unauthorized_tools(tmp_path):
    service = OnboardingService(tmp_path / "workflows.db", provider="offline")
    assert service.registry.execute("document_agent", "not_a_tool", {})["error_code"] == "UNKNOWN_TOOL"
    assert service.registry.execute("document_agent", "calculate_salary", {"employee": default_employee()})["error_code"] == "UNAUTHORIZED_TOOL"


def test_rejected_approval_blocks_workflow(tmp_path):
    service = OnboardingService(tmp_path / "workflows.db", provider="offline")
    workflow_id = service.start("Onboard Alice", default_employee())
    service.decide_approval(_pending_approval(service, workflow_id), "Compliance", "rejected", "Consent needs clarification")
    assert service.status(workflow_id)["status"] == "blocked"


def test_equipment_shortage_recovers_using_approved_alternative(tmp_path):
    service = OnboardingService(tmp_path / "workflows.db", provider="offline")
    employee = default_employee()
    employee["laptop_available"] = False
    workflow_id = service.start("Onboard Alice", employee)
    service.decide_approval(_pending_approval(service, workflow_id), "Compliance", "approved")
    service.decide_approval(_pending_approval(service, workflow_id), "Finance", "approved")

    equipment = next(task for task in service.status(workflow_id)["tasks"] if task["task_id"] == "equipment")
    event_types = [event["event_type"] for event in service.audit(workflow_id)]
    assert equipment["result"]["item"] == "approved_standard_laptop_alternative"
    assert "retry_scheduled" in event_types


def test_agent_prompt_is_a_real_version_controlled_contract():
    prompt = load_system_prompt("verification_agent")
    assert "untrusted" in prompt.lower()
    assert "approval" in prompt.lower()


def test_normalized_llm_tool_request_executes_only_through_registry(tmp_path):
    service = OnboardingService(tmp_path / "workflows.db", provider="offline")
    response = OfflineProvider().complete([Message("user", "Please validate documents")], service.registry.definitions_for("document_agent"))
    assert response.tool_calls[0].name == "validate_documents"
    result = service.execute_requested_tool("document_agent", response.tool_calls[0].name, {"employee": default_employee()})
    assert result["success"] is True
