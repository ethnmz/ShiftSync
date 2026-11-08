"""POST /inbound/imessage: texts and voice notes from the Photon bridge land on the sender's handoff.

Real app, service and in-memory database; speech-to-text is a fake and extraction is scripted.
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import clock, db, stt
from app.demo.seed import reset
from app.handoff.analyzer import Extraction, ScriptedAnalyzer
from app.main import create_app
from app.models import Handoff, Statement
from app.routes import ingest
from tests.test_handoff_service import STEP, step2_extraction

URL = "/api/inbound/imessage"
MAYA = "+15550100001"  # night lead in config/roster.yaml; the next shift's lead is Jordan
TRANSCRIPT = "UPS B is still in maintenance bypass."


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("FRONTEND_URL", "http://web.test")
    reset("sqlite://")
    clock.set_now(STEP[2]["at"])
    analyzer = ScriptedAnalyzer()
    app = create_app()
    app.state.analyzer = analyzer
    monkeypatch.setattr(ingest.stt, "transcribe", lambda path: stt.Transcript(text=TRANSCRIPT, provider="fake"))
    with TestClient(app) as client:
        yield SimpleNamespace(client=client, analyzer=analyzer)


def text(api, body, phone=MAYA):
    return api.client.post(URL, json={"sender_phone": phone, "text": body})


def maya_handoffs() -> list[Handoff]:
    with Session(db.get_engine()) as s:
        return list(s.exec(select(Handoff).where(Handoff.outgoing_id == "maya")))


def statements(hid: str) -> list[Statement]:
    with Session(db.get_engine()) as s:
        return list(s.exec(select(Statement).where(Statement.handoff_id == hid).order_by(Statement.id)))


def test_first_text_starts_a_handoff_and_asks_the_top_question(api):
    api.analyzer.push(step2_extraction())
    r = text(api, STEP[2]["text"])
    assert r.status_code == 200, r.text
    body = r.json()
    (h,) = maya_handoffs()
    assert (h.incoming_id, h.state) == ("jordan", "clarifying")
    assert body["reply"].startswith("Started your handoff to Jordan. Added: UPS-B ")
    # Uncertainty stays visible; a confirmed-looking check mark is never shown.
    assert 'UPS-B (⚠ unverified: "mostly")' in body["reply"]
    # Prefix only: #13's certainty floor also appends the trigger word (': "not sure"').
    assert "Cooling inspection (? unknown" in body["reply"]
    assert "✓" not in body["reply"]
    (question,) = body["followups"]
    assert question.startswith("(1/3) ") and question.endswith('Reply, send a voice note, or "don\'t know".')
    (st,) = statements(h.id)
    assert (st.source, st.speaker_id, st.text) == ("imessage_text", "maya", STEP[2]["text"])


def test_next_text_answers_the_pending_question(api):
    api.analyzer.push(step2_extraction())
    text(api, STEP[2]["text"])
    (h,) = maya_handoffs()
    api.analyzer.push(Extraction())
    assert text(api, "The vendor still has to run the load test.").status_code == 200
    answer = statements(h.id)[-1]
    assert answer.role == "clarification_answer" and answer.question_id


@pytest.mark.parametrize("reply", ["don't know", "I don’t know.", "IDK", "not sure"])
def test_dont_know_marks_the_question_unknown(api, reply):
    api.analyzer.push(step2_extraction())
    text(api, STEP[2]["text"])
    r = text(api, reply)
    assert r.status_code == 200, r.text
    assert r.json()["reply"] == "Noted as unknown. Jordan will see it marked unknown."
    (h,) = maya_handoffs()
    last = statements(h.id)[-1]
    assert (last.text, last.role) == ("I don't know.", "clarification_answer")
    assert api.analyzer.calls[-1].get("text") == STEP[2]["text"]  # no extraction for "don't know"


def test_dont_know_without_a_question_is_just_a_note(api):
    api.analyzer.push(Extraction())
    r = text(api, "not sure")
    assert r.status_code == 200
    (h,) = maya_handoffs()
    (st,) = statements(h.id)
    assert (st.text, st.role) == ("not sure", "handoff")


def test_texts_go_to_the_open_handoff(api):
    h = api.client.post("/api/handoffs", json={"outgoing_id": "maya", "incoming_id": "jordan"},
                        headers={"X-User": "maya"}).json()
    api.analyzer.push(Extraction())
    r = text(api, "Generator 1 looks good.")
    assert r.json()["reply"] == "Got it. Added to your handoff for Jordan."
    assert [x.id for x in maya_handoffs()] == [h["id"]]
    assert len(statements(h["id"])) == 1


def test_done_clarifying_links_to_review(api):
    api.analyzer.push(Extraction())
    r = text(api, "Nothing else to report.")
    (h,) = maya_handoffs()
    assert h.state == "in_review"
    assert r.json()["followups"] == [f"That's all I need. Review and submit here: http://web.test/create/{h.id}/review"]


def test_voice_note_is_transcribed_and_kept(api, tmp_path):
    api.analyzer.push(Extraction())
    r = api.client.post(URL, data={"sender_phone": MAYA}, files={"file": ("note.caf", b"caf bytes", "audio/x-caf")})
    assert r.status_code == 200, r.text
    (h,) = maya_handoffs()
    (st,) = statements(h.id)
    assert (st.source, st.text) == ("imessage_voice", TRANSCRIPT)
    assert st.audio_path.endswith(".caf") and (tmp_path / "data" / st.audio_path).read_bytes() == b"caf bytes"


def test_failed_transcription_asks_for_a_text(api, monkeypatch):
    def fail(path):
        raise stt.STTError("No speech was detected in the recording.")

    monkeypatch.setattr(ingest.stt, "transcribe", fail)
    r = api.client.post(URL, data={"sender_phone": MAYA}, files={"file": ("note.caf", b"caf", "audio/x-caf")})
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert detail["code"] == "transcription_failed" and detail["message"].endswith("You can text it instead.")


def test_failed_analysis_keeps_the_note(api):
    r = text(api, "UPS-B is in bypass.")  # nothing scripted, so extraction fails
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert detail["code"] == "analysis_failed" and "saved your note" in detail["message"]
    (h,) = maya_handoffs()
    assert detail["statement_id"] == statements(h.id)[0].id


@pytest.mark.parametrize("phone", ["(555) 010-0001", "15550100001", "+1 555 010 0001"])
def test_phone_formats_match_the_roster(api, phone):
    api.analyzer.push(Extraction())
    assert text(api, "hi", phone=phone).status_code == 200


@pytest.mark.parametrize("phone", ["+15559999999", "", "someone@example.com"])
def test_unknown_numbers_are_refused(api, phone):
    r = text(api, "hi", phone=phone)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "unknown_sender"
    assert maya_handoffs() == []


def test_submitted_handoff_is_not_reopened_or_replaced(api):
    api.analyzer.push(Extraction())
    text(api, "Nothing else to report.")
    (h,) = maya_handoffs()
    with Session(db.get_engine()) as s:
        s.get(Handoff, h.id).state = "submitted"
        s.commit()
    r = text(api, "Oh, one more thing.")
    assert r.status_code == 409
    assert r.json()["detail"]["message"] == ("Your handoff to Jordan Blake is already submitted, so I can't add "
                                             "to it. Please tell Jordan Blake directly.")
    assert len(maya_handoffs()) == 1
    # A shift later, a text starts the next handoff.
    clock.advance(9 * 3600)
    api.analyzer.push(Extraction())
    assert text(api, "New shift note.").status_code == 200
    assert len(maya_handoffs()) == 2


def test_no_next_shift_lead(api):
    r = text(api, "hi", phone="+15550100008")  # Dana, supervisor, no team
    assert r.status_code == 422 and "web app" in r.json()["detail"]["message"]


@pytest.mark.parametrize("kwargs", [
    {"json": {"sender_phone": MAYA, "text": "  "}},
    {"json": ["x"]},
    {"data": {"sender_phone": MAYA}, "files": {"other": ("a", b"b")}},
    {"content": b"hi", "headers": {"content-type": "text/plain"}},
])
def test_bad_requests(api, kwargs):
    r = api.client.post(URL, **kwargs)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "unprocessable"
