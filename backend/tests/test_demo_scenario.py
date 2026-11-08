"""Replays demo/scenario.json through POST /api/demo/step/{n} (offline fixtures) and
checks each step's `expect` block. Run after every rule or prompt change.
"""
import pytest
from fastapi.testclient import TestClient

from app import db
from app.demo.seed import load_scenario, reset
from app.main import create_app

SCEN = load_scenario()


@pytest.fixture(scope="module")
def replay():
    reset("sqlite://")
    app = create_app()
    out = {}
    with TestClient(app) as client:
        for step in SCEN["steps"]:
            r = client.post(f"/api/demo/step/{step['n']}")
            assert r.status_code == 200, (step["n"], r.text)
            out[step["n"]] = r.json()
        yield out
    db.get_engine("sqlite://")  # leave a fresh engine for other modules


def _items(d, asset=None, kind=None, mention=None):
    found = []
    for it in d["items"]:
        if asset and asset not in it["asset_ids"]:
            continue
        if kind and it["kind"] != kind:
            continue
        if mention and mention.lower() not in it["title"].lower():
            continue
        found.append(it)
    return found


def _match_item(d, spec):
    if spec.get("asset"):
        cands = _items(d, asset=spec["asset"], kind=spec.get("kind"))
    elif spec.get("asset_mention_contains"):
        cands = _items(d, kind=spec.get("kind"), mention=spec["asset_mention_contains"].split()[-1])
    else:
        cands = _items(d, kind=spec.get("kind"))
    assert cands, spec
    return cands[0]


def _check_fact(item, fs):
    cands = [f for f in item["facts"] if "slot" not in fs or f["slot"] == fs["slot"]]
    assert cands, (item["title"], fs)
    f = cands[-1]
    if "normalized" in fs:
        assert f["normalized"] == fs["normalized"], (item["title"], fs, f)
    if "certainty" in fs:
        assert f["certainty"] == fs["certainty"], (item["title"], fs, f)
    if "floor_term" in fs:
        assert fs["floor_term"] in (f["certainty_reason"] or ""), (fs, f)
    if "value_contains" in fs:
        assert fs["value_contains"].lower() in (f["value"] or "").lower(), (fs, f)


def test_step1_carry_over(replay):
    exp, d = SCEN["steps"][0]["expect"], replay[1]["handoff"]
    assert d["state"] == exp["state"]
    for asset in exp["carried_over_items"]:
        assert _items(d, asset=asset)[0]["carried_over_from"]


def test_step2_analysis(replay):
    exp, d = SCEN["steps"][1]["expect"], replay[2]["handoff"]
    assert d["state"] == exp["state"]
    for spec in exp["items"]:
        it = _match_item(d, spec)
        assert it["priority"] == spec["priority"], (spec, it["priority"])
        for fs in spec.get("facts", []):
            _check_fact(it, fs)
    ups = _items(d, asset="UPS-B")[0]
    assert all(f["certainty"] != "confirmed" for f in ups["facts"] if f["slot"] in ("work_status", "operational_clearance"))
    assert all(f["certainty"] != "confirmed" for f in _items(d, asset="GEN-1")[0]["facts"] if f["slot"] == "condition")
    own = [fu for fu in d["followups"] if not _items(d, asset="CRAC-3") or fu["item_id"] != _items(d, asset="CRAC-3")[0]["id"]]
    assert all(fu["owner"] is None and fu["deadline"] is None for fu in own)
    [q] = [q for q in d["questions"] if q["status"] == "pending"]
    first = exp["gaps_top3_in_order"][0]
    assert q["item_id"] == ups["id"] and q["gap_type"] == first["type"] and q["slots"] == first["slots"]


def test_steps3_to_5_questions(replay):
    q2 = replay[4]["question_shown"]
    assert "clear" in q2.lower() or "normal operation" in q2.lower()
    for n in (3, 4, 5):
        exp, d = SCEN["steps"][n - 1]["expect"], replay[n]["handoff"]
        for fs in exp.get("facts", []):
            _check_fact(_items(d, asset="UPS-B" if fs["item"] == "UPS-B" else fs["item"])[0], fs)
        for spec in exp.get("items", []):
            it = _match_item(d, spec)
            for fs in spec["facts"]:
                _check_fact(it, fs)
        for fc in exp.get("followups_created", []):
            it = _items(d, asset=fc["item"] if fc["item"] != "UPS-B" else "UPS-B")[0]
            [fu] = [fu for fu in d["followups"] if fu["item_id"] == it["id"]]
            assert fu["owner_label"] == fc["owner_label"]
            if "missing_information_contains" in fc:
                assert fc["missing_information_contains"] in fu["missing_information"].lower()
    exp5, d5 = SCEN["steps"][4]["expect"], replay[5]["handoff"]
    assert d5["state"] == exp5["state"] and d5["budget"]["used"] == exp5["budget_used"]
    not_asked = {(n["item_id"], s) for n in d5["not_asked"] for s in n["slots"]}
    for na in exp5["not_asked_includes"]:
        it = _items(d5, kind="general_claim")[0] if na["item"] == "general_claim" else _items(d5, asset=na["item"])[0]
        assert (it["id"], na["slot"]) in not_asked, na


