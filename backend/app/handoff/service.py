"""Handoff service: the Shift A flow and follow-ups, on top of the deterministic rules.

Routes call these functions. Each one validates who is acting, changes state
through handoff/state.py, writes audit events, and commits.

AI is reached only through `app.handoff.analyzer`. If extraction fails, the
statement is kept and nothing else changes.
"""
from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import datetime
from typing import Any

from sqlmodel import Session, select

from app import clock, config
from app.certainty.floor import find_term, floor_certainty
from app.clarify.gaps import find_gaps
from app.clarify.planner import plan
from app.db import id_sequence, next_id
from app.followups import rules as fu_rules
from app.handoff import state as sm
from app.handoff.analyzer import AnalysisError, Analyzer, DefaultAnalyzer, verify_quote
from app.handoff.priority import compute_priority
from app.handoff.view import ItemView
from app.models import (CERTAINTIES, AuditEvent, ClarificationQuestion, Fact, FollowUp, Handoff, Item,
                        Statement)

# Words that must appear before a fact may say work is complete or equipment is cleared.
_COMPLETE_WORDS = ["complete", "completed", "finished", "done"]
_CLEARED_WORDS = ["cleared", "released", "back in service", "normal operation"]
_NEGATIONS = ["not cleared", "isn't cleared", "not complete", "isn't complete", "not finished",
              "isn't finished", "not done", "isn't done", "hasn't been cleared", "never finished"]


# ---------- Errors (routes map these to HTTP) ----------

class ServiceError(Exception):
    """HTTP body: {"detail": {"code", "message", ...payload}} (same shape as ingest errors)."""
    status = 400
    code = "bad_request"

    def __init__(self, message: str, payload: dict[str, Any] | None = None, code: str | None = None):
        super().__init__(message)
        self.message = message
        self.payload = payload or {}
        if code:
            self.code = code


class NotFound(ServiceError):
    status, code = 404, "not_found"


class Forbidden(ServiceError):
    status, code = 403, "forbidden"


class Conflict(ServiceError):
    status, code = 409, "conflict"


class Unprocessable(ServiceError):
    status, code = 422, "unprocessable"


# ---------- Loading ----------

def get_handoff(session: Session, handoff_id: str) -> Handoff:
    h = session.get(Handoff, handoff_id)
    if h is None:
        raise NotFound(f"handoff {handoff_id} not found")
    return h


def handoff_items(session: Session, handoff_id: str) -> list[Item]:
    return list(session.exec(select(Item).where(Item.handoff_id == handoff_id).order_by(Item.id)))


def item_facts(session: Session, item_ids: Iterable[str]) -> list[Fact]:
    ids = list(item_ids)
    if not ids:
        return []
    return list(session.exec(select(Fact).where(Fact.item_id.in_(ids)).order_by(Fact.id)))


def views_for(session: Session, handoff_id: str) -> list[ItemView]:
    items = handoff_items(session, handoff_id)
    facts = item_facts(session, [i.id for i in items])
    return [ItemView.build(i, facts) for i in items]


def questions_for(session: Session, handoff_id: str) -> list[ClarificationQuestion]:
    return list(session.exec(select(ClarificationQuestion)
                             .where(ClarificationQuestion.handoff_id == handoff_id)
                             .order_by(ClarificationQuestion.id)))


def statements_for(session: Session, handoff_id: str) -> list[Statement]:
    return list(session.exec(select(Statement).where(Statement.handoff_id == handoff_id).order_by(Statement.id)))


def followups_for(session: Session, handoff_id: str) -> list[FollowUp]:
    """Follow-ups attached to this handoff's items (including carried-over ones)."""
    ids = [i.id for i in handoff_items(session, handoff_id)]
    if not ids:
        return []
    return list(session.exec(select(FollowUp).where(FollowUp.item_id.in_(ids)).order_by(FollowUp.id)))


def audit(session: Session, type_: str, *, handoff_id: str | None = None, item_id: str | None = None,
          actor_id: str | None = None, **detail: Any) -> None:
    session.add(AuditEvent(id=next_id(session, AuditEvent), handoff_id=handoff_id, item_id=item_id,
                           actor_id=actor_id, type=type_, at=clock.now(), detail=detail))


