"""Shift B: briefing, acknowledgment, understanding verification (Problem 2).

Acknowledgment and verification are separate steps with separate records.
Neither closes a follow-up or says anything about equipment safety.

Code decides which items are checked, the answer key, the verdict floor, the
check status and the handoff state. The LLM only phrases text and grades;
its text passes the language rules or is replaced by a template.
"""
from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from app import clock
from app.briefing.select import briefing_order, collapsed
from app.db import next_id
from app.followups.rules import owner_label
from app.handoff import language
from app.handoff import state as sm
from app.handoff.analyzer import AnalysisError, Analyzer, DefaultAnalyzer
from app.handoff.detail import followup_out, item_out
from app.handoff.service import (Conflict, NotFound, Unprocessable, _authorize, _transition, audit,
                                 followups_for, get_handoff, item_facts, views_for)
from app.handoff.view import ItemView
from app.models import MISCONCEPTIONS, VERDICTS, Acknowledgment, AuditEvent, Fact, Item, Statement, VerificationCheck
from app.verify.answer_key import build_answer_key, select_items
from app.verify.floor import check_status, floor_verdict

DISCLAIMER = ("Acknowledging this handoff does not close open issues or confirm equipment is safe to operate.")
RECEIVED_STATES = ("submitted", "acknowledged", "verifying", "verified", "verified_with_assistance")
_LOWEST = ("unknown", "unverified", "reported", "confirmed")


def _reviewed(view: ItemView) -> ItemView:
    """Briefing and checks use operator-reviewed facts only."""
    return ItemView(item=view.item, facts=[f for f in view.facts if f.review_state != "ai_extracted"],
                    carried_over=view.carried_over)


def _fu_by_item(session: Session, handoff_id: str) -> dict[str, Any]:
    return {fu.item_id: fu for fu in followups_for(session, handoff_id) if fu.status != "closed"}


# ---------- Briefing ----------

def _say(value: str | None) -> str:
    return (value or "").replace("_", " ")


def template_line(view: ItemView, fu: Any | None) -> str:
    parts = []
    ws = view.fact("work_status")
    if ws is not None:
        state = _say(ws.normalized) or ws.value
        parts.append(f"work {state} ({ws.certainty})" if state != "unknown" else "status unknown")
    oc = view.fact("operational_clearance")
    if oc is not None:
        parts.append(_say(oc.normalized) if oc.normalized else oc.value)
    for slot, label in (("remaining_work", "remaining"), ("rationale", "why"),
                        ("required_verification", "before normal operation"), ("restore_condition", "until"),
                        ("current_mode", "mode"), ("condition", "condition"), ("findings", "found"),
                        ("claim", "claim")):
        f = view.fact(slot)
        if f is not None:
            parts.append(f"{label}: {f.value}" + (f" ({f.certainty})" if f.certainty != "confirmed" else ""))
    if fu is not None:
        parts.append("owner to be assigned" if not fu.owner_id else f"owner {owner_label(fu)}")
    if view.carried_over:
        parts.append("carried over")
    return f"{view.item.title}: " + "; ".join(parts) if parts else view.item.title


def _line_certainty(view: ItemView) -> str:
    if not view.facts:
        return "unknown"
    return min((f.certainty for f in view.facts), key=_LOWEST.index)


