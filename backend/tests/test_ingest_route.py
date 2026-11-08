"""POST /handoffs/{id}/statements: text and audio reach the handoff service as verbatim text.

The handoff service and speech-to-text are fakes; the database is a temp SQLite file.
"""

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session

from app import clock, db, stt
from app.models import Handoff
from app.routes import ingest

URL = "/api/handoffs/H-0001/statements"
MAYA = {"X-User": "maya"}  # outgoing
JORDAN = {"X-User": "jordan"}  # incoming


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setattr(db, "_engine", None)
    db.init_db(f"sqlite:///{tmp_path / 'test.db'}")
    with Session(db.get_engine()) as s:
        s.add(Handoff(id="H-0001", outgoing_id="maya", incoming_id="jordan", state="draft", created_at=clock.now()))
        s.commit()

    calls: list[dict] = []

    async def fake_ingest(**kwargs):
        calls.append(kwargs)
        return {"id": kwargs["handoff_id"], "state": "clarifying"}

    stt_calls: list = []

    def fake_transcribe(path):
        stt_calls.append(path)
        return stt.Transcript(text="UPS B is still in maintenance bypass.", provider="fake")

    monkeypatch.setattr(ingest.stt, "transcribe", fake_transcribe)

    app = FastAPI()
    app.include_router(ingest.router, prefix="/api")
    app.dependency_overrides[ingest.get_ingest_statement] = lambda: fake_ingest
    return SimpleNamespace(client=TestClient(app), app=app, calls=calls, stt_calls=stt_calls,
                           audio_dir=tmp_path / "data" / "audio")


def error_code(r) -> str:
    """docs/API.md: every 4xx is {"detail": {"code", "message"}} with a display-ready message."""
    detail = r.json()["detail"]
    assert detail["message"]
    return detail["code"]


def set_state(value: str) -> None:
    with Session(db.get_engine()) as s:
        s.get(Handoff, "H-0001").state = value
        s.commit()


def audio(data: bytes = b"fake webm bytes", name: str = "note.webm"):
    return {"file": (name, data, "audio/webm")}


# ---- text ----

def test_text_goes_to_service_verbatim(api):
    r = api.client.post(URL, json={"text": "  Generator 1 looks good.  "}, headers=MAYA)
    assert r.status_code == 200
    assert r.json() == {"id": "H-0001", "state": "clarifying"}
    (call,) = api.calls
    assert call["text"] == "Generator 1 looks good."
    assert call["source"] == "text_web"
    assert call["speaker_id"] == "maya"
    assert call["question_id"] is None and call["audio_path"] is None
    assert api.stt_calls == []


def test_text_answer_keeps_question_id(api):
    api.client.post(URL, json={"text": "I don't know.", "question_id": "Q-0001"}, headers=MAYA)
    assert api.calls[0]["question_id"] == "Q-0001"


@pytest.mark.parametrize("body", [{}, {"text": "   "}, {"text": 42}, ["text"]])
def test_blank_text_is_rejected(api, body):
    r = api.client.post(URL, json=body, headers=MAYA)
    assert r.status_code == 422 and error_code(r) == "unprocessable"
    assert api.calls == []


# ---- audio ----

def test_audio_is_saved_transcribed_and_passed_on(api):
    r = api.client.post(URL, files=audio(), data={"question_id": "Q-0002"}, headers=MAYA)
    assert r.status_code == 200
    (call,) = api.calls
    assert call["text"] == "UPS B is still in maintenance bypass."
    assert call["source"] == "voice_web"
    assert call["question_id"] == "Q-0002"
    assert call["audio_path"].startswith("audio/H-0001-") and call["audio_path"].endswith(".webm")
    (saved,) = api.audio_dir.iterdir()
    assert saved.read_bytes() == b"fake webm bytes"
    assert api.stt_calls == [saved]


def test_unsafe_filename_suffix_falls_back_to_webm(api):
    api.client.post(URL, files=audio(name="../../evil.sh;rm"), headers=MAYA)
    (saved,) = api.audio_dir.iterdir()
    assert saved.parent == api.audio_dir and saved.suffix == ".webm"


def test_failed_transcription_keeps_audio_and_asks_for_text(api, monkeypatch):
    def fail(path):
        raise stt.STTError("No speech was detected in the recording.")

    monkeypatch.setattr(ingest.stt, "transcribe", fail)
    r = api.client.post(URL, files=audio(), headers=MAYA)
    assert r.status_code == 422 and error_code(r) == "transcription_failed"
    detail = r.json()["detail"]
    assert detail["audio_saved"] is True
    assert "No speech" in detail["message"] and "type it" in detail["message"]
    assert len(list(api.audio_dir.iterdir())) == 1  # kept
    assert api.calls == []  # nothing invented, nothing ingested


def test_empty_recording_is_rejected_and_not_kept(api):
    r = api.client.post(URL, files=audio(data=b""), headers=MAYA)
    assert r.status_code == 422 and error_code(r) == "unprocessable"
    assert list(api.audio_dir.iterdir()) == []
    assert api.stt_calls == []


def test_oversize_recording_is_rejected_and_not_kept(api, monkeypatch):
    monkeypatch.setattr(ingest, "MAX_AUDIO_BYTES", 10)
    r = api.client.post(URL, files=audio(data=b"x" * 11), headers=MAYA)
    assert r.status_code == 422 and error_code(r) == "unprocessable"
    assert list(api.audio_dir.iterdir()) == []


def test_multipart_without_file(api):
    r = api.client.post(URL, data={"question_id": "Q-1"}, files={"other": ("a", b"b")}, headers=MAYA)
    assert r.status_code == 422 and error_code(r) == "unprocessable"


# ---- who and when ----

def test_incoming_operator_cannot_add(api):
    r = api.client.post(URL, files=audio(), headers=JORDAN)
    assert r.status_code == 403 and error_code(r) == "forbidden"
    assert not api.audio_dir.exists() and api.stt_calls == []


def test_unknown_user_cannot_add(api):
    r = api.client.post(URL, json={"text": "hi"}, headers={"X-User": "mallory"})
    assert r.status_code == 403 and error_code(r) == "forbidden"


def test_missing_user_header(api):
    assert api.client.post(URL, json={"text": "hi"}).status_code == 422


def test_unknown_handoff(api):
    r = api.client.post("/api/handoffs/H-9999/statements", files=audio(), headers=MAYA)
    assert r.status_code == 404 and error_code(r) == "not_found"
    assert not api.audio_dir.exists()


@pytest.mark.parametrize("closed", ["submitted", "acknowledged", "verified"])
def test_no_statements_after_submit(api, closed):
    set_state(closed)
    r = api.client.post(URL, files=audio(), headers=MAYA)
    assert r.status_code == 409 and error_code(r) == "conflict"
    assert not api.audio_dir.exists() and api.stt_calls == []


def test_unsupported_content_type(api):
    r = api.client.post(URL, content=b"hello", headers={**MAYA, "content-type": "text/plain"})
    assert r.status_code == 422 and error_code(r) == "unprocessable"
