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
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "16000", str(out)]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=FFMPEG_TIMEOUT_S, check=False)
    except subprocess.TimeoutExpired as exc:
        raise STTError("Converting the recording took too long.") from exc

    if proc.returncode != 0 or not out.is_file():
        detail = proc.stderr.decode(errors="replace").strip().splitlines()
        reason = detail[-1] if detail else f"exit code {proc.returncode}"
        raise STTError(f"Couldn't read the recording ({reason}).")
    return out
