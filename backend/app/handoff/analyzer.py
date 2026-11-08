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
import json
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


@dataclass
class Grade:
    """Mirror of app.schemas.GradeResult."""
    verdict: str
    conveyed_fact_ids: list[str] = field(default_factory=list)
    missing_fact_ids: list[str] = field(default_factory=list)
    contradictions: list[dict[str, Any]] = field(default_factory=list)
    misconception: str | None = None
    feedback: str | None = None


class Analyzer(Protocol):
    async def extract(self, *, text: str, speaker: dict[str, Any], existing_items: list[dict[str, Any]],
                      scope: dict[str, Any] | None) -> Any: ...

    async def phrase_question(self, *, gap: dict[str, Any], item: dict[str, Any]) -> tuple[str, str]: ...

    async def brief(self, *, items: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]] | None: ...

    async def verify_question(self, *, item: dict[str, Any], answer_key: dict[str, Any]) -> str | None: ...

    async def grade(self, *, question: str, answer_key: dict[str, Any], answer: str) -> Any: ...


def _json(payload: dict[str, Any]) -> str:
    """User content for the model: JSON, so quotes like "didn't" can't break the structure."""
    return json.dumps(payload, ensure_ascii=False, indent=1, default=str)


def _prompt(name: str) -> str:
    return (config.BACKEND_DIR / "app" / "prompts" / f"{name}.md").read_text(encoding="utf-8")


async def _complete(task: str, prompt: str, user: str, schema_name: str) -> Any:
    client = importlib.import_module("app.llm.client")
    schemas = importlib.import_module("app.schemas")
    return await client.complete_json(task, _prompt(prompt), user, getattr(schemas, schema_name))


# ---------- Deterministic helpers ----------

def verify_quote(quote: str | None, text: str) -> bool:
    """Akshi's quote check (`app.certainty.quotes.supported_quote`) if present,
    else rapidfuzz partial_ratio ≥ 85."""
    if not quote:
        return False
    try:
        mod = importlib.import_module("app.certainty.quotes")
    except ImportError:
        mod = None
    check = getattr(mod, "supported_quote", None) or getattr(mod, "verify_quote", None)
    if check is not None:
        return bool(check(quote, text))
    return fuzz.partial_ratio(quote.lower(), text.lower()) >= QUOTE_MATCH_THRESHOLD


def _roster_for_llm() -> list[dict[str, Any]]:
    """Roster without phone numbers: only the configured providers see content, and phones aren't needed."""
    return [{"id": p["id"], "name": p["name"], "role": p["role"], "team": p.get("team")}
            for p in config.people().values()]


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
        except ImportError as e:
            raise AnalysisError("extraction is not available yet") from e
        speaker = {k: v for k, v in speaker.items() if k != "phone"}
        try:
            if hasattr(mod, "extract"):
                # Akshi's signature: extract(statement, *, assets, kinds, roster, speaker, existing_items, scope)
                return await mod.extract(text, assets=config.load_yaml("assets")["assets"],
                                         kinds=config.slots()["kinds"], roster=_roster_for_llm(),
                                         speaker=speaker, existing_items=existing_items, scope=scope)
            if hasattr(mod, "extract_statement"):
                return await mod.extract_statement(text=text, speaker=speaker, existing_items=existing_items,
                                                   scope=scope)
        except Exception as e:  # any failure → no state change
            log.warning("extraction failed: %s", e)
            raise AnalysisError("Couldn't analyze that. Try again or type it.") from e
        raise AnalysisError("extraction is not available yet")

    async def phrase_question(self, *, gap, item):
        try:
            user = _json({"GAP": gap, "ITEM": {"title": item["title"], "kind": item["kind"]},
                          "FACTS": item.get("facts", []), "SHIFT A'S WORDS": item.get("quotes", [])})
            out = await _complete("clarify", "clarify", user, "ClarificationText")
            return out.text, out.why_asked
        except Exception as e:  # missing module, provider down, invalid JSON twice
            log.info("clarify phrasing fell back to template: %s", e)
            return template_question(gap, item)

    async def brief(self, *, items):
        """(headline, lines) from the LLM, or None → caller uses the template."""
        try:
            out = await _complete("brief", "brief", _json({"REVIEWED ITEMS (in order)": items}), "BriefingText")
            return out.headline, [dict(line) for line in out.lines]
        except Exception as e:
            log.info("briefing fell back to template: %s", e)
            return None

    async def verify_question(self, *, item, answer_key):
        try:
            out = await _complete("verify_question", "verify_question",
                                  _json({"ITEM": item, "ANSWER KEY": answer_key}), "VerificationQuestionText")
            return out.text
        except Exception as e:
            log.info("verification question fell back to template: %s", e)
            return None

    async def grade(self, *, question, answer_key, answer):
        """GradeResult. Failure → AnalysisError (no attempt is recorded)."""
        try:
            return await _complete("grade", "grade",
                                   _json({"QUESTION": question, "ANSWER KEY": answer_key, "ANSWER": answer}), "GradeResult")
        except Exception as e:
            log.warning("grading failed: %s", e)
            raise AnalysisError("Couldn't check that answer. Try again.") from e


# ---------- Scripted analyzer (tests, offline demo) ----------

class ScriptedAnalyzer:
    """Returns queued Extractions in order. Question text always comes from the template."""

    def __init__(self, extractions: list[Extraction] | None = None):
        self.queue = list(extractions or [])
        self.grades: list[Grade] = []
        self.calls: list[dict[str, Any]] = []

    def push(self, extraction: Extraction) -> None:
        self.queue.append(extraction)

    def push_grade(self, grade: Grade) -> None:
        self.grades.append(grade)

    async def brief(self, *, items):
        return None

    async def verify_question(self, *, item, answer_key):
        return None

    async def grade(self, *, question, answer_key, answer):
        self.calls.append({"grade": answer})
        if not self.grades:
            raise AnalysisError("no scripted grade left")
        return self.grades.pop(0)

    async def extract(self, *, text, speaker, existing_items, scope):
        self.calls.append({"text": text, "scope": scope, "existing_items": existing_items})
        if not self.queue:
            raise AnalysisError("no scripted extraction left")
        return self.queue.pop(0)

    async def phrase_question(self, *, gap, item):
        return template_question(gap, item)
