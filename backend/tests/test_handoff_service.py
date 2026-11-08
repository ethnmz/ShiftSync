"""Shift A flow end to end through the service and routes (demo/scenario.json steps 1-6, 8).

Extraction is scripted (Akshi's extractor isn't wired in yet); everything after
extraction is the real code: quote check, certainty floor, merge, priority,
follow-ups, gaps, planner, state machine, review, submit.
"""
import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session

from app import clock, db
from app.demo.seed import load_scenario, reset
from app.handoff import service
from app.handoff.analyzer import AnalysisError, ExtractedFact as EF, ExtractedItem as EI, Extraction, ScriptedAnalyzer
from app.main import create_app

SCEN = load_scenario()
STEP = {s["n"]: s for s in SCEN["steps"]}


@pytest.fixture
def env():
    reset("sqlite://")
    analyzer = ScriptedAnalyzer()
    app = create_app()
    app.state.analyzer = analyzer
    with TestClient(app) as client:
        yield client, analyzer


def H(user):
    return {"X-User": user}


def _session():
    return Session(db.get_engine())


def _say(hid, text, analyzer, question_id=None, speaker="maya"):
    with _session() as s:
        asyncio.run(service.ingest_statement(s, hid, speaker, text, source="voice_web",
                                             question_id=question_id, analyzer=analyzer))


def _item(detail, *, asset=None, kind=None):
    for it in detail["items"]:
        if (asset is None or asset in it["asset_ids"]) and (kind is None or it["kind"] == kind):
            return it
    raise AssertionError(f"no item asset={asset} kind={kind}")


def _fact(item, slot):
    return next(f for f in item["facts"] if f["slot"] == slot)


def _pending(detail):
    [q] = [q for q in detail["questions"] if q["status"] == "pending"]
    return q


def step2_extraction():
    return Extraction(items=[
        EI(kind="vendor_work", title="UPS-B maintenance", asset_id="UPS-B", asset_mention="UPS-B", facts=[
            # The LLM over-claims "confirmed"; the floor must lower it.
            EF("work_status", "Mostly finished", "confirmed", "UPS-B maintenance is mostly finished", "incomplete"),
            EF("vendor_return", "Vendor returns tomorrow", "confirmed", "The vendor is coming back tomorrow"),
        ]),
        EI(kind="observation", title="Generator 1 condition", asset_id="GEN-1", facts=[
            EF("condition", "Looks good", "confirmed", "Generator 1 looks good"),
        ]),
        EI(kind="inspection", title="Cooling inspection", asset_id=None, asset_mention="the cooling inspection", facts=[
            EF("work_status", "Unknown", "unknown", "I'm not sure what happened with the cooling inspection", "unknown"),
        ]),
    ], unscoped_claims=["everything else should be okay"])


