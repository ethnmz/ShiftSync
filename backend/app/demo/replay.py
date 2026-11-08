"""Replay demo/scenario.json step by step through the real service code.

Each step sets the demo clock to the step's `at`, then performs the step's
action as the step's actor. With `offline=True` (the default) the AI calls are
replaced by app/demo/fixtures.py, so the demo works with no network.
"""
from __future__ import annotations

from typing import Any

from sqlmodel import Session, select

from app import clock
from app.demo import fixtures
from app.demo.seed import load_scenario
from app.handoff import receive, service
from app.handoff.analyzer import Analyzer, Grade, ScriptedAnalyzer
from app.handoff.detail import handoff_detail
from app.handoff.service import Conflict, NotFound
from app.models import ClarificationQuestion, FollowUp, Handoff, Item, VerificationCheck

OUTGOING, INCOMING = "maya", "jordan"


def _step(n: int) -> dict[str, Any]:
    for s in load_scenario()["steps"]:
        if s["n"] == n:
            return s
    raise NotFound(f"no demo step {n}")


def current_handoff(session: Session) -> Handoff:
    h = session.exec(select(Handoff).where(Handoff.outgoing_id == OUTGOING, Handoff.incoming_id == INCOMING)
                     .order_by(Handoff.id.desc())).first()
    if h is None:
        raise Conflict("run demo step 1 first", code="demo_order")
    return h


def _pending_question(session: Session, hid: str) -> ClarificationQuestion:
    q = session.exec(select(ClarificationQuestion).where(ClarificationQuestion.handoff_id == hid,
                                                         ClarificationQuestion.status == "pending")).first()
    if q is None:
        raise Conflict("no pending question; run the earlier steps first", code="demo_order")
    return q


def _pending_check(session: Session, hid: str) -> VerificationCheck:
    c = session.exec(select(VerificationCheck).where(VerificationCheck.handoff_id == hid,
                                                     VerificationCheck.status == "pending")
                     .order_by(VerificationCheck.id)).first()
    if c is None:
        raise Conflict("no pending check; run the earlier steps first", code="demo_order")
    return c


def _followup_for(session: Session, hid: str, asset: str) -> FollowUp:
    for fu in service.followups_for(session, hid):
        item = session.get(Item, fu.item_id)
        if item and asset in item.asset_ids:
            return fu
    raise Conflict(f"no follow-up for {asset} yet", code="demo_order")


def _grade_for(n: int, check: VerificationCheck) -> Grade:
    spec = fixtures.GRADES[n]
    by_slot = {e["slot"]: e["fact_id"] for e in check.answer_key.get("must_convey", []) if e.get("fact_id")}
    contradictions = [{"fact_id": by_slot[s], "claimed": c} for s, c in spec["contradictions"].items() if s in by_slot]
    missing = [by_slot[s] for s in spec["missing"] if s in by_slot]
    conveyed = [fid for fid in by_slot.values() if fid not in missing and fid not in {c["fact_id"] for c in contradictions}]
    return Grade(verdict=spec["verdict"], conveyed_fact_ids=conveyed, missing_fact_ids=missing,
                 contradictions=contradictions, misconception=spec["misconception"])


async def run_step(session: Session, n: int, *, offline: bool = True, live_analyzer: Analyzer | None = None) -> dict[str, Any]:
    step = _step(n)
    clock.set_now(step["at"])
    analyzer: Analyzer | None = live_analyzer
    if offline:
        scripted = ScriptedAnalyzer()
        if n in fixtures.EXTRACTIONS:
            scripted.push(fixtures.EXTRACTIONS[n])
        analyzer = scripted
    out: dict[str, Any] = {"step": n, "at": step["at"], "actor": step["actor"], "offline": offline}

    if n == 1:
        h = service.create_handoff(session, OUTGOING, INCOMING, actor_id=OUTGOING)
    elif n == 2:
        h = current_handoff(session)
        await service.ingest_statement(session, h.id, OUTGOING, step["text"], source=step.get("source", "text_web"),
                                       analyzer=analyzer)
    elif n in (3, 4, 5):
        h = current_handoff(session)
        q = _pending_question(session, h.id)
        out["question_shown"] = q.text
        await service.answer_question(session, h.id, q.id, OUTGOING, text=step["text"],
                                      source=step.get("source", "text_web"), analyzer=analyzer)
    elif n == 6:
        h = current_handoff(session)
        for v in service.views_for(session, h.id):
            if v.priority == "critical":
                for f in v.facts:
                    if f.review_state == "ai_extracted":
                        service.patch_fact(session, f.id, OUTGOING, review_state="operator_confirmed")
        service.confirm_routine(session, h.id, OUTGOING)
        service.submit(session, h.id, OUTGOING)
    elif n == 7:
        h = current_handoff(session)
        out["briefing"] = await receive.build_briefing(session, h.id, viewer_id=INCOMING, analyzer=analyzer)
    elif n == 8:
        h = current_handoff(session)
        receive.acknowledge(session, h.id, INCOMING)
        fu = _followup_for(session, h.id, "CHL-2")
        service.assign_followup(session, fu.id, INCOMING, INCOMING, clock.now().replace(hour=16, minute=0, second=0))
    elif n in (9, 10, 11):
        h = current_handoff(session)
        if n == 9:
            started = await receive.start_verification(session, h.id, INCOMING, analyzer=analyzer)
            out["question_shown"] = started["check"]["question"]
        c = _pending_check(session, h.id)
        if n == 11:
            out["question_shown"] = c.question
        if offline:
            analyzer.push_grade(_grade_for(n, c))
        out["attempt"] = await receive.answer_check(session, c.id, INCOMING, step["text"],
                                                    source=step.get("source", "text_web"), analyzer=analyzer)
    elif n == 12:
        h = current_handoff(session)
        out["before"] = receive.supervisor_summary(session)["followups"]
        fu = _followup_for(session, h.id, "UPS-B")
        service.assign_followup(session, fu.id, "dana", "sam", clock.now().replace(day=9, hour=15, minute=0, second=0))
        out["after"] = receive.supervisor_summary(session)["followups"]
    else:
        raise NotFound(f"no demo step {n}")

    session.refresh(h)
    out["handoff"] = handoff_detail(session, h)
    return out
