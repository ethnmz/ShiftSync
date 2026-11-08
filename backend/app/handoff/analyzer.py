"""The single seam between the handoff service and the AI code (owned by Akshi).

The service only needs two things from AI:
- `extract`: statement → items and facts with verbatim quotes
- `phrase_question`: the gap code chose → one short question

Everything after that (quote check fallback, certainty floor, asset check,
merge, priority, follow-ups, gaps, budget) is deterministic code in this repo.

`DefaultAnalyzer` calls Akshi's modules when they exist. Until then, or if a
call fails, extraction raises AnalysisError (the caller makes no state change)
and question wording falls back to a template built from slots.yaml hints.
Tests pass a `ScriptedAnalyzer`.
"""
from __future__ import annotations

import importlib
import logging
from dataclasses import dataclass, field
from typing import Any, Protocol

from rapidfuzz import fuzz

from app import config

log = logging.getLogger(__name__)

QUOTE_MATCH_THRESHOLD = 85


class AnalysisError(RuntimeError):
    """Extraction failed. Keep the statement, change nothing else."""


# ---------- Shapes (mirror app.schemas from docs/AI_PIPELINE.md; duck-typed) ----------

@dataclass
class ExtractedFact:
    slot: str
    value: str
    certainty: str
    quote: str
    normalized: str | None = None
    owner_mentioned: str | None = None
    deadline_text: str | None = None


@dataclass
class ExtractedItem:
    kind: str
    title: str
    facts: list[ExtractedFact] = field(default_factory=list)
    link_item_id: str | None = None
    asset_mention: str | None = None
    asset_id: str | None = None
    is_decision: bool = False


@dataclass
class Extraction:
    items: list[ExtractedItem] = field(default_factory=list)
    unscoped_claims: list[str] = field(default_factory=list)


class Analyzer(Protocol):
    async def extract(self, *, text: str, speaker: dict[str, Any], existing_items: list[dict[str, Any]],
                      scope: dict[str, Any] | None) -> Any: ...

    async def phrase_question(self, *, gap: dict[str, Any], item: dict[str, Any]) -> tuple[str, str]: ...


# ---------- Deterministic helpers ----------

def verify_quote(quote: str | None, text: str) -> bool:
    """Akshi's quote check if present, else rapidfuzz partial_ratio ≥ 85."""
    if not quote:
        return False
    try:
        mod = importlib.import_module("app.certainty.quotes")
        return bool(mod.verify_quote(quote, text))
    except (ImportError, AttributeError):
        return fuzz.partial_ratio(quote.lower(), text.lower()) >= QUOTE_MATCH_THRESHOLD


def template_question(gap: dict[str, Any], item: dict[str, Any]) -> tuple[str, str]:
    """Plain question from slots.yaml hints. Used when the LLM is unavailable."""
    catalog = config.kind_slots(item["kind"])
    title = item["title"]
    parts = []
    for slot in gap["slots"]:
        hint = catalog.get(slot, {}).get("hint")
        parts.append(hint or f"What is the {slot.replace('_', ' ')}?")
    if gap["gap_type"] == "missing_owner_or_deadline":
        parts = [f"Who will follow up on {title}, and by when?"]
    reason = gap.get("reason", "")
    prefix = ""
    if reason.startswith('vague:"'):
        prefix = f'You said "{reason[7:-1]}" about {title}. '
    elif gap["gap_type"] == "uncertain_claim":
        prefix = f"About {title}: "
    else:
        prefix = f"{title}: "
    text = prefix + " ".join(parts)
    why = {
        "vague_statement": reason.replace("vague:", "").strip() + ": what exactly?",
        "missing_required": "required for this item",
        "uncertain_claim": "status not confirmed",
        "missing_rationale": "reason not given",
        "missing_condition": "condition not given",
        "unscoped_claim": "no equipment named",
        "missing_owner_or_deadline": "no owner or deadline",
    }.get(gap["gap_type"], "missing detail")
    return text, why


# ---------- Default (real) analyzer ----------

class DefaultAnalyzer:
    async def extract(self, *, text, speaker, existing_items, scope):
        try:
            mod = importlib.import_module("app.extract")
            fn = getattr(mod, "extract_statement")
        except (ImportError, AttributeError) as e:
            raise AnalysisError("extraction is not available yet") from e
        try:
            return await fn(text=text, speaker=speaker, existing_items=existing_items, scope=scope)
        except Exception as e:  # any failure → no state change
            log.warning("extraction failed: %s", e)
            raise AnalysisError("Couldn't analyze that. Try again or type it.") from e

    async def phrase_question(self, *, gap, item):
        try:
            client = importlib.import_module("app.llm.client")
            schemas = importlib.import_module("app.schemas")
            prompt_path = config.BACKEND_DIR / "app" / "prompts" / "clarify.md"
            system = prompt_path.read_text(encoding="utf-8")
            user = (f"GAP: {gap['gap_type']} on slots {gap['slots']} ({gap.get('reason', '')})\n"
                    f"ITEM: {item['title']} ({item['kind']})\n"
                    f"FACTS: {item.get('facts', [])}\n"
                    f"SHIFT A'S WORDS: {item.get('quotes', [])}")
            out = await client.complete_json("clarify", system, user, schemas.ClarificationText)
            return out.text, out.why_asked
        except Exception as e:  # missing module, provider down, invalid JSON twice
            log.info("clarify phrasing fell back to template: %s", e)
            return template_question(gap, item)


# ---------- Scripted analyzer (tests, offline demo) ----------

class ScriptedAnalyzer:
    """Returns queued Extractions in order. Question text always comes from the template."""

    def __init__(self, extractions: list[Extraction] | None = None):
        self.queue = list(extractions or [])
        self.calls: list[dict[str, Any]] = []

    def push(self, extraction: Extraction) -> None:
        self.queue.append(extraction)

    async def extract(self, *, text, speaker, existing_items, scope):
        self.calls.append({"text": text, "scope": scope, "existing_items": existing_items})
        if not self.queue:
            raise AnalysisError("no scripted extraction left")
        return self.queue.pop(0)

    async def phrase_question(self, *, gap, item):
        return template_question(gap, item)