def _authorize(h: Handoff, action: str, actor_id: str) -> None:
    try:
        sm.authorize(h, action, actor_id)
    except sm.ActorError as e:
        raise Forbidden(str(e)) from e


def _transition(h: Handoff, event: str, **kw: Any) -> None:
    try:
        h.state = sm.transition(h.state, event, **kw)
    except sm.TransitionError as e:
        raise Conflict(str(e)) from e


def _require_person(person_id: str) -> dict[str, Any]:
    p = config.person(person_id)
    if p is None:
        raise Forbidden(f"{person_id!r} is not on the roster")
    return p


# ---------- Create (with carry-over) ----------

def create_handoff(session: Session, outgoing_id: str, incoming_id: str, actor_id: str | None = None) -> Handoff:
    _require_person(outgoing_id)
    _require_person(incoming_id)
    if actor_id and actor_id != outgoing_id:
        raise Forbidden("only the outgoing operator can start their handoff")
    now = clock.now()
    h = Handoff(id=next_id(session, Handoff), outgoing_id=outgoing_id, incoming_id=incoming_id,
                state="draft", created_at=now)
    session.add(h)
    audit(session, "handoff_created", handoff_id=h.id, actor_id=actor_id or outgoing_id)

    # Carry over every open follow-up from handoffs that were already submitted: copy
    # its item (and current facts) into this handoff and point the follow-up at the
    # copy. Nothing is closed or reassigned. A handoff still being written keeps its
    # own follow-ups, so a second, accidental handoff can't take them away.
    carried = []
    open_fus = session.exec(select(FollowUp).where(FollowUp.status != "closed").order_by(FollowUp.id)).all()
    for fu in open_fus:
        old = session.get(Item, fu.item_id)
        if old is None or old.handoff_id == h.id:
            continue
        source = session.get(Handoff, old.handoff_id)
        if source is None or source.state in (*sm.SHIFT_A_EDIT_STATES, "analyzing"):
            continue
        copy = Item(id=next_id(session, Item), handoff_id=h.id, origin_item_id=old.id, kind=old.kind,
                    title=old.title, asset_ids=list(old.asset_ids), asset_mention=old.asset_mention,
                    location=old.location, priority=old.priority, is_decision=old.is_decision, open=True,
                    created_from_statement_id=old.created_from_statement_id)
        session.add(copy)
        for f in ItemView.build(old, item_facts(session, [old.id])).facts:
            session.add(Fact(id=next_id(session, Fact), item_id=copy.id, slot=f.slot, value=f.value,
                             normalized=f.normalized, certainty=f.certainty, certainty_reason=f.certainty_reason,
                             review_state=f.review_state, source_statement_id=f.source_statement_id,
                             quote=f.quote, ai_proposed_value=f.ai_proposed_value))
        fu.item_id = copy.id
        carried.append(copy.id)
        audit(session, "carried_over", handoff_id=h.id, item_id=copy.id, origin_item_id=old.id, followup_id=fu.id)
    h.carried_over_item_ids = carried
    session.commit()
    return h


# ---------- Statements and analysis ----------

async def ingest_statement(session: Session, handoff_id: str, speaker_id: str, text: str,
                           source: str = "text_web", question_id: str | None = None,
                           audio_path: str | None = None, analyzer: Analyzer | None = None) -> Handoff:
    """Shift A adds speech or text (a new note, or the answer to a question).

    The statement is stored first and kept even if analysis fails.
    """
    h = get_handoff(session, handoff_id)
    _authorize(h, "statement_added", speaker_id)
    if h.state not in sm.SHIFT_A_EDIT_STATES:
        raise Conflict(f"cannot add statements while {h.state}")
    if not text or not text.strip():
        raise Unprocessable("empty statement")
    q = None
    if question_id:
        q = session.get(ClarificationQuestion, question_id)
        if q is None or q.handoff_id != h.id:
            raise NotFound(f"question {question_id} not found")
        if q.status != "pending":
            raise Conflict("that question is already answered")
    stmt = Statement(id=next_id(session, Statement), handoff_id=h.id, speaker_id=speaker_id, source=source,
                     role="clarification_answer" if q else "handoff", text=text.strip(),
                     audio_path=audio_path, at=clock.now(), question_id=question_id)
    session.add(stmt)
    session.commit()
    await _analyze(session, h, stmt, q, analyzer or DefaultAnalyzer())
    return h


