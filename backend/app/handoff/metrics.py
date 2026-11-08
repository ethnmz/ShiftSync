"""Per-handoff metrics (rules.yaml → metrics). Counts only what actually happened.

shift_b_seconds needs a "briefing opened" timestamp that is not stored yet, so
it stays None rather than being estimated.
"""
from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from app import clock
from app.followups.rules import counts
from app.models import Fact, VerificationCheck


def _seconds(a, b) -> float | None:
    if a is None or b is None:
        return None
    if a.tzinfo is None:
        a = a.replace(tzinfo=b.tzinfo)
    if b.tzinfo is None:
        b = b.replace(tzinfo=a.tzinfo)
    return (b - a).total_seconds()


def compute_metrics(session: Session, h) -> dict[str, Any]:
    from app.handoff.service import followups_for, handoff_items, questions_for, statements_for

    statements = statements_for(session, h.id)
    questions = questions_for(session, h.id)
    items = handoff_items(session, h.id)
    own_items = [i.id for i in items if i.origin_item_id is None]
    all_facts = list(session.exec(select(Fact).where(Fact.item_id.in_(own_items)))) if own_items else []
    current = [f for f in all_facts if f.superseded_by is None and f.review_state != "operator_rejected"]
    checks = list(session.exec(select(VerificationCheck).where(VerificationCheck.handoff_id == h.id)))
    attempts = [a for c in checks for a in (c.attempts or [])]

    first_statement = min((s.at for s in statements if s.role == "handoff"), default=None)
    by_certainty = {c: sum(1 for f in current if f.certainty == c)
                    for c in ("confirmed", "reported", "unverified", "unknown")}
    edited = sum(1 for f in all_facts if f.review_state in ("operator_edited", "operator_rejected")
                 and (f.ai_proposed_value is not None or f.review_state == "operator_rejected"))
    first_ok = sum(1 for c in checks if c.attempts and c.attempts[0].get("verdict") == "consistent")

    return {
        "shift_a_seconds": _seconds(first_statement, h.submitted_at),
        "shift_b_seconds": None,
        "clarification_questions_asked": sum(1 for q in questions if q.status != "not_asked"),
        "not_asked": sum(1 for q in questions if q.status == "not_asked"),
        "answered_unknown": sum(1 for q in questions if q.status == "answered_unknown"),
        "facts_by_certainty": by_certainty,
        "ai_facts_edited_or_rejected": edited,
        "verification_first_attempt_rate": (first_ok / len(checks)) if checks else None,
        "misunderstandings_caught": sum(1 for a in attempts if a.get("verdict") == "inconsistent"),
        "open_followups": counts(followups_for(session, h.id), clock.now()),
    }
