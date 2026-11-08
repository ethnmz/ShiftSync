from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.handoff import receive
from app.routes.deps import get_session

router = APIRouter()


@router.get("/supervisor/summary")
def summary(session: Session = Depends(get_session)):
    return receive.supervisor_summary(session)
