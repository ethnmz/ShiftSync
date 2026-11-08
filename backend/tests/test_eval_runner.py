"""Benchmark runner mechanics with a fake LLM. These numbers test the plumbing only;
real results come from `python -m app.eval.run` with a configured provider.
"""
import asyncio
import json

import pytest

from app.eval import run as eval_run
from app.eval.llm import Flag, Incorrect, JudgeOut, ReaderGrade
from app.handoff.analyzer import ExtractedFact as EF
from app.handoff.analyzer import ExtractedItem as EI
from app.handoff.analyzer import Extraction, ScriptedAnalyzer


class FakeLLM:
    def __init__(self):
        self.operator_calls = []

    async def summarize(self, notes):
        return "UPS-A is fine. The vendor returns tomorrow. Rack A13 alarm handled."

    async def operator_answer(self, question, knowledge):
        self.operator_calls.append(question)
        return "I don't know", True

    async def reader_answers(self, artifact, questions):
        return ["answer"] * len(questions)

    async def judge(self, *, artifact, scenario, reader_answers, questions_asked, operator_answers):
        n = len([f for f in scenario["ground_truth_facts"] if f.get("critical")])
        ok = "unknown" in artifact  # pretend only the ShiftSync artifact keeps unknowns visible
        ev = artifact.splitlines()[0] if ok else ""  # quoted from the artifact, as the prompt requires
        q_ev = questions_asked[0] if questions_asked else ""
        return JudgeOut(critical_facts=[Flag(index=i, ok=ok, evidence=ev) for i in range(n)],
                        ambiguous_resolved=[Flag(index=0, ok=ok, evidence=ev)], unknowns_preserved=[],
                        missing_detected=[Flag(index=i, ok=True, evidence=q_ev)
                                          for i in range(len(scenario["missing_in_notes"]))],
                        reader_grades=[ReaderGrade(index=0, correct=ok)],
                        incorrect_statements=[] if ok else [Incorrect(statement="UPS-A is fine", why="contradicts clearance")])


def ups_a_extraction():
    return Extraction(items=[EI(kind="vendor_work", title="UPS-A vendor work", asset_id="UPS-A", facts=[
        EF("vendor_return", "Vendor back tomorrow morning", "confirmed",
           "UPS-A vendor said they'll be back tomorrow morning"),
    ])], unscoped_claims=["everything should be fine"])


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    return tmp_path


def test_full_run_with_fake_llm(data_dir):
    llm = FakeLLM()
    out = asyncio.run(eval_run.run(runs=1, only="vague_ups", llm=llm,
                                   analyzer=ScriptedAnalyzer([ups_a_extraction()])))
    assert out["status"] == "complete" and out["simulated"] and out["method_notes"]
    conds = out["scenarios"]["vague_ups"]["conditions"]
    assert set(conds) == {"normal", "summary", "shiftsync"}
    ss, normal = conds["shiftsync"], conds["normal"]
    # The pipeline really ran: questions were asked and answered "I don't know" by the simulated operator.
    assert llm.operator_calls and ss["clarification_questions_asked"]["mean"] >= 1
    assert "unknown" in ss["examples"]["artifact"]
    assert normal["missing_details_detected"] is None  # ShiftSync-only metric
    assert normal["clarification_questions_asked"] is None
    assert ss["missing_details_detected"]["mean"] == 1.0  # evidence from QUESTIONS ASKED counts here
    assert ss["critical_facts_transferred"]["mean"] == 1.0 and normal["critical_facts_transferred"]["mean"] == 0.0
    assert ss["shift_a_words_proxy"]["mean"] > normal["shift_a_words_proxy"]["mean"]  # effort is shown, not hidden
    # The raw notes involve no AI, so they can't "introduce" AI errors; the summary can.
    assert normal["incorrect_facts_introduced"]["mean"] == 0
    assert conds["summary"]["incorrect_facts_introduced"]["mean"] == 1
    # Spot-check evidence is saved.
    assert ss["examples"]["judge"]["critical_facts"] and ss["examples"]["reader_answers"]
    assert json.loads((data_dir / "eval_results.json").read_text())["status"] == "complete"


def test_judge_cannot_invent_incorrect_statements(data_dir):
    class Inventing(FakeLLM):
        async def judge(self, **kw):
            out = await super().judge(**kw)
            out.incorrect_statements.append(Incorrect(statement="UPS-A cleared for full load", why="made up"))
            return out
    out = asyncio.run(eval_run.run(runs=1, only="vague_ups", llm=Inventing(),
                                   analyzer=ScriptedAnalyzer([ups_a_extraction()])))
    # "UPS-A cleared for full load" is not in any artifact, so it is never counted.
    conds = out["scenarios"]["vague_ups"]["conditions"]
    assert conds["summary"]["incorrect_facts_introduced"]["mean"] == 1
    assert conds["shiftsync"]["incorrect_facts_introduced"]["mean"] == 0


