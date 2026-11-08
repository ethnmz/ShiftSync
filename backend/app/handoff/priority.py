"""Item priority from config/rules.yaml → item_priority. First matching rule wins.

The LLM never sets priority.
"""
from __future__ import annotations

from typing import Any

from app import config
from app.handoff.view import ItemView


def _as_list(v: Any) -> list[Any]:
    return v if isinstance(v, list) else [v]


def _fact_matches(view: ItemView, cond: dict[str, Any]) -> bool:
    for f in view.facts:
        if "slot" in cond and f.slot != cond["slot"]:
            continue
        if "normalized" in cond and f.normalized not in cond["normalized"]:
            continue
        if "certainty" in cond and f.certainty not in cond["certainty"]:
            continue
        return True
    return False


def _rule_matches(view: ItemView, when: dict[str, Any]) -> bool:
    if "kind" in when and view.kind not in _as_list(when["kind"]):
        return False
    if "asset_category" in when and not (view.categories() & set(when["asset_category"])):
        return False
    if "asset_category_or_mention" in when:
        cats = view.categories() | view.mention_categories()
        if not (cats & set(when["asset_category_or_mention"])):
            return False
    if "any_fact" in when and not any(_fact_matches(view, c) for c in when["any_fact"]):
        return False
    return True


def compute_priority(view: ItemView) -> tuple[str, str]:
    """Return (priority, rule id)."""
    for rule in config.rules()["item_priority"]:
        if _rule_matches(view, rule.get("when") or {}):
            return rule["priority"], rule["id"]
    return "routine", "default"
