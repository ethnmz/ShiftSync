"""HandoffDetail JSON, as documented in docs/API.md."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from app import clock, config
from app.followups.rules import counts, owner_label
from app.handoff.metrics import compute_metrics
from app.models import Fact, FollowUp, Handoff, Item, VerificationCheck


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.isoformat() + "Z"
    return dt.isoformat().replace("+00:00", "Z")


def person_ref(person_id: str | None) -> dict[str, str] | None:
    if not person_id:
        return None
    p = config.person(person_id)
    return {"id": person_id, "name": p["name"] if p else person_id}


def fact_out(f: Fact, history: list[Fact]) -> dict[str, Any]:
    return {
        "id": f.id, "slot": f.slot, "value": f.value, "normalized": f.normalized,
        "certainty": f.certainty, "certainty_reason": f.certainty_reason, "review_state": f.review_state,
        "quote": f.quote, "source_statement_id": f.source_statement_id,
        "ai_proposed_value": f.ai_proposed_value,
        "history": [{"value": o.value, "normalized": o.normalized, "certainty": o.certainty,
                     "review_state": o.review_state, "quote": o.quote,
                     "source_statement_id": o.source_statement_id, "at": None} for o in history],
    }


def item_out(session: Session, item: Item, facts: list[Fact]) -> dict[str, Any]:
    prev_of = {f.superseded_by: f for f in facts if f.superseded_by}
    current = [f for f in facts if f.superseded_by is None and f.review_state != "operator_rejected"]

    def history(f: Fact) -> list[Fact]:
        chain, cur = [], prev_of.get(f.id)
        while cur is not None:
            chain.append(cur)
            cur = prev_of.get(cur.id)
        return list(reversed(chain))

    carried = None
    if item.origin_item_id:
        origin = session.get(Item, item.origin_item_id)
        origin_h = session.get(Handoff, origin.handoff_id) if origin else None
        carried = {"handoff_id": origin.handoff_id if origin else None, "item_id": item.origin_item_id,
                   "handoff_created_at": iso(origin_h.created_at) if origin_h else None}
    return {
        "id": item.id, "title": item.title, "kind": item.kind, "asset_ids": item.asset_ids,
        "priority": item.priority, "is_decision": item.is_decision, "open": item.open,
        "carried_over_from": carried,
        "facts": [fact_out(f, history(f)) for f in current],
    }


def followup_out(fu: FollowUp) -> dict[str, Any]:
    return {
        "id": fu.id, "item_id": fu.item_id, "description": fu.description,
        "missing_information": fu.missing_information, "owner": person_ref(fu.owner_id),
        "owner_label": owner_label(fu), "deadline": iso(fu.deadline),
        "assigned_by": person_ref(fu.assigned_by), "assigned_at": iso(fu.assigned_at), "status": fu.status,
    }


def handoff_summary(h: Handoff) -> dict[str, Any]:
    return {"id": h.id, "state": h.state, "outgoing": person_ref(h.outgoing_id),
            "incoming": person_ref(h.incoming_id), "created_at": iso(h.created_at),
            "submitted_at": iso(h.submitted_at), "acknowledged_at": iso(h.acknowledged_at),
            "verified_at": iso(h.verified_at)}


def handoff_detail(session: Session, h: Handoff) -> dict[str, Any]:
    from app.handoff.service import followups_for, handoff_items, questions_for, statements_for

    items = handoff_items(session, h.id)
    facts = list(session.exec(select(Fact).where(Fact.item_id.in_([i.id for i in items])))) if items else []
    questions = questions_for(session, h.id)
    followups = followups_for(session, h.id)
    fu_counts = counts(followups, clock.now())
    return {
        **handoff_summary(h),
        "statements": [{"id": s.id, "speaker_id": s.speaker_id, "role": s.role, "source": s.source,
                        "text": s.text, "question_id": s.question_id,
                        "audio_url": f"/api/statements/{s.id}/audio" if s.audio_path else None,
                        "at": iso(s.at)} for s in statements_for(session, h.id)],
        "items": [item_out(session, i, [f for f in facts if f.item_id == i.id]) for i in items],
        "questions": [{"id": q.id, "item_id": q.item_id, "gap_type": q.gap_type, "slots": q.slots,
                       "text": q.text, "status": q.status, "why_asked": q.why_asked,
                       "asked_at": iso(q.asked_at), "answered_at": iso(q.answered_at)}
                      for q in questions if q.status != "not_asked"],
        "not_asked": [{"item_id": q.item_id, "slots": q.slots, "reason": q.reason_not_asked}
                      for q in questions if q.status == "not_asked"],
        "budget": {"used": h.question_budget_used, "max": config.budgets()["clarification_questions"]},
        "followups": [followup_out(fu) for fu in followups],
        # Check history for the Receive/History screens. The answer key is never included.
        "checks": [{"id": c.id, "item_id": c.item_id, "question": c.question, "status": c.status,
                    "attempts": list(c.attempts or [])}
                   for c in session.exec(select(VerificationCheck).where(VerificationCheck.handoff_id == h.id)
                                         .order_by(VerificationCheck.id))],
        "status_line": {"submitted_at": iso(h.submitted_at), "acknowledged_at": iso(h.acknowledged_at),
                        "verified_at": iso(h.verified_at), "open_followups": fu_counts["open"],
                        "unassigned_followups": fu_counts["unassigned"]},
        "metrics": compute_metrics(session, h),
    }
