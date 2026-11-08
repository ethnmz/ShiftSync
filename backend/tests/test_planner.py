"""Planner: budget, priority order, and the demo's three questions (demo/scenario.json steps 2-5)."""
from app.clarify.gaps import Gap, find_gaps
from app.clarify.planner import plan, rank, score
from app.handoff.priority import compute_priority
from tests.conftest import make_fact, question


def _summary(g):
    return (g.item_id, g.gap_type, g.slots)


def test_top3_matches_demo_step2(step2):
    ups, cool = step2["ups"], step2["cool"]
    top3 = [_summary(g) for g in rank(find_gaps(step2["views"]))[:3]]
    assert top3 == [
        (ups.id, "vague_statement", ("remaining_work", "rationale")),
        (ups.id, "missing_required", ("operational_clearance",)),
        (cool.id, "uncertain_claim", ("equipment_scope", "work_status")),
    ]


def test_demo_walkthrough_asks_three_then_review(step2):
    views, ups, cool = step2["views"], step2["ups"], step2["cool"]
    v_ups, _, v_cool, _ = views
    asked = []

    # Step 2 → Q1 about what remains on UPS-B and why.
    p = plan(find_gaps(views, asked), budget_used=0)
    assert _summary(p.next) == (ups.id, "vague_statement", ("remaining_work", "rationale"))
    asked.append(question(ups, p.next.gap_type, p.next.slots, p.next.target_slot))

    # Step 3 answer: load test remains, battery module didn't arrive.
    v_ups.facts += [
        make_fact(ups, "remaining_work", "Final load test", "confirmed",
                  "the vendor couldn't do the final load test", statement_id="S-0002"),
        make_fact(ups, "rationale", "Replacement battery module didn't arrive", "confirmed",
                  "The replacement battery module didn't arrive", statement_id="S-0002"),
    ]
    p = plan(find_gaps(views, asked), budget_used=1)
    assert _summary(p.next) == (ups.id, "missing_required", ("operational_clearance",))
    asked.append(question(ups, p.next.gap_type, p.next.slots, p.next.target_slot))

    # Step 4 answer: not cleared, in maintenance bypass.
    v_ups.facts += [
        make_fact(ups, "operational_clearance", "Not cleared: in maintenance bypass", "confirmed",
                  "It's still in maintenance bypass", normalized="not_cleared", statement_id="S-0003"),
        make_fact(ups, "required_verification", "Vendor finishes load test and signs off", "confirmed",
                  "not cleared until the vendor finishes the load test and signs off", statement_id="S-0003"),
    ]
    p = plan(find_gaps(views, asked), budget_used=2)
    assert _summary(p.next) == (cool.id, "uncertain_claim", ("equipment_scope", "work_status"))
    asked.append(question(cool, p.next.gap_type, p.next.slots, p.next.target_slot, status="answered"))

    # Step 5 answer: Chiller 2, never got a report, don't know if finished.
    cool.asset_ids = ["CHL-2"]
    v_cool.facts = [
        make_fact(cool, "equipment_scope", "Chiller 2", "confirmed", "It was Chiller 2", statement_id="S-0004"),
        make_fact(cool, "work_status", "Unknown; no report received", "unknown",
                  "I honestly don't know if they finished", normalized="unknown", statement_id="S-0004"),
    ]
    cool.priority = compute_priority(v_cool)[0]
    assert cool.priority == "critical"
    p = plan(find_gaps(views, asked), budget_used=3)
    assert p.next is None  # → in_review
    not_asked = {(n.gap.item_id, s) for n in p.not_asked for s in n.gap.slots}
    assert (step2["gc"].id, "scope") in not_asked
    assert (ups.id, "owner") in not_asked
    assert all(n.reason for n in p.not_asked)


def _gap(gap_type, priority="routine", safety=False, slots=("x",)):
    return Gap("I-1", gap_type, slots, None, safety, priority, "")


def test_score_formula():
    assert score(_gap("vague_statement", "critical", safety=True)) == 90 + 30 + 10
    assert score(_gap("unscoped_claim", "important")) == 30 + 10


def test_below_threshold_is_not_asked_even_with_budget():
    p = plan([_gap("unscoped_claim", "important")], budget_used=0)
    assert p.next is None
    assert p.not_asked[0].reason.startswith("low priority")


def test_budget_spent_skips_non_safety():
    p = plan([_gap("missing_required", "critical")], budget_used=3)
    assert p.next is None
    assert p.not_asked[0].reason == "question budget spent"


def test_safety_gap_is_asked_past_budget():
    p = plan([_gap("missing_required", "critical", safety=True)], budget_used=3)
    assert p.next is not None and p.over_budget


def test_within_budget_not_over():
    p = plan([_gap("missing_required", "critical", safety=True)], budget_used=0)
    assert p.next is not None and not p.over_budget
