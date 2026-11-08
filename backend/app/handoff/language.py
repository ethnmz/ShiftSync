"""Language rules (rules.yaml → language_rules), enforced on AI-written text.

- `never_say` phrases ("you may proceed", "safe to operate") are never allowed.
- `forbidden_unless_confirmed` words ("cleared", "safe", "complete", ...) are
  allowed only when negated ("not cleared") or backed by a confirmed fact that
  says the work is complete / the equipment is cleared.
- Feedback about clearance must say it "must be verified through authorized procedures".
"""
from __future__ import annotations

import re
from collections.abc import Iterable

from app import config
from app.certainty.floor import normalize_text
from app.handoff.view import ItemView

_NEGATORS = ("not", "isn't", "isnt", "aren't", "never", "no", "hasn't", "haven't", "wasn't", "un", "nor", "until")
_CLEARANCE_WORDS = ("clear", "cleared", "clearance")


def _rules() -> dict:
    return config.rules()["language_rules"]


def _confirmed_ok(views: Iterable[ItemView]) -> bool:
    for v in views:
        for f in v.facts:
            if f.certainty == "confirmed" and f.normalized in ("complete", "cleared"):
                return True
    return False


def violations(text: str, views: Iterable[ItemView]) -> list[str]:
    """Problems with `text`. Empty list means it may be shown."""
    views = list(views)
    norm = normalize_text(text)
    found = [f'never say "{p}"' for p in _rules()["never_say"] if normalize_text(p) in norm]
    if _confirmed_ok(views):
        return found
    words = re.findall(r"[\w']+", norm)
    for word in _rules()["forbidden_unless_confirmed"]:
        target = normalize_text(word).split()
        n = len(target)
        for i in range(len(words) - n + 1):
            if words[i:i + n] != target:
                continue
            before = words[max(0, i - 3):i]
            if not any(w in _NEGATORS or w.endswith("n't") for w in before):
                found.append(f'"{word}" without a confirmed fact')
    return found


def clearance_involved(views: Iterable[ItemView]) -> bool:
    for v in views:
        if v.fact("operational_clearance") is not None:
            return True
        if v.categories() & {"power", "cooling"} and v.is_open_work():
            return True
    return False


def ensure_clearance_sentence(text: str, views: Iterable[ItemView]) -> str:
    phrase = _rules()["feedback_must_include_when_clearance_involved"]
    if clearance_involved(views) and phrase not in text.lower():
        text = text.rstrip()
        if text and not text.endswith("."):
            text += "."
        text += f" Clearance {phrase}."
    return text


def mentions_clearance(text: str) -> bool:
    return any(w in normalize_text(text) for w in _CLEARANCE_WORDS)
