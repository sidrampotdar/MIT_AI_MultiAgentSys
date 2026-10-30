"""Structured Multi-Agent Dispatcher and Event Bus.

Supports agent registration, discovery, structured message exchange,
agent-to-agent delegation, correlation tracking, and pub/sub events.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable
from uuid import uuid4

from app.core.state import WorkflowStateStore
from app.models.schemas import AgentMessage

logger = logging.getLogger("agent_dispatcher")


@dataclass
class AgentDescriptor:
    name: str
    role: str
    responsibilities: list[str]
    allowed_tools: list[str]
    handler: Callable[[AgentMessage], dict[str, Any]] | None = None


class AgentDispatcher:
    def __init__(self, state_store: WorkflowStateStore):
        self.state = state_store
        self._agents: dict[str, AgentDescriptor] = {}
        self._event_subscribers: dict[str, list[Callable[[dict[str, Any]], None]]] = {}

    def register_agent(self, descriptor: AgentDescriptor) -> None:
        self._agents[descriptor.name] = descriptor
        logger.info(f"Agent registered: {descriptor.name} ({descriptor.role})")

    def get_agent(self, name: str) -> AgentDescriptor | None:
        return self._agents.get(name)

    def list_agents(self) -> list[dict[str, Any]]:
        return [
            {
                "name": a.name,
                "role": a.role,
                "responsibilities": a.responsibilities,
                "allowed_tools": a.allowed_tools,
            }
            for a in self._agents.values()
        ]

    def send_message(
        self,
        workflow_id: str,
        sender: str,
        recipient: str,
        content: str,
        data: dict[str, Any] | None = None,
        task_id: str | None = None,
        correlation_id: str | None = None,
        message_type: str = "request",
    ) -> AgentMessage:
        """Send a structured message from one agent to another and record it durably."""
        corr_id = correlation_id or f"CORR-{uuid4().hex[:10].upper()}"
        payload_data = data or {}

        msg_id = self.state.save_agent_message(
            workflow_id=workflow_id,
            sender_agent=sender,
            recipient_agent=recipient,
            task_id=task_id,
            correlation_id=corr_id,
            message_type=message_type,
            content=content,
            data=payload_data,
        )

        self.state.audit(
            workflow_id=workflow_id,
            task_id=task_id,
            actor=sender,
            event_type="agent_message_sent",
            status="delivered",
            input_data={"to": recipient, "type": message_type, "content": content},
            output_data={"message_id": msg_id, "correlation_id": corr_id},
        )

        msg = AgentMessage(
            message_id=msg_id,
            workflow_id=workflow_id,
            sender_agent=sender,
            recipient_agent=recipient,
            task_id=task_id,
            correlation_id=corr_id,
            message_type=message_type,
            content=content,
            data=payload_data,
        )

        # Publish agent.message_sent event
        self.publish_event("agent.message_sent", {
            "workflow_id": workflow_id,
            "message_id": msg_id,
            "sender": sender,
            "recipient": recipient,
            "content": content,
            "correlation_id": corr_id,
        })

        # If recipient has an active synchronous handler, invoke it
        target_agent = self.get_agent(recipient)
        if target_agent and target_agent.handler:
            try:
                response_data = target_agent.handler(msg)
                if response_data:
                    # Record acknowledgment or reply
                    self.state.save_agent_message(
                        workflow_id=workflow_id,
                        sender_agent=recipient,
                        recipient_agent=sender,
                        task_id=task_id,
                        correlation_id=corr_id,
                        message_type="response",
                        content=f"Processed request: {content[:80]}",
                        data=response_data,
                    )
            except Exception as exc:
                logger.error(f"Error executing agent handler for {recipient}: {exc}")

        return msg

    def delegate_task(
        self,
        workflow_id: str,
        delegating_agent: str,
        target_agent: str,
        task_id: str,
        task_instruction: str,
        context: dict[str, Any]
    ) -> AgentMessage:
        """Formal agent-to-agent task delegation."""
        return self.send_message(
            workflow_id=workflow_id,
            sender=delegating_agent,
            recipient=target_agent,
            task_id=task_id,
            content=task_instruction,
            data=context,
            message_type="delegation",
        )

    # --- Pub/Sub Event Bus ---

    def subscribe(self, event_name: str, handler: Callable[[dict[str, Any]], None]) -> None:
        self._event_subscribers.setdefault(event_name, []).append(handler)

    def publish_event(self, event_name: str, payload: dict[str, Any]) -> None:
        handlers = self._event_subscribers.get(event_name, [])
        for h in handlers:
            try:
                h(payload)
            except Exception as exc:
                logger.error(f"Event subscriber error on {event_name}: {exc}")
        # Global listeners ('*')
        for h in self._event_subscribers.get("*", []):
            try:
                h({"event": event_name, **payload})
            except Exception as exc:
                logger.error(f"Wildcard subscriber error on {event_name}: {exc}")