def run_to_review(client, analyzer):
    clock.set_now(STEP[1]["at"])
    r = client.post("/api/handoffs", json={"outgoing_id": "maya", "incoming_id": "jordan"}, headers=H("maya"))
    assert r.status_code == 200, r.text
    d = r.json()
    hid = d["id"]

    clock.set_now(STEP[2]["at"])
    analyzer.push(step2_extraction())
    _say(hid, STEP[2]["text"], analyzer)
    d = client.get(f"/api/handoffs/{hid}").json()
    ups = _item(d, asset="UPS-B")
    q1 = _pending(d)

    clock.set_now(STEP[3]["at"])
    analyzer.push(Extraction(items=[EI(kind="vendor_work", title="UPS-B maintenance", asset_id="UPS-B",
                                       link_item_id=ups["id"], facts=[
        EF("remaining_work", "Final load test", "confirmed", "the vendor couldn't do the final load test"),
        EF("rationale", "Replacement battery module didn't arrive", "confirmed",
           "The replacement battery module didn't arrive"),
    ])]))
    r = client.post(f"/api/handoffs/{hid}/questions/{q1['id']}/answer", json={"text": STEP[3]["text"]},
                    headers=H("maya"))
    assert r.status_code == 200, r.text
    q2 = _pending(r.json())

    clock.set_now(STEP[4]["at"])
    analyzer.push(Extraction(items=[EI(kind="vendor_work", title="UPS-B maintenance", asset_id="UPS-B",
                                       link_item_id=ups["id"], facts=[
        EF("operational_clearance", "Not cleared: in maintenance bypass", "confirmed",
           "It's still in maintenance bypass", "not_cleared"),
        EF("required_verification", "Vendor finishes load test and signs off", "confirmed",
           "It's not cleared until the vendor finishes the load test and signs off"),
    ])]))
    r = client.post(f"/api/handoffs/{hid}/questions/{q2['id']}/answer", json={"text": STEP[4]["text"]},
                    headers=H("maya"))
    d4 = r.json()
    q3 = _pending(d4)
    cool = _item(d4, kind="inspection")

    clock.set_now(STEP[5]["at"])
    analyzer.push(Extraction(items=[EI(kind="inspection", title="Chiller 2 cooling inspection", asset_id="CHL-2",
                                       link_item_id=cool["id"], facts=[
        EF("equipment_scope", "Chiller 2", "confirmed", "It was Chiller 2"),
        EF("work_status", "Unknown; no report received", "confirmed", "I honestly don't know if they finished",
           "unknown"),
    ])]))
    r = client.post(f"/api/handoffs/{hid}/questions/{q3['id']}/answer", json={"text": STEP[5]["text"]},
                    headers=H("maya"))
    return hid, {"d2": d, "q1": q1, "q2": q2, "q3": q3, "d4": d4, "d5": r.json()}


def test_step1_carries_over_crac3(env):
    client, _ = env
    clock.set_now(STEP[1]["at"])
    d = client.post("/api/handoffs", json={"outgoing_id": "maya", "incoming_id": "jordan"}, headers=H("maya")).json()
    assert d["state"] == "draft"
    crac = _item(d, asset="CRAC-3")
    assert crac["carried_over_from"]["item_id"]
    [fu] = d["followups"]
    assert fu["owner"] == {"id": "rob", "name": "Rob Kim"}


def test_second_handoff_does_not_take_followups_from_one_in_progress(env):
    client, analyzer = env
    hid, r = run_to_review(client, analyzer)  # Maya's handoff, still in review
    before = {fu["id"] for fu in client.get(f"/api/handoffs/{hid}").json()["followups"]}
    other = client.post("/api/handoffs", json={"outgoing_id": "maya", "incoming_id": "jordan"},
                        headers=H("maya")).json()
    assert other["followups"] == [] and other["items"] == []
    after = {fu["id"] for fu in client.get(f"/api/handoffs/{hid}").json()["followups"]}
    assert after == before  # UPS-B, CHL-2 and the carried CRAC-3 stay with the handoff being written


