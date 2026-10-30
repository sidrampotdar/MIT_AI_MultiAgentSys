from app.tools.base import ToolResponse
from app.tools.store import store


class EquipmentSimulator:
    """Equipment and Laptop Inventory Management Simulator."""

    @staticmethod
    def check_availability(item: str) -> ToolResponse:
        item_clean = item.lower()
        if item_clean not in store.inventory:
            return ToolResponse(
                success=False,
                tool_name="equipment",
                status="failed",
                message="Unknown equipment item",
                error_code="ITEM_NOT_FOUND",
            )

        available = store.inventory[item_clean]
        if item_clean == "laptop" and store.failures.laptop_out_of_stock:
            available = 0

        return ToolResponse(
            success=True,
            tool_name="equipment",
            status="completed",
            message="Inventory checked",
            data={
                "item": item_clean,
                "available_quantity": available,
                "in_stock": available > 0,
            },
        )

    @staticmethod
    def request_equipment(email: str, item: str = "laptop") -> ToolResponse:
        item_clean = item.lower()
        if item_clean not in store.inventory:
            return ToolResponse(
                success=False,
                tool_name="equipment",
                status="failed",
                message="Unknown equipment item",
                error_code="ITEM_NOT_FOUND",
            )

        available = store.inventory[item_clean]
        if item_clean == "laptop" and store.failures.laptop_out_of_stock:
            available = 0

        if available <= 0:
            return ToolResponse(
                success=False,
                tool_name="equipment",
                status="failed",
                message="Laptop inventory is out of stock" if item_clean == "laptop" else f"{item.capitalize()} is out of stock",
                data={},
                error_code="OUT_OF_STOCK",
                requires_approval=False,
            )

        # Inventory decreases only after a successful request
        store.inventory[item_clean] -= 1
        request_id = store.next_id("equipment")
        record = {
            "request_id": request_id,
            "employee_email": email.lower(),
            "item": item_clean,
            "status": "ordered",
        }
        store.equipment_orders[request_id] = record

        return ToolResponse(
            success=True,
            tool_name="equipment",
            status="completed",
            message=f"{item.capitalize()} requested successfully",
            data=record,
        )

    @staticmethod
    def update_delivery_status(request_id: str, status: str) -> ToolResponse:
        order = store.equipment_orders.get(request_id)
        if not order:
            return ToolResponse(
                success=False,
                tool_name="equipment",
                status="failed",
                message="Equipment order not found",
                error_code="ORDER_NOT_FOUND",
            )

        order["status"] = status
        return ToolResponse(
            success=True,
            tool_name="equipment",
            status="completed",
            message=f"Equipment delivery status updated to {status}",
            data=order,
        )

    @staticmethod
    def get_equipment_order(request_id: str) -> ToolResponse:
        order = store.equipment_orders.get(request_id)
        if not order:
            return ToolResponse(
                success=False,
                tool_name="equipment",
                status="failed",
                message="Equipment order not found",
                error_code="ORDER_NOT_FOUND",
            )

        return ToolResponse(
            success=True,
            tool_name="equipment",
            status="completed",
            message="Equipment order retrieved",
            data=order,
        )
