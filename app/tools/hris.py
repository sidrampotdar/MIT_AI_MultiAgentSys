from typing import Any
from app.tools.base import ToolResponse
from app.tools.store import store


class HRISSimulator:
    """Human Resource Information System (HRIS) Simulator."""

    @staticmethod
    def check_employee_exists(email: str) -> ToolResponse:
        employee = store.employees.get(email.lower())
        return ToolResponse(
            success=True,
            tool_name="hris",
            status="completed",
            message=(
                "Employee already exists"
                if employee else "Employee does not exist"
            ),
            data={
                "exists": employee is not None,
                "employee": employee,
            },
        )

    @staticmethod
    def create_employee(employee_data: dict[str, Any]) -> ToolResponse:
        email = employee_data.get("email", "").lower()
        if not email:
            return ToolResponse(
                success=False,
                tool_name="hris",
                status="failed",
                message="Employee email is required",
                error_code="MISSING_EMAIL",
            )

        if email in store.employees:
            return ToolResponse(
                success=False,
                tool_name="hris",
                status="failed",
                message="Employee already exists",
                error_code="EMPLOYEE_ALREADY_EXISTS",
                data={"email": email},
            )

        employee_id = store.next_id("employee")
        record = {
            "employee_id": employee_id,
            "first_name": employee_data.get("first_name", ""),
            "last_name": employee_data.get("last_name", ""),
            "email": email,
            "department": employee_data.get("department", "General"),
            "designation": employee_data.get("designation", "Staff"),
            "employment_status": employee_data.get("employment_status", "pending_onboarding"),
            "manager_email": employee_data.get("manager_email"),
            "location": employee_data.get("location"),
            "created_at": employee_data.get("created_at"),
        }
        # Include any extra metadata passed in employee_data
        for k, v in employee_data.items():
            if k not in record:
                record[k] = v

        store.employees[email] = record

        return ToolResponse(
            success=True,
            tool_name="hris",
            status="completed",
            message="Employee record created successfully",
            data={
                "employee_id": employee_id,
                "employee": record,
            },
        )

    @staticmethod
    def get_employee(email: str) -> ToolResponse:
        employee = store.employees.get(email.lower())
        if not employee:
            return ToolResponse(
                success=False,
                tool_name="hris",
                status="failed",
                message="Employee not found",
                error_code="EMPLOYEE_NOT_FOUND",
            )

        return ToolResponse(
            success=True,
            tool_name="hris",
            status="completed",
            message="Employee record retrieved",
            data={
                "employee_id": employee["employee_id"],
                "employee": employee,
            },
        )

    @staticmethod
    def update_employee_status(email: str, status: str) -> ToolResponse:
        employee = store.employees.get(email.lower())
        if not employee:
            return ToolResponse(
                success=False,
                tool_name="hris",
                status="failed",
                message="Employee not found",
                error_code="EMPLOYEE_NOT_FOUND",
            )

        employee["employment_status"] = status
        return ToolResponse(
            success=True,
            tool_name="hris",
            status="completed",
            message=f"Employee status updated to {status}",
            data={
                "employee_id": employee["employee_id"],
                "status": status,
            },
        )
