"""Speech-to-text backends, chosen by STT_PROVIDER. Each takes a 16 kHz mono WAV and returns raw text."""

import os
import wave
from collections.abc import Callable
from functools import lru_cache
from pathlib import Path

from .errors import STTError

# Assumption: handoffs are in English (the local default model is small.en), so both
# providers are told the language instead of guessing it from a few seconds of audio.
LANGUAGE = "en"
OPENAI_TIMEOUT_S = 60


def transcribe_openai(wav: Path, prompt: str) -> str:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise STTError("OPENAI_API_KEY is not set.")
    model = os.environ.get("OPENAI_STT_MODEL") or "whisper-1"

    from openai import OpenAI

    client = OpenAI(api_key=api_key, timeout=OPENAI_TIMEOUT_S)
    with wav.open("rb") as f:
        result = client.audio.transcriptions.create(model=model, file=f, prompt=prompt, language=LANGUAGE)
    return result.text


@lru_cache(maxsize=1)
def _local_model(name: str):
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise STTError("STT_PROVIDER=local needs faster-whisper (pip install faster-whisper).") from exc
    return WhisperModel(name, device="auto", compute_type="auto")


def read_wav16k(wav: Path):
    """Samples of our own 16 kHz mono 16-bit WAV as float32 in [-1, 1].

    Passing samples instead of a path keeps faster-whisper from decoding the file
    with PyAV, whose newer releases reject the arguments faster-whisper 1.2 sends.
    """
    import numpy as np

    with wave.open(str(wav), "rb") as w:
        if (w.getframerate(), w.getnchannels(), w.getsampwidth()) != (16000, 1, 2):
            raise STTError("The converted recording has an unexpected format.")
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def transcribe_local(wav: Path, prompt: str) -> str:
    model = _local_model(os.environ.get("LOCAL_WHISPER_MODEL") or "small.en")
    # vad_filter skips silence, where Whisper is most likely to produce text nobody said.
    segments, _info = model.transcribe(read_wav16k(wav), language=LANGUAGE, initial_prompt=prompt, vad_filter=True)
    return " ".join(seg.text.strip() for seg in segments)


PROVIDERS: dict[str, Callable[[Path, str], str]] = {
    "openai": transcribe_openai,
    "local": transcribe_local,
}