async def answer_question(session: Session, handoff_id: str, question_id: str, actor_id: str,
                          text: str | None = None, dont_know: bool = False, source: str = "text_web",
                          analyzer: Analyzer | None = None) -> Handoff:
    h = get_handoff(session, handoff_id)
    _authorize(h, "answer_question", actor_id)
    if not dont_know:
        return await ingest_statement(session, handoff_id, actor_id, text or "", source=source,
                                      question_id=question_id, analyzer=analyzer)
    q = session.get(ClarificationQuestion, question_id)
    if q is None or q.handoff_id != h.id:
        raise NotFound(f"question {question_id} not found")
    if q.status != "pending":
        raise Conflict("that question is already answered")
    now = clock.now()
    stmt = Statement(id=next_id(session, Statement), handoff_id=h.id, speaker_id=actor_id, source=source,
                     role="clarification_answer", text="I don't know.", at=now, question_id=q.id)
    session.add(stmt)
    q.status, q.answer_statement_id, q.answered_at = "answered_unknown", stmt.id, now
    item = session.get(Item, q.item_id)
    view = ItemView.build(item, item_facts(session, [item.id]))
    catalog = config.kind_slots(item.kind)
    # Record the unknown explicitly so it stays visible. Owners/deadlines are never filled this way.
    for slot in q.slots:
        if slot in ("owner", "deadline") or view.fact(slot) is not None:
            continue
        values = catalog.get(slot, {}).get("values", [])
        session.add(Fact(id=next_id(session, Fact), item_id=item.id, slot=slot, value="Unknown",
                         normalized="unknown" if "unknown" in values else None, certainty="unknown",
                         certainty_reason='uncertainty:"don\'t know"', review_state="ai_extracted",
                         source_statement_id=stmt.id, quote="I don't know."))
    audit(session, "answered_unknown", handoff_id=h.id, item_id=item.id, actor_id=actor_id, question_id=q.id)
    session.flush()
    _refresh_rules(session, h, actor_id)
    await _replan(session, h, analyzer or DefaultAnalyzer())
    session.commit()
    return h


def _item_brief(view: ItemView) -> dict[str, Any]:
    return {"id": view.id, "kind": view.kind, "title": view.item.title, "asset_ids": view.item.asset_ids,
            "asset_mention": view.item.asset_mention, "priority": view.priority,
            "facts": [{"id": f.id, "slot": f.slot, "value": f.value, "normalized": f.normalized,
                       "certainty": f.certainty} for f in view.facts],
            "quotes": [f.quote for f in view.facts if f.quote]}


async def _analyze(session: Session, h: Handoff, stmt: Statement, q: ClarificationQuestion | None,
                   analyzer: Analyzer) -> None:
    previous = h.state
    _transition(h, "statement_added")
    views = views_for(session, h.id)
    scope = None
    if q is not None:
        scope = {"question": q.text, "item_id": q.item_id, "slots": list(q.slots)}
    try:
        extraction = await analyzer.extract(
            text=stmt.text, speaker=config.person(stmt.speaker_id) or {"id": stmt.speaker_id},
            existing_items=[_item_brief(v) for v in views], scope=scope)
    except AnalysisError as e:
        h.state = sm.transition(h.state, "analysis_failed", previous_state=previous)
        audit(session, "analysis_failed", handoff_id=h.id, statement_id=stmt.id, error=str(e))
        session.commit()
        raise Unprocessable(str(e) or "Couldn't analyze that. Try again or type it.",
                            {"statement_id": stmt.id}, code="analysis_failed") from e

    _merge(session, h, stmt, extraction, q)
    if q is not None:
        q.status, q.answer_statement_id, q.answered_at = "answered", stmt.id, clock.now()
    session.flush()
    _refresh_rules(session, h, stmt.speaker_id)
    await _replan(session, h, analyzer)
    session.commit()


