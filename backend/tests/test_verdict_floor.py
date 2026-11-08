from app.models import FollowUp
from app.verify.answer_key import build_answer_key, select_items
from app.verify.floor import check_status, floor_verdict
from tests.conftest import make_fact, make_item, view


def _ups():
    ups = make_item("vendor_work", "UPS-B maintenance", ["UPS-B"])
    ws = make_fact(ups, "work_status", "Mostly finished", "unverified", "UPS-B maintenance is mostly finished",
                   normalized="incomplete")
    rw = make_fact(ups, "remaining_work", "Final load test", "confirmed", "couldn't do the final load test")
    rat = make_fact(ups, "rationale", "Battery module didn't arrive", "confirmed",
                    "The replacement battery module didn't arrive")
    oc = make_fact(ups, "operational_clearance", "Not cleared", "confirmed", "It's still in maintenance bypass",
                   normalized="not_cleared")
    return view(ups, ws, rw, rat, oc), {"ws": ws, "rw": rw, "rat": rat, "oc": oc}


def test_answer_key_marks_safety_facts_critical():
    v, f = _ups()
    key = build_answer_key(v)
    crit = {e["fact_id"] for e in key["must_convey"] if e["critical"]}
    assert crit == {f["ws"].id, f["oc"].id}
    assert "the work is complete" in key["must_not_claim"]
    assert "the equipment is cleared for normal operation" in key["must_not_claim"]
    assert "work status is confirmed" in key["must_not_claim"]


def test_owner_only_in_key_once_assigned():
    v, _ = _ups()
    fu = FollowUp(id="FU-0001", item_id=v.id, handoff_id="H-0001", description="d", missing_information="m")
    assert not [e for e in build_answer_key(v, fu)["must_convey"] if e["slot"] == "owner"]
    fu.owner_id = "jordan"
    [owner] = [e for e in build_answer_key(v, fu)["must_convey"] if e["slot"] == "owner"]
    assert "Jordan Blake" in owner["statement"] and not owner["critical"]


def test_contradicting_critical_fact_is_inconsistent_even_if_grader_says_consistent():
    v, f = _ups()
    key = build_answer_key(v)
    verdict, reason = floor_verdict("consistent", [{"fact_id": f["ws"].id, "claimed": "maintenance is complete"}],
                                    [], key)
    assert verdict == "inconsistent" and reason == "contradiction_of_critical_fact"


def test_missing_critical_fact_caps_at_partial():
    v, f = _ups()
    key = build_answer_key(v)
    assert floor_verdict("consistent", [], [f["oc"].id], key) == ("partially_consistent", "missing_critical_fact")


def test_missing_noncritical_fact_keeps_consistent():
    v, f = _ups()
    key = build_answer_key(v)
    assert floor_verdict("consistent", [], [f["rat"].id], key) == ("consistent", None)


def test_floor_never_raises():
    v, _ = _ups()
    assert floor_verdict("inconsistent", [], [], build_answer_key(v))[0] == "inconsistent"


def test_unusable_grade_is_partial_not_consistent():
    v, _ = _ups()
    assert floor_verdict(None, [], [], build_answer_key(v)) == ("partially_consistent", "grader_unsure")


def test_check_status_two_attempts_then_needs_clarification():
    v, f = _ups()
    key = build_answer_key(v)
    contra = [{"fact_id": f["ws"].id, "claimed": "complete"}]
    assert check_status("inconsistent", [], contra, key, attempt_no=1) == "pending"
    assert check_status("inconsistent", [], contra, key, attempt_no=2) == "needs_clarification"
    assert check_status("consistent", [], [], key, attempt_no=2) == "verified"


def test_partial_with_only_noncritical_missing_is_verified():
    v, f = _ups()
    key = build_answer_key(v)
    assert check_status("partially_consistent", [f["rat"].id], [], key, attempt_no=1) == "verified"
    assert check_status("partially_consistent", [f["oc"].id], [], key, attempt_no=1) == "pending"


def test_select_items_matches_demo(step2):
    views = step2["views"]
    carried = make_item("maintenance", "CRAC 3 recalibration", ["CRAC-3"], origin="I-0099")
    cf = make_fact(carried, "work_status", "Pending", "confirmed", "CRAC 3 still needs recalibration",
                   normalized="pending")
    chosen = select_items(views + [view(carried, cf)])
    assert [v.id for v in chosen] == [step2["ups"].id, step2["cool"].id]
