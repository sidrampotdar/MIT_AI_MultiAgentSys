"""Allowlisted Tool Registry and Enterprise Simulators.

All tools define input schemas, authorized agents, risk classifications,
approval requirements, and idempotency keys. Agents cannot execute arbitrary code.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Callable

from app.core.salary import SalaryCalculationEngine
from app.tools.communication import CommunicationSimulator
from app.tools.compliance import ComplianceSimulator
from app.tools.documents import DocumentSimulator
from app.tools.equipment import EquipmentSimulator
from app.tools.hris import HRISSimulator
from app.tools.identity import IdentitySimulator
from app.tools.store import store as shared_store


@dataclass(frozen=True)
class RegisteredTool:
    name: str
    description: str
    schema: dict[str, Any]
    allowed_agents: frozenset[str]
    handler: Callable[..., dict[str, Any]]
    risk_level: str = "low"  # low, medium, high, critical
    requires_approval: bool = False
    idempotent: bool = True


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, RegisteredTool] = {}
        self._idempotent_results: dict[str, dict[str, Any]] = {}
        # Wired by OnboardingService: durable store + approval check. Without a
        # verifier, tools that require approval refuse to run at all.
        self.state: Any = None
        self.approval_verifier: Callable[[str | None, str, dict[str, Any]], tuple[bool, str]] | None = None

    def register(self, tool: RegisteredTool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"Tool already registered: {tool.name}")
        self._tools[tool.name] = tool

    def get_tool(self, name: str) -> RegisteredTool | None:
        return self._tools.get(name)

    def list_tools(self) -> list[dict[str, Any]]:
        return [
            {
                "name": t.name,
                "description": t.description,
                "allowed_agents": list(t.allowed_agents),
                "risk_level": t.risk_level,
                "requires_approval": t.requires_approval,
                "schema": t.schema,
            }
            for t in self._tools.values()
        ]

    def definitions_for(self, agent: str) -> list[dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.schema,
                },
            }
            for t in self._tools.values()
            if agent in t.allowed_agents
        ]

    def execute(
        self,
        agent: str,
        name: str,
        arguments: dict[str, Any],
        idempotency_key: str | None = None,
        approval_id: str | None = None,
        workflow_id: str | None = None,
        task_id: str | None = None,
    ) -> dict[str, Any]:
        started = datetime.now(timezone.utc).isoformat()
        result = self._execute(agent, name, arguments, idempotency_key, approval_id)
        if self.state is not None and not result.get("idempotent_replay"):
            self.state.record_tool_execution(
                workflow_id, task_id, agent, name, arguments, result, idempotency_key, approval_id, started
            )
        return result

    def _execute(
        self,
        agent: str,
        name: str,
        arguments: dict[str, Any],
        idempotency_key: str | None,
        approval_id: str | None,
    ) -> dict[str, Any]:
        tool = self._tools.get(name)
        if not tool:
            return {"success": False, "error_code": "UNKNOWN_TOOL", "message": f"{name} is not registered"}

        if agent not in tool.allowed_agents:
            return {
                "success": False,
                "error_code": "UNAUTHORIZED_TOOL",
                "message": f"{agent} is not authorized to execute tool '{name}'",
            }

        # Sensitive tools never run without a valid, current, approved approval.
        if tool.requires_approval:
            if self.approval_verifier is None:
                return {"success": False, "error_code": "APPROVAL_REQUIRED",
                        "message": f"Tool '{name}' requires human approval and no approval gate is configured"}
            allowed, reason = self.approval_verifier(approval_id, name, arguments)
            if not allowed:
                return {"success": False, "error_code": "APPROVAL_REQUIRED", "message": reason}

        # Validate required arguments
        required = tool.schema.get("required", [])
        missing = [key for key in required if key not in arguments]
        if missing:
            return {
                "success": False,
                "error_code": "INVALID_ARGUMENTS",
                "message": f"Missing required arguments: {', '.join(missing)}",
            }

        # Idempotency check
        key = idempotency_key or sha256(f"{agent}:{name}:{sorted(arguments.items(), key=lambda x: str(x[0]))}".encode()).hexdigest()
        if tool.idempotent:
            cached = self.state.cached_tool_result(key) if self.state is not None else self._idempotent_results.get(key)
            if cached is not None:
                return {**cached, "idempotent_replay": True}

        try:
            handler_result = tool.handler(**arguments)
            if isinstance(handler_result, dict):
                result = {"success": True, **handler_result}
                if "success" in handler_result:
                    result["success"] = handler_result["success"]
            else:
                result = {"success": True, "data": handler_result}
        except Exception as exc:
            result = {"success": False, "error_code": "TOOL_EXECUTION_ERROR", "message": str(exc)}

        # Only successes are cached: a failed attempt must stay retryable.
        if tool.idempotent and result.get("success") and self.state is None:
            self._idempotent_results[key] = result
        return result


def build_enterprise_registry() -> ToolRegistry:
    """Builds and returns the comprehensive allowlisted tool registry."""
    registry = ToolRegistry()

    # Schemas
    employee_param = {
        "type": "object",
        "properties": {"employee": {"type": "object"}},
        "required": ["employee"],
        "additionalProperties": False,
    }

    # 1. HR Tools
    def _create_hr(employee: dict[str, Any]) -> dict[str, Any]:
        email = employee.get("email", "").lower()
        res = HRISSimulator.create_employee({
            "first_name": employee.get("first_name", "First"),
            "last_name": employee.get("last_name", "Last"),
            "email": email,
            "department": employee.get("department", "Engineering"),
            "designation": employee.get("designation", "Software Engineer"),
            "location": employee.get("location", "Bengaluru"),
        })
        if not res.success:
            existing = HRISSimulator.get_employee(email)
            emp_id = existing.data.get("employee_id") if existing.success else f"EMP-{sha256(email.encode()).hexdigest()[:8].upper()}"
            return {"status": "already_exists", "employee_id": emp_id}
        return {"status": "created", "employee_id": res.data.get("employee_id")}

    registry.register(RegisteredTool(
        name="create_employee_record",
        description="Create an official HRIS employee database record.",
        schema=employee_param,
        allowed_agents=frozenset({"hr_agent"}),
        handler=lambda employee: _create_hr(employee),
        risk_level="medium",
        idempotent=True,
    ))
    # Alias for backwards compatibility
    registry.register(RegisteredTool(
        name="create_hr_record",
        description="Alias for create_employee_record.",
        schema=employee_param,
        allowed_agents=frozenset({"hr_agent"}),
        handler=lambda employee: _create_hr(employee),
        risk_level="medium",
        idempotent=True,
    ))

    registry.register(RegisteredTool(
        name="get_employee_record",
        description="Retrieve HRIS employee record by email.",
        schema={"type": "object", "properties": {"email": {"type": "string"}}, "required": ["email"]},
        allowed_agents=frozenset({"hr_agent", "planner_agent"}),
        handler=lambda email: HRISSimulator.get_employee(email).model_dump(),
        risk_level="low",
    ))

    registry.register(RegisteredTool(
        name="update_employee_status",
        description="Update employee employment status in HRIS.",
        schema={"type": "object", "properties": {"email": {"type": "string"}, "status": {"type": "string"}}, "required": ["email", "status"]},
        allowed_agents=frozenset({"hr_agent"}),
        handler=lambda email, status: HRISSimulator.update_employee_status(email, status).model_dump(),
        risk_level="medium",
    ))

    # 2. Document Tools
    def _validate_docs(employee: dict[str, Any]) -> dict[str, Any]:
        email = employee.get("email", "").lower()
        DocumentSimulator.add_synthetic_documents(email)
        res = DocumentSimulator.validate_documents(email)
        missing = employee.get("missing_documents") or ([] if res.success else res.data.get("missing_documents", []))
        return {
            "status": "completed" if not missing else "blocked",
            "missing_documents": missing,
            "verified": len(missing) == 0,
        }

    registry.register(RegisteredTool(
        name="validate_documents",
        description="Validate submitted employee documents and metadata.",
        schema=employee_param,
        allowed_agents=frozenset({"document_agent"}),
        handler=lambda employee: _validate_docs(employee),
        risk_level="low",
    ))

    registry.register(RegisteredTool(
        name="get_employee_documents",
        description="Get list of uploaded documents for candidate.",
        schema={"type": "object", "properties": {"email": {"type": "string"}}, "required": ["email"]},
        allowed_agents=frozenset({"document_agent", "hr_agent"}),
        handler=lambda email: DocumentSimulator.get_documents(email).model_dump(),
        risk_level="low",
    ))

    registry.register(RegisteredTool(
        name="extract_document_fields",
        description="Extract structured educational and personal fields from document images or PDFs.",
        schema=employee_param,
        allowed_agents=frozenset({"document_agent"}),
        handler=lambda employee: {
            "candidate": f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip() or employee.get("name", ""),
            "university": employee.get("university", "ABC Engineering College"),
            "degree": employee.get("degree", "BTech"),
            "graduation_year": employee.get("graduation_year", 2024),
            "enrollment_number": employee.get("enrollment_number", "SYN-2020-1045"),
        },
        risk_level="low",
    ))

    # 3. Verification Tools (Education & Employment)
    def _send_edu_verification(employee: dict[str, Any]) -> dict[str, Any]:
        univ = employee.get("university", "ABC Engineering College")
        recipient = "registrar@abc-engineering.edu.test"
        return {
            "status": "sent",
            "institution": univ,
            "recipient": recipient,
            "enrollment_number": employee.get("enrollment_number", "SYN-2020-1045"),
        }

    registry.register(RegisteredTool(
        name="send_education_verification",
        description="Send an approved education verification request to candidate's institution.",
        schema=employee_param,
        allowed_agents=frozenset({"verification_agent", "education_verification_agent"}),
        handler=lambda employee: _send_edu_verification(employee),
        risk_level="high",
        requires_approval=True,
    ))

    registry.register(RegisteredTool(
        name="submit_education_verification",
        description="Submit formal verification request to educational institution.",
        schema=employee_param,
        allowed_agents=frozenset({"education_verification_agent", "verification_agent"}),
        handler=lambda employee: _send_edu_verification(employee),
        risk_level="high",
        requires_approval=True,
    ))

    def _send_emp_verification(employee: dict[str, Any]) -> dict[str, Any]:
        employer = employee.get("previous_employer", "Tech Innovators Inc")
        return {
            "status": "sent",
            "employer": employer,
            "recipient": "hr@tech-innovators.test",
            "designation": employee.get("previous_designation", "Junior Engineer"),
        }

    registry.register(RegisteredTool(
        name="send_employment_verification",
        description="Send previous employment verification request.",
        schema=employee_param,
        allowed_agents=frozenset({"employment_verification_agent", "verification_agent"}),
        handler=lambda employee: _send_emp_verification(employee),
        risk_level="high",
        requires_approval=True,
    ))

    registry.register(RegisteredTool(
        name="submit_employment_verification",
        description="Submit formal employment verification request to previous employer.",
        schema=employee_param,
        allowed_agents=frozenset({"employment_verification_agent"}),
        handler=lambda employee: _send_emp_verification(employee),
        risk_level="high",
        requires_approval=True,
    ))

    registry.register(RegisteredTool(
        name="retrieve_verification_result",
        description="Retrieve latest external verification check status.",
        schema={"type": "object", "properties": {"email": {"type": "string"}}, "required": ["email"]},
        allowed_agents=frozenset({"verification_agent", "education_verification_agent", "employment_verification_agent"}),
        handler=lambda email: {"status": shared_store.verifications.get(email.lower(), {}).get("status", "not_started")},
        risk_level="low",
    ))

    # 4. Salary & Finance Tools
    def _calc_salary(employee: dict[str, Any]) -> dict[str, Any]:
        ctc = int(employee.get("annual_ctc", 1_200_000))
        designation = employee.get("designation", "Software Engineer")
        structure = SalaryCalculationEngine.calculate(ctc, designation=designation, allow_grade_override=True)
        return {"status": "reconciled", **structure.model_dump()}

    registry.register(RegisteredTool(
        name="calculate_salary",
        description="Deterministically calculate CTC components, PF, gross, and net salary.",
        schema=employee_param,
        allowed_agents=frozenset({"finance_agent"}),
        handler=lambda employee: _calc_salary(employee),
        risk_level="medium",
    ))

    registry.register(RegisteredTool(
        name="validate_salary_structure",
        description="Validate that salary components reconcile with approved CTC.",
        schema={"type": "object", "properties": {"structure": {"type": "object"}, "approved_ctc": {"type": "integer"}}, "required": ["structure", "approved_ctc"]},
        allowed_agents=frozenset({"finance_agent"}),
        handler=lambda structure, approved_ctc: SalaryCalculationEngine.validate_structure(structure, approved_ctc),
        risk_level="low",
    ))

    registry.register(RegisteredTool(
        name="create_payroll_profile",
        description="Create approved payroll profile in enterprise finance system.",
        schema=employee_param,
        allowed_agents=frozenset({"finance_agent"}),
        handler=lambda employee: {"status": "created", "profile_id": f"PAY-{sha256(employee['email'].encode()).hexdigest()[:8].upper()}"},
        risk_level="critical",
        requires_approval=True,
    ))

    # 5. Identity & Access Tools
    def _prov_accounts(employee: dict[str, Any]) -> dict[str, Any]:
        email = employee.get("email", "").lower()
        res = IdentitySimulator.provision_account(email)
        if not res.success:
            # Deterministic retry if configured in simulator
            res = IdentitySimulator.provision_account(email)
        return {
            "status": "provisioned" if res.success else "failed",
            "accounts": ["email", "slack", "github", "jira"],
            "account_id": res.data.get("account_id") if res.success else None,
        }

    registry.register(RegisteredTool(
        name="provision_standard_accounts",
        description="Provision standard non-privileged corporate accounts.",
        schema=employee_param,
        allowed_agents=frozenset({"account_agent"}),
        handler=lambda employee: _prov_accounts(employee),
        risk_level="medium",
    ))

    registry.register(RegisteredTool(
        name="create_user_account",
        description="Create standard user account in enterprise identity provider.",
        schema={"type": "object", "properties": {"email": {"type": "string"}}, "required": ["email"]},
        allowed_agents=frozenset({"account_agent"}),
        handler=lambda email: IdentitySimulator.provision_account(email).model_dump(),
        risk_level="medium",
    ))

    registry.register(RegisteredTool(
        name="request_privileged_access",
        description="Request elevated privileged access (e.g. production admin). Requires explicit security approval.",
        schema={"type": "object", "properties": {"email": {"type": "string"}, "role": {"type": "string"}}, "required": ["email", "role"]},
        allowed_agents=frozenset({"account_agent"}),
        handler=lambda email, role: IdentitySimulator.request_privileged_access(email, role).model_dump(),
        risk_level="critical",
        requires_approval=True,
    ))

    # 6. Equipment Tools
    def _alloc_equip(employee: dict[str, Any]) -> dict[str, Any]:
        if not employee.get("laptop_available", True) and not employee.get("use_approved_alternative", False):
            return {
                "success": False,
                "error_code": "OUT_OF_STOCK",
                "message": "Developer laptop is temporarily unavailable",
            }
        item = "approved_standard_laptop_alternative" if employee.get("use_approved_alternative") else "developer_laptop"
        return {"status": "allocated", "item": item}

    registry.register(RegisteredTool(
        name="allocate_equipment",
        description="Allocate a developer laptop or approved standard alternative.",
        schema=employee_param,
        allowed_agents=frozenset({"equipment_agent"}),
        handler=lambda employee: _alloc_equip(employee),
        risk_level="medium",
    ))

    registry.register(RegisteredTool(
        name="check_inventory",
        description="Check hardware stock level for requested item.",
        schema={"type": "object", "properties": {"item": {"type": "string"}}, "required": ["item"]},
        allowed_agents=frozenset({"equipment_agent"}),
        handler=lambda item: EquipmentSimulator.check_availability(item).model_dump(),
        risk_level="low",
    ))

    registry.register(RegisteredTool(
        name="create_equipment_request",
        description="Create hardware equipment procurement order.",
        schema={"type": "object", "properties": {"email": {"type": "string"}, "item": {"type": "string"}}, "required": ["email", "item"]},
        allowed_agents=frozenset({"equipment_agent"}),
        handler=lambda email, item: EquipmentSimulator.request_equipment(email, item).model_dump(),
        risk_level="medium",
    ))

    # 7. Compliance Tools
    def _comp_compliance(employee: dict[str, Any]) -> dict[str, Any]:
        email = employee.get("email", "").lower()
        ComplianceSimulator.initialize_employee(email)
        for p in ComplianceSimulator.REQUIRED_POLICIES:
            ComplianceSimulator.acknowledge_policy(email, p)
        for d in ComplianceSimulator.REQUIRED_DOCUMENTS:
            ComplianceSimulator.submit_compliance_document(email, d)
        status_res = ComplianceSimulator.check_compliance_status(email)
        return {
            "status": "completed" if status_res.data.get("is_compliant") else "pending",
            "acknowledgements": len(status_res.data.get("acknowledged_policies", [])),
            "is_compliant": status_res.data.get("is_compliant", True),
        }

    registry.register(RegisteredTool(
        name="complete_compliance",
        description="Record mandatory policy acknowledgements and tax compliance documents.",
        schema=employee_param,
        allowed_agents=frozenset({"compliance_agent"}),
        handler=lambda employee: _comp_compliance(employee),
        risk_level="medium",
    ))

    registry.register(RegisteredTool(
        name="check_policy_acknowledgement",
        description="Check whether all mandatory policies have been acknowledged.",
        schema={"type": "object", "properties": {"email": {"type": "string"}}, "required": ["email"]},
        allowed_agents=frozenset({"compliance_agent"}),
        handler=lambda email: ComplianceSimulator.check_compliance_status(email).model_dump(),
        risk_level="low",
    ))

    # 8. Communication & Email Tools
    def _send_welcome(employee: dict[str, Any]) -> dict[str, Any]:
        email = employee.get("email", "").lower()
        name = f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip() or employee.get("name", "Employee")
        res = CommunicationSimulator.send_welcome_email(email, name)
        return {"status": "sent", "recipient": email, "email_id": res.data.get("email_id")}

    registry.register(RegisteredTool(
        name="send_welcome_email",
        description="Send an approved welcome email and onboarding orientation schedule.",
        schema=employee_param,
        allowed_agents=frozenset({"communication_agent"}),
        handler=lambda employee: _send_welcome(employee),
        risk_level="low",
    ))

    registry.register(RegisteredTool(
        name="create_email_draft",
        description="Create an email draft awaiting approval before sending.",
        schema={"type": "object", "properties": {"recipient": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"}, "purpose": {"type": "string"}}, "required": ["recipient", "subject", "body", "purpose"]},
        allowed_agents=frozenset({"email_operations_agent", "communication_agent"}),
        handler=lambda recipient, subject, body, purpose: {"status": "drafted", "recipient": recipient, "subject": subject, "purpose": purpose},
        risk_level="medium",
    ))

    registry.register(RegisteredTool(
        name="send_email",
        description="Send an approved email message.",
        schema={"type": "object", "properties": {"recipient": {"type": "string"}, "subject": {"type": "string"}, "body": {"type": "string"}, "template": {"type": "string"}}, "required": ["recipient", "subject", "body"]},
        allowed_agents=frozenset({"email_operations_agent", "communication_agent"}),
        handler=lambda recipient, subject, body, template="generic": CommunicationSimulator.send_email(recipient, subject, body, template).model_dump(),
        risk_level="high",
        requires_approval=True,
    ))

    registry.register(RegisteredTool(
        name="classify_email_reply",
        description="Classify incoming email response content (e.g. confirmation, mismatch, inquiry).",
        schema={"type": "object", "properties": {"body": {"type": "string"}}, "required": ["body"]},
        allowed_agents=frozenset({"email_operations_agent"}),
        handler=lambda body: {
            "classification": "mismatch" if "mismatch" in body.lower() or "different" in body.lower() else (
                "ambiguous" if "ignore" in body.lower() else "confirmed"
            )
        },
        risk_level="low",
    ))

    return registry
