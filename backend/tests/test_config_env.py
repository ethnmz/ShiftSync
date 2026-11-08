import os

from app.config import load_env_file


def test_loads_values_and_real_env_wins(tmp_path, monkeypatch):
    env = tmp_path / ".env"
    env.write_text(
        "# comment\n"
        "NEMOTRON_MODEL=nvidia/some-model\n"
        "NVIDIA_BASE_URL=\"https://example.test/v1\"\n"
        "export LLM_PROVIDER=nemotron  # inline comment\n"
        "EMPTY=\n"
        "ALREADY=from-file\n"
        "not a line\n",
        encoding="utf-8",
    )
    for k in ("NEMOTRON_MODEL", "NVIDIA_BASE_URL", "LLM_PROVIDER", "EMPTY"):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("ALREADY", "from-shell")

    loaded = load_env_file(env)

    assert os.environ["NEMOTRON_MODEL"] == "nvidia/some-model"
    assert os.environ["NVIDIA_BASE_URL"] == "https://example.test/v1"
    assert os.environ["LLM_PROVIDER"] == "nemotron"
    assert os.environ["EMPTY"] == ""
    assert os.environ["ALREADY"] == "from-shell"
    assert "ALREADY" not in loaded and "NEMOTRON_MODEL" in loaded
    for k in loaded:
        os.environ.pop(k, None)  # set by the loader, not by monkeypatch, so remove directly


def test_missing_file_is_fine(tmp_path):
    assert load_env_file(tmp_path / "nope.env") == []
