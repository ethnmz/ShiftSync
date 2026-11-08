from app.clarify.gaps import find_gaps
from tests.conftest import make_fact, make_item, question, view


def _by(gaps, item, gap_type):
    return [g for g in gaps if g.item_id == item.id and g.gap_type == gap_type]


def test_priorities_after_step2(step2):
    assert [v.priority for v in step2["views"]] == ["critical", "routine", "critical", "important"]


def test_vague_ups_asks_what_remains_and_why(step2):
    gaps = find_gaps(step2["views"])
    [vague] = _by(gaps, step2["ups"], "vague_statement")
    assert vague.slots == ("remaining_work", "rationale")
    assert vague.target_slot == "work_status"
    # The vague slot does not also produce an uncertain_claim.
    assert not _by(gaps, step2["ups"], "uncertain_claim")


def test_ups_clearance_missing_is_its_own_safety_gap(step2):
    gaps = find_gaps(step2["views"])
    clearance = [g for g in _by(gaps, step2["ups"], "missing_required") if g.slots == ("operational_clearance",)]
    assert clearance and clearance[0].safety


def test_uncertain_inspection_asks_scope_and_status(step2):
    [g] = _by(find_gaps(step2["views"]), step2["cool"], "uncertain_claim")
    assert g.slots == ("equipment_scope", "work_status")


def test_general_claim_is_unscoped(step2):
    [g] = _by(find_gaps(step2["views"]), step2["gc"], "unscoped_claim")
    assert g.slots == ("scope",) and not g.safety


def test_routine_observation_has_no_gaps(step2):
    assert not [g for g in find_gaps(step2["views"]) if g.item_id == step2["gen"].id]


def test_owner_gap_for_open_critical_work(step2):
    [g] = _by(find_gaps(step2["views"]), step2["ups"], "missing_owner_or_deadline")
    assert g.slots == ("owner", "deadline")


def test_answered_slot_is_never_reasked(step2):
    ups = step2["ups"]
    q = question(ups, "vague_statement", ["remaining_work", "rationale"], target="work_status")
    gaps = find_gaps(step2["views"], [q])
    assert not _by(gaps, ups, "vague_statement")
    # The work_status target is covered, so no uncertain_claim appears for it either.
    assert not _by(gaps, ups, "uncertain_claim")


def test_dont_know_counts_as_answered(step2):
    cool = step2["cool"]
    q = question(cool, "uncertain_claim", ["equipment_scope", "work_status"], target="work_status",
                 status="answered_unknown")
    assert not _by(find_gaps(step2["views"], [q]), cool, "uncertain_claim")


def test_not_asked_question_does_not_cover(step2):
    ups = step2["ups"]
    q = question(ups, "vague_statement", ["remaining_work", "rationale"], target="work_status", status="not_asked")
    assert _by(find_gaps(step2["views"], [q]), ups, "vague_statement")


def test_owner_asked_at_most_once(step2):
    ups = step2["ups"]
    q = question(ups, "missing_owner_or_deadline", ["owner"], status="answered_unknown")
    assert not _by(find_gaps(step2["views"], [q]), ups, "missing_owner_or_deadline")


def test_bypass_missing_rationale_and_condition_are_safety_gaps():
    item = make_item("bypass", "UPS-A bypass", ["UPS-A"])
    f = make_fact(item, "current_mode", "Maintenance bypass", "confirmed", "UPS-A is in maintenance bypass")
    gaps = find_gaps([view(item, f)])
    types = {g.gap_type: g for g in gaps}
    assert types["missing_rationale"].safety and types["missing_rationale"].slots == ("rationale",)
    assert types["missing_condition"].safety and types["missing_condition"].slots == ("restore_condition",)


def test_carried_over_items_skipped_unless_mentioned():
    item = make_item("maintenance", "CRAC 3 recalibration", ["CRAC-3"], origin="I-0099")
    f = make_fact(item, "work_status", "Pending", "confirmed", "CRAC 3 still needs recalibration",
                  normalized="pending", statement_id="S-OLD")
    v = view(item, f)
    assert find_gaps([v], statement_ids={"S-0001"}) == []
    f.source_statement_id = "S-0001"
    assert find_gaps([v], statement_ids={"S-0001"})


def test_closed_item_has_no_gaps(step2):
    step2["ups"].open = False
    assert not [g for g in find_gaps(step2["views"]) if g.item_id == step2["ups"].id]
