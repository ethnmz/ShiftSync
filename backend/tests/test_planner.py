"""Planner: budget, priority order, and the demo's three questions (demo/scenario.json steps 2-5)."""
import pytest

from app.clarify.gaps import Gap, find_gaps
from app.clarify.planner import plan, rank, score
from app.handoff.priority import compute_priority
from tests.conftest import make_fact, make_item, question, view
from tests.test_handoff_service import EF, EI, Extraction, H, _item, _pending, _say, env  # noqa: F401


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


def _gap(gap_type, priority="routine", safety=False, slots=("x",), statement_clear=False):
    return Gap("I-1", gap_type, slots, None, safety, priority, "", statement_clear=statement_clear)


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


# ---- a clear statement is not quizzed (Problem 5) ----

def _pending_ups(certainty="confirmed", quote="UPS-B testing is still pending", is_decision=False):
    ups = make_item("testing", "UPS-B testing", ["UPS-B"], is_decision=is_decision)
    return ups, view(ups, make_fact(ups, "work_status", "Pending", certainty, quote, normalized="pending"))


def test_clear_statement_is_not_asked_even_with_budget():
    p = plan([_gap("missing_required", "critical", statement_clear=True)], budget_used=0)
    assert p.next is None
    assert p.not_asked[0].reason == "statement was clear"


def test_clear_statement_still_gets_the_safety_question():
    ups, v = _pending_ups()
    p = plan(find_gaps([v]), budget_used=0)
    assert _summary(p.next) == (ups.id, "missing_required", ("operational_clearance",))
    assert not p.next.statement_clear


@pytest.mark.parametrize("certainty, quote", [
    ("unverified", "UPS-B testing is probably still pending"),
    ("unknown", "I'm not sure UPS-B testing is still pending"),
    ("reported", "the vendor said UPS-B testing is still pending"),
    ("confirmed", "UPS-B testing is pending but it's handled"),
])
def test_unclear_statement_keeps_non_safety_questions(certainty, quote):
    _, v = _pending_ups(certainty, quote)
    non_safety = [g for g in find_gaps([v]) if not g.safety]
    assert non_safety and not any(g.statement_clear for g in non_safety)
    assert plan(non_safety, budget_used=0).next is not None


def test_decision_is_still_asked_why():
    _, v = _pending_ups(is_decision=True)
    gaps = find_gaps([v])
    [why] = [g for g in gaps if g.gap_type == "missing_rationale"]
    p = plan([g for g in gaps if not g.safety], budget_used=0)
    assert p.next == why
    assert {n.reason for n in p.not_asked} == {"statement was clear"}


def test_decision_is_still_asked_its_restore_condition():
    item = make_item("decision", "Load test postponed", ["UPS-B"])
    v = view(item,
             make_fact(item, "decision", "Postponed", "confirmed", "We postponed the UPS-B load test"),
             make_fact(item, "rationale", "Load bank failed", "confirmed", "The vendor's load bank failed"))
    [condition] = [g for g in find_gaps([v]) if g.gap_type == "missing_condition"]
    assert not condition.safety and not condition.statement_clear


def test_item_with_no_usable_facts_is_not_clear():
    ups = make_item("testing", "UPS-B testing", ["UPS-B"])
    assert not any(g.statement_clear for g in find_gaps([view(ups)]))


def test_low_effort_complete_gets_one_question(env):  # noqa: F811
    """eval/scenarios/low_effort_complete.json, with scripted extraction, through the real service."""
    client, analyzer = env
    hid = client.post("/api/handoffs", json={"outgoing_id": "maya", "incoming_id": "jordan"},
                      headers=H("maya")).json()["id"]
    analyzer.push(Extraction(items=[
        EI(kind="maintenance", title="Generator 1 maintenance", asset_id="GEN-1", facts=[
            EF("work_status", "Complete", "confirmed", "Generator 1 maintenance is complete", "complete"),
        ]),
        EI(kind="testing", title="UPS-B testing", asset_id="UPS-B", facts=[
            EF("work_status", "Pending", "confirmed", "UPS-B testing is still pending", "pending"),
            EF("vendor_return", "9 AM", "confirmed", "Vendor returns at 9 AM"),
            EF("owner", "Shift B lead", "confirmed", "Shift B lead will follow up"),
        ]),
    ]))
    _say(hid, "Generator 1 maintenance is complete. UPS-B testing is still pending. "
              "Vendor returns at 9 AM, and Shift B lead will follow up.", analyzer)
    detail = client.get(f"/api/handoffs/{hid}").json()
    q = _pending(detail)
    assert q["slots"] == ["operational_clearance"]

    answer = "No, UPS-B is not cleared until the vendor signs off."
    analyzer.push(Extraction(items=[
        EI(kind="testing", title="UPS-B testing", asset_id="UPS-B", link_item_id=_item(detail, asset="UPS-B")["id"], facts=[
            EF("operational_clearance", "Not cleared", "confirmed", "UPS-B is not cleared until the vendor signs off",
               "not_cleared"),
        ]),
    ]))
    r = client.post(f"/api/handoffs/{hid}/questions/{q['id']}/answer", json={"text": answer}, headers=H("maya"))
    assert r.status_code == 200, r.text

    detail = r.json()
    assert detail["state"] == "in_review" and detail["budget"]["used"] == 1
    skipped = {s for n in detail["not_asked"] if n["reason"] == "statement was clear" for s in n["slots"]}
    assert {"remaining_work", "next_action", "rationale"} <= skipped
