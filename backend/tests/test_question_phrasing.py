"""Safety questions use code's wording, and a stated "not cleared" is always recorded."""
import asyncio
from types import SimpleNamespace

import pytest

from app.handoff import analyzer
from app.handoff.analyzer import DefaultAnalyzer, Extraction, ExtractedFact, ExtractedItem, add_stated_not_cleared

UPS = {"title": "UPS B maintenance", "kind": "maintenance"}
INSPECTION = {"title": "Cooling inspection", "kind": "inspection"}
EXISTING = [{"id": "I-1", **UPS}]
ASKED = {"question": "Is it cleared?", "item_id": "I-1", "slots": ["operational_clearance"]}
ANSWER = "no, it's still in maintenance bypass, it's not cleared until the vendor finishes the load test and signs off"


def ask(monkeypatch, slots, item=UPS):
    calls = []

    async def fake_complete(*args):
        calls.append(args)
        return SimpleNamespace(text="from the model", why_asked="why")

    monkeypatch.setattr(analyzer, "_complete", fake_complete)
    gap = {"gap_type": "missing_required", "slots": slots, "target_slot": None, "reason": ""}
    text, _ = asyncio.run(DefaultAnalyzer().phrase_question(gap=gap, item=item))
    return text, calls


def test_clearance_question_never_goes_to_the_model(monkeypatch):
    text, calls = ask(monkeypatch, ["operational_clearance"])
    assert calls == []
    assert text == "UPS B maintenance: Is the equipment cleared for normal operation?"


def test_non_safety_question_is_worded_by_the_model(monkeypatch):
    text, calls = ask(monkeypatch, ["remaining_work", "rationale"])
    assert text == "from the model" and len(calls) == 1


def test_question_mixing_safety_and_other_slots_is_worded_by_the_model(monkeypatch):
    text, calls = ask(monkeypatch, ["equipment_scope", "work_status"], item=INSPECTION)
    assert text == "from the model" and len(calls) == 1


# ---- a stated "not cleared" ----

def bypass_only() -> Extraction:
    """What the live model returned: the answer filed under bypass slots, with no clearance fact."""
    return Extraction(items=[ExtractedItem(kind="bypass", title="Maintenance bypass", facts=[
        ExtractedFact("current_mode", "maintenance bypass", "confirmed", "it's still in maintenance bypass")])])


def clearance_facts(extraction):
    return [f for item in extraction.items for f in item.facts if f.slot == "operational_clearance"]


def test_stated_not_cleared_is_recorded_on_the_asked_item():
    result = add_stated_not_cleared(bypass_only(), ANSWER, EXISTING, ASKED)
    [fact] = clearance_facts(result)
    assert (fact.value, fact.normalized, fact.quote) == ("Not cleared", "not_cleared", ANSWER)
    added = result.items[-1]
    assert (added.link_item_id, added.kind) == ("I-1", "maintenance")
    assert len(result.items) == 2  # what the model found is kept


@pytest.mark.parametrize("words", ["It isn't cleared yet.", "It hasn't been cleared.", "It's NOT cleared.",
                                   "It isn’t cleared.", "It has not yet been cleared."])
def test_ways_of_saying_not_cleared(words):
    assert clearance_facts(add_stated_not_cleared(Extraction(), words, EXISTING, ASKED))


@pytest.mark.parametrize("words", ["Yes, it's cleared for normal operation.", "It was cleared this morning.",
                                   "I don't know."])
def test_code_never_records_anything_else(words):
    assert not clearance_facts(add_stated_not_cleared(Extraction(), words, EXISTING, ASKED))


def test_the_models_own_clearance_fact_wins():
    mine = Extraction(items=[ExtractedItem(kind="maintenance", title="UPS", link_item_id="I-1", facts=[
        ExtractedFact("operational_clearance", "Unknown", "unknown", "not sure", "unknown")])])
    assert [f.normalized for f in clearance_facts(add_stated_not_cleared(mine, ANSWER, EXISTING, ASKED))] == ["unknown"]


@pytest.mark.parametrize("scope", [None, {"question": "What remains?", "item_id": "I-1", "slots": ["remaining_work"]}])
def test_only_applies_when_clearance_was_asked(scope):
    assert not clearance_facts(add_stated_not_cleared(Extraction(), ANSWER, EXISTING, scope))


def test_quote_is_one_exact_sentence():
    text = "The vendor left. It's not cleared yet. Back tomorrow."
    assert clearance_facts(add_stated_not_cleared(Extraction(), text, EXISTING, ASKED))[0].quote == "It's not cleared yet."


def test_long_sentence_is_cut_to_the_quote_limit_around_the_words():
    text = " ".join(f"w{i}" for i in range(40)) + " it is not cleared " + " ".join(f"x{i}" for i in range(40))
    quote = clearance_facts(add_stated_not_cleared(Extraction(), text, EXISTING, ASKED))[0].quote
    assert "not cleared" in quote and len(quote.split()) == 30 and quote in text
