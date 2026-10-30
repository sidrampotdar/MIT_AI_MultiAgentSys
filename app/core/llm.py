"""Provider-neutral LLM interface with Groq, Gemini, and offline adapters.
Includes timeout handling, retries, exponential backoff, structured output parsing,
and automatic provider fallback.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Protocol

from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("enterprise_llm")


@dataclass(frozen=True)
class Message:
    role: str
    content: str


@dataclass(frozen=True)
class ToolRequest:
    name: str
    arguments: dict[str, Any]
    call_id: str = "tool-call-1"


@dataclass
class LLMResponse:
    content: str = ""
    tool_calls: list[ToolRequest] = field(default_factory=list)
    provider: str = "unknown"
    model: str = "unknown"
    usage: dict[str, int] = field(default_factory=dict)
    latency_ms: float = 0.0

    def parse_json(self) -> dict[str, Any]:
        """Safely extract and parse JSON object from markdown-wrapped content."""
        raw = self.content.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return json.loads(raw)


class LLMProvider(Protocol):
    def complete(self, messages: list[Message], tools: list[dict[str, Any]] | None = None) -> LLMResponse: ...


class OfflineProvider:
    """Predictable provider used for demos and tests; makes no network calls."""

    def __init__(self, model: str = "rule-based"):
        self.model = model

    def complete(self, messages: list[Message], tools: list[dict[str, Any]] | None = None) -> LLMResponse:
        start_t = time.perf_counter()
        prompt = messages[-1].content.lower() if messages else ""
        calls: list[ToolRequest] = []

        if "produce a json execution plan" in prompt:
            tasks = [
                {"task_id": "documents", "agent": "document_agent", "tool": "validate_documents", "depends_on": []},
                {"task_id": "education", "agent": "verification_agent", "tool": "send_education_verification", "depends_on": ["documents"], "approval_action": "send_education_verification"},
                {"task_id": "salary", "agent": "finance_agent", "tool": "calculate_salary", "depends_on": ["education"], "approval_action": "finalize_salary_profile"},
                {"task_id": "hr_record", "agent": "hr_agent", "tool": "create_hr_record", "depends_on": ["salary"]},
                {"task_id": "accounts", "agent": "account_agent", "tool": "provision_standard_accounts", "depends_on": ["hr_record"]},
                {"task_id": "equipment", "agent": "equipment_agent", "tool": "allocate_equipment", "depends_on": ["hr_record"]},
                {"task_id": "compliance", "agent": "compliance_agent", "tool": "complete_compliance", "depends_on": ["hr_record"]},
                {"task_id": "welcome", "agent": "communication_agent", "tool": "send_welcome_email", "depends_on": ["accounts", "equipment", "compliance"]},
            ]
            return LLMResponse(
                content=json.dumps({"tasks": tasks}),
                provider="offline",
                model=self.model,
                usage={"input_tokens": 50, "output_tokens": 150},
                latency_ms=(time.perf_counter() - start_t) * 1000,
            )

        if tools:
            for tool in tools:
                func_name = tool.get("function", {}).get("name", "")
                if func_name and func_name.replace("_", " ") in prompt:
                    calls.append(ToolRequest(name=func_name, arguments={}))
                    break

        return LLMResponse(
            content=json.dumps({"decision": "approved", "reason": "offline provider rule-based decision"}),
            tool_calls=calls,
            provider="offline",
            model=self.model,
            usage={"input_tokens": 20, "output_tokens": 20},
            latency_ms=(time.perf_counter() - start_t) * 1000,
        )


class GroqProvider:
    """Normalizes LangChain/Groq responses into the application's contract."""

    def __init__(self, model: str | None = None, temperature: float = 0.0, timeout: float = 30.0):
        from langchain_groq import ChatGroq
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not configured")
        # Default to active Groq model
        self.model = model or os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
        self.temperature = temperature
        self.timeout = timeout
        self.client = ChatGroq(model=self.model, temperature=temperature, timeout=timeout)

    def complete(self, messages: list[Message], tools: list[dict[str, Any]] | None = None) -> LLMResponse:
        from langchain_core.messages import HumanMessage, SystemMessage
        start_t = time.perf_counter()
        converted = [
            SystemMessage(content=m.content) if m.role == "system" else HumanMessage(content=m.content)
            for m in messages
        ]
        bound_client = self.client.bind_tools(tools) if tools else self.client
        result = bound_client.invoke(converted)

        calls = [
            ToolRequest(
                name=call["name"],
                arguments=call.get("args", {}),
                call_id=call.get("id", f"call-{time.time_ns()}")
            )
            for call in getattr(result, "tool_calls", [])
        ]
        usage = getattr(result, "usage_metadata", {}) or {}
        return LLMResponse(
            content=str(result.content),
            tool_calls=calls,
            provider="groq",
            model=self.model,
            usage=dict(usage),
            latency_ms=(time.perf_counter() - start_t) * 1000,
        )


