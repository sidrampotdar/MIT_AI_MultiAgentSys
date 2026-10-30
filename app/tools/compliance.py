from app.tools.base import ToolResponse
from app.tools.store import store


class ComplianceSimulator:
    """Compliance and Policy Management Simulator."""

    REQUIRED_POLICIES = [
        "code_of_conduct",
        "information_security",
        "data_protection",
    ]

    REQUIRED_DOCUMENTS = [
        "tax_declaration",
        "bank_details",
    ]

    @staticmethod
    def initialize_employee(email: str) -> ToolResponse:
        record = {
            "employee_email": email.lower(),
            "acknowledged_policies": [],
            "submitted_documents": [],
            "compliance_status": "pending",
        }
        store.compliance_records[email.lower()] = record

        return ToolResponse(
            success=True,
            tool_name="compliance",
            status="completed",
            message="Compliance record initialized",
            data=record,
        )

    @staticmethod
    def acknowledge_policy(email: str, policy_name: str) -> ToolResponse:
        email_clean = email.lower()
        record = store.compliance_records.get(email_clean)
        if not record:
            return ToolResponse(
                success=False,
                tool_name="compliance",
                status="failed",
                message="Compliance record not found",
                error_code="RECORD_NOT_FOUND",
            )

        if policy_name not in record["acknowledged_policies"]:
            record["acknowledged_policies"].append(policy_name)

        return ToolResponse(
            success=True,
            tool_name="compliance",
            status="completed",
            message=f"Policy '{policy_name}' acknowledged",
            data=record,
        )

    @staticmethod
    def submit_compliance_document(email: str, document_name: str) -> ToolResponse:
        email_clean = email.lower()
        record = store.compliance_records.get(email_clean)
        if not record:
            return ToolResponse(
                success=False,
                tool_name="compliance",
                status="failed",
                message="Compliance record not found",
                error_code="RECORD_NOT_FOUND",
            )

        if document_name not in record["submitted_documents"]:
            record["submitted_documents"].append(document_name)

        return ToolResponse(
            success=True,
            tool_name="compliance",
            status="completed",
            message=f"Compliance document '{document_name}' submitted",
            data=record,
        )

    @staticmethod
    def check_compliance_status(email: str) -> ToolResponse:
        email_clean = email.lower()
        record = store.compliance_records.get(email_clean)
        if not record:
            return ToolResponse(
                success=False,
                tool_name="compliance",
                status="failed",
                message="Compliance record not found",
                error_code="RECORD_NOT_FOUND",
            )

        missing_policies = [
            p for p in ComplianceSimulator.REQUIRED_POLICIES
            if p not in record["acknowledged_policies"]
        ]
        missing_documents = [
            d for d in ComplianceSimulator.REQUIRED_DOCUMENTS
            if d not in record["submitted_documents"]
        ]

        is_compliant = len(missing_policies) == 0 and len(missing_documents) == 0
        record["compliance_status"] = "compliant" if is_compliant else "pending"

        # Notice: Technical success is True (tool performed check without crashing),
        # but the business status reflects whether onboarding compliance is satisfied.
        return ToolResponse(
            success=True,
            tool_name="compliance",
            status="completed",
            message="Employee is compliant" if is_compliant else "Employee compliance is pending",
            data={
                "compliance_status": record["compliance_status"],
                "missing_policies": missing_policies,
                "missing_documents": missing_documents,
                "is_compliant": is_compliant,
            },
        )
