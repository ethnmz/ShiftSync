"""Benchmark runner mechanics with a fake LLM. These numbers test the plumbing only;
real results come from `python -m app.eval.run` with a configured provider.
"""
import asyncio
import json

import pytest

from app.eval import run as eval_run
from app.eval.llm import Flag, JudgeOut, ReaderGrade
from app.handoff.analyzer import ExtractedFact as EF
from app.handoff.analyzer import ExtractedItem as EI
from app.handoff.analyzer import Extraction, ScriptedAnalyzer


class FakeLLM:
    def __init__(self):
        self.operator_calls = []

    async def summarize(self, notes):
        return "UPS-A vendor returns tomorrow. Rack A13 alarm handled."

    async def operator_answer(self, question, knowledge):
        self.operator_calls.append(question)
        return "I don't know", True

    async def reader_answers(self, artifact, questions):
        return ["answer"] * len(questions)

    async def judge(self, *, artifact, scenario, reader_answers, questions_asked, operator_answers):
        n = len([f for f in scenario["ground_truth_facts"] if f.get("critical")])
        ok = "unknown" in artifact  # pretend only the ShiftSync artifact keeps unknowns visible
        return JudgeOut(critical_facts=[Flag(index=i, ok=ok) for i in range(n)],
                        ambiguous_resolved=[Flag(index=0, ok=ok)], unknowns_preserved=[],
                        missing_detected=[Flag(index=i, ok=True) for i in range(len(scenario["missing_in_notes"]))],
                        reader_grades=[ReaderGrade(index=0, correct=ok)],
                        incorrect_statements=[] if ok else ["UPS-A is fine"])


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
    assert ss["critical_facts_transferred"]["mean"] == 1.0 and normal["critical_facts_transferred"]["mean"] == 0.0
    assert ss["shift_a_words_proxy"]["mean"] > normal["shift_a_words_proxy"]["mean"]  # effort is shown, not hidden
    assert json.loads((data_dir / "eval_results.json").read_text())["status"] == "complete"


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
