"""Follow-up rules (Problem 4). Deterministic.

- Created automatically for critical/important items whose facts hit a slot's
  `followup_if` in slots.yaml. One follow-up per item.
- Owner and deadline come only from a human: an explicit quote from the
  outgoing operator, or an assignment by a lead/supervisor. Otherwise the owner
  shows "To be assigned".
- Never closed automatically. Closing needs a closure statement.
- Open follow-ups never block a handoff transition (team decision on the board,
  2026-11-08).
"""
from __future__ import annotations

from collections.abc import Callable, Iterable
from datetime import datetime

from app import config
from app.certainty.floor import find_term
from app.handoff.view import ItemView
from app.models import Fact, FollowUp

ASSIGNER_ROLES = ("lead", "supervisor")
# Phrases that mean "the incoming shift's lead" in Shift A's own words.
INCOMING_LEAD_PHRASES = ["shift b lead", "incoming lead", "next shift lead", "next shift's lead",
                         "oncoming lead", "day lead", "day shift lead"]


class FollowUpPermissionError(PermissionError):
    pass


class FollowUpError(ValueError):
    pass


def default_owner_label() -> str:
    return config.rules()["followups"]["default_owner_label"]


def owner_label(fu: FollowUp) -> str:
    if not fu.owner_id:
        return default_owner_label()
    p = config.person(fu.owner_id)
    return p["name"] if p else fu.owner_id


# ---------- Creation ----------

def trigger_fact(view: ItemView) -> Fact | None:
    """The first fact (catalog order) that requires a follow-up, if any."""
    if view.priority not in ("critical", "important"):
        return None
    for slot, spec in config.kind_slots(view.kind).items():
        cond = spec.get("followup_if")
        f = view.fact(slot)
        if not cond or f is None:
            continue
        if f.normalized in cond.get("normalized", []) or f.certainty in cond.get("certainty", []):
            return f
    return None


def describe(view: ItemView, trigger: Fact) -> tuple[str, str]:
    """(description, missing_information) from the item's own facts. No LLM."""
    title = view.item.title
    verification = view.fact("required_verification")
    remaining = view.fact("remaining_work")
    if trigger.slot == "operational_clearance":
        desc = f"Confirm whether {title} is cleared for normal operation"
        missing = verification.value if verification else "Clearance confirmation through authorized procedures"
    elif trigger.slot == "work_status" and view.kind == "inspection":
        desc = f"Confirm what the {title} found and whether it was completed"
        missing = "Inspection report or completion confirmation"
    elif trigger.slot == "work_status":
        desc = f"Confirm completion of {title}"
        if verification:
            missing = verification.value
        elif remaining:
            missing = f"Completion confirmation: {remaining.value}"
        else:
            missing = "Completion confirmation"
    else:
        desc = f"Resolve {trigger.slot.replace('_', ' ')} for {title}"
        missing = f"Confirmed {trigger.slot.replace('_', ' ')}"
    return desc, missing


def sync_followups(views: Iterable[ItemView], existing: Iterable[FollowUp], handoff_id: str,
                   new_id: Callable[[], str]) -> list[FollowUp]:
    """Create missing follow-ups and refresh the text of open ones.

    Returns the newly created follow-ups (caller adds them to the session).
    Never closes or reassigns anything.
    """
    by_item = {fu.item_id: fu for fu in existing}
    created = []
    for view in views:
        trig = trigger_fact(view)
        if trig is None:
            continue
        desc, missing = describe(view, trig)
        fu = by_item.get(view.id)
        if fu is None:
            fu = FollowUp(id=new_id(), item_id=view.id, handoff_id=handoff_id,
                          description=desc, missing_information=missing)
            by_item[view.id] = fu
            created.append(fu)
        elif fu.status != "closed":
            fu.description, fu.missing_information = desc, missing
    return created


# ---------- Ownership ----------

def owner_from_quote(owner_mentioned: str | None, quote: str | None, incoming_lead_id: str) -> str | None:
    """Roster id for an owner Shift A named explicitly, or None.

    The mention must appear in the verbatim quote. It may be a roster id, full
    name, unique first name, or a phrase meaning the incoming lead.
    """
    if not owner_mentioned or not quote or not find_term(quote, [owner_mentioned]):
        return None
    mention = owner_mentioned.strip().lower()
    if find_term(mention, INCOMING_LEAD_PHRASES):
        return incoming_lead_id
    people = [p for p in config.people().values() if p.get("role") != "vendor"]
    for p in people:
        if mention in (p["id"].lower(), p["name"].lower()):
            return p["id"]
    first = [p for p in people if p["name"].split()[0].lower() == mention]
    return first[0]["id"] if len(first) == 1 else None


def assign(fu: FollowUp, actor_id: str, owner_id: str, deadline: datetime | None, now: datetime) -> FollowUp:
    """PATCH /followups/{id}: only a lead or supervisor may assign."""
    actor = config.person(actor_id)
    if not actor or actor["role"] not in ASSIGNER_ROLES:
        raise FollowUpPermissionError("only a lead or supervisor can assign a follow-up")
    owner = config.person(owner_id)
    if not owner or owner["role"] == "vendor":
        raise FollowUpError(f"owner {owner_id!r} is not on the roster")
    if fu.status == "closed":
        raise FollowUpError("follow-up is closed")
    fu.owner_id = owner_id
    fu.deadline = deadline
    fu.assigned_by = actor_id
    fu.assigned_at = now
    return fu


def close(fu: FollowUp, actor_id: str, closure_statement_id: str | None, now: datetime) -> FollowUp:
    if not closure_statement_id:
        raise FollowUpError("closing a follow-up needs a closure statement")
    if not config.person(actor_id):
        raise FollowUpPermissionError("unknown person")
    fu.status = "closed"
    fu.closed_by = actor_id
    fu.closed_at = now
    fu.closure_statement_id = closure_statement_id
    return fu


def counts(followups: Iterable[FollowUp], now: datetime) -> dict[str, int]:
    """{open, unassigned, overdue} over follow-ups that are not closed."""
    live = [fu for fu in followups if fu.status != "closed"]

    def overdue(fu: FollowUp) -> bool:
        if fu.deadline is None:
            return False
        dl = fu.deadline if fu.deadline.tzinfo else fu.deadline.replace(tzinfo=now.tzinfo)
        return dl < now

    return {
        "open": len(live),
        "unassigned": sum(1 for fu in live if not fu.owner_id),
        "overdue": sum(1 for fu in live if overdue(fu)),
    }
