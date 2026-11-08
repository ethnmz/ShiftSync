"""Shift B routes: briefing, acknowledge, verification (docs/API.md).

`POST /verification/{vid}/answer` (typed and voice) lives in Diego's
app/routes/ingest.py and calls `receive.answer_check`.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlmodel import Session

from app.handoff import receive
from app.handoff.analyzer import Analyzer
from app.handoff.detail import handoff_detail
from app.routes.deps import current_user, get_analyzer, get_session

router = APIRouter()


class ClarifiedBody(BaseModel):
    note: str


@router.get("/handoffs/{handoff_id}/briefing")
async def briefing(handoff_id: str, x_user: str | None = Header(None, alias="X-User"),
                   session: Session = Depends(get_session), analyzer: Analyzer = Depends(get_analyzer)):
    return await receive.build_briefing(session, handoff_id, viewer_id=x_user, analyzer=analyzer)


@router.post("/handoffs/{handoff_id}/acknowledge")
def acknowledge(handoff_id: str, user: str = Depends(current_user), session: Session = Depends(get_session)):
    return handoff_detail(session, receive.acknowledge(session, handoff_id, user))


@router.post("/handoffs/{handoff_id}/verification/start")
async def start(handoff_id: str, user: str = Depends(current_user), session: Session = Depends(get_session),
                analyzer: Analyzer = Depends(get_analyzer)):
    return await receive.start_verification(session, handoff_id, user, analyzer=analyzer)


@router.post("/verification/{check_id}/clarified-in-person")
def clarified(check_id: str, body: ClarifiedBody, user: str = Depends(current_user),
              session: Session = Depends(get_session)):
    return handoff_detail(session, receive.clarified_in_person(session, check_id, user, body.note))
