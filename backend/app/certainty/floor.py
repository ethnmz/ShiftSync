"""Certainty floor (Problem 4): code caps what the quote's wording allows.

The floor can only lower certainty. Whatever the LLM proposes, a quote with a
hedge can never be `confirmed`. Raising certainty needs a new operator statement,
and that new statement is floored too.

Lexicons come from config/slots.yaml → language.
"""
from __future__ import annotations

import re

from app import config
from app.models import CERTAINTIES

# (lexicon key, cap, reason label). Checked strictest first.
_CAPS = (
    ("uncertainty_terms", "unknown", "uncertainty"),
    ("hedges", "unverified", "hedge"),
    ("observation_terms", "reported", "observation"),
)


def rank(certainty: str) -> int:
    return CERTAINTIES.index(certainty)


def lower_of(a: str, b: str) -> str:
    return a if rank(a) <= rank(b) else b


def normalize_text(text: str) -> str:
    """Lowercase, straighten curly apostrophes, collapse spaces."""
    text = text.lower().replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", text).strip()


def find_term(text: str, terms: list[str]) -> str | None:
    """First lexicon term found as a whole phrase in `text` (case-insensitive)."""
    norm = normalize_text(text)
    for term in terms:
        if re.search(r"(?<![\w'])" + re.escape(normalize_text(term)) + r"(?![\w'])", norm):
            return term
    return None


def floor_certainty(proposed: str, quote: str | None) -> tuple[str, str | None]:
    """Return (certainty, reason). Reason is set only when the floor lowered it,
    e.g. `hedge:"mostly"`. A missing quote cannot support anything above `reported`.
    """
    if proposed not in CERTAINTIES:
        raise ValueError(f"unknown certainty {proposed!r}")
    if not quote:
        capped = lower_of(proposed, "reported")
        return capped, ("no_quote" if capped != proposed else None)
    lang = config.language()
    for key, cap, label in _CAPS:
        term = find_term(quote, lang.get(key, []))
        if term and rank(proposed) > rank(cap):
            return cap, f'{label}:"{term}"'
    return proposed, None


class CertaintyRaiseError(ValueError):
    """An operator tried to raise certainty without a new statement."""


def operator_set_certainty(current: str, requested: str, new_statement_text: str | None) -> tuple[str, str | None]:
    """Apply an operator's certainty edit (PATCH /facts).

    Lowering is always allowed. Raising requires `new_statement_text`, which is
    then floored like any other quote.
    """
    if requested not in CERTAINTIES:
        raise ValueError(f"unknown certainty {requested!r}")
    if rank(requested) <= rank(current):
        return requested, "operator lowered"
    if not new_statement_text:
        raise CertaintyRaiseError("raising certainty needs a new operator statement")
    certainty, reason = floor_certainty(requested, new_statement_text)
    return certainty, reason or "operator stated"
