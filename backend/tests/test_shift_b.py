"""Shift B end to end (demo/scenario.json steps 7-12) with scripted grading, plus language rules."""
import pytest

from app import clock
from app.handoff.analyzer import Grade
from app.handoff.language import ensure_clearance_sentence, violations
from tests.conftest import make_fact, make_item, view
from tests.test_handoff_service import H, STEP, _item, env, run_to_review  # noqa: F401  (env is a fixture)


def submitted(client, analyzer):
    hid, r = run_to_review(client, analyzer)
    clock.set_now(STEP[6]["at"])
    for it in r["d5"]["items"]:
        if it["priority"] == "critical":
            for f in it["facts"]:
                if f["review_state"] == "ai_extracted":
                    client.patch(f"/api/facts/{f['id']}", json={"review_state": "operator_confirmed"}, headers=H("maya"))
    client.post(f"/api/handoffs/{hid}/review/confirm-routine", headers=H("maya"))
    d = client.post(f"/api/handoffs/{hid}/submit", headers=H("maya")).json()
    assert d["state"] == "submitted"
    return hid, d


def fact_id(item, slot):
    return next(f["id"] for f in item["facts"] if f["slot"] == slot)


def to_verifying(client, analyzer):
    hid, d = submitted(client, analyzer)
    clock.set_now(STEP[7]["at"])
    client.get(f"/api/handoffs/{hid}/briefing", headers=H("jordan"))
    clock.set_now(STEP[8]["at"])
    client.post(f"/api/handoffs/{hid}/acknowledge", headers=H("jordan"))
    clock.set_now(STEP[9]["at"])
    start = client.post(f"/api/handoffs/{hid}/verification/start", headers=H("jordan")).json()
    return hid, d, start


def test_briefing_order_and_lines(env):
    client, analyzer = env
    hid, d = submitted(client, analyzer)
    clock.set_now(STEP[7]["at"])
    assert client.get(f"/api/handoffs/{hid}/briefing").status_code == 200
    b = client.get(f"/api/handoffs/{hid}/briefing", headers=H("jordan")).json()
    titles = [it["title"] for it in b["items"]]
    ups, chl, gc, crac, gen = (_item(d, asset="UPS-B"), _item(d, asset="CHL-2"), _item(d, kind="general_claim"),
                               _item(d, asset="CRAC-3"), _item(d, asset="GEN-1"))
    assert [it["id"] for it in b["items"]] == [ups["id"], chl["id"], gc["id"], crac["id"], gen["id"]], titles
    text = " ".join(line["text"] for line in b["lines"]).lower()
    for must in ["ups-b", "not cleared", "load test", "battery module", "chiller 2", "unknown", "owner to be assigned"]:
        assert must in text, must
    for never in ["ups-b complete", "cleared for", "safe"]:
        assert never not in text, never
    assert b["disclaimer"]
    assert all(line["item_id"] != gen["id"] for line in b["lines"])  # routine item stays collapsed


def test_briefing_before_submit_is_409(env):
    client, analyzer = env
    hid, _ = run_to_review(client, analyzer)
    r = client.get(f"/api/handoffs/{hid}/briefing", headers=H("jordan"))
    assert r.status_code == 409


