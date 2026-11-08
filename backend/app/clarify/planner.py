"""Question planner (Problem 5): ask the fewest, most important questions.

score = gap_weight + item_priority_bonus + safety_bonus
- Within the budget, ask the top gap scoring ≥ ask_threshold, except a non-safety
  gap on an item that was stated clearly (`Gap.statement_clear`).
- After the budget is spent, still ask gaps on safety slots: slots.yaml says
  safety slots are "kept even when simplifying" and block submit.
- Everything else is reported as not asked, with a reason.

`safety_bonus` is read from slots.yaml → priority.safety_bonus (default 10).
It breaks ties so a safety slot outranks a plain missing field on the same item.
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from app import config
from app.clarify.gaps import Gap

DEFAULT_SAFETY_BONUS = 10


def score(gap: Gap) -> int:
    prio = config.slots()["priority"]
    return (prio["gap_weight"][gap.gap_type]
            + prio["item_priority_bonus"].get(gap.item_priority, 0)
            + (prio.get("safety_bonus", DEFAULT_SAFETY_BONUS) if gap.safety else 0))


def rank(gaps: Iterable[Gap]) -> list[Gap]:
    return sorted(gaps, key=lambda g: (-score(g), not g.safety, g.order, g.slots))


@dataclass
class NotAsked:
    gap: Gap
    score: int
    reason: str


@dataclass
class Plan:
    next: Gap | None
    next_score: int | None = None
    over_budget: bool = False           # a mandatory safety question past the budget
    not_asked: list[NotAsked] = field(default_factory=list)


def plan(gaps: Iterable[Gap], budget_used: int, budget_max: int | None = None,
         threshold: int | None = None) -> Plan:
    budgets = config.budgets()
    budget_max = budgets["clarification_questions"] if budget_max is None else budget_max
    threshold = budgets["ask_threshold"] if threshold is None else threshold

    ranked = rank(gaps)
    within = budget_used < budget_max
    chosen: Gap | None = None
    for g in ranked:
        if (within and score(g) >= threshold and not g.statement_clear) or (not within and g.safety):
            chosen = g
            break

    not_asked = []
    for g in ranked:
        if g is chosen:
            continue
        s = score(g)
        if s < threshold:
            reason = f"low priority (score {s} < {threshold})"
        elif g.statement_clear:
            reason = "statement was clear"
        elif not within or chosen is None:
            reason = "question budget spent"
        else:
            reason = "queued"  # may still be asked after the current question
        not_asked.append(NotAsked(g, s, reason))

    return Plan(next=chosen, next_score=score(chosen) if chosen else None,
                over_budget=chosen is not None and not within, not_asked=not_asked)
