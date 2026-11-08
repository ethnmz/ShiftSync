from datetime import datetime, timezone

import pytest

from app.followups.rules import (FollowUpError, FollowUpPermissionError, assign, close, counts, owner_from_quote,
                                 owner_label, sync_followups)
from app.handoff.priority import compute_priority
from app.models import FollowUp
from tests.conftest import make_fact, make_item, view

NOW = datetime(2026, 11, 8, 13, 1, tzinfo=timezone.utc)


def _ids():
    n = iter(range(1, 100))
    return lambda: f"FU-{next(n):04d}"


def _fu(item_id="I-1"):
    return FollowUp(id="FU-0001", item_id=item_id, handoff_id="H-0001", description="d", missing_information="m")


def test_auto_created_for_uncertain_critical_items_only(step2):
    created = sync_followups(step2["views"], [], "H-0001", _ids())
    items = {fu.item_id for fu in created}
    assert items == {step2["ups"].id, step2["cool"].id}  # not GEN-1 (routine), not the general claim
    assert all(fu.owner_id is None and fu.deadline is None for fu in created)
    assert all(owner_label(fu) == "To be assigned" for fu in created)


def test_inspection_followup_mentions_report(step2):
    created = sync_followups(step2["views"], [], "H-0001", _ids())
    [cool] = [fu for fu in created if fu.item_id == step2["cool"].id]
    assert "report" in cool.missing_information.lower()


def test_sync_is_idempotent_and_never_closes(step2):
    first = sync_followups(step2["views"], [], "H-0001", _ids())
    for fu in first:
        fu.owner_id = "jordan"
    again = sync_followups(step2["views"], first, "H-0001", _ids())
    assert again == []
    assert all(fu.status == "open" and fu.owner_id == "jordan" for fu in first)


def test_followup_uses_stated_verification_requirement():
    ups = make_item("vendor_work", "UPS-B maintenance", ["UPS-B"])
    ws = make_fact(ups, "work_status", "Incomplete", "confirmed", "the load test is not done", normalized="incomplete")
    rv = make_fact(ups, "required_verification", "Vendor finishes load test and signs off", "confirmed",
                   "not cleared until the vendor finishes the load test and signs off")
    v = view(ups, ws, rv)
    assert compute_priority(v)[0] == "critical"
    [fu] = sync_followups([v], [], "H-0001", _ids())
    assert fu.missing_information == "Vendor finishes load test and signs off"


def test_lead_and_supervisor_can_assign():
    fu = assign(_fu(), "jordan", "jordan", NOW, NOW)
    assert (fu.owner_id, fu.assigned_by, fu.assigned_at) == ("jordan", "jordan", NOW)
    fu = assign(_fu(), "dana", "sam", None, NOW)
    assert fu.assigned_by == "dana"


def test_tech_cannot_assign():
    with pytest.raises(FollowUpPermissionError):
        assign(_fu(), "sam", "sam", None, NOW)


def test_owner_must_be_on_roster():
    with pytest.raises(FollowUpError):
        assign(_fu(), "jordan", "nobody", None, NOW)
    with pytest.raises(FollowUpError):
        assign(_fu(), "jordan", "dave_smith", None, NOW)  # vendor


def test_owner_from_quote_requires_the_words():
    assert owner_from_quote("Shift B lead", "Shift B lead will follow up", "jordan") == "jordan"
    assert owner_from_quote("Rob", "Rob is calling the controls tech", "jordan") == "rob"
    assert owner_from_quote("Rob", "someone will call the controls tech", "jordan") is None  # not in quote
    assert owner_from_quote("the vendor", "the vendor will handle it", "jordan") is None  # not a roster person
    assert owner_from_quote(None, "anything", "jordan") is None


def test_close_needs_statement():
    with pytest.raises(FollowUpError):
        close(_fu(), "jordan", None, NOW)
    fu = close(_fu(), "jordan", "S-0009", NOW)
    assert fu.status == "closed" and fu.closure_statement_id == "S-0009"


def test_counts():
    a = _fu("I-1")
    b = _fu("I-2")
    b.owner_id, b.deadline = "jordan", datetime(2026, 11, 8, 12, 0, tzinfo=timezone.utc)
    c = _fu("I-3")
    c.status = "closed"
    assert counts([a, b, c], NOW) == {"open": 2, "unassigned": 1, "overdue": 1}
