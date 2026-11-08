"""Demo seed: reset the database and load the carried-over history from demo/scenario.json.

    python -m app.demo.seed --reset

The history is yesterday's handoff with one open follow-up (CRAC-3). Its owner
and deadline are written in the scenario file by a person, not invented here.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta
from typing import Any

from sqlmodel import Session

from app import clock, config, db
from app.models import Fact, FollowUp, Handoff, Item, Statement


def load_scenario() -> dict[str, Any]:
    with open(config.scenario_path(), encoding="utf-8") as f:
        return json.load(f)


def _ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def seed_history(session: Session, scenario: dict[str, Any] | None = None) -> Handoff | None:
    scenario = scenario or load_scenario()
    hist = scenario.get("history") or {}
    if not hist.get("items"):
        return None
    first_step = _ts(scenario["steps"][0]["at"])
    at = first_step - timedelta(days=1)
    speakers = {f.get("speaker") for it in hist["items"] for f in it.get("facts", [])} - {None}
    outgoing = sorted(speakers)[0] if speakers else "rob"
    h = Handoff(id=db.next_id(session, Handoff), outgoing_id=outgoing, incoming_id="maya", state="submitted",
                created_at=at, submitted_at=at)
    session.add(h)
    for it in hist["items"]:
        text = " ".join(f["quote"] for f in it.get("facts", []))
        stmt = Statement(id=db.next_id(session, Statement), handoff_id=h.id, speaker_id=outgoing, source="seed",
                         role="handoff", text=text, at=at)
        session.add(stmt)
        item = Item(id=db.next_id(session, Item), handoff_id=h.id, kind=it["kind"], title=it["title"],
                    asset_ids=it.get("asset_ids", []), priority="critical", created_from_statement_id=stmt.id)
        session.add(item)
        for f in it.get("facts", []):
            session.add(Fact(id=db.next_id(session, Fact), item_id=item.id, slot=f["slot"],
                             value=f.get("value") or f.get("normalized") or f["quote"],
                             normalized=f.get("normalized"), certainty=f["certainty"],
                             certainty_reason="operator stated", review_state="operator_confirmed",
                             source_statement_id=stmt.id, quote=f["quote"]))
        fu = it.get("followup")
        if fu:
            session.add(FollowUp(id=db.next_id(session, FollowUp), item_id=item.id, handoff_id=h.id,
                                 description=fu["description"], missing_information=fu.get("missing_information", ""),
                                 owner_id=fu.get("owner"), deadline=_ts(fu["deadline"]) if fu.get("deadline") else None,
                                 assigned_by=fu.get("owner"), assigned_at=at if fu.get("owner") else None,
                                 status=fu.get("status", "open")))
    session.commit()
    return h


def reset(url: str | None = None) -> None:
    """Drop everything, recreate tables, load roster/assets and history, set the demo clock."""
    db.init_db(url, drop=True)
    scenario = load_scenario()
    with Session(db.get_engine()) as s:
        db.load_static(s)
        seed_history(s, scenario)
    clock.set_now(scenario["steps"][0]["at"])


def main() -> None:
    ap = argparse.ArgumentParser(description="ShiftSync demo seed")
    ap.add_argument("--reset", action="store_true", help="drop all data and load the demo history")
    args = ap.parse_args()
    if args.reset:
        reset()
        print("demo database reset; history loaded")
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