def _guard_fact(normalized: str | None, quote: str) -> str | None:
    """Reason to drop a fact that claims completion/clearance the quote doesn't state."""
    if normalized == "complete" and (not find_term(quote, _COMPLETE_WORDS) or find_term(quote, _NEGATIONS)):
        return "completion not stated"
    if normalized == "cleared" and (not find_term(quote, _CLEARED_WORDS) or find_term(quote, _NEGATIONS)):
        return "clearance not stated"
    return None


def _norm_words(text: str) -> str:
    return " " + re.sub(r"[^a-z0-9]+", " ", text.lower()).strip() + " "


def _mentioned_asset(ext: Any, statement_text: str, registry: dict[str, Any]) -> str | None:
    """The extracted asset id, only if the speaker actually named that equipment.

    The id, name or one of its aliases from assets.yaml must appear in the
    statement (case, hyphens and punctuation ignored). Otherwise the model picked
    equipment nobody mentioned, and the item gets no asset rather than a guessed one.
    """
    asset_id = getattr(ext, "asset_id", None)
    asset = registry.get(asset_id) if asset_id else None
    if asset is None:
        return None
    said = _norm_words(statement_text)
    names = [asset_id, asset.get("name", ""), *asset.get("aliases", [])]
    if any(n and _norm_words(n) in said for n in names):
        return asset_id
    return None


def _merge(session: Session, h: Handoff, stmt: Statement, extraction: Any, q: ClarificationQuestion | None) -> None:
    items = {i.id: i for i in handoff_items(session, h.id)}
    registry = config.assets()
    scope_item = items.get(q.item_id) if q else None

    asked: set[str] = set()
    if q is not None:
        asked = set(q.slots) | ({q.target_slot} if q.target_slot else set())

    def find_target(ext: Any) -> Item | None:
        link = getattr(ext, "link_item_id", None)
        if link in items:
            return items[link]
        asset = _mentioned_asset(ext, stmt.text, registry)
        # An answer to a question about an item updates that item, even if the model
        # labels it another kind ("bypass" for UPS-B's clearance answer). Only a
        # different named asset makes it a separate item.
        if scope_item is not None and (asset is None or not scope_item.asset_ids or asset in scope_item.asset_ids):
            return scope_item
        if asset:
            for it in items.values():
                if asset in it.asset_ids and it.kind == ext.kind:
                    return it
        return None

    for ext in list(getattr(extraction, "items", []) or []):
        asset = _mentioned_asset(ext, stmt.text, registry)
        target = find_target(ext)
        if target is None:
            target = Item(id=next_id(session, Item), handoff_id=h.id, kind=ext.kind, title=ext.title,
                          asset_ids=[asset] if asset else [], asset_mention=getattr(ext, "asset_mention", None),
                          is_decision=bool(getattr(ext, "is_decision", False)),
                          created_from_statement_id=stmt.id)
            session.add(target)
            items[target.id] = target
        else:
            if asset and asset not in target.asset_ids:
                if not target.asset_ids:
                    target.title = ext.title or target.title  # vague mention resolved to equipment
                target.asset_ids = [*target.asset_ids, asset]
            target.is_decision = target.is_decision or bool(getattr(ext, "is_decision", False))
        mismatched = target is scope_item and ext.kind != target.kind
        filled = {f.slot for f in ItemView.build(target, item_facts(session, [target.id])).facts}
        for ef in getattr(ext, "facts", []) or []:
            slot = ef.slot
            if mismatched and slot in filled and slot not in asked:
                # Same slot name, different kind of item, and not what was asked: keep both
                # facts instead of letting e.g. a bypass "rationale" replace UPS-B's own.
                slot = f"{ext.kind}_{ef.slot}"
                audit(session, "fact_slot_renamed", handoff_id=h.id, item_id=target.id,
                      slot=ef.slot, stored_as=slot, extracted_kind=ext.kind)
            _add_fact(session, h, stmt, target, ef, slot=slot)

    for claim in getattr(extraction, "unscoped_claims", []) or []:
        existing = [i for i in items.values() if i.kind == "general_claim"]
        if any(f.value.lower() == claim.lower() for f in item_facts(session, [i.id for i in existing])):
            continue
        if not verify_quote(claim, stmt.text):
            audit(session, "fact_dropped", handoff_id=h.id, reason="quote not found", quote=claim)
            continue
        item = Item(id=next_id(session, Item), handoff_id=h.id, kind="general_claim", title=claim[:60],
                    created_from_statement_id=stmt.id)
        session.add(item)
        items[item.id] = item
        certainty, reason = floor_certainty("reported", claim)
        session.add(Fact(id=next_id(session, Fact), item_id=item.id, slot="claim", value=claim, certainty=certainty,
                         certainty_reason=reason or "as stated", source_statement_id=stmt.id, quote=claim))


