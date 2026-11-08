"""Demo control (docs/API.md → Demo control). For the synthetic demo only."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import Session

from app import clock
from app.demo import replay
from app.demo.seed import load_scenario, reset
from app.handoff.analyzer import Analyzer
from app.handoff.detail import iso
from app.routes.deps import get_analyzer, get_session

router = APIRouter()


class ClockBody(BaseModel):
    at: datetime | None = None
    advance_seconds: float | None = None
    real: bool = False


@router.post("/demo/reset")
def demo_reset():
    reset()
    return {"ok": True, "now": iso(clock.now())}


@router.post("/demo/clock")
def demo_clock(body: ClockBody):
    if body.real:
        clock.reset()
    elif body.at is not None:
        clock.set_now(body.at)
    elif body.advance_seconds is not None:
        clock.advance(body.advance_seconds)
    return {"now": iso(clock.now())}


@router.get("/demo/scenario")
def demo_scenario():
    return load_scenario()


@router.post("/demo/step/{n}")
async def demo_step(n: int, offline: bool = True, session: Session = Depends(get_session),
                    analyzer: Analyzer = Depends(get_analyzer)):
    """Replay step n. `offline=true` uses fixed AI outputs; `offline=false` uses the configured providers."""
    return await replay.run_step(session, n, offline=offline, live_analyzer=analyzer)