def test_full_shift_b_flow(env):
    client, analyzer = env
    hid, d = submitted(client, analyzer)
    ups, chl = _item(d, asset="UPS-B"), _item(d, asset="CHL-2")

    # Step 7-8: briefing, then acknowledgment (not verification)
    clock.set_now(STEP[7]["at"])
    client.get(f"/api/handoffs/{hid}/briefing", headers=H("jordan"))
    clock.set_now(STEP[8]["at"])
    assert client.post(f"/api/handoffs/{hid}/acknowledge", headers=H("maya")).status_code == 403
    d8 = client.post(f"/api/handoffs/{hid}/acknowledge", headers=H("jordan")).json()
    assert d8["state"] == "acknowledged" and d8["acknowledged_at"] and d8["verified_at"] is None
    [chl_fu] = [fu for fu in d8["followups"] if fu["item_id"] == chl["id"]]
    d8 = client.patch(f"/api/followups/{chl_fu['id']}", json={"owner_id": "jordan", "deadline": "2026-11-08T16:00:00Z"},
                      headers=H("jordan")).json()

    # Step 9: wrong answer. The grader is soft; the floor makes it inconsistent.
    clock.set_now(STEP[9]["at"])
    start = client.post(f"/api/handoffs/{hid}/verification/start", headers=H("jordan")).json()
    assert start["state"] == "verifying"
    v1 = start["check"]
    assert v1["item_id"] == ups["id"] and "answer_key" not in v1
    analyzer.push_grade(Grade(verdict="partially_consistent", missing_fact_ids=[fact_id(ups, "remaining_work")],
                              contradictions=[{"fact_id": fact_id(ups, "work_status"), "claimed": "maintenance is complete"}],
                              misconception="treated_incomplete_as_complete"))
    a1 = client.post(f"/api/verification/{v1['id']}/answer", json={"text": STEP[9]["text"]}, headers=H("jordan")).json()
    assert a1["verdict"] == "inconsistent" and a1["misconception"] == "treated_incomplete_as_complete"
    fb = a1["feedback"].lower()
    for must in ["inconsistent with the handoff", "incomplete", "authorized procedures"]:
        assert must in fb, must
    assert "you may proceed" not in fb and "safe" not in fb
    stmts = {s["id"]: s for s in d["statements"]}
    ev_texts = [stmts[e["statement_id"]]["text"] for e in a1["evidence"]]
    for n in (2, 3, 4):
        assert STEP[n]["text"] in ev_texts, n
    assert a1["status"] == "pending" and a1["next_check"]["id"] == v1["id"]

    # Step 10: second attempt correct
    clock.set_now(STEP[10]["at"])
    analyzer.push_grade(Grade(verdict="consistent", conveyed_fact_ids=[fact_id(ups, "work_status")]))
    a2 = client.post(f"/api/verification/{v1['id']}/answer", json={"text": STEP[10]["text"]}, headers=H("jordan")).json()
    assert (a2["verdict"], a2["status"], a2["attempt"]) == ("consistent", "verified", 2)
    v2 = a2["next_check"]
    assert v2["item_id"] == chl["id"]

    # Step 11: Chiller 2, right first time → handoff verified
    clock.set_now(STEP[11]["at"])
    analyzer.push_grade(Grade(verdict="consistent"))
    a3 = client.post(f"/api/verification/{v2['id']}/answer", json={"text": STEP[11]["text"]}, headers=H("jordan")).json()
    assert a3["attempt"] == 1 and a3["handoff_state"] == "verified" and a3["next_check"] is None
    d11 = client.get(f"/api/handoffs/{hid}").json()
    assert d11["state"] == "verified"
    assert d11["status_line"]["open_followups"] == 3 and d11["status_line"]["unassigned_followups"] == 1
    m = d11["metrics"]
    assert m["verification_first_attempt_rate"] == 0.5 and m["misunderstandings_caught"] == 1
    assert m["shift_b_seconds"] == 240
    assert [len(c["attempts"]) for c in d11["checks"]] == [2, 1]
    # Verification closed nothing.
    assert all(fu["status"] == "open" for fu in d11["followups"])

    # Step 12: supervisor assigns UPS-B
    clock.set_now(STEP[12]["at"])
    assert client.get("/api/supervisor/summary").json()["followups"]["unassigned"] == 1
    [ups_fu] = [fu for fu in d11["followups"] if fu["item_id"] == ups["id"]]
    d12 = client.patch(f"/api/followups/{ups_fu['id']}", json={"owner_id": "sam", "deadline": "2026-11-09T15:00:00Z"},
                       headers=H("dana")).json()
    [ups_fu] = [fu for fu in d12["followups"] if fu["item_id"] == ups["id"]]
    assert ups_fu["assigned_by"]["id"] == "dana"
    assert client.get("/api/supervisor/summary").json()["followups"]["unassigned"] == 0


