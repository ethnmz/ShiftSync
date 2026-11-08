"""Structured model calls. Callers persist results only after successful validation."""
import json
import os
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)
LOG = Path(__file__).resolve().parents[2] / "data" / "llm_log.jsonl"


async def _request(provider, model, system, user, schema):
    if provider == "claude":
        from anthropic import AsyncAnthropic

        async with AsyncAnthropic() as client:
            response = await client.messages.create(
                model=model, max_tokens=4096, temperature=0, system=system,
                messages=[{"role": "user", "content": user}],
                tools=[{"name": "result", "input_schema": schema}],
                tool_choice={"type": "tool", "name": "result"},
            )
        for block in response.content:
            if block.type == "tool_use" and block.name == "result":
                return json.dumps(block.input)
        return ""

    from openai import AsyncOpenAI

    async with AsyncOpenAI(api_key=os.environ["NVIDIA_API_KEY"],
                           base_url=os.environ["NVIDIA_BASE_URL"]) as client:
        response = await client.chat.completions.create(
            model=model, temperature=0,
            messages=[{"role": "system", "content": system + "\nJSON schema: " + json.dumps(schema)},
                      {"role": "user", "content": user}],
        )
    raw = response.choices[0].message.content or ""
    raw = raw.strip()
    if not raw.startswith(("{", "```")) and "</think>" in raw:
        raw = raw.partition("</think>")[2].strip()
    return raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()


async def complete_json(task: str, system: str, user: str, schema: type[T]) -> T:
    provider = os.getenv("LLM_PROVIDER_" + task.upper()) or os.getenv("LLM_PROVIDER", "nemotron")
    if provider not in {"nemotron", "claude"}:
        raise ValueError(f"Unsupported provider: {provider}")
    model = os.getenv(provider.upper() + "_MODEL")
    if not model:
        raise ValueError(f"Set {provider.upper()}_MODEL before running a live extraction")
    for attempt in (1, 2):
        status = "error"
        try:
            raw = await _request(provider, model, system, user, schema.model_json_schema())
            result = schema.model_validate_json(raw)
            status = "validated"
            return result
        except ValidationError as exc:
            status = "invalid_output"
            if attempt == 2:
                raise
            user += "\nCorrect the following validation errors and return JSON only: " + str(
                exc.errors(include_input=False, include_url=False)
            )
        finally:
            LOG.parent.mkdir(parents=True, exist_ok=True)
            with LOG.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(dict(task=task, provider=provider, attempt=attempt, status=status)) + "\n")
