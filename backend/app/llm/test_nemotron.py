"""Exercise the provider request and retry path without calling a live endpoint."""
import asyncio
import json

import httpx
import openai
from pydantic import BaseModel, ValidationError
import pytest

from app.llm import client


class Reply(BaseModel):
    text: str


@pytest.mark.parametrize("second_reply", ['{"text":"ready"}', None])
def test_reasoning_only_reply_retries_once(monkeypatch, tmp_path, second_reply):
    requests = []
    replies = iter([None, second_reply])

    def respond(request):
        requests.append(json.loads(request.content))
        return httpx.Response(200, json={
            "id": "test", "object": "chat.completion", "created": 0, "model": "test",
            "choices": [{"index": 0, "finish_reason": "length", "message": {
                "role": "assistant", "reasoning_content": "internal tokens", "content": next(replies),
            }}],
        })

    sdk = openai.AsyncOpenAI
    monkeypatch.setattr(openai, "AsyncOpenAI", lambda **kwargs: sdk(
        **kwargs, http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond))))
    monkeypatch.setenv("LLM_PROVIDER_EXTRACT", "nemotron")
    monkeypatch.setenv("NEMOTRON_MODEL", "test")
    monkeypatch.setenv("NVIDIA_API_KEY", "offline")
    monkeypatch.setenv("NVIDIA_BASE_URL", "https://example.invalid/v1")
    monkeypatch.setattr(client, "LOG", tmp_path / "calls.jsonl")
    call = client.complete_json("extract", "Return JSON", "test input", Reply)
    if second_reply is None:
        with pytest.raises(ValidationError):
            asyncio.run(call)
    else:
        assert asyncio.run(call).text == "ready"
    assert len(requests) == 2
    for request in requests:
        assert request["chat_template_kwargs"]["enable_thinking"] is False
        assert request["max_tokens"] > 0
