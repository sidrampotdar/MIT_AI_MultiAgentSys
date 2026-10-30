from typing import Any
from pydantic import BaseModel, Field


class ToolResponse(BaseModel):
    success: bool
    tool_name: str
    status: str
    message: str
    data: dict[str, Any] = Field(default_factory=dict)
    error_code: str | None = None
    requires_approval: bool = False