class GeminiProvider:
    """Gemini adapter that normalizes native function calls into ToolRequest."""

    def __init__(self, model: str | None = None, temperature: float = 0.0, timeout: float = 30.0):
        from google import genai
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY is not configured")
        # Default to active Gemini model
        self.model = model or os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        self.temperature = temperature
        self.timeout = timeout
        self.client = genai.Client(api_key=api_key)

    def complete(self, messages: list[Message], tools: list[dict[str, Any]] | None = None) -> LLMResponse:
        from google.genai import types
        start_t = time.perf_counter()
        system = "\n\n".join(m.content for m in messages if m.role == "system")
        prompt = "\n\n".join(m.content for m in messages if m.role != "system")

        declarations = []
        for tool in tools or []:
            func = tool.get("function", {})
            declarations.append(
                types.FunctionDeclaration(
                    name=func["name"],
                    description=func.get("description", ""),
                    parameters_json_schema=func.get("parameters")
                )
            )

        config = types.GenerateContentConfig(
            system_instruction=system or None,
            temperature=self.temperature,
            tools=[types.Tool(function_declarations=declarations)] if declarations else None,
        )

        result = self.client.models.generate_content(
            model=self.model,
            contents=prompt,
            config=config
        )

        calls: list[ToolRequest] = []
        if result.candidates and result.candidates[0].content:
            for part in (result.candidates[0].content.parts or []):
                if getattr(part, "function_call", None):
                    fc = part.function_call
                    calls.append(
                        ToolRequest(
                            name=fc.name,
                            arguments=dict(fc.args or {}),
                            call_id=getattr(fc, "id", None) or f"gemini-call-{time.time_ns()}"
                        )
                    )

        usage_meta = getattr(result, "usage_metadata", None)
        usage = usage_meta.model_dump() if (usage_meta and hasattr(usage_meta, "model_dump")) else {}

        return LLMResponse(
            content=result.text or "",
            tool_calls=calls,
            provider="gemini",
            model=self.model,
            usage=usage,
            latency_ms=(time.perf_counter() - start_t) * 1000,
        )


class ResilientLLMProvider:
    """Wrapper that adds retry policies, backoff, and fallback provider support."""

    def __init__(
        self,
        primary: LLMProvider,
        fallback: LLMProvider | None = None,
        max_retries: int = 2,
        backoff_factor: float = 1.5,
    ):
        self.primary = primary
        self.fallback = fallback
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor

    def complete(self, messages: list[Message], tools: list[dict[str, Any]] | None = None) -> LLMResponse:
        delay = 1.0
        last_error: Exception | None = None

        # 1. Try primary provider with retries
        for attempt in range(self.max_retries + 1):
            try:
                return self.primary.complete(messages, tools)
            except Exception as exc:
                last_error = exc
                logger.warning(
                    f"LLM primary provider failed attempt {attempt + 1}/{self.max_retries + 1}: {exc}"
                )
                if attempt < self.max_retries:
                    time.sleep(delay)
                    delay *= self.backoff_factor

        # 2. Try fallback provider if available
        if self.fallback:
            logger.info("Engaging fallback LLM provider...")
            try:
                return self.fallback.complete(messages, tools)
            except Exception as fb_exc:
                logger.error(f"Fallback LLM provider also failed: {fb_exc}")
                raise RuntimeError(
                    f"Both primary and fallback LLM providers failed. Primary error: {last_error}; Fallback error: {fb_exc}"
                ) from fb_exc

        raise RuntimeError(f"LLM provider failed after {self.max_retries + 1} attempts: {last_error}") from last_error


def create_provider(
    provider_name: str | None = None,
    with_fallback: bool = True,
    fallback_provider: str | None = None
) -> LLMProvider:
    """Factory creating configured LLM provider with optional resilient fallback."""
    selected = (provider_name or os.getenv("LLM_PROVIDER", "groq")).lower()

    def _build_single(name: str) -> LLMProvider:
        if name == "groq":
            return GroqProvider(model=os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b"))
        if name == "gemini":
            return GeminiProvider(model=os.getenv("GEMINI_MODEL", "gemini-3.8-flash"))
        if name == "offline":
            return OfflineProvider()
        raise ValueError(f"Unsupported LLM provider: {name}. Use 'offline', 'groq', or 'gemini'.")

    primary = _build_single(selected)

    if not with_fallback or selected == "offline":
        return primary

    # Determine fallback: if primary is groq, fallback to gemini (or offline if key missing)
    if fallback_provider:
        fb_name = fallback_provider.lower()
    else:
        fb_name = "gemini" if selected == "groq" else "groq"

    try:
        fallback = _build_single(fb_name)
    except Exception:
        fallback = OfflineProvider()

    return ResilientLLMProvider(primary=primary, fallback=fallback)
