"""Verdict floor (Problem 2). Code caps the grader's verdict; it can only lower it.

rules.yaml → verification.verdict_floor:
- a contradiction of a critical fact → inconsistent
- a missing critical fact → at most partially_consistent
Also: any contradiction at all → at most partially_consistent, and an
unusable grade → partially_consistent (never consistent by default).
"""
from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app import config
from app.models import VERDICTS
from app.verify.answer_key import critical_fact_ids


def _worse(a: str, b: str) -> str:
    return a if VERDICTS.index(a) <= VERDICTS.index(b) else b


def floor_verdict(llm_verdict: str | None, contradictions: Iterable[dict[str, Any]],
                  missing_fact_ids: Iterable[str], answer_key: dict[str, Any]) -> tuple[str, str | None]:
    """Return (verdict, reason). Reason is set when the floor changed the verdict."""
    critical = critical_fact_ids(answer_key)
    contradictions = list(contradictions)
    missing = set(missing_fact_ids)

    if llm_verdict not in VERDICTS:
        verdict, reason = "partially_consistent", "grader_unsure"
    else:
        verdict, reason = llm_verdict, None

    if any(c.get("fact_id") in critical for c in contradictions):
        cap, why = "inconsistent", "contradiction_of_critical_fact"
    elif contradictions:
        cap, why = "partially_consistent", "contradiction"
    elif missing & critical:
        cap, why = "partially_consistent", "missing_critical_fact"
    else:
        cap, why = "consistent", None

    floored = _worse(verdict, cap)
    if floored != verdict:
        return floored, why
    return verdict, reason


def check_status(verdict: str, missing_fact_ids: Iterable[str], contradictions: Iterable[dict[str, Any]],
                 answer_key: dict[str, Any], attempt_no: int, max_attempts: int | None = None) -> str:
    """Status of a check after an attempt: verified | pending | needs_clarification.

    rules.yaml: verified when consistent, or partially_consistent with only
    non-critical facts missing (and nothing contradicted). After
    `verification_attempts` tries → the lead clarifies in person.
    """
    max_attempts = config.budgets()["verification_attempts"] if max_attempts is None else max_attempts
    critical_missing = set(missing_fact_ids) & critical_fact_ids(answer_key)
    if verdict == "consistent" or (
            verdict == "partially_consistent" and not critical_missing and not list(contradictions)):
        return "verified"
    return "needs_clarification" if attempt_no >= max_attempts else "pending"
