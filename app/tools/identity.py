from typing import Any
from app.tools.base import ToolResponse
from app.tools.store import store


class IdentitySimulator:
    """Identity and Access Management Simulator."""

    @staticmethod
    def provision_account(email: str, employee_data: dict[str, Any] | None = None) -> ToolResponse:
        email_clean = email.lower()

        # Check deterministic API failure
        if store.failures.identity_api_failures > 0:
            store.failures.identity_api_failures -= 1
            return ToolResponse(
                success=False,
                tool_name="identity",
                status="failed",
                message="Identity provider API temporary failure",
                error_code="TEMPORARY_API_FAILURE",
                data={"remaining_failures": store.failures.identity_api_failures},
            )

        if email_clean in store.accounts:
            return ToolResponse(
                success=True,
                tool_name="identity",
                status="completed",
                message="Company account already exists",
                data=store.accounts[email_clean],
            )

        username = email_clean.split("@")[0]
        account_id = store.next_id("account")
        account = {
            "account_id": account_id,
            "email": email_clean,
            "username": username,
            "status": "active",
            "roles": ["employee"],
            "permissions": [
                "read_internal_resources",
            ],
        }
        store.accounts[email_clean] = account

        return ToolResponse(
            success=True,
            tool_name="identity",
            status="completed",
            message="Company account created",
            data=account,
        )

    # Convenience alias
    create_account = provision_account

    @staticmethod
    def check_permissions(email: str) -> ToolResponse:
        account = store.accounts.get(email.lower())
        if not account:
            return ToolResponse(
                success=False,
                tool_name="identity",
                status="failed",
                message="Identity account not found",
                error_code="ACCOUNT_NOT_FOUND",
            )

        return ToolResponse(
            success=True,
            tool_name="identity",
            status="completed",
            message="Permissions retrieved",
            data={
                "roles": account["roles"],
                "permissions": account["permissions"],
            },
        )

    @staticmethod
    def request_privileged_access(email: str, requested_role: str) -> ToolResponse:
        account = store.accounts.get(email.lower())
        if not account:
            return ToolResponse(
                success=False,
                tool_name="identity",
                status="failed",
                message="Account not found",
                error_code="ACCOUNT_NOT_FOUND",
            )

        if not store.failures.privileged_access_requires_approval:
            if requested_role not in account["roles"]:
                account["roles"].append(requested_role)
            return ToolResponse(
                success=True,
                tool_name="identity",
                status="completed",
                message="Privileged role assigned",
                data=account,
            )

        approval_id = store.next_id("approval")
        approval_record = {
            "approval_id": approval_id,
            "email": email.lower(),
            "requested_role": requested_role,
            "status": "waiting_for_approval",
        }
        store.approvals[approval_id] = approval_record

        return ToolResponse(
            success=True,
            tool_name="identity",
            status="waiting_for_approval",
            message="Privileged access requires approval",
            data=approval_record,
            requires_approval=True,
        )

    @staticmethod
    def approve_privileged_access(approval_id: str) -> ToolResponse:
        approval = store.approvals.get(approval_id)
        if not approval:
            return ToolResponse(
                success=False,
                tool_name="identity",
                status="failed",
                message="Approval request not found",
                error_code="APPROVAL_NOT_FOUND",
            )

        email = approval["email"]
        role = approval["requested_role"]
        account = store.accounts.get(email)
        if not account:
            return ToolResponse(
                success=False,
                tool_name="identity",
                status="failed",
                message="Target account not found",
                error_code="ACCOUNT_NOT_FOUND",
            )

        if role not in account["roles"]:
            account["roles"].append(role)
        approval["status"] = "approved"

        return ToolResponse(
            success=True,
            tool_name="identity",
            status="completed",
            message=f"Privileged role '{role}' granted for {email}",
            data={
                "approval_id": approval_id,
                "account": account,
            },
        )
