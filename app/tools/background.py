from app.tools.base import ToolResponse
from app.tools.store import store


class BackgroundVerificationSimulator:
    """External Background Verification Provider Simulator."""

    VALID_STATUSES = {
        "pass",
        "pending",
        "manual_review",
    }

    @staticmethod
    def submit_verification(email: str) -> ToolResponse:
        email_clean = email.lower()
        existing = store.background_checks.get(email_clean)
        if existing:
            status = existing["status"]
            return ToolResponse(
                success=True,
                tool_name="background",
                status="manual_review" if status == "manual_review" else "completed",
                message="Existing verification request retrieved",
                data=existing,
                requires_approval=(status == "manual_review"),
            )

        verification_status = store.failures.background_status
        if verification_status not in BackgroundVerificationSimulator.VALID_STATUSES:
            return ToolResponse(
                success=False,
                tool_name="background",
                status="failed",
                message=f"Invalid verification status configured: {verification_status}",
                error_code="INVALID_STATUS_CONFIG",
            )

        check_id = store.next_id("bg")
        record = {
            "check_id": check_id,
            "employee_email": email_clean,
            "status": verification_status,
        }
        store.background_checks[email_clean] = record

        # Notice: Technical success is True (provider responded), but if status is manual_review,
        # status indicates manual_review and requires_approval is True.
        return ToolResponse(
            success=True,
            tool_name="background",
            status="manual_review" if verification_status == "manual_review" else "completed",
            message=f"Background check processed with status: {verification_status}",
            data=record,
            requires_approval=(verification_status == "manual_review"),
        )

    @staticmethod
    def get_verification_status(email: str) -> ToolResponse:
        email_clean = email.lower()
        record = store.background_checks.get(email_clean)
        if not record:
            return ToolResponse(
                success=False,
                tool_name="background",
                status="failed",
                message="Background verification record not found",
                error_code="VERIFICATION_NOT_FOUND",
            )

        status = record["status"]
        return ToolResponse(
            success=True,
            tool_name="background",
            status="manual_review" if status == "manual_review" else "completed",
            message=f"Background check status: {status}",
            data=record,
            requires_approval=(status == "manual_review"),
        )

    @staticmethod
    def update_verification_status(email: str, status: str) -> ToolResponse:
        email_clean = email.lower()
        if status not in BackgroundVerificationSimulator.VALID_STATUSES:
            return ToolResponse(
                success=False,
                tool_name="background",
                status="failed",
                message=f"Invalid status: {status}",
                error_code="INVALID_STATUS",
            )

        record = store.background_checks.get(email_clean)
        if not record:
            return ToolResponse(
                success=False,
                tool_name="background",
                status="failed",
                message="Background verification record not found",
                error_code="VERIFICATION_NOT_FOUND",
            )

        record["status"] = status
        return ToolResponse(
            success=True,
            tool_name="background",
            status="manual_review" if status == "manual_review" else "completed",
            message=f"Background verification status updated to {status}",
            data=record,
            requires_approval=(status == "manual_review"),
        )
