"""Briefing selection and order (Problem 2). Code orders; the LLM only writes lines.

Order (docs/ARCHITECTURE.md Stage 5, plus where carried-over items go):
0. critical open items from this handoff
1. items with unverified/unknown facts
2. decisions with rationale
3. open items carried over from an earlier handoff
4. everything else (routine/completed), shown collapsed

Assumption: carried-over items come after this handoff's own non-routine items.
The demo expects UPS-B, CHL-2, general_claim, CRAC-3 (carried), GEN-1.
"""
from __future__ import annotations

from collections.abc import Iterable

from app.handoff.view import ItemView


def _group(v: ItemView) -> int:
    if v.carried_over:
        return 3 if v.item.open else 4
    if v.priority == "critical" and v.item.open:
        return 0
    if any(f.certainty in ("unverified", "unknown") for f in v.facts):
        return 1
    if (v.item.is_decision or v.kind == "decision") and v.fact("rationale"):
        return 2
    return 4


def briefing_order(views: Iterable[ItemView]) -> list[ItemView]:
    indexed = list(enumerate(views))
    return [v for _, v in sorted(indexed, key=lambda t: (_group(t[1]), t[0]))]


def collapsed(view: ItemView) -> bool:
    """True for items the briefing shows collapsed (routine or completed)."""
    return _group(view) == 4
