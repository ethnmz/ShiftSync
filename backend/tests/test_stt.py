"""Speech-to-text: failures are explicit, nothing is invented, the vocabulary hint reaches the provider.

No network, ffmpeg or Whisper model is needed: those pieces are replaced with fakes.
"""

import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import stt
from app.stt import STTError, audio, jargon, providers


@pytest.fixture
def recording(tmp_path: Path) -> Path:
    path = tmp_path / "note.webm"
    path.write_bytes(b"not really audio")
    return path


@pytest.fixture
def fake_ffmpeg(monkeypatch):
    """Skip the real conversion and hand the provider a placeholder WAV path."""
    monkeypatch.setattr(audio, "to_wav16k", lambda src, out_dir: out_dir / "audio16k.wav")


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for var in ("STT_PROVIDER", "OPENAI_API_KEY", "OPENAI_STT_MODEL", "CONFIG_DIR"):
        monkeypatch.delenv(var, raising=False)
    jargon.jargon_prompt.cache_clear()
    yield
    jargon.jargon_prompt.cache_clear()


def use_provider(monkeypatch, fn, name="openai"):
    monkeypatch.setenv("STT_PROVIDER", name)
    monkeypatch.setitem(providers.PROVIDERS, name, fn)


# ---- transcribe() ----

def test_returns_trimmed_provider_text(monkeypatch, recording, fake_ffmpeg):
    use_provider(monkeypatch, lambda wav, prompt: "  UPS B is still in maintenance bypass.  ")
    result = stt.transcribe(recording)
    assert result == stt.Transcript(text="UPS B is still in maintenance bypass.", provider="openai")


def test_defaults_to_openai(monkeypatch, recording, fake_ffmpeg):
    monkeypatch.setitem(providers.PROVIDERS, "openai", lambda wav, prompt: "hello")
    assert stt.transcribe(recording).provider == "openai"


@pytest.mark.parametrize("silence", ["", "   ", None])
def test_no_speech_is_an_error_not_an_empty_statement(monkeypatch, recording, fake_ffmpeg, silence):
    use_provider(monkeypatch, lambda wav, prompt: silence)
    with pytest.raises(STTError, match="No speech"):
        stt.transcribe(recording)


def test_provider_crash_becomes_stt_error(monkeypatch, recording, fake_ffmpeg):
    def boom(wav, prompt):
        raise ConnectionError("network down")

    use_provider(monkeypatch, boom)
    with pytest.raises(STTError, match="ConnectionError"):
        stt.transcribe(recording)


def test_unknown_provider(monkeypatch, recording):
    monkeypatch.setenv("STT_PROVIDER", "carrier-pigeon")
    with pytest.raises(STTError, match="Unknown STT_PROVIDER"):
        stt.transcribe(recording)


def test_missing_file(tmp_path):
    with pytest.raises(STTError, match="missing"):
        stt.transcribe(tmp_path / "nope.webm")


def test_provider_receives_vocabulary_hint(monkeypatch, recording, fake_ffmpeg):
    seen = {}

    def capture(wav, prompt):
        seen["prompt"] = prompt
        return "ok"

    use_provider(monkeypatch, capture, name="local")
    stt.transcribe(recording)
    assert "UPS B" in seen["prompt"]


# ---- ffmpeg ----

def test_missing_ffmpeg(monkeypatch, recording, tmp_path):
    monkeypatch.setattr(audio.shutil, "which", lambda name: None)
    with pytest.raises(STTError, match="ffmpeg is not installed"):
        audio.to_wav16k(recording, tmp_path)


def test_ffmpeg_failure_reports_last_stderr_line(monkeypatch, recording, tmp_path):
    monkeypatch.setattr(audio.shutil, "which", lambda name: "/usr/bin/ffmpeg")
    monkeypatch.setattr(
        audio.subprocess,
        "run",
        lambda cmd, **kw: subprocess.CompletedProcess(cmd, 1, b"", b"header\nInvalid data found when processing input\n"),
    )
    with pytest.raises(STTError, match="Invalid data found"):
        audio.to_wav16k(recording, tmp_path)


def test_ffmpeg_command_makes_16k_mono(monkeypatch, recording, tmp_path):
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        Path(cmd[-1]).write_bytes(b"RIFF")
        return subprocess.CompletedProcess(cmd, 0, b"", b"")

    monkeypatch.setattr(audio.shutil, "which", lambda name: "/usr/bin/ffmpeg")
    monkeypatch.setattr(audio.subprocess, "run", fake_run)
    out = audio.to_wav16k(recording, tmp_path)
    assert out.is_file()
    assert calls[0][calls[0].index("-ac") + 1] == "1"
    assert calls[0][calls[0].index("-ar") + 1] == "16000"


# ---- OpenAI provider ----

def test_openai_needs_a_key(tmp_path):
    with pytest.raises(STTError, match="OPENAI_API_KEY"):
        providers.transcribe_openai(tmp_path / "a.wav", "hint")


def test_openai_call_passes_model_prompt_and_language(monkeypatch, tmp_path):
    wav = tmp_path / "a.wav"
    wav.write_bytes(b"RIFF")
    sent = {}

    class FakeTranscriptions:
        def create(self, **kwargs):
            sent.update(kwargs)
            return SimpleNamespace(text="Generator 1 load test passed.")

    class FakeClient:
        def __init__(self, **kwargs):
            self.audio = SimpleNamespace(transcriptions=FakeTranscriptions())

    monkeypatch.setattr("openai.OpenAI", FakeClient)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_STT_MODEL", "whisper-1")

    assert providers.transcribe_openai(wav, "UPS B, LOTO") == "Generator 1 load test passed."
    assert sent["model"] == "whisper-1"
    assert sent["prompt"] == "UPS B, LOTO"
    assert sent["language"] == "en"


# ---- local provider ----

def write_wav(path: Path, samples: list[int], rate: int = 16000, channels: int = 1) -> Path:
    import struct
    import wave

    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(struct.pack(f"<{len(samples)}h", *samples))
    return path


def test_read_wav16k_scales_samples(tmp_path):
    pytest.importorskip("numpy")
    samples = providers.read_wav16k(write_wav(tmp_path / "a.wav", [0, 16384, -32768]))
    assert samples.dtype.name == "float32"
    assert samples.tolist() == [0.0, 0.5, -1.0]


def test_read_wav16k_rejects_other_formats(tmp_path):
    pytest.importorskip("numpy")
    with pytest.raises(STTError, match="unexpected format"):
        providers.read_wav16k(write_wav(tmp_path / "a.wav", [0, 0], rate=44100))


# ---- vocabulary hint ----

def test_hint_has_fixed_terms_and_assets():
    prompt = jargon.jargon_prompt()
    for term in ("maintenance bypass", "LOTO", "UPS B", "Chiller 2", "CRAC 3", "Generator 1"):
        assert term in prompt
    assert len(prompt) <= jargon.MAX_PROMPT_CHARS


def test_hint_has_no_duplicates_ignoring_case():
    terms = [t.lower() for t in jargon.jargon_prompt().split(", ")]
    assert len(terms) == len(set(terms))


def test_hint_falls_back_to_fixed_terms_without_assets(monkeypatch, tmp_path):
    monkeypatch.setenv("CONFIG_DIR", str(tmp_path))
    assert jargon.jargon_prompt() == ", ".join(jargon.FIXED_TERMS)