async def build_briefing(session: Session, handoff_id: str, viewer_id: str | None = None,
                         analyzer: Analyzer | None = None) -> dict[str, Any]:
    h = get_handoff(session, handoff_id)
    if h.state not in RECEIVED_STATES:
        raise Conflict(f"no briefing until Shift A submits (state {h.state})")
    analyzer = analyzer or DefaultAnalyzer()
    if viewer_id == h.incoming_id and not session.exec(
            select(AuditEvent).where(AuditEvent.handoff_id == h.id, AuditEvent.type == "briefing_opened")).first():
        audit(session, "briefing_opened", handoff_id=h.id, actor_id=viewer_id)
        session.commit()

    fus = _fu_by_item(session, h.id)
    ordered = [_reviewed(v) for v in briefing_order(views_for(session, h.id))]
    shown = [v for v in ordered if not collapsed(v)][:6]
    by_id = {v.id: v for v in ordered}

    templates = {v.id: template_line(v, fus.get(v.id)) for v in shown}
    lines = [{"text": templates[v.id], "item_id": v.id, "fact_ids": [f.id for f in v.facts],
              "certainty": _line_certainty(v)} for v in shown]
    open_fus = [fu for fu in fus.values()]
    n_crit = sum(1 for v in shown if v.priority == "critical")
    n_unassigned = sum(1 for fu in open_fus if not fu.owner_id)
    headline = (f"{n_crit} critical item{'s' if n_crit != 1 else ''} need attention; "
                f"{len(open_fus)} open follow-up{'s' if len(open_fus) != 1 else ''}"
                f" ({n_unassigned} to be assigned).")

    llm = await analyzer.brief(items=[{"id": v.id, "title": v.item.title, "priority": v.priority,
                                       "facts": [{"id": f.id, "slot": f.slot, "value": f.value,
                                                  "certainty": f.certainty} for f in v.facts],
                                       "owner": owner_label(fus[v.id]) if v.id in fus else None}
                                      for v in shown])
    if llm:
        llm_headline, llm_lines = llm
        by_item = {line.get("item_id"): line for line in llm_lines if line.get("item_id") in templates}
        for line in lines:
            cand = by_item.get(line["item_id"])
            if cand and cand.get("text") and not language.violations(cand["text"], [by_id[line["item_id"]]]):
                line["text"] = cand["text"]
        if llm_headline and not language.violations(llm_headline, shown):
            headline = llm_headline

    return {
        "headline": headline,
        "lines": lines,
        "items": [item_out(session, v.item, item_facts(session, [v.id])) for v in ordered],
        "open_followups": [followup_out(fu) for fu in open_fus],
        "disclaimer": DISCLAIMER,
    }


# ---------- Acknowledge ----------

def acknowledge(session: Session, handoff_id: str, actor_id: str) -> Any:
    h = get_handoff(session, handoff_id)
    _authorize(h, "acknowledge", actor_id)
    _transition(h, "acknowledge")
    now = clock.now()
    h.acknowledged_at, h.acknowledged_by = now, actor_id
    session.add(Acknowledgment(id=next_id(session, Acknowledgment), handoff_id=h.id, person_id=actor_id, at=now))
    audit(session, "acknowledged", handoff_id=h.id, actor_id=actor_id)
    session.commit()
    return h


# ---------- Verification ----------

def checks_for(session: Session, handoff_id: str) -> list[VerificationCheck]:
    return list(session.exec(select(VerificationCheck).where(VerificationCheck.handoff_id == handoff_id)
                             .order_by(VerificationCheck.id)))


def check_out(c: VerificationCheck) -> dict[str, Any]:
    """Public view of a check. The answer key is never sent to Shift B."""
    return {"id": c.id, "item_id": c.item_id, "question": c.question, "status": c.status,
            "attempts": list(c.attempts or [])}


def template_verify_question(view: ItemView) -> str:
    if view.kind == "inspection":
        return f"What do we know about the {view.item.title}, and who is following up?"
    name = view.item.asset_ids[0] if len(view.item.asset_ids) == 1 else view.item.title
    return f"What is the current status of {name}, and what must be verified before testing?"


async def start_verification(session: Session, handoff_id: str, actor_id: str,
                             analyzer: Analyzer | None = None) -> dict[str, Any]:
    analyzer = analyzer or DefaultAnalyzer()
    h = get_handoff(session, handoff_id)
    _authorize(h, "start_verification", actor_id)
    if h.state == "verifying":
        pending = [c for c in checks_for(session, h.id) if c.status == "pending"]
        return {"state": h.state, "check": check_out(pending[0]) if pending else None}
    views = [_reviewed(v) for v in views_for(session, h.id)]
    chosen = select_items(views)
    if not chosen:
        raise Conflict("No critical items to check, so understanding can't be verified here.", code="nothing_to_verify")
    _transition(h, "start_verification")
    h.verification_started_at = clock.now()
    fus = _fu_by_item(session, h.id)
    created = []
    for v in chosen:
        key = build_answer_key(v, fus.get(v.id))
        text = await analyzer.verify_question(
            item={"title": v.item.title, "kind": v.kind,
                  "facts": [{"slot": f.slot, "value": f.value, "certainty": f.certainty} for f in v.facts]},
            answer_key=key)
        if not text or language.violations(text, [v]) or text.strip().lower().startswith(("is ", "are ", "did ", "has ")):
            text = template_verify_question(v)  # open-ended, never yes/no
        c = VerificationCheck(id=next_id(session, VerificationCheck), handoff_id=h.id, item_id=v.id,
                              question=text, answer_key=key, status="pending", attempts=[])
        session.add(c)
        created.append(c)
    audit(session, "verification_started", handoff_id=h.id, actor_id=actor_id, checks=[c.id for c in created])
    session.commit()
    return {"state": h.state, "check": check_out(created[0])}


