"""iMessage transport for the optional Photon bridge (docs/PHOTON_BRIDGE.md).

POST /inbound/imessage takes `{"sender_phone", "text"}` as JSON, or a multipart
voice note (`sender_phone` + `file`). The sender is found on the roster by phone,
and the message becomes a Statement on their open handoff through the same
service the web app uses. The response is short bubbles for the bridge to send:
`{"reply": str, "followups": [str]}`. Review, submit and Shift B stay in the web app.

Errors keep the usual `{"detail": {"code", "message"}}` shape. The bridge sends
`message` back to the operator, so messages here are written for a phone.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from json import JSONDecodeError
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session, select
from starlette.datastructures import UploadFile

from app import clock, config
from app.handoff import service
from app.handoff import state as sm
from app.handoff.analyzer import Analyzer
from app.models import Fact, Handoff, Item
from app.routes.deps import get_analyzer, get_session
from app.routes.ingest import save_and_transcribe

router = APIRouter()

# roster.yaml: three 8-hour shifts. A handoff submitted less than one shift ago is
# still "this shift's" handoff, so a late text must not quietly start a new one.
SHIFT_HOURS = 8
# Whole-message replies that mean "I don't know" (the web app's one-tap Unknown).
_DONT_KNOW = {"dont know", "i dont know", "idk", "unknown", "no idea", "not sure", "i am not sure", "im not sure"}
# Weakest first. Confirmed facts get no marker: "UPS-B ✓" could read as "UPS-B is fine".
_CERTAINTY_ORDER = ["unknown", "unverified", "reported", "confirmed"]
_MARKERS = {"unknown": "? unknown", "unverified": "⚠ unverified", "reported": "◔ reported"}
_QUOTED_TERM = re.compile(r'^(?:hedge|uncertainty|observation):"(.+)"$')


@router.post("/inbound/imessage")
async def inbound_imessage(request: Request, session: Session = Depends(get_session),
                           analyzer: Analyzer = Depends(get_analyzer)):
    phone, text, upload = await _read_message(request)
    user = _roster_id(phone)
    h, started = _open_handoff(session, user)
    pending = next((q for q in service.questions_for(session, h.id) if q.status == "pending"), None)

    source, audio_path = "imessage_text", None
    if upload is not None:
        text, audio_path = await save_and_transcribe(upload, h.id, fallback="You can text it instead.")
        source = "imessage_voice"

    before = {s.id for s in service.statements_for(session, h.id)}
    # Assumption: while a question is pending, the next message answers it. That is
    # how the question reads in the thread ("Reply, send a voice note, or don't know").
    dont_know = pending is not None and _means_dont_know(text)
    try:
        if dont_know:
            h = await service.answer_question(session, h.id, pending.id, user, dont_know=True,
                                              source=source, analyzer=analyzer)
        else:
            h = await service.ingest_statement(session, h.id, user, text, source=source,
                                               question_id=pending.id if pending else None,
                                               audio_path=audio_path, analyzer=analyzer)
    except service.ServiceError as exc:
        if exc.code != "analysis_failed":
            raise
        raise service.Unprocessable(
            f"I saved your note to the handoff, but couldn't analyze it right now. "
            f"Check it in the web app: {_review_link(h)}", payload=exc.payload, code=exc.code) from exc
    new = {s.id for s in service.statements_for(session, h.id)} - before
    return _bubbles(session, h, new, started=started, dont_know=dont_know)


async def _read_message(request: Request) -> tuple[str, str, UploadFile | None]:
    """(sender_phone, text, upload). Exactly one of text or upload carries the message."""
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if not isinstance(upload, UploadFile):
            raise service.Unprocessable("Send the voice note in the `file` field.")
        return _str(form.get("sender_phone")), "", upload
    if content_type.startswith("application/json"):
        try:
            body = await request.json()
        except (JSONDecodeError, UnicodeDecodeError):
            raise service.Unprocessable("The request body isn't valid JSON.") from None
        if not isinstance(body, dict):
            raise service.Unprocessable('Send {"sender_phone": "...", "text": "..."}.')
        text = _str(body.get("text"))
        if not text:
            raise service.Unprocessable("Send a text or a voice note.")
        return _str(body.get("sender_phone")), text, None
    raise service.Unprocessable("Send JSON text or a multipart voice note.")


def _str(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _digits(phone: str) -> str:
    d = re.sub(r"\D", "", phone)
    return "1" + d if len(d) == 10 else d  # Assumption: a bare 10-digit number is US (+1)


def _roster_id(phone: str) -> str:
    """Roster id for a phone number. Only roster numbers may add to a handoff."""
    want = _digits(phone)
    for pid, p in config.people().items():
        if want and p.get("phone") and _digits(p["phone"]) == want:
            return pid
    raise service.Forbidden("This number isn't on the ShiftSync roster. Ask your supervisor to add it.",
                            code="unknown_sender")


def _open_handoff(session: Session, user: str) -> tuple[Handoff, bool]:
    """(the sender's open handoff, whether it was just started)."""
    latest = session.exec(select(Handoff).where(Handoff.outgoing_id == user)
                          .order_by(Handoff.created_at.desc(), Handoff.id.desc())).first()
    if latest is not None and latest.state in sm.SHIFT_A_EDIT_STATES:
        return latest, False
    if latest is not None and clock.now() - _utc(latest.created_at) < timedelta(hours=SHIFT_HOURS):
        incoming = config.person(latest.incoming_id) or {}
        name = incoming.get("name", latest.incoming_id)
        raise service.Conflict(f"Your handoff to {name} is already {latest.state}, so I can't add to it. "
                               f"Please tell {name} directly.")
    incoming = _next_shift_lead(user)
    if incoming is None:
        raise service.Unprocessable("I couldn't tell who takes over from you. Start your handoff in the "
                                    "web app, then text me again.")
    # Assumption: a texted handoff goes to the lead of the next shift in roster.yaml.
    # The first reply names that person, so a wrong guess is visible right away.
    return service.create_handoff(session, user, incoming, actor_id=user), True


def _next_shift_lead(user: str) -> str | None:
    roster = config.load_yaml("roster")
    teams = [s["team"] for s in roster.get("shifts", [])]
    team = (config.person(user) or {}).get("team")
    if team not in teams:
        return None
    nxt = teams[(teams.index(team) + 1) % len(teams)]
    return next((p["id"] for p in roster["people"] if p.get("team") == nxt and p.get("role") == "lead"), None)


def _utc(dt: datetime) -> datetime:
    """SQLite returns naive datetimes; the app stores UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _means_dont_know(text: str) -> bool:
    return re.sub(r"[^a-z ]", "", text.lower().replace("’", "'").replace("'", "")).strip() in _DONT_KNOW


def _first_name(person_id: str) -> str:
    return ((config.person(person_id) or {}).get("name") or person_id).split()[0]


def _review_link(h: Handoff) -> str:
    # Assumption: FRONTEND_URL is where the web app runs (Vite dev server by default).
    base = (os.environ.get("FRONTEND_URL") or "http://localhost:5173").rstrip("/")
    return f"{base}/create/{h.id}/review"


def _bubbles(session: Session, h: Handoff, new_statement_ids: set[str], started: bool,
             dont_know: bool) -> dict[str, Any]:
    """The reply bubble plus the next question (or the review link) as follow-up bubbles."""
    incoming = _first_name(h.incoming_id)
    facts = list(session.exec(select(Fact).where(Fact.source_statement_id.in_(new_statement_ids)))) \
        if new_statement_ids else []
    if dont_know:
        reply = f"Noted as unknown. {incoming} will see it marked unknown."
    elif started:
        reply = f"Started your handoff to {incoming}." + (f" Added: {_item_summary(session, facts)}." if facts else "")
    elif facts:
        reply = f"Got it. Added to your handoff for {incoming}: {_item_summary(session, facts)}."
    else:
        reply = f"Got it. Added to your handoff for {incoming}."

    followups = []
    questions = service.questions_for(session, h.id)
    pending = next((q for q in questions if q.status == "pending"), None)
    if pending is not None:
        budget = config.budgets()["clarification_questions"]
        count = f"({h.question_budget_used}/{budget}) " if h.question_budget_used <= budget else ""
        followups.append(f'{count}{pending.text}  Reply, send a voice note, or "don\'t know".')
    elif h.state == "in_review":
        followups.append(f"That's all I need. Review and submit here: {_review_link(h)}")
    return {"reply": reply, "followups": followups}


def _item_summary(session: Session, facts: list[Fact]) -> str:
    """'UPS-B (⚠ unverified: "mostly"), GEN-1': each touched item with its weakest new certainty."""
    by_item: dict[str, list[Fact]] = {}
    for f in facts:
        by_item.setdefault(f.item_id, []).append(f)
    parts = []
    for item_id, item_facts in by_item.items():
        item = session.get(Item, item_id)
        label = ", ".join(item.asset_ids) if item.asset_ids else item.title
        weakest = min(item_facts, key=lambda f: _CERTAINTY_ORDER.index(f.certainty)
                      if f.certainty in _CERTAINTY_ORDER else 0)
        marker = _MARKERS.get(weakest.certainty)
        if marker:
            term = _QUOTED_TERM.match(weakest.certainty_reason or "")
            if term:
                marker += f': "{term.group(1)}"'
            label += f" ({marker})"
        parts.append(label)
    return ", ".join(parts)
