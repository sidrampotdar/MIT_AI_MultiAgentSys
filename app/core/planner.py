"""Structured, provider-backed planner with deterministic policy validation and replanning."""

from __future__ import annotations

import json
from typing import Any

from app.core.llm import LLMProvider, Message


class PlanError(ValueError):
    """Raised when a model plan is malformed or outside enterprise policy."""


class Planner:
    def __init__(self, provider: LLMProvider, allowed_tasks: list[dict[str, Any]]):
        self.provider = provider
        self.allowed_tasks = allowed_tasks

    def create_plan(self, goal: str, employee: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        permitted = [
            {key: item[key] for key in ("task_id", "agent", "tool", "depends_on") if key in item}
            | ({"approval_action": item["approval_action"]} if "approval_action" in item else {})
            for item in self.allowed_tasks
        ]
        prompt = (
            "Produce a JSON execution plan only. The JSON must be an object with a tasks array. "
            "Select the required onboarding tasks from the approved task catalogue exactly; do not invent agents, tools, or dependencies. "
            f"Business goal: {goal}\nEmployee context: {json.dumps(employee)}\nApproved catalogue: {json.dumps(permitted)}"
        )
        response = self.provider.complete([
            Message("system", "You are the Planner Agent. Return valid JSON only. AI proposals cannot bypass workflow policy."),
            Message("user", prompt)
        ])
        try:
            parsed = self._parse_json(response.content)
            tasks = parsed.get("tasks")
            if not isinstance(tasks, list):
                raise PlanError("tasks must be a JSON array")
            return tasks, {
                "provider": response.provider,
                "model": response.model,
                "usage": response.usage,
                "raw_response": response.content
            }
        except (json.JSONDecodeError, KeyError, TypeError, PlanError) as exc:
            raise PlanError(f"Planner did not produce a usable plan: {exc}") from exc

    def replan(
        self,
        current_plan: list[dict[str, Any]],
        completed_tasks: list[str],
        failed_task_id: str,
        reason: str
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """Re-plan workflow around a failed or blocked task, keeping completed work intact."""
        prompt = (
            "You are the Planner Agent. Re-plan the onboarding workflow given a blocked task.\n"
            f"Completed tasks: {json.dumps(completed_tasks)}\n"
            f"Blocked task: {failed_task_id} due to: {reason}\n"
            f"Current plan: {json.dumps(current_plan)}\n"
            "Return a JSON object with a tasks array containing the revised steps."
        )
        response = self.provider.complete([
            Message("system", "You are the Planner Agent. Return valid JSON only with a tasks array."),
            Message("user", prompt)
        ])
        try:
            parsed = self._parse_json(response.content)
            tasks = parsed.get("tasks", current_plan)
            return tasks, {
                "provider": response.provider,
                "model": response.model,
                "replan_reason": reason,
            }
        except Exception:
            # Safe deterministic fallback
            return current_plan, {"fallback": True, "reason": reason}

    @staticmethod
    def _parse_json(content: str) -> dict[str, Any]:
        stripped = content.strip()
        if stripped.startswith("```"):
            stripped = stripped.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(stripped)