def test_shift_a_flow_matches_scenario(env):
    client, analyzer = env
    hid, r = run_to_review(client, analyzer)
    d2 = r["d2"]

    # Step 2
    assert d2["state"] == "clarifying"
    ups = _item(d2, asset="UPS-B")
    assert ups["priority"] == "critical"
    assert _fact(ups, "work_status")["certainty"] == "unverified"
    assert _fact(ups, "work_status")["certainty_reason"] == 'hedge:"mostly"'
    assert "tomorrow" in _fact(ups, "vendor_return")["value"].lower()
    gen = _item(d2, asset="GEN-1")
    assert gen["priority"] == "routine" and _fact(gen, "condition")["certainty"] == "reported"
    cool = _item(d2, kind="inspection")
    assert cool["priority"] == "critical" and _fact(cool, "work_status")["certainty"] == "unknown"
    gc = _item(d2, kind="general_claim")
    assert gc["priority"] == "important" and gc["facts"][0]["certainty"] == "unverified"
    assert all(fu["owner"] is None for fu in d2["followups"] if fu["item_id"] != _item(d2, asset="CRAC-3")["id"])
    assert r["q1"]["gap_type"] == "vague_statement" and r["q1"]["slots"] == ["remaining_work", "rationale"]
    assert "mostly" in r["q1"]["text"].lower()

    # Steps 3-4
    assert r["q2"]["slots"] == ["operational_clearance"]
    assert r["q3"]["item_id"] == cool["id"] and r["q3"]["slots"] == ["equipment_scope", "work_status"]
    ups4 = _item(r["d4"], asset="UPS-B")
    assert _fact(ups4, "operational_clearance")["normalized"] == "not_cleared"
    [ups_fu] = [fu for fu in r["d4"]["followups"] if fu["item_id"] == ups["id"]]
    assert ups_fu["owner_label"] == "To be assigned"
    assert "sign" in ups_fu["missing_information"].lower()

    # Step 5
    d5 = r["d5"]
    assert d5["state"] == "in_review"
    assert d5["budget"] == {"used": 3, "max": 3}
    chl2 = _item(d5, asset="CHL-2")
    assert chl2["id"] == cool["id"]  # the vague mention resolved to Chiller 2
    assert _fact(chl2, "work_status")["certainty"] == "unknown"  # "don't know" floors the over-claim
    [chl_fu] = [fu for fu in d5["followups"] if fu["item_id"] == chl2["id"]]
    assert "report" in chl_fu["missing_information"].lower() and chl_fu["owner_label"] == "To be assigned"
    not_asked = {(n["item_id"], s) for n in d5["not_asked"] for s in n["slots"]}
    assert (gc["id"], "scope") in not_asked and (ups["id"], "owner") in not_asked
    # Nothing in the record claims UPS-B is done or cleared.
    ups5 = _item(d5, asset="UPS-B")
    assert all(f["certainty"] != "confirmed" for f in ups5["facts"] if f["slot"] == "work_status")


def test_submit_blocked_then_review_then_submit(env):
    client, analyzer = env
    hid, r = run_to_review(client, analyzer)

    blocked = client.post(f"/api/handoffs/{hid}/submit", headers=H("maya"))
    assert blocked.status_code == 409
    detail = blocked.json()["detail"]
    assert detail["code"] == "submit_blocked"
    assert detail["blockers"] and all(b["code"] == "unreviewed_critical_fact" for b in detail["blockers"])

    clock.set_now(STEP[6]["at"])
    d = r["d5"]
    before = {f["id"]: f["certainty"] for it in d["items"] for f in it["facts"]}
    for it in d["items"]:
        if it["priority"] == "critical":
            for f in it["facts"]:
                if f["review_state"] == "ai_extracted":
                    rr = client.patch(f"/api/facts/{f['id']}", json={"review_state": "operator_confirmed"},
                                      headers=H("maya"))
                    assert rr.status_code == 200, rr.text
    client.post(f"/api/handoffs/{hid}/review/confirm-routine", headers=H("maya"))
    rr = client.post(f"/api/handoffs/{hid}/submit", headers=H("maya"))
    assert rr.status_code == 200, rr.text
    d6 = rr.json()
    assert d6["state"] == "submitted"
    own = [it for it in d6["items"] if not it["carried_over_from"]]
    assert all(f["review_state"] == "operator_confirmed" for it in own for f in it["facts"])
    assert {f["id"]: f["certainty"] for it in d6["items"] for f in it["facts"]} == before
    assert d6["metrics"]["clarification_questions_asked"] == 3
    assert d6["metrics"]["shift_a_seconds"] <= 300


def test_only_outgoing_can_submit_and_only_leads_assign(env):
    client, analyzer = env
    hid, r = run_to_review(client, analyzer)
    assert client.post(f"/api/handoffs/{hid}/submit", headers=H("jordan")).status_code == 403
    assert client.post(f"/api/handoffs/{hid}/submit", headers=H("nobody")).status_code == 403

    chl2 = _item(r["d5"], asset="CHL-2")
    [fu] = [fu for fu in r["d5"]["followups"] if fu["item_id"] == chl2["id"]]
    body = {"owner_id": "jordan", "deadline": "2026-11-08T16:00:00Z"}
    assert client.patch(f"/api/followups/{fu['id']}", json=body, headers=H("sam")).status_code == 403
    d = client.patch(f"/api/followups/{fu['id']}", json=body, headers=H("jordan")).json()
    [fu2] = [x for x in d["followups"] if x["id"] == fu["id"]]
    assert fu2["owner"]["id"] == "jordan" and fu2["assigned_by"]["id"] == "jordan"
    assert d["status_line"]["unassigned_followups"] == 1  # UPS-B still "To be assigned"


