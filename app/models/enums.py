from enum import Enum


class WorkflowStatus(str, Enum):
    PENDING = "pending"
    READY = "ready"
    IN_PROGRESS = "in_progress"
    WAITING_APPROVAL = "waiting_approval"
    WAITING_FOR_APPROVAL = "waiting_for_approval"  # backwards compatibility alias
    BLOCKED = "blocked"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


class TaskStatus(str, Enum):
    PENDING = "pending"
    READY = "ready"
    IN_PROGRESS = "in_progress"
    WAITING_APPROVAL = "waiting_approval"
    WAITING_FOR_APPROVAL = "waiting_for_approval"  # backwards compatibility alias
    BLOCKED = "blocked"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    ESCALATED = "escalated"
    RETRY_SCHEDULED = "retry_scheduled"


class AgentName(str, Enum):
    PLANNER = "planner_agent"
    DOCUMENT = "document_agent"
    EDUCATION_VERIFICATION = "education_verification_agent"
    EMPLOYMENT_VERIFICATION = "employment_verification_agent"
    EMAIL_OPERATIONS = "email_operations_agent"
    FINANCE = "finance_agent"
    HR = "hr_agent"
    ACCOUNT = "account_agent"
    EQUIPMENT = "equipment_agent"
    COMPLIANCE = "compliance_agent"
    COMMUNICATION = "communication_agent"
    # Aliases for compatibility
    IT = "account_agent"
    NOTIFICATION = "communication_agent"


class ToolStatus(str, Enum):
    REQUESTED = "requested"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    BLOCKED = "blocked"


class ApprovalDecision(str, Enum):
    APPROVED = "approved"
    REJECTED = "rejected"
    PENDING = "pending"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class RedFlagSeverity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RedFlagCategory(str, Enum):
    EDUCATION = "education"
    EMPLOYMENT = "employment"
    FINANCE = "finance"
    EMAIL = "email"
    ACCESS = "access"
    COMPLIANCE = "compliance"


class VerificationStatus(str, Enum):
    NOT_STARTED = "not_started"
    REQUEST_DRAFTED = "request_drafted"
    WAITING_APPROVAL = "waiting_approval"
    REQUEST_SENT = "request_sent"
    WAITING_REPLY = "waiting_reply"
    REPLY_RECEIVED = "reply_received"
    UNDER_REVIEW = "under_review"
    CONFIRMED = "confirmed"
    DISCREPANCY = "discrepancy"
    REJECTED = "rejected"
    ESCALATED = "escalated"


class AuditEventType(str, Enum):
    WORKFLOW_CREATED = "workflow_created"
    PLAN_CREATED = "plan_created"
    PLAN_REVISED = "plan_revised"
    TASK_ASSIGNED = "task_assigned"
    TASK_STARTED = "task_started"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    TASK_RETRYING = "task_retrying"
    AGENT_MESSAGE_SENT = "agent_message_sent"
    TOOL_REQUESTED = "tool_requested"
    TOOL_EXECUTED = "tool_executed"
    TOOL_FAILED = "tool_failed"
    TOOL_BLOCKED = "tool_blocked"
    APPROVAL_REQUESTED = "approval_requested"
    APPROVAL_GRANTED = "approval_granted"
    APPROVAL_REJECTED = "approval_rejected"
    EMAIL_DRAFTED = "email_drafted"
    EMAIL_SENT = "email_sent"
    EMAIL_RECEIVED = "email_received"
    RED_FLAG_DETECTED = "red_flag_detected"
    RED_FLAG_RESOLVED = "red_flag_resolved"
    WORKFLOW_PAUSED = "workflow_paused"
    WORKFLOW_RESUMED = "workflow_resumed"
    WORKFLOW_COMPLETED = "workflow_completed"
    WORKFLOW_FAILED = "workflow_failed"
    WORKFLOW_CANCELLED = "workflow_cancelled"