def _add_fact(session: Session, h: Handoff, stmt: Statement, item: Item, ef: Any, slot: str | None = None) -> None:
    slot = slot or ef.slot
    quote = (getattr(ef, "quote", "") or "").strip()
    if not verify_quote(quote, stmt.text):
        audit(session, "fact_dropped", handoff_id=h.id, item_id=item.id, reason="quote not found",
              slot=slot, quote=quote)
        return
    normalized = getattr(ef, "normalized", None)
    why = _guard_fact(normalized, quote)
    if why:
        audit(session, "fact_dropped", handoff_id=h.id, item_id=item.id, reason=why, slot=slot, quote=quote)
        return
    proposed = ef.certainty if ef.certainty in CERTAINTIES else "unverified"
    certainty, reason = floor_certainty(proposed, quote)
    if certainty == "unknown" and normalized and normalized != "unknown" and \
            "unknown" in config.kind_slots(item.kind).get(slot, {}).get("values", []):
        # "I don't know if they finished" can't be recorded as work_status=incomplete:
        # an unknown fact keeps an unknown value.
        audit(session, "normalized_unknown", handoff_id=h.id, item_id=item.id, slot=slot, proposed=normalized)
        normalized = "unknown"
    fact = Fact(id=next_id(session, Fact), item_id=item.id, slot=slot, value=ef.value, normalized=normalized,
                certainty=certainty, certainty_reason=reason or "operator stated", review_state="ai_extracted",
                source_statement_id=stmt.id, quote=quote)
    session.add(fact)
    if certainty != proposed:
        audit(session, "certainty_floored", handoff_id=h.id, item_id=item.id, fact_id=fact.id,
              proposed=proposed, certainty=certainty, reason=reason)
    for old in item_facts(session, [item.id]):
        if old.slot == slot and old.superseded_by is None and old.id != fact.id:
            old.superseded_by = fact.id
    audit(session, "fact_extracted", handoff_id=h.id, item_id=item.id, fact_id=fact.id, slot=slot)

    # Owner named in Shift A's own words → set it on the follow-up later (rules: owner_sources).
    owner = fu_rules.owner_from_quote(getattr(ef, "owner_mentioned", None), quote, h.incoming_id)
    if owner:
        fact.normalized = fact.normalized or owner


def _refresh_rules(session: Session, h: Handoff, actor_id: str) -> None:
    """Recompute priority and follow-ups after facts changed."""
    session.flush()
    views = views_for(session, h.id)
    for v in views:
        v.item.priority = compute_priority(v)[0]
    existing = followups_for(session, h.id)
    created = fu_rules.sync_followups(views, existing, h.id, id_sequence(session, FollowUp))
    for fu in created:
        session.add(fu)
        audit(session, "followup_created", handoff_id=h.id, item_id=fu.item_id, followup_id=fu.id)
    session.flush()
    # An owner Shift A named explicitly (quote-verified) fills an unassigned follow-up.
    for fu in [*existing, *created]:
        if fu.owner_id or fu.status == "closed":
            continue
        view = next((v for v in views if v.id == fu.item_id), None)
        owner_fact = view.fact("owner") if view else None
        if owner_fact and owner_fact.normalized and config.person(owner_fact.normalized):
            fu.owner_id = owner_fact.normalized
            fu.assigned_by = actor_id
            fu.assigned_at = clock.now()
            audit(session, "followup_assigned", handoff_id=h.id, item_id=fu.item_id, actor_id=actor_id,
                  followup_id=fu.id, source="quote", quote=owner_fact.quote)


def _settle_state(h: Handoff, has_pending: bool) -> None:
    if h.state == "analyzing":
        _transition(h, "analysis_done", has_pending_question=has_pending)
    elif h.state in sm.SHIFT_A_EDIT_STATES:
        h.state = "clarifying" if has_pending else "in_review"