def test_step6_submit(replay):
    exp, d = SCEN["steps"][5]["expect"], replay[6]["handoff"]
    assert d["state"] == exp["state"]
    own = [it for it in d["items"] if not it["carried_over_from"]]
    assert all(f["review_state"] == "operator_confirmed" for it in own for f in it["facts"])
    before = {f["id"]: f["certainty"] for it in replay[5]["handoff"]["items"] for f in it["facts"]}
    after = {f["id"]: f["certainty"] for it in d["items"] for f in it["facts"]}
    assert after == before  # certainties_unchanged
    assert d["metrics"]["clarification_questions_asked"] == exp["metrics"]["clarification_questions_asked"]
    assert d["metrics"]["shift_a_seconds"] <= exp["metrics"]["shift_a_seconds_max"]


def test_step7_briefing(replay):
    exp, b, d = SCEN["steps"][6]["expect"], replay[7]["briefing"], replay[7]["handoff"]
    want = []
    for label in exp["order"]:
        if label == "general_claim":
            want.append(_items(d, kind="general_claim")[0]["id"])
        else:
            want.append(_items(d, asset=label.split()[0])[0]["id"])
    assert [it["id"] for it in b["items"]] == want
    text = " ".join(line["text"] for line in b["lines"]).lower()
    for s in exp["lines_contain"]:
        assert s.lower() in text, s
    for s in exp["lines_must_not_contain"]:
        assert s.lower() not in text, s
    assert bool(b["disclaimer"]) == exp["disclaimer_present"]


def test_step8_acknowledge_and_assign(replay):
    exp, d = SCEN["steps"][7]["expect"], replay[8]["handoff"]
    assert d["state"] == exp["state"] and d["verified_at"] is None
    chl = _items(d, asset="CHL-2")[0]
    [fu] = [fu for fu in d["followups"] if fu["item_id"] == chl["id"]]
    assert fu["owner"]["id"] == exp["followup_assigned"]["owner"]
    assert fu["assigned_by"]["id"] == exp["followup_assigned"]["assigned_by"]


def test_step9_misunderstanding_caught(replay):
    exp, a, d = SCEN["steps"][8]["expect"], replay[9]["attempt"], replay[9]["handoff"]
    assert replay[9]["question_shown"] == SCEN["steps"][8]["question_shown"]
    assert a["verdict"] == exp["verdict"] and a["misconception"] == exp["misconception"]
    fb = a["feedback"].lower()
    for s in exp["feedback_contains"]:
        assert s.lower() in fb, s
    for s in exp["feedback_must_not_contain"]:
        assert s.lower() not in fb, s
    stmts = {s["id"]: s for s in d["statements"]}
    ev = {stmts[e["statement_id"]]["text"] for e in a["evidence"]}
    for ref in exp["evidence_quotes_from"]:
        n = int(ref.split("step ")[1].rstrip(")"))
        assert SCEN["steps"][n - 1]["text"] in ev, ref


def test_step10_second_attempt(replay):
    exp, a = SCEN["steps"][9]["expect"], replay[10]["attempt"]
    assert (a["verdict"], a["status"], a["attempt"]) == (exp["verdict"], exp["check_status"], exp["attempts"])


def test_step11_verified(replay):
    exp, a, d = SCEN["steps"][10]["expect"], replay[11]["attempt"], replay[11]["handoff"]
    assert replay[11]["question_shown"] == SCEN["steps"][10]["question_shown"]
    assert a["verdict"] == exp["verdict"] and a["attempt"] == exp["attempts"]
    assert d["state"] == exp["state"]
    assert d["status_line"]["open_followups"] == exp["status_line"]["open_followups"]
    assert d["status_line"]["unassigned_followups"] == exp["status_line"]["unassigned_followups"]
    for k, v in exp["metrics"].items():
        assert d["metrics"][k] == v, k


def test_step12_supervisor(replay):
    exp, r = SCEN["steps"][11]["expect"], replay[12]
    assert r["before"]["unassigned"] == exp["before"]["unassigned"]
    assert r["after"]["unassigned"] == exp["after"]["unassigned"]
    ups = _items(r["handoff"], asset="UPS-B")[0]
    [fu] = [fu for fu in r["handoff"]["followups"] if fu["item_id"] == ups["id"]]
    assert fu["assigned_by"]["id"] == exp["assigned_by"]
