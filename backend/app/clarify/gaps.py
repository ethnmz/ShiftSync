"""Gap detection (Problems 1, 3, 4). Deterministic, driven by config/slots.yaml.

A gap is something Shift A could clarify. `planner.py` decides which gap to ask.

Rules, per open item from this handoff:
- vague_statement: a safety slot is filled by a quote with a `vague_terms` phrase
  ("mostly finished"). It asks for up to 2 missing non-safety required slots
  (e.g. remaining_work + rationale), or the vague slot itself if none are missing.
- uncertain_claim: a safety slot on a critical item is `unverified`/`unknown` and
  nobody has asked about it yet. It asks the slot plus at most 1 missing
  non-safety slot (e.g. equipment_scope + work_status).
- missing_required / missing_rationale / missing_condition: a required slot is
  empty. Each safety slot is its own gap. Non-safety slots are grouped 2 per gap.
- unscoped_claim: a general_claim with no equipment named.
- missing_owner_or_deadline: open critical work with no owner or deadline stated.

A slot is never asked again once a question about it is pending or answered,
including "I don't know" (Problem 5). The one exception: a safety slot gets one
more try if the answer to its question saved no fact at all, because an answer
nothing recorded hasn't closed the gap. An answer filed under other slots has
been recorded, so it doesn't count.

A non-safety gap on an item that was stated clearly is flagged `statement_clear`,
and the planner records it as not asked (Problem 5). A decision's missing rationale
or restore condition is exempt, because those are worth a question (Problem 3).
"""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from app import config
from app.certainty.floor import find_term
from app.handoff.view import ItemView, eval_when
from app.models import ClarificationQuestion, FollowUp

_COVERING_STATUSES = ("pending", "answered", "answered_unknown")
_SLOT_GAP_TYPE = {"rationale": "missing_rationale", "restore_condition": "missing_condition"}


@dataclass(frozen=True)
class Gap:
    item_id: str
    gap_type: str
    slots: tuple[str, ...]
    target_slot: str | None
    safety: bool
    item_priority: str
    reason: str
    order: int = 0  # item position, for stable tie-breaks
    statement_clear: bool = False  # non-safety gap on an item stated plainly: not worth a question


def _stated_clearly(view: ItemView, vague_terms: list[str]) -> bool:
    """True when the item has facts and every one is confirmed and free of vague wording.

    The certainty floor has already capped hedges, uncertainty and second-hand claims
    ("vendor said"), so certainty covers those. No facts at all is not clear: nothing
    usable was said.
    """
    return bool(view.facts) and all(
        f.certainty == "confirmed" and not find_term(f.quote or f.value, vague_terms)
        for f in view.facts)


def covered_slots(questions: Iterable[ClarificationQuestion], item_id: str) -> set[str]:
    covered: set[str] = set()
    for q in questions:
        if q.item_id == item_id and q.status in _COVERING_STATUSES:
            covered.update(q.slots)
            if q.target_slot:
                covered.add(q.target_slot)
    return covered


def _retry_slots(view: ItemView, questions: Iterable[ClarificationQuestion], catalog: dict) -> set[str]:
    """Safety slots asked exactly once, whose answer saved no fact on this item. Once only, so it can't loop."""
    asked = [q for q in questions if q.item_id == view.id and q.status in _COVERING_STATUSES]
    saved_by = {f.source_statement_id for f in view.facts}
    return {s for q in asked if q.status == "answered" and q.answer_statement_id not in saved_by for s in q.slots
            if catalog.get(s, {}).get("safety") and view.fact(s) is None
            and sum(s in other.slots for other in asked) == 1}


def _owner_settled(view: ItemView, followups: Iterable[FollowUp]) -> bool:
    if view.fact("owner") and view.fact("deadline"):
        return True
    return any(fu.item_id == view.id and fu.owner_id and fu.deadline for fu in followups)


