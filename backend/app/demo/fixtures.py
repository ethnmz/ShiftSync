"""Offline AI outputs for replaying demo/scenario.json without a network.

These stand in for the extractor and grader so the demo replays the same way
every time. They are a demo fixture, not model output: everything after them
(floors, gaps, follow-ups, verdict floor, state) is the real code.

Extractions contain only what the step's own text says, with verbatim quotes.
Grades name facts by slot; replay turns slots into fact ids from the check's
answer key at run time.
"""
from __future__ import annotations

from app.handoff.analyzer import ExtractedFact as EF
from app.handoff.analyzer import ExtractedItem as EI
from app.handoff.analyzer import Extraction

EXTRACTIONS: dict[int, Extraction] = {
    2: Extraction(items=[
        EI(kind="vendor_work", title="UPS-B maintenance", asset_id="UPS-B", asset_mention="UPS-B", facts=[
            EF("work_status", "Mostly finished", "confirmed", "UPS-B maintenance is mostly finished", "incomplete"),
            EF("vendor_return", "Vendor returns tomorrow", "confirmed", "The vendor is coming back tomorrow"),
        ]),
        EI(kind="observation", title="Generator 1 condition", asset_id="GEN-1", facts=[
            EF("condition", "Looks good", "confirmed", "Generator 1 looks good"),
        ]),
        EI(kind="inspection", title="Cooling inspection", asset_id=None, asset_mention="the cooling inspection", facts=[
            EF("work_status", "Unknown", "unknown", "I'm not sure what happened with the cooling inspection", "unknown"),
        ]),
    ], unscoped_claims=["everything else should be okay"]),
    3: Extraction(items=[EI(kind="vendor_work", title="UPS-B maintenance", asset_id="UPS-B", facts=[
        EF("remaining_work", "Final load test", "confirmed", "the vendor couldn't do the final load test"),
        EF("rationale", "Replacement battery module didn't arrive", "confirmed",
           "The replacement battery module didn't arrive"),
    ])]),
    4: Extraction(items=[EI(kind="vendor_work", title="UPS-B maintenance", asset_id="UPS-B", facts=[
        EF("operational_clearance", "Not cleared: in maintenance bypass", "confirmed",
           "It's still in maintenance bypass", "not_cleared"),
        EF("required_verification", "Vendor finishes load test and signs off", "confirmed",
           "It's not cleared until the vendor finishes the load test and signs off"),
    ])]),
    5: Extraction(items=[EI(kind="inspection", title="Chiller 2 cooling inspection", asset_id="CHL-2", facts=[
        EF("equipment_scope", "Chiller 2", "confirmed", "It was Chiller 2"),
        EF("work_status", "Unknown; no report received", "unknown", "I honestly don't know if they finished",
           "unknown"),
    ])]),
}

# step → (verdict, contradiction slots with what was claimed, missing slots, misconception)
GRADES: dict[int, dict] = {
    9: {"verdict": "partially_consistent",
        "contradictions": {"work_status": "maintenance is complete"},
        "missing": ["remaining_work", "required_verification"],
        "misconception": "treated_incomplete_as_complete"},
    10: {"verdict": "consistent", "contradictions": {}, "missing": [], "misconception": None},
    11: {"verdict": "consistent", "contradictions": {}, "missing": [], "misconception": None},
}