def test_edit_keeps_ai_value_and_history(env):
    client, analyzer = env
    hid, r = run_to_review(client, analyzer)
    vr = _fact(_item(r["d5"], asset="UPS-B"), "vendor_return")
    d = client.patch(f"/api/facts/{vr['id']}", json={"review_state": "operator_edited", "value": "Vendor back 09:00"},
                     headers=H("maya")).json()
    new = _fact(_item(d, asset="UPS-B"), "vendor_return")
    assert new["value"] == "Vendor back 09:00" and new["review_state"] == "operator_edited"
    assert new["ai_proposed_value"] == vr["value"]
    assert new["history"][0]["value"] == vr["value"]


def test_raising_certainty_needs_a_statement(env):
    client, analyzer = env
    hid, r = run_to_review(client, analyzer)
    ws = _fact(_item(r["d5"], asset="UPS-B"), "work_status")
    bad = client.patch(f"/api/facts/{ws['id']}", json={"review_state": "operator_edited", "certainty": "confirmed"},
                       headers=H("maya"))
    assert bad.status_code == 422
    still = client.patch(f"/api/facts/{ws['id']}", json={"review_state": "operator_edited", "certainty": "confirmed",
                                                         "text": "I think the vendor finished"}, headers=H("maya")).json()
    assert _fact(_item(still, asset="UPS-B"), "work_status")["certainty"] == "unverified"


def test_analysis_failure_keeps_statement_and_state(env):
    client, analyzer = env
    clock.set_now(STEP[1]["at"])
    hid = client.post("/api/handoffs", json={"outgoing_id": "maya", "incoming_id": "jordan"},
                      headers=H("maya")).json()["id"]
    with _session() as s, pytest.raises(service.Unprocessable) as e:
        asyncio.run(service.ingest_statement(s, hid, "maya", "UPS-B is mostly finished", analyzer=analyzer))
    assert e.value.code == "analysis_failed"
    d = client.get(f"/api/handoffs/{hid}").json()
    assert d["state"] == "draft" and len(d["statements"]) == 1 and len(d["items"]) == 1  # only CRAC-3


def test_dont_know_records_unknown_and_moves_on(env):
    client, analyzer = env
    clock.set_now(STEP[1]["at"])
    hid = client.post("/api/handoffs", json={"outgoing_id": "maya", "incoming_id": "jordan"},
                      headers=H("maya")).json()["id"]
    analyzer.push(step2_extraction())
    _say(hid, STEP[2]["text"], analyzer)
    q1 = _pending(client.get(f"/api/handoffs/{hid}").json())
    d = client.post(f"/api/handoffs/{hid}/questions/{q1['id']}/answer", json={"dont_know": True},
                    headers=H("maya")).json()
    [answered] = [q for q in d["questions"] if q["id"] == q1["id"]]
    assert answered["status"] == "answered_unknown"
    ups = _item(d, asset="UPS-B")
    assert _fact(ups, "remaining_work")["certainty"] == "unknown"
    assert _pending(d)["id"] != q1["id"]  # next question, never the same one again


def test_unverified_quote_is_dropped(env):
    client, analyzer = env
    clock.set_now(STEP[1]["at"])
    hid = client.post("/api/handoffs", json={"outgoing_id": "maya", "incoming_id": "jordan"},
                      headers=H("maya")).json()["id"]
    analyzer.push(Extraction(items=[EI(kind="vendor_work", title="UPS-B", asset_id="UPS-B", facts=[
        EF("work_status", "Complete", "confirmed", "UPS-B maintenance is complete and signed off", "complete"),
    ])]))
    _say(hid, "UPS-B maintenance is mostly finished.", analyzer)
    d = client.get(f"/api/handoffs/{hid}").json()
    ups = _item(d, asset="UPS-B")
    assert ups["facts"] == []  # the invented "complete" never enters the record