def item_gaps(view: ItemView, questions: Iterable[ClarificationQuestion] = (),
              followups: Iterable[FollowUp] = (), order: int = 0) -> list[Gap]:
    questions = list(questions)
    catalog = config.kind_slots(view.kind)
    vague_terms = config.language()["vague_terms"]
    covered = covered_slots(questions, view.id) - _retry_slots(view, questions, catalog)
    clear = _stated_clearly(view, vague_terms)
    is_decision = view.item.is_decision or view.kind == "decision"
    gaps: list[Gap] = []

    def add(gap_type: str, slots: list[str], target: str | None, safety: bool, reason: str) -> None:
        decision_detail = is_decision and gap_type in ("missing_rationale", "missing_condition")
        gaps.append(Gap(view.id, gap_type, tuple(slots), target, safety, view.priority, reason, order,
                        statement_clear=clear and not safety and not decision_detail))

    missing = [s for s, spec in catalog.items()
               if spec.get("required") and s not in covered
               and view.fact(s) is None and eval_when(spec.get("when"), view)]
    missing_safety = [s for s in missing if catalog[s].get("safety")]
    pool = [s for s in missing if not catalog[s].get("safety")]

    # general_claim with no scope → unscoped_claim, not missing_required.
    if view.kind == "general_claim" and "scope" in pool:
        pool.remove("scope")
        add("unscoped_claim", ["scope"], None, False, "no equipment named")

    vague: list[tuple[str, str]] = []
    uncertain: list[str] = []
    for s, spec in catalog.items():
        f = view.fact(s)
        if not spec.get("safety") or f is None or s in covered:
            continue
        term = find_term(f.quote or f.value, vague_terms)
        if term:
            vague.append((s, term))
        elif view.priority == "critical" and f.certainty in ("unverified", "unknown"):
            uncertain.append(s)

    for s, term in vague:
        take, pool = pool[:2], pool[2:]
        add("vague_statement", take or [s], s, True, f'vague:"{term}"')
    for s in uncertain:
        take, pool = pool[:1], pool[1:]
        add("uncertain_claim", take + [s], s, True, f"{s} is {view.fact(s).certainty}")

    for s in missing_safety:
        add(_SLOT_GAP_TYPE.get(s, "missing_required"), [s], None, True, f"{s} missing")

    special = [s for s in pool if s in _SLOT_GAP_TYPE]
    plain = [s for s in pool if s not in _SLOT_GAP_TYPE]
    for s in special:
        add(_SLOT_GAP_TYPE[s], [s], None, False, f"{s} missing")
    for i in range(0, len(plain), 2):
        add("missing_required", plain[i:i + 2], None, False, f"{', '.join(plain[i:i + 2])} missing")

    # A decision of a kind whose catalog has no rationale slot still needs a why.
    if (view.item.is_decision and "rationale" not in catalog
            and view.fact("rationale") is None and "rationale" not in covered):
        add("missing_rationale", ["rationale"], None, False, "decision without rationale")

    if view.priority == "critical" and view.is_open_work() and not _owner_settled(view, followups):
        # Asked at most once: any earlier owner/deadline question covers both.
        want = [s for s in ("owner", "deadline") if view.fact(s) is None]
        if want and not covered & {"owner", "deadline"}:
            add("missing_owner_or_deadline", want, None, False, "open work without owner/deadline")

    return gaps


def find_gaps(views: Iterable[ItemView], questions: Iterable[ClarificationQuestion] = (),
              followups: Iterable[FollowUp] = (), statement_ids: set[str] | None = None) -> list[Gap]:
    """Gaps over all open items Shift A talked about in this handoff.

    Carried-over items are skipped unless one of their current facts comes from
    `statement_ids` (this handoff's statements), so Shift A isn't quizzed about
    yesterday's items she didn't mention.
    """
    questions = list(questions)
    followups = list(followups)
    out: list[Gap] = []
    for order, view in enumerate(views):
        if not view.item.open:
            continue
        if view.carried_over and not (statement_ids and any(f.source_statement_id in statement_ids for f in view.facts)):
            continue
        out.extend(item_gaps(view, questions, followups, order))
    return out
