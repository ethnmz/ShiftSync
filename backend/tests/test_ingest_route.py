"""POST /handoffs/{id}/statements through the real app: text and audio become verbatim Statements.

Speech-to-text is a fake and extraction is scripted; the handoff service, error
mapping in main.py and the database (in-memory SQLite) are real.
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

MAYA = {"X-User": "maya"}  # outgoing
JORDAN = {"X-User": "jordan"}  # incoming
TRANSCRIPT = "UPS B is still in maintenance bypass."


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    reset("sqlite://")
    analyzer = ScriptedAnalyzer()
    app = create_app()
    app.state.analyzer = analyzer

    stt_calls: list = []

    def fake_transcribe(path):
        stt_calls.append(path)
        return stt.Transcript(text=TRANSCRIPT, provider="fake")

    monkeypatch.setattr(ingest.stt, "transcribe", fake_transcribe)

    with TestClient(app) as client:
        r = client.post("/api/handoffs", json={"outgoing_id": "maya", "incoming_id": "jordan"}, headers=MAYA)
        hid = r.json()["id"]
        yield SimpleNamespace(client=client, analyzer=analyzer, hid=hid, url=f"/api/handoffs/{hid}/statements",
                              stt_calls=stt_calls, audio_dir=tmp_path / "data" / "audio")


def statements(hid: str) -> list[Statement]:
    with Session(db.get_engine()) as s:
        return list(s.exec(select(Statement).where(Statement.handoff_id == hid)))


def error_code(r) -> str:
    """docs/API.md: every 4xx is {"detail": {"code", "message"}} with a display-ready message."""
    detail = r.json()["detail"]
    assert detail["message"]
    return detail["code"]


def set_state(hid: str, value: str) -> None:
    with Session(db.get_engine()) as s:
        s.get(Handoff, hid).state = value
        s.commit()


def audio(data: bytes = b"fake webm bytes", name: str = "note.webm"):
    return {"file": (name, data, "audio/webm")}


# ---- text ----

def test_text_becomes_a_verbatim_statement(api):
    api.analyzer.push(Extraction())
    r = api.client.post(api.url, json={"text": "  Generator 1 looks good.  "}, headers=MAYA)
    assert r.status_code == 200
    assert r.json()["id"] == api.hid
    (st,) = statements(api.hid)
    assert (st.text, st.source, st.speaker_id, st.role) == ("Generator 1 looks good.", "text_web", "maya", "handoff")
    assert st.audio_path is None
    assert api.analyzer.calls[0]["text"] == "Generator 1 looks good."
    assert api.stt_calls == []


def test_text_question_id_reaches_the_service(api):
    r = api.client.post(api.url, json={"text": "I don't know.", "question_id": "Q-9999"}, headers=MAYA)
    assert r.status_code == 404 and error_code(r) == "not_found"
    assert "Q-9999" in r.json()["detail"]["message"]


@pytest.mark.parametrize("body", [{}, {"text": "   "}, {"text": 42}, ["text"]])
def test_blank_text_is_rejected(api, body):
    r = api.client.post(api.url, json=body, headers=MAYA)
    assert r.status_code == 422 and error_code(r) == "unprocessable"
    assert statements(api.hid) == []


# ---- audio ----

def test_audio_is_saved_transcribed_and_stored(api):
    api.analyzer.push(Extraction())
    r = api.client.post(api.url, files=audio(), headers=MAYA)
    assert r.status_code == 200
    (st,) = statements(api.hid)
    assert (st.text, st.source, st.speaker_id) == (TRANSCRIPT, "voice_web", "maya")
    assert st.audio_path.startswith(f"audio/{api.hid}-") and st.audio_path.endswith(".webm")
    (saved,) = api.audio_dir.iterdir()
    assert saved.read_bytes() == b"fake webm bytes"
    assert api.stt_calls == [saved]


def test_audio_question_id_reaches_the_service(api):
    r = api.client.post(api.url, files=audio(), data={"question_id": "Q-9999"}, headers=MAYA)
    assert r.status_code == 404 and "Q-9999" in r.json()["detail"]["message"]


def test_voice_statement_survives_failed_analysis(api):
    # Nothing scripted, so extraction fails; the service keeps the statement and its audio.
    r = api.client.post(api.url, files=audio(), headers=MAYA)
    assert r.status_code == 422 and error_code(r) == "analysis_failed"
    (st,) = statements(api.hid)
    assert st.text == TRANSCRIPT and st.audio_path is not None


def test_unsafe_filename_suffix_falls_back_to_webm(api):
    api.analyzer.push(Extraction())
    api.client.post(api.url, files=audio(name="../../evil.sh;rm"), headers=MAYA)
    (saved,) = api.audio_dir.iterdir()
    assert saved.parent == api.audio_dir and saved.suffix == ".webm"


def test_failed_transcription_keeps_audio_and_asks_for_text(api, monkeypatch):
    def fail(path):
        raise stt.STTError("No speech was detected in the recording.")

    monkeypatch.setattr(ingest.stt, "transcribe", fail)
    r = api.client.post(api.url, files=audio(), headers=MAYA)
    assert r.status_code == 422 and error_code(r) == "transcription_failed"
    detail = r.json()["detail"]
    assert detail["audio_saved"] is True
    assert "No speech" in detail["message"] and "type it" in detail["message"]
    assert len(list(api.audio_dir.iterdir())) == 1  # kept
    assert statements(api.hid) == [] and api.analyzer.calls == []  # nothing invented


def test_empty_recording_is_rejected_and_not_kept(api):
    r = api.client.post(api.url, files=audio(data=b""), headers=MAYA)
    assert r.status_code == 422 and error_code(r) == "unprocessable"
    assert list(api.audio_dir.iterdir()) == [] and api.stt_calls == []


def test_oversize_recording_is_rejected_and_not_kept(api, monkeypatch):
    monkeypatch.setattr(ingest, "MAX_AUDIO_BYTES", 10)
    r = api.client.post(api.url, files=audio(data=b"x" * 11), headers=MAYA)
    assert r.status_code == 422 and error_code(r) == "unprocessable"
    assert list(api.audio_dir.iterdir()) == []


def test_multipart_without_file(api):
    r = api.client.post(api.url, data={"question_id": "Q-1"}, files={"other": ("a", b"b")}, headers=MAYA)
    assert r.status_code == 422 and error_code(r) == "unprocessable"


# ---- who and when ----

def test_incoming_operator_cannot_add(api):
    r = api.client.post(api.url, files=audio(), headers=JORDAN)
    assert r.status_code == 403 and error_code(r) == "forbidden"
    assert not api.audio_dir.exists() and api.stt_calls == []


def test_unknown_user_cannot_add(api):
    r = api.client.post(api.url, json={"text": "hi"}, headers={"X-User": "mallory"})
    assert r.status_code == 403 and error_code(r) == "unknown_user"


def test_missing_user_header(api):
    assert api.client.post(api.url, json={"text": "hi"}).status_code == 422


def test_unknown_handoff(api):
    r = api.client.post("/api/handoffs/H-9999/statements", files=audio(), headers=MAYA)
    assert r.status_code == 404 and error_code(r) == "not_found"
    assert not api.audio_dir.exists()


@pytest.mark.parametrize("closed", ["submitted", "acknowledged", "verified"])
def test_no_statements_after_submit(api, closed):
    set_state(api.hid, closed)
    r = api.client.post(api.url, files=audio(), headers=MAYA)
    assert r.status_code == 409 and error_code(r) == "conflict"
    assert not api.audio_dir.exists() and api.stt_calls == []


def test_unsupported_content_type(api):
    r = api.client.post(api.url, content=b"hello", headers={**MAYA, "content-type": "text/plain"})
    assert r.status_code == 422 and error_code(r) == "unprocessable"


# ---- playback ----

def test_audio_url_plays_the_original_recording(api):
    api.analyzer.push(Extraction())
    detail = api.client.post(api.url, files=audio(), headers=MAYA).json()
    (st,) = detail["statements"]
    r = api.client.get(st["audio_url"])
    assert r.status_code == 200
    assert r.content == b"fake webm bytes"
    assert r.headers["content-type"] == "audio/webm"


def test_text_statement_has_no_audio(api):
    api.analyzer.push(Extraction())
    detail = api.client.post(api.url, json={"text": "All good."}, headers=MAYA).json()
    (st,) = detail["statements"]
    assert st["audio_url"] is None
    r = api.client.get(f"/api/statements/{st['id']}/audio")
    assert r.status_code == 404 and error_code(r) == "not_found"


def test_unknown_statement_audio(api):
    r = api.client.get("/api/statements/S-9999/audio")
    assert r.status_code == 404 and error_code(r) == "not_found"


def test_audio_path_cannot_escape_the_audio_folder(api, tmp_path):
    secret = tmp_path / "data" / "secret.txt"
    secret.parent.mkdir(parents=True, exist_ok=True)
    secret.write_text("not audio")
    with Session(db.get_engine()) as s:
        s.add(Statement(id="S-0900", handoff_id=api.hid, speaker_id="maya", source="voice_web", role="handoff",
                        text="x", audio_path="audio/../secret.txt", at=clock.now()))
        s.commit()
    r = api.client.get("/api/statements/S-0900/audio")
    assert r.status_code == 404