async def _replan(session: Session, h: Handoff, analyzer: Analyzer) -> None:
    """Ask the next question, or move to review and record what was not asked."""
    session.flush()
    questions = questions_for(session, h.id)
    if any(q.status == "pending" for q in questions):
        _settle_state(h, True)
        return
    views = views_for(session, h.id)
    stmt_ids = {s.id for s in statements_for(session, h.id)}
    gaps = find_gaps(views, questions, followups_for(session, h.id), stmt_ids)
    p = plan(gaps, h.question_budget_used)

    for q in questions:
        if q.status == "not_asked":
            session.delete(q)
    session.flush()
    for n in p.not_asked:
        if n.reason == "queued":
            continue
        session.add(ClarificationQuestion(
            id=next_id(session, ClarificationQuestion), handoff_id=h.id, item_id=n.gap.item_id,
            gap_type=n.gap.gap_type, slots=list(n.gap.slots), target_slot=n.gap.target_slot,
            priority_score=n.score, status="not_asked", reason_not_asked=n.reason))

    if p.next is None:
        _settle_state(h, False)
        return
    g = p.next
    view = next(v for v in views if v.id == g.item_id)
    gap = {"gap_type": g.gap_type, "slots": list(g.slots), "target_slot": g.target_slot, "reason": g.reason}
    text, why = await analyzer.phrase_question(gap=gap, item=_item_brief(view))
    q = ClarificationQuestion(id=next_id(session, ClarificationQuestion), handoff_id=h.id, item_id=g.item_id,
                              gap_type=g.gap_type, slots=list(g.slots), target_slot=g.target_slot,
                              priority_score=p.next_score or 0, text=text, why_asked=why, status="pending",
                              asked_at=clock.now())
    session.add(q)
    h.question_budget_used += 1
    audit(session, "question_asked", handoff_id=h.id, item_id=g.item_id, question_id=q.id,
          gap_type=g.gap_type, slots=list(g.slots), over_budget=p.over_budget)
    _settle_state(h, True)


# ---------- Review and submit ----------

def patch_fact(session: Session, fact_id: str, actor_id: str, *, review_state: str,
               value: str | None = None, normalized: str | None = None, certainty: str | None = None,
               text: str | None = None) -> Handoff:
    from app.certainty.floor import CertaintyRaiseError, operator_set_certainty

    fact = session.get(Fact, fact_id)
    if fact is None or fact.superseded_by is not None:
        raise NotFound(f"fact {fact_id} not found or superseded")
    item = session.get(Item, fact.item_id)
    h = get_handoff(session, item.handoff_id)
    _authorize(h, "review", actor_id)
    if h.state not in ("clarifying", "in_review"):
        raise Conflict(f"cannot review facts while {h.state}")
    if review_state not in ("operator_confirmed", "operator_edited", "operator_rejected"):
        raise Unprocessable(f"bad review_state {review_state!r}")

    stmt = None
    if text:
        stmt = Statement(id=next_id(session, Statement), handoff_id=h.id, speaker_id=actor_id, source="text_web",
                         role="review_edit", text=text.strip(), at=clock.now())
        session.add(stmt)

    new_certainty, reason = fact.certainty, fact.certainty_reason
    if certainty is not None and certainty != fact.certainty:
        try:
            new_certainty, reason = operator_set_certainty(fact.certainty, certainty, text)
        except CertaintyRaiseError as e:
            raise Unprocessable(str(e)) from e
        except ValueError as e:
            raise Unprocessable(str(e)) from e

    changed = (value is not None and value != fact.value) or (normalized is not None and normalized != fact.normalized) \
        or new_certainty != fact.certainty
    if changed:
        # Edits make a new version; the old one stays as history.
        new = Fact(id=next_id(session, Fact), item_id=fact.item_id, slot=fact.slot,
                   value=value if value is not None else fact.value,
                   normalized=normalized if normalized is not None else fact.normalized,
                   certainty=new_certainty, certainty_reason=reason,
                   review_state="operator_edited" if review_state != "operator_rejected" else review_state,
                   source_statement_id=stmt.id if stmt else fact.source_statement_id,
                   quote=stmt.text if stmt else fact.quote,
                   ai_proposed_value=fact.ai_proposed_value or (fact.value if fact.review_state == "ai_extracted" else None))
        session.add(new)
        fact.superseded_by = new.id
        audit(session, "fact_edited", handoff_id=h.id, item_id=item.id, actor_id=actor_id,
              fact_id=fact.id, new_fact_id=new.id)
    else:
        if review_state == "operator_edited":
            review_state = "operator_confirmed"  # nothing actually changed
        fact.review_state = review_state
        audit(session, "fact_reviewed", handoff_id=h.id, item_id=item.id, actor_id=actor_id,
              fact_id=fact.id, review_state=review_state)
    session.flush()
    _refresh_rules(session, h, actor_id)
    session.commit()
    return h


