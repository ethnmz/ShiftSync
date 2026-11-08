"""Shared FastAPI dependencies."""
from __future__ import annotations

from fastapi import Header, HTTPException, Request

from app import config
from app.db import get_session  # noqa: F401  (re-exported for routers)
from app.handoff.analyzer import Analyzer, DefaultAnalyzer


def current_user(x_user: str = Header(..., alias="X-User")) -> str:
    """Demo identity: a roster id in the X-User header. A demo selector, not authentication."""
    if not config.person(x_user):
        raise HTTPException(status_code=403, detail={"code": "unknown_user",
                                                     "message": f"{x_user!r} is not on the roster"})
    return x_user


def get_analyzer(request: Request) -> Analyzer:
    return getattr(request.app.state, "analyzer", None) or DefaultAnalyzer()
