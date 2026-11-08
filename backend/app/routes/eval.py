"""Benchmark routes (docs/EVALUATION.md). Results only come from real runs."""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from app.eval import run as eval_run

router = APIRouter()
_running = {"active": False}


class RunBody(BaseModel):
    runs: int = 3
    scenario: str | None = None


async def _job(body: RunBody) -> None:
    try:
        await eval_run.run(body.runs, body.scenario)
    finally:
        _running["active"] = False


@router.post("/eval/run")
async def start_run(background: BackgroundTasks, body: RunBody | None = None):
    body = body or RunBody()
    if _running["active"]:
        return {"status": "running"}
    _running["active"] = True
    background.add_task(_job, body)
    return {"status": "running"}


@router.get("/eval/results")
def results():
    out = eval_run.read_results()
    if _running["active"]:
        out = {**out, "running": True}
    return out
