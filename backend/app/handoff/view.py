"""Read-only view of an item and its current facts, shared by the deterministic rules.

Rules (priority, gaps, planner, follow-ups, verification, briefing) take
`ItemView`s so they can be unit-tested without a database.
"""
from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass, field

from app import config
from app.models import Fact, Item

# Words that tie an un-matched mention ("the cooling inspection") to a category.
MENTION_CATEGORY_WORDS = {
    "power": ("power", "ups", "generator", "breaker", "ats", "transfer switch", "pdu", "utility", "battery"),
    "cooling": ("cooling", "chiller", "crac", "chilled", "hvac", "cooler", "valve"),
}


def current_facts(facts: Iterable[Fact]) -> list[Fact]:
    """Facts still in force: not superseded and not rejected by the operator."""
    return [f for f in facts if f.superseded_by is None and f.review_state != "operator_rejected"]


@dataclass
class ItemView:
    item: Item
    facts: list[Fact] = field(default_factory=list)
    carried_over: bool = False

    @classmethod
    def build(cls, item: Item, facts: Iterable[Fact], carried_over: bool | None = None) -> "ItemView":
        mine = current_facts(f for f in facts if f.item_id == item.id)
        if carried_over is None:
            carried_over = item.origin_item_id is not None
        return cls(item=item, facts=mine, carried_over=carried_over)

    @property
    def id(self) -> str:
        return self.item.id

    @property
    def kind(self) -> str:
        return self.item.kind

    @property
    def priority(self) -> str:
        return self.item.priority

    def fact(self, slot: str) -> Fact | None:
        """Current fact for a slot (last one wins if several)."""
        found = [f for f in self.facts if f.slot == slot]
        return found[-1] if found else None

    def value(self, slot: str) -> str | None:
        f = self.fact(slot)
        if f is None:
            return None
        return f.normalized or f.value

    def categories(self) -> set[str]:
        cats = {c for a in self.item.asset_ids if (c := config.asset_category(a))}
        return cats

    def mention_categories(self) -> set[str]:
        text = " ".join(filter(None, [self.item.asset_mention, self.item.title])).lower()
        return {cat for cat, words in MENTION_CATEGORY_WORDS.items()
                if any(re.search(rf"\b{re.escape(w)}\b", text) for w in words)}

    def is_open_work(self) -> bool:
        ws = self.value("work_status")
        return ws in ("incomplete", "pending", "not_started", "unknown")


# ---------- `when` conditions from slots.yaml ----------

_CLAUSE = re.compile(r"^\s*(\w+)\s+(==|!=|not in|in)\s+(.+?)\s*$")


def _parse_rhs(raw: str) -> list[str]:
    raw = raw.strip()
    if raw.startswith("[") and raw.endswith("]"):
        return [v.strip() for v in raw[1:-1].split(",") if v.strip()]
    return [raw]


def eval_when(expr: str | None, view: ItemView) -> bool:
    """Evaluate a slots.yaml `when` like "asset_category in [power, cooling] and work_status != complete".

    A slot with no fact has value None, so `work_status != complete` is True when
    work_status is missing. `asset_category` also counts categories implied by the mention.
    """
    if not expr:
        return True
    for clause in expr.split(" and "):
        m = _CLAUSE.match(clause)
        if not m:
            raise ValueError(f"cannot parse when-clause {clause!r}")
        lhs, op, rhs = m.group(1), m.group(2), _parse_rhs(m.group(3))
        if lhs == "asset_category":
            values = view.categories() | view.mention_categories()
        else:
            v = view.value(lhs)
            values = {v} if v is not None else set()
        hit = bool(values & set(rhs))
        if op in ("==", "in") and not hit:
            return False
        if op in ("!=", "not in") and hit:
            return False
    return True
