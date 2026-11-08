"""Offline regression for retry, source evidence, and length-related drops."""
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from app.extract import extract_statement
from app.llm import client


class ExtractionTest(unittest.IsolatedAsyncioTestCase):
    async def test_retry_preserves_only_supported_ups_fact(self):
        statement = "UPS-B maintenance is mostly finished."
        fact = dict(slot="work_status", value="incomplete", quote=statement, certainty="unverified")
        item = dict(kind="vendor_work", title="UPS-B maintenance", asset_id="UPS-B", is_decision=False,
                    facts=[fact, dict(fact, quote="UPS-B is cleared for testing."),
                           dict(fact, quote=statement.lower()), dict(fact, value="word " * 16)])
        reply = {"items": [item, dict(item, title="word " * 9)]}
        with tempfile.TemporaryDirectory() as folder, \
                patch.dict(os.environ, LLM_PROVIDER_EXTRACT="nemotron", NEMOTRON_MODEL="offline"), \
                patch.object(client, "LOG", Path(folder) / "calls.jsonl"), \
                patch.object(client, "_request", new_callable=AsyncMock) as request, \
                self.assertLogs("app.extract", level="INFO") as logs:
            request.side_effect = ["{}", json.dumps(reply)]
            result = await extract_statement(text=statement, speaker={"id": "maya"}, existing_items=[], scope=None)
        self.assertEqual(request.await_count, 2)
        kept_item, = result.items
        kept_fact, = kept_item.facts
        self.assertEqual((kept_item.asset_id, kept_fact.normalized, kept_fact.certainty, kept_fact.quote),
                         ("UPS-B", "incomplete", "unverified", statement))
        self.assertTrue(any("title exceeds 8 words" in line for line in logs.output))
        self.assertTrue(any("value exceeds 15 words" in line for line in logs.output))