def confirm_routine(session: Session, handoff_id: str, actor_id: str) -> Handoff:
    h = get_handoff(session, handoff_id)
    _authorize(h, "review", actor_id)
    if h.state not in ("clarifying", "in_review"):
        raise Conflict(f"cannot review facts while {h.state}")
    n = 0
    for v in views_for(session, h.id):
        if v.priority == "critical":
            continue  # critical facts are confirmed one at a time
        for f in v.facts:
            if f.review_state == "ai_extracted":
                f.review_state = "operator_confirmed"
                n += 1
    audit(session, "routine_confirmed", handoff_id=h.id, actor_id=actor_id, count=n)
    session.commit()
    return h


def submit(session: Session, handoff_id: str, actor_id: str) -> Handoff:
    from app.handoff.metrics import compute_metrics

    h = get_handoff(session, handoff_id)
    _authorize(h, "submit", actor_id)
    if h.state != "in_review":
        raise Conflict(f"cannot submit while {h.state}")
    blockers = sm.submit_blockers(views_for(session, h.id), questions_for(session, h.id))
    if blockers:
        raise Conflict("Finish review before submitting.", {"blockers": blockers}, code="submit_blocked")
    _transition(h, "submit")
    h.submitted_at = clock.now()
    h.metrics = compute_metrics(session, h)
    audit(session, "submitted", handoff_id=h.id, actor_id=actor_id)
    session.commit()
    return h


# ---------- Follow-ups ----------

def _followup(session: Session, followup_id: str) -> FollowUp:
    fu = session.get(FollowUp, followup_id)
    if fu is None:
        raise NotFound(f"follow-up {followup_id} not found")
    return fu


def _followup_handoff(session: Session, fu: FollowUp) -> Handoff:
    item = session.get(Item, fu.item_id)
    return get_handoff(session, item.handoff_id if item else fu.handoff_id)


def assign_followup(session: Session, followup_id: str, actor_id: str, owner_id: str,
                    deadline: datetime | None) -> Handoff:
    fu = _followup(session, followup_id)
    try:
        fu_rules.assign(fu, actor_id, owner_id, deadline, clock.now())
    except fu_rules.FollowUpPermissionError as e:
        raise Forbidden(str(e)) from e
    except fu_rules.FollowUpError as e:
        raise Unprocessable(str(e)) from e
    h = _followup_handoff(session, fu)
    audit(session, "followup_assigned", handoff_id=h.id, item_id=fu.item_id, actor_id=actor_id,
          followup_id=fu.id, owner_id=owner_id, deadline=deadline.isoformat() if deadline else None,
          source="assignment")
    session.commit()
    return h


def close_followup(session: Session, followup_id: str, actor_id: str, text: str) -> Handoff:
    fu = _followup(session, followup_id)
    _require_person(actor_id)
    if not text or not text.strip():
        raise Unprocessable("closing a follow-up needs a closure statement")
    h = _followup_handoff(session, fu)
    stmt = Statement(id=next_id(session, Statement), handoff_id=h.id, speaker_id=actor_id, source="text_web",
                     role="followup_update", text=text.strip(), at=clock.now())
    session.add(stmt)
    try:
        fu_rules.close(fu, actor_id, stmt.id, clock.now())
    except fu_rules.FollowUpError as e:
        raise Unprocessable(str(e)) from e
    audit(session, "followup_closed", handoff_id=h.id, item_id=fu.item_id, actor_id=actor_id,
          followup_id=fu.id, statement_id=stmt.id)
    session.commit()
    return h
