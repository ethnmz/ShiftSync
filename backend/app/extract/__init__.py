"""Extract candidate facts for review; the core applies its certainty rules next."""
import json
import logging
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..certainty.quotes import supported_quote
from ..llm.client import complete_json

PROMPT = Path(__file__).resolve().parents[1] / "prompts" / "extract.md"
logger = logging.getLogger(__name__)


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class FactOut(Candidate):
    slot: str
    value: str = Field(min_length=1)
    normalized: str | None = None
    certainty: Literal["confirmed", "reported", "unverified", "unknown"]
    quote: str
    owner_mentioned: str | None = None
    deadline_text: str | None = None


class ItemOut(Candidate):
    link_item_id: str | None = None
    kind: str
    asset_mention: str | None = None
    asset_id: str | None = None
    title: str = Field(min_length=1)
    is_decision: bool
    facts: list[FactOut]


class ExtractionResult(Candidate):
    items: list[ItemOut]
    unscoped_claims: list[str] = Field(default_factory=list)


async def extract_statement(*, text, speaker, existing_items, scope) -> ExtractionResult:
    """Entry point used by the handoff service for statements and clarification answers."""
    from .. import config

    def operator_context(person):
        return {key: person[key] for key in ("id", "name", "role", "team") if key in person}

    return await extract(
        text, assets=list(config.assets().values()), kinds=config.slots()["kinds"],
        roster=[operator_context(person) for person in config.people().values()],
        speaker=operator_context(speaker), existing_items=existing_items, scope=scope,
    )


async def extract(statement: str, *, assets, kinds, roster, speaker, existing_items=(), scope=None):
    """Pass assets.yaml's assets list and slots.yaml's kinds mapping as context."""
    if not statement.strip():
        return ExtractionResult(items=[])
    context = dict(statement=statement, assets=assets, kinds=kinds, roster=roster,
                   speaker=speaker, existing_items=existing_items, scope=scope)
    result = await complete_json("extract", PROMPT.read_text(encoding="utf-8-sig"),
                                 json.dumps(context, ensure_ascii=False), ExtractionResult)
    asset_ids = {asset["id"] for asset in assets}
    item_ids = {item["id"] for item in existing_items}
    kept = []
    for item in result.items:
        if item.kind not in kinds:
            continue
        if len(item.title.split()) > 8:
            logger.info("Dropped extracted item: title exceeds 8 words")
            continue
        if item.asset_id not in asset_ids:
            item.asset_id = None
        if item.link_item_id not in item_ids:
            item.link_item_id = None
        slots = kinds[item.kind]["slots"]
        facts = []
        for fact in item.facts:
            if not supported_quote(fact.quote, statement):
                logger.warning("Dropped extracted fact with unsupported source quote")
                continue
            if fact.slot not in slots:
                continue
            if len(fact.value.split()) > 15:
                logger.info("Dropped extracted fact: value exceeds 15 words")
                continue
            values = slots[fact.slot].get("values")
            if values and fact.normalized not in values:
                fact.normalized = fact.value if fact.value in values else None
            if fact.owner_mentioned and fact.owner_mentioned.casefold() not in fact.quote.casefold():
                fact.owner_mentioned = None
            if fact.deadline_text and fact.deadline_text not in fact.quote:
                fact.deadline_text = None
            facts.append(fact)
        if facts:
            kept.append(item.model_copy(update={"facts": facts}))
    return ExtractionResult(items=kept, unscoped_claims=[
        claim for claim in result.unscoped_claims if claim and claim in statement
    ])
