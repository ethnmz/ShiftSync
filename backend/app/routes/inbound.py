"""iMessage transport for the optional Photon bridge (docs/PHOTON_BRIDGE.md).

POST /inbound/imessage takes `{"sender_phone", "text"}` as JSON, or a multipart
voice note (`sender_phone` + `file`). The sender is found on the roster by phone.
The response is short bubbles for the bridge to send: `{"reply": str, "followups": [str]}`.

- Shift A: the message becomes a Statement on their open handoff, through the same
  service the web app uses. Review and submit stay in the web app.
- Shift B: if a handoff from this shift is waiting on the sender, they get the
  briefing, acknowledge it, and answer the understanding check by text or voice.

POST /inbound/imessage/notices tells the bridge who to text about a new handoff.

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
from app.handoff import receive, service
from app.handoff import state as sm
from app.handoff.analyzer import Analyzer
from app.models import AuditEvent, Fact, Handoff, Item, Statement
from app.routes.deps import get_analyzer, get_session
from app.routes.ingest import save_and_transcribe

router = APIRouter()

# roster.yaml: three 8-hour shifts. A handoff submitted less than one shift ago is
# still "this shift's" handoff, so a late text must not quietly start a new one.
SHIFT_HOURS = 8
# Whole-message replies that mean "I don't know" (the web app's one-tap Unknown).
_DONT_KNOW = {"dont know", "i dont know", "idk", "unknown", "no idea", "not sure", "i am not sure", "im not sure"}
# Whole-message replies that acknowledge a briefing. Deliberately explicit: "ok" could be anything.
_ACK = {"ack", "acknowledge", "acknowledged", "received"}
# Handoff states where the incoming operator still has something to do.
_SHIFT_B_STATES = ("submitted", "acknowledged", "verifying")
_MAX_EVIDENCE_BUBBLES = 2
_IN_PERSON = "A lead needs to clarify this with you in person."
# Weakest first. Confirmed facts get no marker: "UPS-B ✓" could read as "UPS-B is fine".
_CERTAINTY_ORDER = ["unknown", "unverified", "reported", "confirmed"]
_MARKERS = {"unknown": "? unknown", "unverified": "⚠ unverified", "reported": "◔ reported"}
_QUOTED_TERM = re.compile(r'^(?:hedge|uncertainty|observation):"(.+)"$')


@router.post("/inbound/imessage")
async def inbound_imessage(request: Request, session: Session = Depends(get_session),
                           analyzer: Analyzer = Depends(get_analyzer)):
    phone, text, upload = await _read_message(request)
    user = _roster_id(phone)
    waiting = _handoff_to_receive(session, user)
    if waiting is not None:
        return await _shift_b(session, waiting, user, text, upload, analyzer)
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


@router.post("/inbound/imessage/notices")
def imessage_notices(session: Session = Depends(get_session)):
    """Newly submitted handoffs for the bridge to announce. Each one is returned once.

    The notice is only a nudge, so `briefing_opened` still means they opened it.
    """
    announced = set(session.exec(select(AuditEvent.handoff_id).where(AuditEvent.type == "incoming_notified")))
    notices = []
    for h in session.exec(select(Handoff).where(Handoff.state == "submitted")).all():
        phone = (config.person(h.incoming_id) or {}).get("phone")
        if h.id in announced or not phone or not _within_shift(h):
            continue
        service.audit(session, "incoming_notified", handoff_id=h.id)
        notices.append({"phone": phone, "text": f"{_first_name(h.outgoing_id)} handed off to you. "
                                                "Reply to open the briefing."})
    session.commit()
    return {"notices": notices}


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


def _within_shift(h: Handoff) -> bool:
    return clock.now() - _utc(h.submitted_at or h.created_at) < timedelta(hours=SHIFT_HOURS)


def _handoff_to_receive(session: Session, user: str) -> Handoff | None:
    """This shift's handoff waiting on `user` as the incoming operator, if any.

    Assumption: anything older than one shift isn't the one they're taking over.
    Without this, old unfinished history would capture all of their texts.
    """
    h = session.exec(select(Handoff).where(Handoff.incoming_id == user, Handoff.state.in_(_SHIFT_B_STATES))
                     .order_by(Handoff.submitted_at.desc(), Handoff.id.desc())).first()
    return h if h is not None and _within_shift(h) else None


async def _shift_b(session: Session, h: Handoff, user: str, text: str, upload: UploadFile | None,
                   analyzer: Analyzer) -> dict[str, Any]:
    """One message from the incoming operator: briefing, then acknowledgment, then the check."""
    if h.state == "submitted":
        if upload is not None or not _means(text, _ACK):
            return await _briefing_bubbles(session, h, user, analyzer)
        receive.acknowledge(session, h.id, user)
        return await _start_check(session, h, user, analyzer,
                                  "Acknowledged. That isn't verified understanding yet, so here's a quick check.")
    if h.state == "acknowledged":
        return await _start_check(session, h, user, analyzer, "Here's a quick check of your understanding.")

    check = next((c for c in receive.checks_for(session, h.id) if c.status == "pending"), None)
    if check is None:
        return {"reply": _IN_PERSON, "followups": []}
    source, audio_path = "imessage_text", None
    if upload is not None:
        text, audio_path = await save_and_transcribe(upload, f"{h.id}-{check.id}",
                                                     fallback="You can text your answer instead.")
        source = "imessage_voice"
    try:
        attempt = await receive.answer_check(session, check.id, user, text, source=source,
                                             analyzer=analyzer, audio_path=audio_path)
    except service.ServiceError as exc:
        if exc.code != "analysis_failed":
            raise
        raise service.Unprocessable("I couldn't check that answer right now. Please send it again.",
                                    payload=exc.payload, code=exc.code) from exc
    return _attempt_bubbles(session, h, attempt)


async def _briefing_bubbles(session: Session, h: Handoff, user: str, analyzer: Analyzer) -> dict[str, Any]:
    b = await receive.build_briefing(session, h.id, viewer_id=user, analyzer=analyzer)
    followups = []
    if b["lines"]:
        followups.append("\n\n".join(_briefing_line(line) for line in b["lines"]))
    if b["open_followups"]:
        followups.append("Open follow-ups:\n" + "\n".join(f"• {fu['description']} (owner: {fu['owner_label']})"
                                                          for fu in b["open_followups"]))
    followups.append(f'{b["disclaimer"]} Reply "ack" when you\'ve read this.')
    return {"reply": f"{_first_name(h.outgoing_id)} handed off to you. {b['headline']}", "followups": followups}


def _briefing_line(line: dict[str, Any]) -> str:
    marker = _MARKERS.get(line["certainty"])
    return f"{marker}\n{line['text']}" if marker else line["text"]


async def _start_check(session: Session, h: Handoff, user: str, analyzer: Analyzer, opener: str) -> dict[str, Any]:
    try:
        started = await receive.start_verification(session, h.id, user, analyzer=analyzer)
    except service.ServiceError as exc:
        if exc.code != "nothing_to_verify":
            raise
        return {"reply": opener.split(".")[0] + ".", "followups": [exc.message]}
    return {"reply": opener, "followups": [_check_prompt(session, h, started["check"])]}


def _check_prompt(session: Session, h: Handoff, check: dict[str, Any], retry: bool = False) -> str:
    ids = [c.id for c in receive.checks_for(session, h.id)]
    return (f"{'Try again. ' if retry else ''}({ids.index(check['id']) + 1}/{len(ids)}) {check['question']}  "
            "Reply or send a voice note.")


def _attempt_bubbles(session: Session, h: Handoff, attempt: dict[str, Any]) -> dict[str, Any]:
    followups = []
    if attempt["status"] == "verified":
        reply = "✓ That matches the handoff."
        if attempt["feedback"]:
            followups.append(attempt["feedback"])
    else:
        reply = attempt["feedback"] or "That doesn't match the handoff."
        followups += _evidence_bubbles(session, attempt["evidence"])
    if attempt["status"] == "needs_clarification":
        followups.append(_IN_PERSON)
    next_check = attempt["next_check"]
    if next_check:
        followups.append(_check_prompt(session, h, next_check, retry=next_check["id"] == attempt["check_id"]))
    elif attempt["handoff_state"] in ("verified", "verified_with_assistance"):
        followups.append(_verified_bubble(session, attempt["handoff_state"], h))
    return {"reply": reply, "followups": followups}


def _evidence_bubbles(session: Session, evidence: list[dict[str, str]]) -> list[str]:
    """The original words behind a correction, once each, naming who said them."""
    bubbles: list[str] = []
    seen: set[str] = set()
    for e in evidence:
        quote = e.get("quote")
        if not quote or quote in seen:
            continue
        seen.add(quote)
        st = session.get(Statement, e["statement_id"]) if e.get("statement_id") else None
        label = f"{_first_name(st.speaker_id)} said" if st else "From the handoff"
        bubbles.append(f'{label}: "{quote}"')
    return bubbles[:_MAX_EVIDENCE_BUBBLES]


def _verified_bubble(session: Session, state: str, h: Handoff) -> str:
    still_open = [fu for fu in service.followups_for(session, h.id) if fu.status != "closed"]
    unassigned = sum(1 for fu in still_open if not fu.owner_id)
    done = "Understanding verified" if state == "verified" else "Understanding verified with a lead's help"
    return (f"{done}. That doesn't close open issues or confirm equipment is safe to operate: "
            f"{len(still_open)} follow-up{'' if len(still_open) == 1 else 's'} still open "
            f"({unassigned} to be assigned).")


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


def _means(text: str, phrases: set[str]) -> bool:
    return re.sub(r"[^a-z ]", "", text.lower().replace("’", "'").replace("'", "")).strip() in phrases


def _means_dont_know(text: str) -> bool:
    return _means(text, _DONT_KNOW)


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
