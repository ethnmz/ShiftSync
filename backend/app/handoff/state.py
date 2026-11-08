"""Handoff state machine (docs/ARCHITECTURE.md). Deterministic; the LLM never sets state.

draft ─statement─▶ analyzing ─▶ clarifying ─(no question to ask)─▶ in_review
in_review ─submit (Shift A)─▶ submitted ─acknowledge (Shift B)─▶ acknowledged
acknowledged ─start verification─▶ verifying ─all checks verified─▶ verified
                                              └ any clarified_in_person ─▶ verified_with_assistance

Open follow-ups never block a transition. Acknowledgment is not verification.
"""
from __future__ import annotations

from collections.abc import Iterable

from app import config
from app.handoff.view import ItemView
from app.models import ClarificationQuestion, Handoff, VerificationCheck

SHIFT_A_EDIT_STATES = ("draft", "clarifying", "in_review")


class TransitionError(ValueError):
    """Event not allowed in the current state."""


class ActorError(PermissionError):
    """This person may not do this."""


# event → (allowed from-states, to-state or None if computed)
TRANSITIONS: dict[str, tuple[tuple[str, ...], str | None]] = {
    "statement_added": (SHIFT_A_EDIT_STATES, "analyzing"),
    "analysis_done": (("analyzing",), None),        # clarifying or in_review
    "analysis_failed": (("analyzing",), None),      # back to where it was
    "submit": (("in_review",), "submitted"),
    "acknowledge": (("submitted",), "acknowledged"),
    "start_verification": (("acknowledged",), "verifying"),
    "verification_done": (("verifying",), None),    # verified / verified_with_assistance
}

# Who may trigger each event: "outgoing", "incoming", or a set of roles.
ACTORS: dict[str, str | tuple[str, ...]] = {
    "statement_added": "outgoing",
    "answer_question": "outgoing",
    "review": "outgoing",
    "submit": "outgoing",
    "acknowledge": "incoming",
    "start_verification": "incoming",
    "verification_answer": "incoming",
    "clarified_in_person": ("lead", "supervisor"),
}


def authorize(handoff: Handoff, action: str, actor_id: str) -> None:
    """Raise ActorError unless `actor_id` may perform `action` on this handoff.

    Demo identity is the X-User roster id; this is a demo selector, not authentication.
    """
    rule = ACTORS.get(action)
    if rule is None:
        return
    if rule == "outgoing" and actor_id != handoff.outgoing_id:
        raise ActorError(f"only the outgoing operator can {action.replace('_', ' ')}")
    if rule == "incoming" and actor_id != handoff.incoming_id:
        raise ActorError(f"only the incoming operator can {action.replace('_', ' ')}")
    if isinstance(rule, tuple):
        p = config.person(actor_id)
        if not p or p["role"] not in rule:
            raise ActorError(f"only a {' or '.join(rule)} can {action.replace('_', ' ')}")


def transition(state: str, event: str, *, has_pending_question: bool | None = None,
               previous_state: str | None = None, checks: Iterable[VerificationCheck] | None = None) -> str:
    """Return the next state, or raise TransitionError."""
    if event not in TRANSITIONS:
        raise TransitionError(f"unknown event {event!r}")
    allowed, target = TRANSITIONS[event]
    if state not in allowed:
        raise TransitionError(f"cannot {event} while {state}")
    if target is not None:
        return target
    if event == "analysis_done":
        if has_pending_question is None:
            raise TransitionError("analysis_done needs has_pending_question")
        return "clarifying" if has_pending_question else "in_review"
    if event == "analysis_failed":
        # "Invalid LLM JSON twice → no state change": return to the prior state.
        return previous_state if previous_state in SHIFT_A_EDIT_STATES else "draft"
    if event == "verification_done":
        outcome = verification_outcome(checks or [])
        if outcome is None:
            raise TransitionError("verification is not finished")
        return outcome
    raise TransitionError(f"unhandled event {event!r}")


def verification_outcome(checks: Iterable[VerificationCheck]) -> str | None:
    """verified / verified_with_assistance once every check is settled, else None.

    No checks at all → None: the app never reports understanding as verified
    without asking anything.
    """
    checks = list(checks)
    if not checks or any(c.status not in ("verified", "clarified_in_person") for c in checks):
        return None
    if any(c.status == "clarified_in_person" for c in checks):
        return "verified_with_assistance"
    return "verified"


def is_safety_question(q: ClarificationQuestion, kind: str) -> bool:
    if q.gap_type in ("vague_statement", "uncertain_claim"):
        return True  # these gaps only come from safety slots
    return any(config.is_safety_slot(kind, s) for s in q.slots)


def submit_blockers(views: Iterable[ItemView], questions: Iterable[ClarificationQuestion]) -> list[dict]:
    """rules.yaml → submit_blockers. Empty list means Shift A may submit.

    1. A fact on a critical item that nobody has reviewed (still ai_extracted).
    2. A pending clarification question on a safety slot ("I don't know" answers it).
    A missing follow-up owner does not block.

    Each blocker: {code, message, item_id, fact_id | question_id}.
    """
    views = list(views)
    kinds = {v.id: v.kind for v in views}
    blockers: list[dict] = []
    for v in views:
        if v.priority != "critical":
            continue
        for f in v.facts:
            if f.review_state == "ai_extracted":
                blockers.append({"code": "unreviewed_critical_fact",
                                 "message": f"Review {f.slot.replace('_', ' ')} on {v.item.title}",
                                 "item_id": v.id, "fact_id": f.id})
    for q in questions:
        if q.status == "pending" and is_safety_question(q, kinds.get(q.item_id, "")):
            blockers.append({"code": "pending_safety_question",
                             "message": "Answer the pending safety question (\"I don't know\" is allowed)",
                             "item_id": q.item_id, "question_id": q.id})
    return blockers
