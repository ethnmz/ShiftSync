"""Normalize any recording (browser webm, iMessage caf, …) to 16 kHz mono WAV."""

import shutil
import subprocess
from pathlib import Path

from .errors import STTError

FFMPEG_TIMEOUT_S = 60


def to_wav16k(src: Path, out_dir: Path) -> Path:
    """Convert `src` with ffmpeg and return the path of the new WAV inside `out_dir`."""
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise STTError("ffmpeg is not installed on the server.")

    out = out_dir / "audio16k.wav"
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(out)]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=FFMPEG_TIMEOUT_S, check=False)
    except subprocess.TimeoutExpired as exc:
        raise STTError("Converting the recording took too long.") from exc

    if proc.returncode != 0 or not out.is_file():
        detail = proc.stderr.decode(errors="replace").strip().splitlines()
        reason = detail[-1] if detail else f"exit code {proc.returncode}"
        raise STTError(f"Couldn't read the recording ({reason}).")
    return out


def browser_copy(src: Path) -> Path:
    """An .m4a beside an iMessage .caf, which most browsers can't play. The original is untouched."""
    out = src.with_suffix(".m4a")
    if out.is_file():
        return out
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise STTError("ffmpeg is not installed on the server.")

    # Written under a temporary name so a failed conversion can't be cached as the copy.
    partial = src.with_suffix(".partial.m4a")
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-vn", "-c:a", "aac", "-b:a", "64k", str(partial)]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=FFMPEG_TIMEOUT_S, check=False)
    except subprocess.TimeoutExpired as exc:
        partial.unlink(missing_ok=True)
        raise STTError("Converting the recording took too long.") from exc
    if proc.returncode != 0 or not partial.is_file():
        partial.unlink(missing_ok=True)
        raise STTError("Couldn't convert the recording for playback.")
    return partial.replace(out)
