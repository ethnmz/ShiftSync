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
from collections.abc import Awaitable, Callable
from json import JSONDecodeError
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from sqlmodel import Session
# Starlette's class: request.form() returns these, and fastapi.UploadFile is a subclass.
from starlette.datastructures import UploadFile

from app import config, stt
from app.db import get_session
from app.handoff import state
from app.models import Handoff

log = logging.getLogger(__name__)

router = APIRouter()

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # OpenAI's upload limit for transcription
_CHUNK_BYTES = 1024 * 1024
_SAFE_SUFFIX = re.compile(r"^\.[a-z0-9]{1,5}$")
_DEFAULT_SUFFIX = ".webm"  # what browser MediaRecorder produces


def get_ingest_statement() -> Callable[..., Awaitable[Any]]:
    """The handoff service call, as a dependency so tests can pass a fake until it lands."""
    from app.handoff.service import ingest_statement

    return ingest_statement


def _error(status: int, code: str, message: str, **extra: Any) -> HTTPException:
    """docs/API.md: every 4xx is {"detail": {"code", "message", ...extra}}; message is display-ready."""
    return HTTPException(status, {"code": code, "message": message, **extra})


@router.post("/handoffs/{handoff_id}/statements")
async def add_statement(
    handoff_id: str,
    request: Request,
    x_user: str = Header(),
    session: Session = Depends(get_session),
    ingest_statement: Callable[..., Awaitable[Any]] = Depends(get_ingest_statement),
):
    # Check who and where before saving anything, so stray uploads never reach disk or STT.
    handoff = session.get(Handoff, handoff_id)
    if handoff is None:
        raise _error(404, "not_found", f"Handoff {handoff_id} not found.")
    try:
        state.authorize(handoff, "statement_added", x_user)
    except state.ActorError:
        raise _error(403, "forbidden", "Only the outgoing operator can add to this handoff.") from None
    if handoff.state not in state.SHIFT_A_EDIT_STATES:
        raise _error(409, "conflict", f"This handoff is {handoff.state}. It no longer takes new statements.")

    content_type = request.headers.get("content-type", "")
    audio_path: str | None = None
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if not isinstance(upload, UploadFile):
            raise _error(422, "unprocessable", "Send the recording in the `file` field.")
        question_id = _form_str(form.get("question_id"))
        saved = await _save_upload(upload, handoff_id)
        # Assumption: audio_path is stored relative to DATA_DIR ("audio/H-0001-….webm").
        audio_path = saved.relative_to(config.data_dir()).as_posix()
        try:
            transcript = await run_in_threadpool(stt.transcribe, saved)
        except stt.STTError as exc:
            log.warning("Transcription failed for %s (%s); audio kept at %s", handoff_id, exc, audio_path)
            raise _error(
                422, "transcription_failed",
                f"Couldn't transcribe that recording. {exc} You can type it instead.",
                audio_saved=True,
            ) from None
        text, source = transcript.text, "voice_web"
    elif content_type.startswith("application/json"):
        try:
            body = await request.json()
        except (JSONDecodeError, UnicodeDecodeError):
            raise _error(422, "unprocessable", "The request body isn't valid JSON.") from None
        if not isinstance(body, dict):
            raise _error(422, "unprocessable", 'Send {"text": "..."}.')
        text = body.get("text").strip() if isinstance(body.get("text"), str) else ""
        if not text:
            raise _error(422, "unprocessable", "Type something or record a voice note.")
        question_id = _form_str(body.get("question_id"))
        source = "text_web"
    else:
        raise _error(422, "unprocessable", "Send JSON text or a multipart recording.")

    return await ingest_statement(
        session=session, handoff_id=handoff_id, speaker_id=x_user, text=text,
        source=source, question_id=question_id, audio_path=audio_path,
    )


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
        raise _error(422, "unprocessable", "That recording is too long. Keep voice notes under 25 MB.")
    if size == 0:
        dest.unlink(missing_ok=True)
        raise _error(422, "unprocessable", "The recording is empty.")
    return dest
