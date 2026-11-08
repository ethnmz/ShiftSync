"""Shift A statement ingest: POST /handoffs/{id}/statements (docs/API.md).

Accepts typed text (JSON `{"text", "question_id"?}`) or a recording (multipart
`file`, optional `question_id`). A recording is saved under data/audio/ and
transcribed with app.stt. The verbatim text then goes to the handoff service,
which owns the Statement row, analysis and state changes.
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
from sqlmodel import Session
# Starlette's class: request.form() returns these, and fastapi.UploadFile is a subclass.
from starlette.datastructures import UploadFile

from app import config, stt
from app.handoff import service
from app.handoff import state as sm
from app.handoff.analyzer import Analyzer
from app.handoff.detail import handoff_detail
from app.routes.deps import current_user, get_analyzer, get_session

log = logging.getLogger(__name__)

router = APIRouter()

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # OpenAI's upload limit for transcription
_CHUNK_BYTES = 1024 * 1024
_SAFE_SUFFIX = re.compile(r"^\.[a-z0-9]{1,5}$")
_DEFAULT_SUFFIX = ".webm"  # what browser MediaRecorder produces


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

    content_type = request.headers.get("content-type", "")
    audio_path: str | None = None
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if not isinstance(upload, UploadFile):
            raise service.Unprocessable("Send the recording in the `file` field.")
        question_id = _form_str(form.get("question_id"))
        saved = await _save_upload(upload, handoff_id)
        # Assumption: audio_path is stored relative to DATA_DIR ("audio/H-0001-….webm").
        audio_path = saved.relative_to(config.data_dir()).as_posix()
        try:
            transcript = await run_in_threadpool(stt.transcribe, saved)
        except stt.STTError as exc:
            log.warning("Transcription failed for %s (%s); audio kept at %s", handoff_id, exc, audio_path)
            raise service.Unprocessable(
                f"Couldn't transcribe that recording. {exc} You can type it instead.",
                payload={"audio_saved": True}, code="transcription_failed",
            ) from exc
        text, source = transcript.text, "voice_web"
    elif content_type.startswith("application/json"):
        try:
            body = await request.json()
        except (JSONDecodeError, UnicodeDecodeError):
            raise service.Unprocessable("The request body isn't valid JSON.") from None
        if not isinstance(body, dict):
            raise service.Unprocessable('Send {"text": "..."}.')
        text = body.get("text").strip() if isinstance(body.get("text"), str) else ""
        if not text:
            raise service.Unprocessable("Type something or record a voice note.")
        question_id = _form_str(body.get("question_id"))
        source = "text_web"
    else:
        raise service.Unprocessable("Send JSON text or a multipart recording.")

    h = await service.ingest_statement(session, handoff_id, user, text, source=source,
                                       question_id=question_id, audio_path=audio_path, analyzer=analyzer)
    return handoff_detail(session, h)


def _form_str(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return value.strip() or None


async def _save_upload(upload: UploadFile, handoff_id: str) -> Path:
    """Stream the upload to data/audio/, enforcing the size limit. Returns the saved path."""
    audio_dir = config.data_dir() / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(upload.filename or "").suffix.lower()
    if not _SAFE_SUFFIX.match(suffix):
        suffix = _DEFAULT_SUFFIX
    dest = audio_dir / f"{handoff_id}-{uuid.uuid4().hex[:12]}{suffix}"

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
