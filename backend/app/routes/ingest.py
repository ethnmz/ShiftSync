"""Text and voice transport for the web app (docs/API.md).

- POST /handoffs/{id}/statements: Shift A's note or clarification answer.
- POST /verification/{id}/answer: Shift B's answer to an understanding check.
- GET /statements/{id}/audio: the original recording behind a voice statement.

Both POST routes take typed text (JSON `{"text", ...}`) or a recording (multipart
`file`). A recording is saved under data/audio/ and transcribed with app.stt. The
verbatim text then goes to Aditri's service (handoff.service / handoff.receive),
which owns the Statement row, analysis, grading and state changes.
"""

from __future__ import annotations

import logging
import re
import uuid
from json import JSONDecodeError
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlmodel import Session
# Starlette's class: request.form() returns these, and fastapi.UploadFile is a subclass.
from starlette.datastructures import UploadFile

from app import config, stt
from app.handoff import receive, service
from app.handoff import state as sm
from app.handoff.analyzer import Analyzer
from app.handoff.detail import handoff_detail
from app.models import Statement, VerificationCheck
from app.routes.deps import current_user, get_analyzer, get_session

log = logging.getLogger(__name__)

router = APIRouter()

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # OpenAI's upload limit for transcription
_CHUNK_BYTES = 1024 * 1024
_SAFE_SUFFIX = re.compile(r"^\.[a-z0-9]{1,5}$")
_DEFAULT_SUFFIX = ".webm"  # what browser MediaRecorder produces
# mimetypes calls .webm video/webm; these are what an <audio> element expects.
_AUDIO_TYPES = {".webm": "audio/webm", ".ogg": "audio/ogg", ".wav": "audio/wav", ".mp3": "audio/mpeg",
                ".m4a": "audio/mp4", ".caf": "audio/x-caf"}


@router.post("/handoffs/{handoff_id}/statements")
async def add_statement(
    handoff_id: str,
    request: Request,
    user: str = Depends(current_user),
    session: Session = Depends(get_session),
    analyzer: Analyzer = Depends(get_analyzer),
):
    # The service repeats these checks; doing them first keeps stray uploads off disk and out of STT.
    h = service.get_handoff(session, handoff_id)
    try:
        sm.authorize(h, "statement_added", user)
    except sm.ActorError as exc:
        raise service.Forbidden("Only the outgoing operator can add to this handoff.") from exc
    if h.state not in sm.SHIFT_A_EDIT_STATES:
        raise service.Conflict(f"This handoff is {h.state}. It no longer takes new statements.")

    text, source, audio_path, fields = await _read_spoken(request, handoff_id)
    h = await service.ingest_statement(session, handoff_id, user, text, source=source,
                                       question_id=fields.get("question_id"), audio_path=audio_path,
                                       analyzer=analyzer)
    return handoff_detail(session, h)


@router.post("/verification/{check_id}/answer")
async def answer_verification_check(
    check_id: str,
    request: Request,
    user: str = Depends(current_user),
    session: Session = Depends(get_session),
    analyzer: Analyzer = Depends(get_analyzer),
):
    # Same checks as receive.answer_check, made before any audio is saved or transcribed.
    c = session.get(VerificationCheck, check_id)
    if c is None:
        raise service.NotFound(f"check {check_id} not found")
    h = service.get_handoff(session, c.handoff_id)
    try:
        sm.authorize(h, "verification_answer", user)
    except sm.ActorError as exc:
        raise service.Forbidden("Only the incoming operator can answer these checks.") from exc
    if h.state != "verifying":
        raise service.Conflict(f"cannot answer checks while {h.state}")
    if c.status != "pending":
        raise service.Conflict(f"this check is {c.status.replace('_', ' ')}")

    text, source, audio_path, _ = await _read_spoken(request, f"{h.id}-{check_id}")
    return await receive.answer_check(session, check_id, user, text, source=source,
                                      analyzer=analyzer, audio_path=audio_path)


@router.get("/statements/{statement_id}/audio")
def statement_audio(statement_id: str, session: Session = Depends(get_session)):
    """The original recording behind a voice statement (HandoffDetail's `audio_url`).

    Assumption: no X-User check here, because a browser <audio src> can't send that
    header. X-User is a demo selector, not authentication, and audio stays local.
    """
    st = session.get(Statement, statement_id)
    if st is None or not st.audio_path:
        raise service.NotFound(f"No recording for statement {statement_id}.")
    audio_dir = (config.data_dir() / "audio").resolve()
    path = (config.data_dir() / st.audio_path).resolve()
    if not path.is_relative_to(audio_dir) or not path.is_file():
        raise service.NotFound(f"The recording for statement {statement_id} is missing.")
    return FileResponse(path, media_type=_AUDIO_TYPES.get(path.suffix, "application/octet-stream"))


async def _read_spoken(request: Request, name: str) -> tuple[str, str, str | None, dict[str, str | None]]:
    """(text, source, audio_path, fields) from JSON text or a multipart recording.

    `name` prefixes the saved recording. `fields` holds the optional `question_id`.
    A recording that can't be transcribed is kept and raises transcription_failed.
    """
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if not isinstance(upload, UploadFile):
            raise service.Unprocessable("Send the recording in the `file` field.")
        fields = {"question_id": _form_str(form.get("question_id"))}
        saved = await _save_upload(upload, name)
        # Assumption: audio_path is stored relative to DATA_DIR ("audio/H-0001-….webm").
        audio_path = saved.relative_to(config.data_dir()).as_posix()
        try:
            transcript = await run_in_threadpool(stt.transcribe, saved)
        except stt.STTError as exc:
            log.warning("Transcription failed for %s (%s); audio kept at %s", name, exc, audio_path)
            raise service.Unprocessable(
                f"Couldn't transcribe that recording. {exc} You can type it instead.",
                payload={"audio_saved": True}, code="transcription_failed",
            ) from exc
        return transcript.text, "voice_web", audio_path, fields

    if content_type.startswith("application/json"):
        try:
            body = await request.json()
        except (JSONDecodeError, UnicodeDecodeError):
            raise service.Unprocessable("The request body isn't valid JSON.") from None
        if not isinstance(body, dict):
            raise service.Unprocessable('Send {"text": "..."}.')
        text = body.get("text").strip() if isinstance(body.get("text"), str) else ""
        if not text:
            raise service.Unprocessable("Type something or record a voice note.")
        return text, "text_web", None, {"question_id": _form_str(body.get("question_id"))}

    raise service.Unprocessable("Send JSON text or a multipart recording.")


def _form_str(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return value.strip() or None


async def _save_upload(upload: UploadFile, name: str) -> Path:
    """Stream the upload to data/audio/, enforcing the size limit. Returns the saved path."""
    audio_dir = config.data_dir() / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(upload.filename or "").suffix.lower()
    if not _SAFE_SUFFIX.match(suffix):
        suffix = _DEFAULT_SUFFIX
    dest = audio_dir / f"{name}-{uuid.uuid4().hex[:12]}{suffix}"

    size = 0
    with dest.open("wb") as out:
        while chunk := await upload.read(_CHUNK_BYTES):
            size += len(chunk)
            if size > MAX_AUDIO_BYTES:
                break
            out.write(chunk)
    if size > MAX_AUDIO_BYTES:
        dest.unlink(missing_ok=True)
        raise service.Unprocessable("That recording is too long. Keep voice notes under 25 MB.")
    if size == 0:
        dest.unlink(missing_ok=True)
        raise service.Unprocessable("The recording is empty.")
    return dest