def test_two_misses_then_clarified_in_person(env):
    client, analyzer = env
    hid, d, start = to_verifying(client, analyzer)
    ups = _item(d, asset="UPS-B")
    v1 = start["check"]
    wrong = Grade(verdict="inconsistent", contradictions=[{"fact_id": fact_id(ups, "work_status"), "claimed": "done"}])
    for _ in range(2):
        analyzer.push_grade(wrong)
        a = client.post(f"/api/verification/{v1['id']}/answer", json={"text": "It's done."}, headers=H("jordan")).json()
    assert a["status"] == "needs_clarification"
    assert client.post(f"/api/verification/{v1['id']}/answer", json={"text": "again"},
                       headers=H("jordan")).status_code == 409
    body = {"note": "Talked with Maya; load test still pending"}
    assert client.post(f"/api/verification/{v1['id']}/clarified-in-person", json=body,
                       headers=H("sam")).status_code == 403
    d2 = client.post(f"/api/verification/{v1['id']}/clarified-in-person", json=body, headers=H("dana")).json()
    assert d2["state"] == "verifying"  # the Chiller 2 check is still open
    v2 = [c for c in d2["checks"] if c["status"] == "pending"][0]
    analyzer.push_grade(Grade(verdict="consistent"))
    a = client.post(f"/api/verification/{v2['id']}/answer", json={"text": "ok"}, headers=H("jordan")).json()
    assert a["handoff_state"] == "verified_with_assistance"


def test_grader_failure_records_no_attempt(env):
    client, analyzer = env
    hid, d, start = to_verifying(client, analyzer)
    r = client.post(f"/api/verification/{start['check']['id']}/answer", json={"text": "x"}, headers=H("jordan"))
    assert r.status_code == 422 and r.json()["detail"]["code"] == "analysis_failed"
    d2 = client.get(f"/api/handoffs/{hid}").json()
    assert d2["checks"][0]["attempts"] == [] and d2["state"] == "verifying"


def test_only_incoming_answers_and_hallucinated_ids_ignored(env):
    client, analyzer = env
    hid, d, start = to_verifying(client, analyzer)
    vid = start["check"]["id"]
    assert client.post(f"/api/verification/{vid}/answer", json={"text": "x"}, headers=H("maya")).status_code == 403
    # The grader cites a fact that isn't in the key: ignored, so no contradiction, verdict stays consistent.
    analyzer.push_grade(Grade(verdict="consistent", contradictions=[{"fact_id": "F-9999", "claimed": "?"}]))
    a = client.post(f"/api/verification/{vid}/answer", json={"text": "fine"}, headers=H("jordan")).json()
    assert a["verdict"] == "consistent" and a["contradictions"] == []


def test_cannot_verify_before_acknowledge(env):
    client, analyzer = env
    hid, d = submitted(client, analyzer)
    assert client.post(f"/api/handoffs/{hid}/verification/start", headers=H("jordan")).status_code == 409


# ---------- language rules ----------

def _ups_view(normalized="incomplete", certainty="unverified"):
    ups = make_item("vendor_work", "UPS-B maintenance", ["UPS-B"])
    return view(ups, make_fact(ups, "work_status", "x", certainty, "UPS-B maintenance is mostly finished",
                               normalized=normalized))


@pytest.mark.parametrize("text,bad", [
    ("UPS-B is cleared for testing.", True),
    ("UPS-B is not cleared until the vendor signs off.", False),
    ("Maintenance is complete.", True),
    ("Maintenance remains incomplete.", False),
    ("You may proceed with testing.", True),
    ("It is safe to operate.", True),
    ("It hasn't been cleared.", False),
])
def test_language_violations(text, bad):
    assert bool(violations(text, [_ups_view()])) is bad


def test_confirmed_completion_allows_the_word():
    v = _ups_view(normalized="complete", certainty="confirmed")
    assert violations("Maintenance is complete.", [v]) == []
    assert violations("You may proceed.", [v])  # never_say always applies


def test_clearance_sentence_added():
    out = ensure_clearance_sentence("That interpretation is inconsistent with the handoff", [_ups_view()])
    assert "must be verified through authorized procedures" in out
