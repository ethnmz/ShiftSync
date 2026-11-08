"""Handoff routes for Shift A review/submit, facts, and follow-ups (docs/API.md).

`POST /handoffs/{id}/statements` lives in Diego's app/routes/ingest.py.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session, select

from app.handoff import service
from app.handoff.analyzer import Analyzer
from app.handoff.detail import followup_out, handoff_detail, handoff_summary
from app.models import FollowUp, Handoff
from app.routes.deps import current_user, get_analyzer, get_session

router = APIRouter()


class CreateHandoff(BaseModel):
    outgoing_id: str
    incoming_id: str


class AnswerBody(BaseModel):
    text: str | None = None
    dont_know: bool = False


class FactPatch(BaseModel):
    review_state: str
    value: str | None = None
    normalized: str | None = None
    certainty: str | None = None
    text: str | None = None


class FollowUpPatch(BaseModel):
    owner_id: str
    deadline: datetime | None = None


class CloseBody(BaseModel):
    text: str


@router.post("/handoffs")
def create_handoff(body: CreateHandoff, user: str = Depends(current_user), session: Session = Depends(get_session)):
    h = service.create_handoff(session, body.outgoing_id, body.incoming_id, actor_id=user)
    return handoff_detail(session, h)


@router.get("/handoffs")
def list_handoffs(state: str | None = None, limit: int = 50, session: Session = Depends(get_session)):
    q = select(Handoff).order_by(Handoff.created_at.desc()).limit(limit)
    if state:
        q = q.where(Handoff.state == state)
    return [handoff_summary(h) for h in session.exec(q)]


@router.get("/handoffs/{handoff_id}")
def get_handoff(handoff_id: str, session: Session = Depends(get_session)):
    return handoff_detail(session, service.get_handoff(session, handoff_id))


@router.post("/handoffs/{handoff_id}/questions/{question_id}/answer")
async def answer_question(handoff_id: str, question_id: str, body: AnswerBody,
                          user: str = Depends(current_user), session: Session = Depends(get_session),
                          analyzer: Analyzer = Depends(get_analyzer)):
    h = await service.answer_question(session, handoff_id, question_id, user, text=body.text,
                                      dont_know=body.dont_know, analyzer=analyzer)
    return handoff_detail(session, h)


@router.patch("/facts/{fact_id}")
def patch_fact(fact_id: str, body: FactPatch, user: str = Depends(current_user),
               session: Session = Depends(get_session)):
    h = service.patch_fact(session, fact_id, user, review_state=body.review_state, value=body.value,
                           normalized=body.normalized, certainty=body.certainty, text=body.text)
    return handoff_detail(session, h)


@router.post("/handoffs/{handoff_id}/review/confirm-routine")
def confirm_routine(handoff_id: str, user: str = Depends(current_user), session: Session = Depends(get_session)):
    return handoff_detail(session, service.confirm_routine(session, handoff_id, user))


@router.post("/handoffs/{handoff_id}/submit")
def submit(handoff_id: str, user: str = Depends(current_user), session: Session = Depends(get_session)):
    return handoff_detail(session, service.submit(session, handoff_id, user))


@router.get("/followups")
def list_followups(status: str | None = None, session: Session = Depends(get_session)):
    q = select(FollowUp).order_by(FollowUp.id)
    if status:
        q = q.where(FollowUp.status == status)
    return [followup_out(fu) for fu in session.exec(q)]


@router.patch("/followups/{followup_id}")
def assign_followup(followup_id: str, body: FollowUpPatch, user: str = Depends(current_user),
                    session: Session = Depends(get_session)):
    h = service.assign_followup(session, followup_id, user, body.owner_id, body.deadline)
    return handoff_detail(session, h)


@router.post("/followups/{followup_id}/close")
def close_followup(followup_id: str, body: CloseBody, user: str = Depends(current_user),
                   session: Session = Depends(get_session)):
    return handoff_detail(session, service.close_followup(session, followup_id, user, body.text))
