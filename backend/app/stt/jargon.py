"""Vocabulary hint for Whisper so site terms ("UPS B", "CRAC 3", "LOTO") come out spelled right.

docs/AI_PIPELINE.md §5: JARGON = asset names and aliases + a fixed list of terms.
"""

import logging
import os
from functools import lru_cache
from pathlib import Path

import yaml

log = logging.getLogger(__name__)

FIXED_TERMS = ["UPS", "maintenance bypass", "load test", "chiller", "CRAC", "LOTO", "vendor", "clearance"]

# Whisper only reads the last ~224 tokens of a prompt. Assumption: 600 characters stays
# under that for these short terms, so nothing is silently cut from the front.
MAX_PROMPT_CHARS = 600

_REPO_CONFIG = Path(__file__).resolve().parents[3] / "config"


def _config_dir() -> Path:
    # Stopgap until backend/app/config.py exists: read CONFIG_DIR directly.
    configured = os.environ.get("CONFIG_DIR")
    return Path(configured) if configured else _REPO_CONFIG


def _asset_terms(assets_file: Path) -> tuple[list[str], list[str]]:
    data = yaml.safe_load(assets_file.read_text()) or {}
    entries = [*(data.get("halls") or []), *(data.get("assets") or [])]
    names = [e["name"] for e in entries if e.get("name")]
    aliases = [a for e in entries for a in (e.get("aliases") or [])]
    return names, aliases


@lru_cache(maxsize=1)
def jargon_prompt() -> str:
    """Comma-separated terms: fixed list first, then asset names, then aliases while room remains."""
    assets_file = _config_dir() / "assets.yaml"
    try:
        names, aliases = _asset_terms(assets_file)
    except (OSError, yaml.YAMLError, TypeError, KeyError) as exc:
        # A missing hint makes transcription a little worse, not wrong, so keep going.
        log.warning("STT vocabulary hint: couldn't read %s (%s); using fixed terms only", assets_file, exc)
        names, aliases = [], []

    terms: list[str] = []
    seen: set[str] = set()
    length = 0
    for term in [*FIXED_TERMS, *names, *aliases]:
        key = term.strip().lower()
        if not key or key in seen:
            continue
        added = len(term) + (2 if terms else 0)
        if length + added > MAX_PROMPT_CHARS:
            break
        seen.add(key)
        terms.append(term.strip())
        length += added
    return ", ".join(terms)
