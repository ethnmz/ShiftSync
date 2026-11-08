"""Which items Shift B is checked on, and the answer key for each (Problem 2).

Deterministic. The LLM phrases the question and grades the answer against this key.

Assumption (not stated in the spec): items carried over from an earlier
handoff are not re-checked here. The demo expects exactly two checks
(UPS-B, CHL-2) and a 0.5 first-attempt rate, which only holds if the
carried-over CRAC-3 item is left out.
"""
from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app import config
from app.followups.rules import owner_label
from app.handoff.view import ItemView
from app.models import FollowUp

# Slots Shift B should be able to explain, in key order: status, what remains
# or must be verified, why, conditions.
KEY_SLOTS = ("work_status", "operational_clearance", "current_mode", "lockout_status", "tag_holder",
             "condition", "findings", "remaining_work", "required_verification", "rationale",
             "restore_condition", "restrictions", "next_action", "decision")


def _uncertain(view: ItemView) -> bool:
    return any(f.certainty in ("unverified", "unknown") for f in view.facts)


def _all_confirmed_complete(view: ItemView) -> bool:
    return (all(f.certainty == "confirmed" for f in view.facts)
            and view.value("work_status") in (None, "complete")
            and view.value("operational_clearance") in (None, "cleared"))


def select_items(views: Iterable[ItemView], limit: int | None = None) -> list[ItemView]:
    """rules.yaml → verification.select_order, up to `verification_questions`."""
    limit = config.budgets()["verification_questions"] if limit is None else limit
    eligible = [v for v in views
                if v.item.open and not v.carried_over and v.priority != "routine"
                and not _all_confirmed_complete(v)]

    def group(v: ItemView) -> int | None:
        if v.priority == "critical" and (_uncertain(v) or v.is_open_work()):
            return 0
        if (v.kind in ("decision", "bypass") or v.item.is_decision) and (
                v.fact("rationale") or v.fact("restore_condition")):
            return 1
        if v.priority == "critical":
            return 2
        return None

    ranked = sorted(((g, i, v) for i, v in enumerate(eligible) if (g := group(v)) is not None),
                    key=lambda t: (t[0], t[1]))
    return [v for _, _, v in ranked[:limit]]


def _label(slot: str) -> str:
    return slot.replace("_", " ")


def build_answer_key(view: ItemView, followup: FollowUp | None = None) -> dict[str, Any]:
    """{must_convey: [{fact_id, statement, critical}], must_not_claim: [str]}.

    `critical` marks facts on safety slots. The verdict floor uses it.
    The follow-up owner is included only once a human has assigned one.
    """
    catalog = config.kind_slots(view.kind)
    must_convey: list[dict[str, Any]] = []
    for slot in KEY_SLOTS:
        f = view.fact(slot)
        if f is None:
            continue
        must_convey.append({
            "fact_id": f.id,
            "slot": slot,
            "statement": f"{_label(slot)}: {f.value} ({f.certainty})",
            "critical": bool(catalog.get(slot, {}).get("safety")),
        })
    if followup is not None and followup.owner_id:
        must_convey.append({
            "fact_id": None,
            "followup_id": followup.id,
            "slot": "owner",
            "statement": f"follow-up owner: {owner_label(followup)}",
            "critical": False,
        })

    must_not_claim: list[str] = []
    ws = view.value("work_status")
    if ws is not None and ws != "complete":
        must_not_claim.append("the work is complete")
    clearance = view.value("operational_clearance")
    if clearance in ("not_cleared", "unknown") or (
            clearance is None and ws not in (None, "complete") and view.categories() & {"power", "cooling"}):
        must_not_claim.append("the equipment is cleared for normal operation")
    if view.value("lockout_status") == "active":
        must_not_claim.append("the lockout has been removed")
    for f in view.facts:
        if f.certainty in ("unverified", "unknown"):
            must_not_claim.append(f"{_label(f.slot)} is confirmed")
    return {"must_convey": must_convey, "must_not_claim": must_not_claim}


def critical_fact_ids(answer_key: dict[str, Any]) -> set[str]:
    return {e["fact_id"] for e in answer_key.get("must_convey", []) if e.get("critical") and e.get("fact_id")}