def test_judge_credit_must_be_quoted_from_the_artifact(data_dir):
    """The judge sees NOTES and OPERATOR ANSWERS; credit taken from them must score 0."""
    class FromNotes(FakeLLM):
        async def judge(self, *, artifact, scenario, reader_answers, questions_asked, operator_answers):
            n = len([f for f in scenario["ground_truth_facts"] if f.get("critical")])
            not_in_artifact = "the vendor confirmed UPS-A is cleared for full load"
            return JudgeOut(critical_facts=[Flag(index=i, ok=True, evidence=not_in_artifact) for i in range(n)],
                            ambiguous_resolved=[Flag(index=0, ok=True)],  # no evidence at all
                            unknowns_preserved=[],
                            missing_detected=[Flag(index=0, ok=True, evidence=not_in_artifact)],
                            reader_grades=[], incorrect_statements=[])
    out = asyncio.run(eval_run.run(runs=1, only="vague_ups", llm=FromNotes(),
                                   analyzer=ScriptedAnalyzer([ups_a_extraction()])))
    for name, c in out["scenarios"]["vague_ups"]["conditions"].items():
        assert c["critical_facts_transferred"]["mean"] == 0.0, name
        assert c["ambiguous_clarified"]["mean"] == 0.0, name
        assert c["examples"]["ungrounded_credit_removed"]["critical_facts"]
    assert out["scenarios"]["vague_ups"]["conditions"]["shiftsync"]["missing_details_detected"]["mean"] == 0.0


def test_grounded_rejects_tiny_quotes():
    flags = [Flag(index=0, ok=True, evidence="unknown"), Flag(index=1, ok=True, evidence="GEN-1 fuel level: unknown")]
    kept, dropped = eval_run._grounded(flags, "GEN-1 fuel level: unknown (unknown)")
    assert [f.ok for f in kept] == [False, True] and [d["index"] for d in dropped] == [0]


def test_grounded_accepts_joined_or_shortened_real_quotes():
    artifact = ("UPS-B load test pending [critical]\n  decision: vendor returns at 9 AM (confirmed)\n"
                "  operational clearance: not_cleared (confirmed)\n\nOpen follow-ups:\n"
                "- Confirm completion of UPS-B | missing: Completion confirmation | owner: To be assigned")
    flags = [
        # Title joined to a fact two lines below it: both pieces are real.
        Flag(index=0, ok=True, evidence="UPS-B load test pending [critical]\n  operational clearance: not_cleared (confirmed)"),
        # Middle of a line cut out with "..." (and the unicode ellipsis).
        Flag(index=1, ok=True, evidence="Open follow-ups: ... owner: To be assigned"),
        Flag(index=2, ok=True, evidence="Confirm completion of UPS-B \u2026 owner: To be assigned"),
        # One real piece plus one invented piece: still not grounded.
        Flag(index=3, ok=True, evidence="operational clearance: not_cleared ... cleared for full load by the vendor"),
        # Only short pieces: nothing long enough to check.
        Flag(index=4, ok=True, evidence="UPS-B ... 9 AM"),
    ]
    kept, dropped = eval_run._grounded(flags, artifact)
    assert [f.ok for f in kept] == [True, True, True, False, False]
    assert [d["index"] for d in dropped] == [3, 4]


def test_unavailable_llm_reports_not_run_without_numbers(data_dir, monkeypatch):
    # Never reach a real provider from the test suite, even if backend/.env has a key.
    for var in ("NEMOTRON_MODEL", "CLAUDE_MODEL", "NVIDIA_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(var, raising=False)
    out = asyncio.run(eval_run.run(runs=1, only="vague_ups"))
    assert out["status"] == "not_run" and out["reason"] and out["scenarios"] == {}
    assert eval_run.read_results()["status"] == "not_run"


def test_results_before_any_run(data_dir):
    assert eval_run.read_results()["status"] == "not_run"


def test_rate_ignores_out_of_range_and_duplicates():
    flags = [Flag(index=0, ok=True), Flag(index=0, ok=True), Flag(index=7, ok=True)]
    assert eval_run._rate(flags, 2) == 0.5
    assert eval_run._rate([], 0) is None
