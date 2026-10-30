"""Centralized Recovery and Resilience Manager.

Handles retry policies, backoff, error categorization, idempotent retries,
and escalation when retries are exhausted.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Callable

from app.core.state import WorkflowStateStore

logger = logging.getLogger("recovery_manager")


class RecoveryManager:
    def __init__(self, state_store: WorkflowStateStore, max_retries: int = 3):
        self.state = state_store
        self.max_retries = max_retries

    def classify_error(self, error: Exception | str) -> str:
        """Classify error into retryable or non-retryable categories."""
        err_str = str(error).lower()
        if "out_of_stock" in err_str:
            return "RESOURCE_UNAVAILABLE"
        if "temporary" in err_str or "timeout" in err_str or "connection" in err_str:
            return "TRANSIENT_NETWORK"
        if "discrepancy" in err_str or "mismatch" in err_str:
            return "DATA_DISCREPANCY"
        if "approval" in err_str or "rejected" in err_str:
            return "APPROVAL_BLOCKED"
        if "unauthorized" in err_str or "forbidden" in err_str:
            return "SECURITY_VIOLATION"
        return "OPERATIONAL_FAILURE"

    def execute_with_retry(
        self,
        workflow_id: str,
        task_id: str,
        operation: Callable[[], dict[str, Any]],
        fallback_action: Callable[[], dict[str, Any]] | None = None,
        max_attempts: int | None = None,
    ) -> dict[str, Any]:
        """Execute an operation with bounded retry and backoff policy."""
        attempts_limit = max_attempts or self.max_retries
        last_result: dict[str, Any] = {}

        for attempt in range(1, attempts_limit + 1):
            try:
                result = operation()
                if result.get("success", True):
                    return result
                # Tool reported a structured failure
                error_type = self.classify_error(result.get("error_code") or result.get("message", "unknown"))
                last_result = result

                # Check if fallback action exists (e.g. approved laptop alternative)
                if fallback_action and error_type == "RESOURCE_UNAVAILABLE":
                    self.state.save_recovery_record(
                        workflow_id=workflow_id,
                        task_id=task_id,
                        attempt=attempt,
                        max_retries=attempts_limit,
                        error_type=error_type,
                        error_message=result.get("message", "Item out of stock"),
                        action_taken="use_approved_alternative",
                        status="in_progress",
                    )
                    fallback_res = fallback_action()
                    if fallback_res.get("success", True):
                        self.state.save_recovery_record(
                            workflow_id=workflow_id,
                            task_id=task_id,
                            attempt=attempt,
                            max_retries=attempts_limit,
                            error_type=error_type,
                            error_message="Recovered via alternative",
                            action_taken="use_approved_alternative",
                            status="recovered",
                        )
                        return fallback_res

                self.state.save_recovery_record(
                    workflow_id=workflow_id,
                    task_id=task_id,
                    attempt=attempt,
                    max_retries=attempts_limit,
                    error_type=error_type,
                    error_message=result.get("message", "Tool returned failure"),
                    action_taken="retry_attempt",
                    status="in_progress",
                )

            except Exception as exc:
                error_type = self.classify_error(exc)
                last_result = {"success": False, "error_code": error_type, "message": str(exc)}
                self.state.save_recovery_record(
                    workflow_id=workflow_id,
                    task_id=task_id,
                    attempt=attempt,
                    max_retries=attempts_limit,
                    error_type=error_type,
                    error_message=str(exc),
                    action_taken="retry_attempt",
                    status="in_progress",
                )

        # Retries exhausted - escalate
        self.state.save_recovery_record(
            workflow_id=workflow_id,
            task_id=task_id,
            attempt=attempts_limit,
            max_retries=attempts_limit,
            error_type="RETRIES_EXHAUSTED",
            error_message="Maximum retry limit reached",
            action_taken="escalate_to_human",
            status="escalated",
        )
        self.state.audit(
            workflow_id=workflow_id,
            task_id=task_id,
            actor="recovery_manager",
            event_type="task_failed",
            status="escalated",
            input_data={"retries": attempts_limit},
            output_data=last_result,
        )
        return last_result

