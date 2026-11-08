"""Speech-to-text: audio file → verbatim transcript (docs/AI_PIPELINE.md §5).

This module only transcribes. Saving the audio, creating the Statement and
running analysis belong to the ingest route that calls it.
"""

import logging
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

from . import audio, jargon, providers
from .errors import STTError

__all__ = ["STTError", "Transcript", "transcribe"]

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Transcript:
    text: str
    provider: str


def transcribe(audio_path: str | Path) -> Transcript:
    """Transcribe one recording. Raises STTError instead of ever returning guessed or empty text."""
    # Stopgap until backend/app/config.py exists: read STT_PROVIDER directly.
    name = (os.environ.get("STT_PROVIDER") or "openai").strip().lower()
    backend = providers.PROVIDERS.get(name)
    if backend is None:
        raise STTError(f"Unknown STT_PROVIDER {name!r} (use 'openai' or 'local').")

    src = Path(audio_path)
    if not src.is_file():
        raise STTError("The recording file is missing.")

    with tempfile.TemporaryDirectory(prefix="shiftsync-stt-") as tmp:
        wav = audio.to_wav16k(src, Path(tmp))
        try:
            text = backend(wav, jargon.jargon_prompt())
        except STTError:
            raise
        except Exception as exc:
            log.exception("STT provider %s failed on %s", name, src.name)
            raise STTError(f"Speech-to-text failed ({type(exc).__name__}).") from exc

    text = (text or "").strip()
    if not text:
        raise STTError("No speech was detected in the recording.")
    return Transcript(text=text, provider=name)