def _evidence(session: Session, fact_ids: list[str]) -> list[dict[str, str]]:
    out, seen = [], set()
    for fid in fact_ids:
        f = session.get(Fact, fid)
        if f is None or not f.quote or (f.source_statement_id, f.quote) in seen:
            continue
        seen.add((f.source_statement_id, f.quote))
        out.append({"statement_id": f.source_statement_id, "quote": f.quote, "fact_id": f.id})
    return out


def template_feedback(view: ItemView, verdict: str, key: dict[str, Any]) -> str:
    opener = ("That interpretation is inconsistent with the handoff." if verdict == "inconsistent"
              else "That answer is missing part of the handoff.")
    facts = []
    ws = view.fact("work_status")
    if ws is not None:
        facts.append(f"{view.item.title} work is {_say(ws.normalized) or ws.value} ({ws.certainty})")
    oc = view.fact("operational_clearance")
    if oc is not None:
        facts.append(f"it is {_say(oc.normalized) or oc.value}")
    for slot in ("remaining_work", "rationale", "required_verification"):
        f = view.fact(slot)
        if f is not None:
            facts.append(f"{slot.replace('_', ' ')}: {f.value}")
    body = "; ".join(facts) if facts else "; ".join(e["statement"] for e in key["must_convey"])
    return f"{opener} {body[0].upper() + body[1:] if body else ''}."


async def answer_check(session: Session, check_id: str, actor_id: str, text: str, source: str = "text_web",
                       analyzer: Analyzer | None = None, audio_path: str | None = None) -> dict[str, Any]:
    """Grade one Shift B answer. Returns the VerificationAttempt (+ next_check, handoff_state)."""
    analyzer = analyzer or DefaultAnalyzer()
    c = session.get(VerificationCheck, check_id)
    if c is None:
        raise NotFound(f"check {check_id} not found")
    h = get_handoff(session, c.handoff_id)
    _authorize(h, "verification_answer", actor_id)
    if h.state != "verifying":
        raise Conflict(f"cannot answer checks while {h.state}")
    if c.status != "pending":
        raise Conflict(f"this check is {c.status.replace('_', ' ')}")
    if not text or not text.strip():
        raise Unprocessable("empty answer")

    stmt = Statement(id=next_id(session, Statement), handoff_id=h.id, speaker_id=actor_id, source=source,
                     role="verification_answer", text=text.strip(), audio_path=audio_path, at=clock.now())
    session.add(stmt)
    session.commit()

    item = session.get(Item, c.item_id)
    view = _reviewed(ItemView.build(item, item_facts(session, [item.id])))
    key = c.answer_key
    key_ids = {e["fact_id"] for e in key.get("must_convey", []) if e.get("fact_id")}
    try:
        g = await analyzer.grade(question=c.question, answer_key=key, answer=stmt.text)
    except AnalysisError as e:
        audit(session, "grading_failed", handoff_id=h.id, item_id=c.item_id, check_id=c.id, statement_id=stmt.id)
        session.commit()
        raise Unprocessable(str(e), {"statement_id": stmt.id}, code="analysis_failed") from e

    contradictions = [dict(x) for x in (getattr(g, "contradictions", None) or []) if dict(x).get("fact_id") in key_ids]
    missing = [f for f in (getattr(g, "missing_fact_ids", None) or []) if f in key_ids]
    conveyed = [f for f in (getattr(g, "conveyed_fact_ids", None) or []) if f in key_ids and f not in missing]
    llm_verdict = getattr(g, "verdict", None)
    verdict, floor_reason = floor_verdict(llm_verdict if llm_verdict in VERDICTS else None,
                                          contradictions, missing, key)
    attempt_no = len(c.attempts or []) + 1
    status = check_status(verdict, missing, contradictions, key, attempt_no)

    misconception = getattr(g, "misconception", None)
    if verdict == "consistent":
        misconception = None
    elif misconception not in MISCONCEPTIONS:
        misconception = "other"

    feedback = None
    evidence: list[dict[str, str]] = []
    if verdict != "consistent":
        feedback = getattr(g, "feedback", None)
        if not feedback or language.violations(feedback, [view]):
            feedback = template_feedback(view, verdict, key)
        feedback = language.ensure_clearance_sentence(feedback, [view])
        critical = [e["fact_id"] for e in key["must_convey"] if e.get("critical") and e.get("fact_id")]
        evidence = _evidence(session, [x["fact_id"] for x in contradictions] + missing + critical)

    attempt = {"statement_id": stmt.id, "answer_text": stmt.text, "verdict": verdict,
               "llm_verdict": llm_verdict, "floor_reason": floor_reason,
               "conveyed_fact_ids": conveyed, "missing_fact_ids": missing, "contradictions": contradictions,
               "misconception": misconception, "feedback": feedback, "evidence": evidence,
               "at": clock.now().isoformat()}
    c.attempts = [*(c.attempts or []), attempt]
    c.status = status
    audit(session, "verification_attempt", handoff_id=h.id, item_id=c.item_id, actor_id=actor_id,
          check_id=c.id, attempt=attempt_no, verdict=verdict, status=status)
    _maybe_finish(session, h)
    session.commit()
    return _attempt_out(session, h, c, attempt, attempt_no)


