"""Shared builders for unit tests. No database needed."""
from __future__ import annotations

import itertools

import pytest

from app import clock, config
from app.handoff.priority import compute_priority
from app.handoff.view import ItemView
from app.models import ClarificationQuestion, Fact, Item

_ids = itertools.count(1)


def make_item(kind: str, title: str, asset_ids=(), *, mention=None, priority=None,
              is_decision=False, origin=None, item_id=None) -> Item:
    return Item(id=item_id or f"I-{next(_ids):04d}", handoff_id="H-0001", kind=kind, title=title,
                asset_ids=list(asset_ids), asset_mention=mention, priority=priority or "routine",
                is_decision=is_decision, origin_item_id=origin)


def make_fact(item: Item, slot: str, value: str, certainty: str, quote: str, *, normalized=None,
              review_state="ai_extracted", statement_id="S-0001") -> Fact:
    return Fact(id=f"F-{next(_ids):04d}", item_id=item.id, slot=slot, value=value, normalized=normalized,
                certainty=certainty, quote=quote, review_state=review_state,
                source_statement_id=statement_id)


def view(item: Item, *facts: Fact, carried_over=None, set_priority=True) -> ItemView:
    v = ItemView.build(item, facts, carried_over=carried_over)
    if set_priority:
        item.priority = compute_priority(v)[0]
    return v


def question(item: Item, gap_type: str, slots, target=None, status="answered") -> ClarificationQuestion:
    return ClarificationQuestion(id=f"Q-{next(_ids):04d}", handoff_id="H-0001", item_id=item.id,
                                 gap_type=gap_type, slots=list(slots), target_slot=target, status=status)


@pytest.fixture(autouse=True)
def _fresh_config_and_clock():
    config.reload()
    clock.reset()
    yield
    clock.reset()


@pytest.fixture
def step2():
    """Items and facts as extraction should produce them after demo step 2 (Maya's first note)."""
    ups = make_item("vendor_work", "UPS-B maintenance", ["UPS-B"])
    ups_ws = make_fact(ups, "work_status", "Mostly finished", "unverified",
                       "UPS-B maintenance is mostly finished", normalized="incomplete")
    ups_vr = make_fact(ups, "vendor_return", "Vendor returns tomorrow", "confirmed",
                       "The vendor is coming back tomorrow")
    gen = make_item("observation", "Generator 1 condition", ["GEN-1"])
    gen_c = make_fact(gen, "condition", "Looks good", "reported", "Generator 1 looks good")
    cool = make_item("inspection", "Cooling inspection", [], mention="the cooling inspection")
    cool_ws = make_fact(cool, "work_status", "Unknown", "unknown",
                        "I'm not sure what happened with the cooling inspection", normalized="unknown")
    gc = make_item("general_claim", "Everything else", [])
    gc_f = make_fact(gc, "condition", "everything else should be okay", "unverified",
                     "everything else should be okay")
    views = [view(ups, ups_ws, ups_vr), view(gen, gen_c), view(cool, cool_ws), view(gc, gc_f)]
    return {"views": views, "ups": ups, "gen": gen, "cool": cool, "gc": gc}
