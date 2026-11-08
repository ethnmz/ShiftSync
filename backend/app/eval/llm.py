"""LLM roles used only by the benchmark (docs/EVALUATION.md).

- summarize: the "basic AI summary" baseline (one call)
- operator_answer: simulated outgoing operator, answers ONLY from the scenario's
  outgoing_operator_knowledge, or "I don't know"
- reader_answers: simulated incoming operator (eval_reader prompt)
- judge: scores an artifact against the scenario's ground truth

All go through Akshi's `app.llm.client.complete_json`. If it is missing or a
call fails, EvalUnavailable is raised and the runner reports "not_run". It
never fills in numbers.
"""
from __future__ import annotations

import importlib
import json
from typing import Any, Protocol

from pydantic import BaseModel

from app import config


class EvalUnavailable(RuntimeError):
    pass


# ---------- Schemas ----------

class SummaryOut(BaseModel):
    summary: str


class OperatorOut(BaseModel):
    answer: str          # plain words, or exactly "I don't know"
    dont_know: bool


class ReaderOut(BaseModel):
    answers: list[str]   # one per question, in order


class Flag(BaseModel):
    index: int
    ok: bool


class ReaderGrade(BaseModel):
    index: int
    correct: bool        # conveys must_convey and claims nothing in must_not_claim


class JudgeOut(BaseModel):
    critical_facts: list[Flag]          # present WITH the correct certainty
    ambiguous_resolved: list[Flag]      # resolved, or explicitly marked unverified/unknown
    unknowns_preserved: list[Flag]      # gt unknown/unverified facts shown as such
    missing_detected: list[Flag]        # missing_in_notes: asked about, or shown as unknown / to be assigned
    reader_grades: list[ReaderGrade]
    incorrect_statements: list[str]     # contradict ground truth or unsupported by any source


# ---------- Prompts ----------

SUMMARY_PROMPT = "Summarize this shift handoff for the incoming operator."
READER_PROMPT = (
    "You are an incoming data center operator starting a shift: busy and reading quickly. Read ONLY the\n"
    "HANDOFF and answer each question in 1–2 sentences. If the handoff is vague, answer with the most\n"
    "natural interpretation a busy person would make. Only say something is unknown if the handoff\n"
    "explicitly says so. Return ONLY JSON: {\"answers\": [one string per question, in order]}.")
OPERATOR_PROMPT = (
    "You are the outgoing operator answering ONE clarification question about your shift handoff.\n"
    "Answer ONLY from YOUR KNOWLEDGE, in one or two short spoken sentences. Never add anything that is\n"
    "not in YOUR KNOWLEDGE. If YOUR KNOWLEDGE does not answer the question, set dont_know=true and\n"
    "answer \"I don't know\". Return ONLY JSON: {\"answer\": str, \"dont_know\": bool}.")
JUDGE_PROMPT = (
    "You grade a shift-handoff ARTIFACT (what the incoming operator reads) against GROUND TRUTH.\n"
    "Be strict and literal. For each list, return one entry per indexed input:\n"
    "- critical_facts: ok only if the fact is present AND shown with the same certainty (an unverified\n"
    "  claim shown as fact is NOT ok).\n"
    "- ambiguous_resolved: ok if the phrase's meaning is resolved by a confirmed statement, or the\n"
    "  artifact explicitly marks it unverified/unknown. Passing it through unchanged is NOT ok.\n"
    "- unknowns_preserved: ok if that unknown/unverified fact is shown as unknown/unverified, never as\n"
    "  complete/confirmed.\n"
    "- missing_detected: ok if the artifact or its QUESTIONS ASKED cover that missing detail, or the\n"
    "  artifact shows it as unknown / to be assigned.\n"
    "- reader_grades: correct if the READER ANSWER conveys every must_convey point and claims nothing in\n"
    "  must_not_claim.\n"
    "- incorrect_statements: quote each artifact statement that contradicts ground truth or is not\n"
    "  supported by the NOTES or OPERATOR ANSWERS (invented owners, deadlines, completion, clearance).\n"
    "Return ONLY JSON matching the schema.")


def _prompt_file(name: str, default: str) -> str:
    p = config.BACKEND_DIR / "app" / "prompts" / f"{name}.md"
    return p.read_text(encoding="utf-8") if p.exists() else default


class EvalLLM(Protocol):
    async def summarize(self, notes: str) -> str: ...

    async def operator_answer(self, question: str, knowledge: dict[str, str]) -> tuple[str, bool]: ...

    async def reader_answers(self, artifact: str, questions: list[str]) -> list[str]: ...

    async def judge(self, *, artifact: str, scenario: dict[str, Any], reader_answers: list[str],
                    questions_asked: list[str], operator_answers: list[str]) -> JudgeOut: ...


class DefaultEvalLLM:
    async def _call(self, task: str, system: str, user: str, schema: type[BaseModel]) -> Any:
        try:
            client = importlib.import_module("app.llm.client")
        except ImportError as e:
            raise EvalUnavailable("LLM client (app.llm.client) is not available yet") from e
        try:
            return await client.complete_json(task, system, user, schema)
        except Exception as e:
            raise EvalUnavailable(f"{task} call failed: {e}") from e

    async def summarize(self, notes):
        out = await self._call("eval_summary", _prompt_file("eval_summary", SUMMARY_PROMPT) +
                               '\nReturn ONLY JSON: {"summary": str}.', f"HANDOFF NOTES:\n{notes}", SummaryOut)
        return out.summary

    async def operator_answer(self, question, knowledge):
        out = await self._call("eval_operator", OPERATOR_PROMPT,
                               f"YOUR KNOWLEDGE:\n{json.dumps(knowledge, indent=1)}\n\nQUESTION: {question}", OperatorOut)
        return out.answer, out.dont_know

    async def reader_answers(self, artifact, questions):
        qs = "\n".join(f"{i}. {q}" for i, q in enumerate(questions))
        out = await self._call("eval_reader", _prompt_file("eval_reader", READER_PROMPT),
                               f"HANDOFF:\n{artifact}\n\nQUESTIONS:\n{qs}", ReaderOut)
        return out.answers

    async def judge(self, *, artifact, scenario, reader_answers, questions_asked, operator_answers):
        gt = scenario["ground_truth_facts"]
        crit = [f for f in gt if f.get("critical")]
        unknowns = [f for f in gt if f["certainty"] in ("unverified", "unknown")]
        cq = scenario["comprehension_questions"]
        user = json.dumps({
            "NOTES": scenario["notes"], "OPERATOR ANSWERS": operator_answers, "QUESTIONS ASKED": questions_asked,
            "ARTIFACT": artifact,
            "critical_facts": [{"index": i, **f} for i, f in enumerate(crit)],
            "ambiguous_phrases": [{"index": i, "phrase": p} for i, p in enumerate(scenario["ambiguous_phrases"])],
            "unknowns": [{"index": i, **f} for i, f in enumerate(unknowns)],
            "missing_in_notes": [{"index": i, "detail": m} for i, m in enumerate(scenario["missing_in_notes"])],
            "reader": [{"index": i, "question": q["q"], "must_convey": q["must_convey"],
                        "must_not_claim": q["must_not_claim"], "READER ANSWER": reader_answers[i] if i < len(reader_answers) else ""}
                       for i, q in enumerate(cq)],
        }, indent=1)
        return await self._call("eval_judge", JUDGE_PROMPT, user, JudgeOut)
