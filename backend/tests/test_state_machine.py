from datetime import datetime, timezone

import pytest

from app.briefing.select import briefing_order, collapsed
from app.handoff.state import ActorError, TransitionError, authorize, submit_blockers, transition, verification_outcome
from app.models import Handoff, VerificationCheck
from tests.conftest import make_fact, make_item, question, view


def _handoff(state="draft"):
    return Handoff(id="H-0001", outgoing_id="maya", incoming_id="jordan", state=state,
                   created_at=datetime(2026, 11, 8, 12, 35, tzinfo=timezone.utc))


def test_happy_path():
    s = transition("draft", "statement_added")
    assert s == "analyzing"
    s = transition(s, "analysis_done", has_pending_question=True)
    assert s == "clarifying"
    s = transition(transition(s, "statement_added"), "analysis_done", has_pending_question=False)
    assert s == "in_review"
    s = transition(s, "submit")
    s = transition(s, "acknowledge")
    assert s == "acknowledged"
    s = transition(s, "start_verification")
    checks = [VerificationCheck(id="V-1", handoff_id="H-0001", item_id="I-1", status="verified")]
    assert transition(s, "verification_done", checks=checks) == "verified"


def test_acknowledge_is_not_verification():
    assert transition("submitted", "acknowledge") == "acknowledged"
    with pytest.raises(TransitionError):
        transition("acknowledged", "verification_done", checks=[])


@pytest.mark.parametrize("state,event", [
    ("draft", "submit"), ("clarifying", "submit"), ("in_review", "acknowledge"),
    ("submitted", "start_verification"), ("submitted", "statement_added"), ("verified", "acknowledge"),
])
def test_illegal_transitions(state, event):
    with pytest.raises(TransitionError):
        transition(state, event)


def test_analysis_failure_returns_to_previous_state():
    assert transition("analyzing", "analysis_failed", previous_state="clarifying") == "clarifying"


def test_verification_outcomes():
    v = lambda st: VerificationCheck(id="V", handoff_id="H", item_id="I", status=st)  # noqa: E731
    assert verification_outcome([]) is None
    assert verification_outcome([v("verified"), v("pending")]) is None
    assert verification_outcome([v("verified"), v("verified")]) == "verified"
    assert verification_outcome([v("verified"), v("clarified_in_person")]) == "verified_with_assistance"


def test_actor_rules():
    h = _handoff()
    authorize(h, "submit", "maya")
    authorize(h, "acknowledge", "jordan")
    authorize(h, "clarified_in_person", "dana")
    with pytest.raises(ActorError):
        authorize(h, "submit", "jordan")
    with pytest.raises(ActorError):
        authorize(h, "acknowledge", "maya")
    with pytest.raises(ActorError):
        authorize(h, "clarified_in_person", "sam")  # a tech


def test_submit_blocked_by_unreviewed_critical_fact_and_pending_safety_question(step2):
    views, ups = step2["views"], step2["ups"]
    q = question(ups, "missing_required", ["operational_clearance"], status="pending")
    blockers = submit_blockers(views, [q])
    assert any(b["code"] == "unreviewed_critical_fact" and b["fact_id"] for b in blockers)
    assert any(b["code"] == "pending_safety_question" and b["question_id"] == q.id for b in blockers)

    for v in views:
        for f in v.facts:
            f.review_state = "operator_confirmed"
    q.status = "answered_unknown"  # "I don't know" resolves it
    assert submit_blockers(views, [q]) == []


def test_unassigned_followup_does_not_block_submit(step2):
    for v in step2["views"]:
        for f in v.facts:
            f.review_state = "operator_confirmed"
    # No follow-up owner anywhere; still nothing blocks.
    assert submit_blockers(step2["views"], []) == []


def test_non_safety_pending_question_does_not_block(step2):
    for v in step2["views"]:
        for f in v.facts:
            f.review_state = "operator_confirmed"
    q = question(step2["gc"], "unscoped_claim", ["scope"], status="pending")
    assert submit_blockers(step2["views"], [q]) == []


def test_briefing_order_matches_demo(step2):
    ups, gen, cool, gc = step2["views"]
    crac = make_item("maintenance", "CRAC 3 recalibration", ["CRAC-3"], origin="I-0099")
    v_crac = view(crac, make_fact(crac, "work_status", "Pending", "confirmed", "CRAC 3 still needs recalibration",
                                  normalized="pending"))
    order = briefing_order([v_crac, gen, ups, gc, cool])
    assert [v.id for v in order] == [ups.id, cool.id, gc.id, crac.id, gen.id]
    assert collapsed(gen) and not collapsed(ups)
