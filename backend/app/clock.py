"""The only source of "now". The demo freezes or moves this clock.

All times are timezone-aware UTC.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

_frozen: datetime | None = None


def now() -> datetime:
    return _frozen if _frozen is not None else datetime.now(timezone.utc)


def set_now(when: datetime | str) -> datetime:
    """Freeze the clock at `when` (datetime or ISO 8601 string)."""
    global _frozen
    if isinstance(when, str):
        when = datetime.fromisoformat(when.replace("Z", "+00:00"))
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    _frozen = when.astimezone(timezone.utc)
    return _frozen


def advance(seconds: float) -> datetime:
    """Move a frozen clock forward. Freezes at real now first if not frozen."""
    return set_now(now() + timedelta(seconds=seconds))


def reset() -> None:
    """Return to the real wall clock."""
    global _frozen
    _frozen = None