def _maybe_finish(session: Session, h: Any) -> None:
    session.flush()
    checks = checks_for(session, h.id)
    if sm.verification_outcome(checks) is not None:
        _transition(h, "verification_done", checks=checks)
        h.verified_at = clock.now()
        audit(session, h.state, handoff_id=h.id)


def _attempt_out(session: Session, h: Any, c: VerificationCheck, a: dict[str, Any], n: int) -> dict[str, Any]:
    nxt = next((x for x in checks_for(session, h.id) if x.status == "pending" and x.id != c.id), None)
    if c.status == "pending":
        nxt = c  # same check, another attempt
    return {"check_id": c.id, "attempt": n, "verdict": a["verdict"], "misconception": a["misconception"],
            "conveyed_fact_ids": a["conveyed_fact_ids"], "missing_fact_ids": a["missing_fact_ids"],
            "contradictions": a["contradictions"], "feedback": a["feedback"], "evidence": a["evidence"],
            "status": c.status, "next_check": check_out(nxt) if nxt else None, "handoff_state": h.state}


def clarified_in_person(session: Session, check_id: str, actor_id: str, note: str) -> Any:
    c = session.get(VerificationCheck, check_id)
    if c is None:
        raise NotFound(f"check {check_id} not found")
    h = get_handoff(session, c.handoff_id)
    _authorize(h, "clarified_in_person", actor_id)
    if c.status != "needs_clarification":
        raise Conflict("only a check that needs clarification can be marked clarified in person")
    if not note or not note.strip():
        raise Unprocessable("add a short note about what was clarified")
    c.status = "clarified_in_person"
    audit(session, "clarified_in_person", handoff_id=h.id, item_id=c.item_id, actor_id=actor_id,
          check_id=c.id, note=note.strip())
    _maybe_finish(session, h)
    session.commit()
    return h


# ---------- Supervisor ----------

def supervisor_summary(session: Session) -> dict[str, Any]:
    from app.followups.rules import counts
    from app.handoff.detail import handoff_summary
    from app.models import ClarificationQuestion, FollowUp, Handoff

    handoffs = list(session.exec(select(Handoff).order_by(Handoff.created_at.desc())))
    today = clock.now().date()
    checks = list(session.exec(select(VerificationCheck)))
    fu = counts(session.exec(select(FollowUp)).all(), clock.now())
    return {
        "pending_handoffs": [handoff_summary(h) for h in handoffs
                             if h.state not in ("verified", "verified_with_assistance")],
        "completed_today": [handoff_summary(h) for h in handoffs
                            if h.verified_at and h.verified_at.date() == today],
        "unresolved_questions": len(session.exec(select(ClarificationQuestion)
                                                 .where(ClarificationQuestion.status == "pending")).all()),
        "outstanding_acknowledgments": [handoff_summary(h) for h in handoffs if h.state == "submitted"],
        "verification": {
            "verified": sum(1 for h in handoffs if h.state == "verified"),
            "with_assistance": sum(1 for h in handoffs if h.state == "verified_with_assistance"),
            "in_progress": sum(1 for h in handoffs if h.state == "verifying"),
            "checks_needing_clarification": sum(1 for c in checks if c.status == "needs_clarification"),
        },
        "followups": fu,
    }

