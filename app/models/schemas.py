from datetime import date, datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    model_validator,
)

from app.models.enums import (
    WorkflowStatus,
    TaskStatus,
    AgentName,
    ToolStatus,
    ApprovalDecision,
    ApprovalStatus,
    AuditEventType,
)


class AppBaseModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        validate_assignment=True,
    )
class EmployeeProfile(AppBaseModel):
    department: str
    designation: str
    employment_type: str = "full_time"

    manager_name: str | None = None
    manager_email: EmailStr | None = None

    location: str
    salary: float | None = Field(default=None, gt=0)

    joining_date: date


class Employee(AppBaseModel):
    employee_id: UUID = Field(default_factory=uuid4)

    first_name: str = Field(min_length=1)
    last_name: str = Field(min_length=1)

    email: EmailStr
    phone: str | None = None

    profile: EmployeeProfile

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
class OnboardingRequest(AppBaseModel):
    request_id: UUID = Field(default_factory=uuid4)

    employee: Employee

    requested_by: str
    business_goal: str

    priority: str = "normal"

    requested_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    metadata: dict[str, Any] = Field(default_factory=dict)


class WorkflowStep(AppBaseModel):
    task_id: UUID = Field(default_factory=uuid4)

    description: str = Field(min_length=5)

    assigned_agent: AgentName

    dependencies: list[UUID] = Field(default_factory=list)

    required_tools: list[str] = Field(default_factory=list)

    status: TaskStatus = TaskStatus.PENDING

    retry_count: int = Field(default=0, ge=0)
    max_retries: int = Field(default=3, ge=0)

    result: dict[str, Any] | None = None
    error: str | None = None

    @model_validator(mode="after")
    def validate_retries(self):
        if self.retry_count > self.max_retries:
            raise ValueError("retry_count cannot exceed max_retries")

        if self.task_id in self.dependencies:
            raise ValueError("A task cannot depend on itself")

        if len(self.dependencies) != len(set(self.dependencies)):
            raise ValueError("Duplicate task dependencies are not allowed")

        return self
    
step = WorkflowStep(
    description="Verify employee identity documents",
    assigned_agent=AgentName.DOCUMENT,
    required_tools=["document_verification"],
)

class WorkflowPlan(AppBaseModel):
    plan_id: UUID = Field(default_factory=uuid4)

    workflow_id: UUID = Field(default_factory=uuid4)

    objective: str

    steps: list[WorkflowStep]

    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    @model_validator(mode="after")
    def validate_plan(self):
        task_ids = [step.task_id for step in self.steps]

        if len(task_ids) != len(set(task_ids)):
            raise ValueError("Duplicate task IDs found in workflow plan")

        known_ids = set(task_ids)

        for step in self.steps:
            unknown = set(step.dependencies) - known_ids

            if unknown:
                raise ValueError(
                    f"Unknown dependencies in task {step.task_id}: {unknown}"
                )

        # Detect circular dependencies using DFS.
        graph = {
            step.task_id: step.dependencies
            for step in self.steps
        }

        visited = set()
        active = set()

        def visit(task_id):
            if task_id in active:
                raise ValueError("Circular task dependencies detected")

            if task_id in visited:
                return

            active.add(task_id)

            for dependency in graph[task_id]:
                visit(dependency)

            active.remove(task_id)
            visited.add(task_id)

        for task_id in task_ids:
            visit(task_id)

        return self

class AgentTask(AppBaseModel):
    assignment_id: UUID = Field(default_factory=uuid4)

    task_id: UUID

    agent_name: AgentName

    description: str

    input_data: dict[str, Any] = Field(default_factory=dict)

    status: TaskStatus = TaskStatus.PENDING

    assigned_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
class ToolCall(AppBaseModel):
    tool_call_id: UUID = Field(default_factory=uuid4)

    tool_name: str

    arguments: dict[str, Any] = Field(default_factory=dict)

    status: ToolStatus = ToolStatus.REQUESTED

    output: dict[str, Any] | None = None

    error: str | None = None

    executed_at: datetime | None = None 
class AgentResult(AppBaseModel):
    result_id: UUID = Field(default_factory=uuid4)

    agent_name: AgentName

    task_id: UUID

    status: TaskStatus

    summary: str

    structured_data: dict[str, Any] = Field(default_factory=dict)

    tool_calls: list[ToolCall] = Field(default_factory=list)

    requires_approval: bool = False

    error: str | None = None

    executed_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    @model_validator(mode="after")
    def validate_result(self):
        if self.status == TaskStatus.FAILED and not self.error:
            raise ValueError("Failed agent results must contain an error")

        if self.status == TaskStatus.COMPLETED and self.error:
            raise ValueError("Completed agent results cannot contain an error")

        if self.requires_approval and self.status == TaskStatus.COMPLETED:
            raise ValueError(
                "A task requiring approval cannot be marked completed yet"
            )

        return self



class ApprovalRequest(AppBaseModel):
    approval_id: UUID = Field(default_factory=uuid4)

    workflow_id: UUID
    task_id: UUID

    requested_by: AgentName

    description: str

    reason: str

    requested_action: dict[str, Any] = Field(default_factory=dict)

    status: ApprovalStatus = ApprovalStatus.PENDING

    requested_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    expires_at: datetime | None = None

class ApprovalResult(AppBaseModel):
    approval_id: UUID

    decision: ApprovalDecision

    reviewed_by: str

    comments: str | None = None

    reviewed_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    @model_validator(mode="after")
    def validate_decision(self):
        if self.decision == ApprovalDecision.PENDING:
            raise ValueError(
                "ApprovalResult must contain a final decision"
            )

        return self

class WorkflowState(AppBaseModel):
    workflow_id: UUID = Field(default_factory=uuid4)

    employee_id: UUID

    current_plan: WorkflowPlan | None = None

    completed_steps: list[UUID] = Field(default_factory=list)

    pending_steps: list[UUID] = Field(default_factory=list)

    failed_steps: list[UUID] = Field(default_factory=list)

    approval_requests: list[ApprovalRequest] = Field(
        default_factory=list
    )

    workflow_status: WorkflowStatus = WorkflowStatus.PENDING

    started_at: datetime | None = None

    completed_at: datetime | None = None

    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    @model_validator(mode="after")
    def validate_state(self):
        groups = [
            set(self.completed_steps),
            set(self.pending_steps),
            set(self.failed_steps),
        ]

        if any(
            groups[i] & groups[j]
            for i in range(len(groups))
            for j in range(i + 1, len(groups))
        ):
            raise ValueError(
                "A task cannot belong to multiple workflow state groups"
            )

        if self.current_plan:
            known_ids = {
                step.task_id for step in self.current_plan.steps
            }

            referenced_ids = set().union(*groups)

            if not referenced_ids.issubset(known_ids):
                raise ValueError(
                    "Workflow state references tasks outside its current plan"
                )

        return self
class AuditEvent(AppBaseModel):
    event_id: UUID = Field(default_factory=uuid4)

    workflow_id: UUID

    event_type: AuditEventType

    actor: str

    description: str

    entity_id: UUID | None = None

    metadata: dict[str, Any] = Field(default_factory=dict)

    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )   
