"""POST /verification/{id}/answer with a recording: Shift B's spoken answer is transcribed, stored, then graded.

Reuses Aditri's Shift B setup (demo steps 1-9 through the real routes). Speech-to-text is a fake.
"""

import pytest
from sqlmodel import Session, select

from app import db, stt
from app.handoff.analyzer import Grade
from app.models import Statement, VerificationCheck
from app.routes import ingest
from tests.test_handoff_service import H, env  # noqa: F401  (env is a fixture)
from tests.test_shift_b import to_verifying

SPOKEN = "UPS B maintenance is not finished and it still has to be cleared through the procedure."


@pytest.fixture
def voice(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    calls: list = []

    def fake_transcribe(path):
        calls.append(path)
        return stt.Transcript(text=SPOKEN, provider="fake")

    monkeypatch.setattr(ingest.stt, "transcribe", fake_transcribe)
    return calls, tmp_path / "data" / "audio"


def answers(hid: str) -> list[Statement]:
    with Session(db.get_engine()) as s:
        q = select(Statement).where(Statement.handoff_id == hid, Statement.role == "verification_answer")
        return list(s.exec(q))


def recording():
    return {"file": ("answer.webm", b"fake webm bytes", "audio/webm")}


def test_spoken_answer_is_stored_and_graded(env, voice):
    client, analyzer = env
    stt_calls, audio_dir = voice
    hid, _, start = to_verifying(client, analyzer)
    vid = start["check"]["id"]
    analyzer.push_grade(Grade(verdict="consistent"))

    r = client.post(f"/api/verification/{vid}/answer", files=recording(), headers=H("jordan"))
    assert r.status_code == 200
    assert r.json()["check_id"] == vid and r.json()["verdict"] == "consistent"
    (st,) = answers(hid)
    assert (st.text, st.source, st.speaker_id) == (SPOKEN, "voice_web", "jordan")
    assert st.audio_path.startswith(f"audio/{hid}-{vid}-")
    assert {"grade": SPOKEN} in analyzer.calls
    (saved,) = audio_dir.iterdir()
    assert stt_calls == [saved]


def test_typed_answer_still_works(env, voice):
    client, analyzer = env
    hid, _, start = to_verifying(client, analyzer)
    analyzer.push_grade(Grade(verdict="consistent"))
    r = client.post(f"/api/verification/{start['check']['id']}/answer", json={"text": "  Not finished.  "},
                    headers=H("jordan"))
    assert r.status_code == 200
    (st,) = answers(hid)
    assert (st.text, st.source, st.audio_path) == ("Not finished.", "text_web", None)


def test_failed_transcription_records_nothing(env, voice, monkeypatch):
    client, analyzer = env
    _, audio_dir = voice
    hid, _, start = to_verifying(client, analyzer)

    def fail(path):
        raise stt.STTError("No speech was detected in the recording.")

    monkeypatch.setattr(ingest.stt, "transcribe", fail)
    r = client.post(f"/api/verification/{start['check']['id']}/answer", files=recording(), headers=H("jordan"))
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "transcription_failed" and r.json()["detail"]["audio_saved"] is True
    assert answers(hid) == [] and not any("grade" in c for c in analyzer.calls)
    assert len(list(audio_dir.iterdir())) == 1  # kept


def test_outgoing_operator_cannot_answer(env, voice):
    client, analyzer = env
    stt_calls, audio_dir = voice
    _, _, start = to_verifying(client, analyzer)
    r = client.post(f"/api/verification/{start['check']['id']}/answer", files=recording(), headers=H("maya"))
    assert r.status_code == 403 and r.json()["detail"]["code"] == "forbidden"
    assert stt_calls == [] and not audio_dir.exists()


def test_unknown_check(env, voice):
    client, _ = env
    stt_calls, audio_dir = voice
    r = client.post("/api/verification/V-9999/answer", files=recording(), headers=H("jordan"))
    assert r.status_code == 404 and r.json()["detail"]["code"] == "not_found"
    assert stt_calls == [] and not audio_dir.exists()


def test_settled_check_takes_no_more_answers(env, voice):
    client, analyzer = env
    stt_calls, audio_dir = voice
    _, _, start = to_verifying(client, analyzer)
    vid = start["check"]["id"]
    with Session(db.get_engine()) as s:
        s.get(VerificationCheck, vid).status = "verified"
        s.commit()
    r = client.post(f"/api/verification/{vid}/answer", files=recording(), headers=H("jordan"))
    assert r.status_code == 409 and r.json()["detail"]["code"] == "conflict"
    assert stt_calls == [] and not audio_dir.exists()
