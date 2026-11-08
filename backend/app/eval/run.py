"""Benchmark runner (docs/EVALUATION.md).

    python -m app.eval.run [--runs 3] [--scenario vague_ups]

Three conditions per scenario: the normal handoff (notes unchanged), a basic AI
summary, and ShiftSync (the real pipeline in a throwaway in-memory database,
with a simulated outgoing operator answering only from the scenario's knowledge).
Every number comes from these runs. If any LLM call is unavailable, the run
stops and the results file says "not_run" with the reason. Nothing is filled in.

Method notes (also written into the results file):
- Simulated operators are a proxy for real people.
- ShiftSync review accepts every extracted fact, so the pre- and post-review
  artifacts are the same here; "incorrect facts" is counted on that artifact.
- Misunderstandings are measured the same way for all conditions: the simulated
  reader answers the comprehension questions from the artifact. ShiftSync's own
  verification loop is exercised in the live demo, not here.
- Time is a proxy: words spoken by Shift A and words read by Shift B.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from rapidfuzz import fuzz
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app import config, db
from app.handoff import receive, service
from app.handoff.analyzer import AnalysisError, Analyzer, DefaultAnalyzer
from app.eval.llm import DefaultEvalLLM, EvalLLM, EvalUnavailable

CONDITIONS = ("normal", "summary", "shiftsync")
METHOD_NOTES = [
    "Simulated outgoing and incoming operators are LLM proxies for real people.",
    "ShiftSync review accepts every extracted fact, so pre- and post-review artifacts are identical in this run.",
    "Misunderstandings: a simulated reader answers the comprehension questions from each artifact; "
    "ShiftSync's verification loop is not exercised here.",
    "Time is a proxy: words spoken by Shift A and words read by Shift B.",
]
OUTGOING, INCOMING = "maya", "jordan"
MAX_QUESTIONS = 10
QUOTE_MATCH = 85  # same threshold as the source-quote check
MIN_EVIDENCE_CHARS = 8


def results_path() -> Path:
    return config.data_dir() / "eval_results.json"


def load_scenarios(only: str | None = None) -> list[dict[str, Any]]:
    out = []
    for p in sorted(config.eval_dir().glob("*.json")):
        sc = json.loads(p.read_text(encoding="utf-8"))
        if only is None or sc["id"] == only:
            out.append(sc)
    return out


def _words(text: str) -> int:
    return len(text.split())


def _grounded(flags: list[Any], *sources: str) -> tuple[list[Any], list[dict[str, Any]]]:
    """Keep an ok flag only if its evidence is really in one of `sources` (what Shift B reads,
    plus QUESTIONS ASKED for missing_detected). The judge also sees NOTES and OPERATOR ANSWERS
    so it can spot unsupported claims; without this check it gave credit from them.
    Returns (flags with ungrounded ok turned off, the ones turned off, for spot-checking)."""
    out, dropped = [], []
    hay = [t.lower() for t in sources if t]
    for f in flags:
        ev = (getattr(f, "evidence", "") or "").strip().lower()
        # Assumption: under MIN_EVIDENCE_CHARS a quote like "unknown" matches almost any artifact.
        found = len(ev) >= MIN_EVIDENCE_CHARS and any(fuzz.partial_ratio(ev, h) >= QUOTE_MATCH for h in hay)
        if f.ok and not found:
            dropped.append({"index": f.index, "evidence": f.evidence, "why": f.why})
            f = f.model_copy(update={"ok": False})
        out.append(f)
    return out, dropped


def _rate(flags: list[Any], n: int) -> float | None:
    if n == 0:
        return None
    ok = {f.index for f in flags if getattr(f, "ok", getattr(f, "correct", False)) and 0 <= f.index < n}
    return len(ok) / n


# ---------- ShiftSync condition ----------

def artifact_from_briefing(b: dict[str, Any]) -> str:
    """What Shift B reads: headline, lines, every reviewed fact with its certainty, follow-ups."""
    out = [b["headline"], ""]
    out += [f"- {line['text']}" for line in b["lines"]]
    out.append("")
    for it in b["items"]:
        out.append(f"{it['title']} [{it['priority']}]")
        for f in it["facts"]:
            out.append(f"  {f['slot'].replace('_', ' ')}: {f['value']} ({f['certainty']})")
    if b["open_followups"]:
        out.append("")
        out.append("Open follow-ups:")
        out += [f"- {fu['description']} | missing: {fu['missing_information']} | owner: {fu['owner_label']}"
                for fu in b["open_followups"]]
    out += ["", b["disclaimer"]]
    return "\n".join(out)


async def run_shiftsync(sc: dict[str, Any], llm: EvalLLM, analyzer: Analyzer) -> dict[str, Any]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    answers: list[str] = []
    asked: list[str] = []
    with Session(engine) as s:
        db.load_static(s)
        h = service.create_handoff(s, OUTGOING, INCOMING, actor_id=OUTGOING)
        try:
            await service.ingest_statement(s, h.id, OUTGOING, sc["notes"], analyzer=analyzer)
        except service.Unprocessable as e:
            raise EvalUnavailable(f"ShiftSync extraction failed: {e.message}") from e
        for _ in range(MAX_QUESTIONS):
            pending = [q for q in service.questions_for(s, h.id) if q.status == "pending"]
            if not pending:
                break
            q = pending[0]
            asked.append(q.text)
            text, dont_know = await llm.operator_answer(q.text, sc["outgoing_operator_knowledge"])
            answers.append(text)
            try:
                await service.answer_question(s, h.id, q.id, OUTGOING, text=None if dont_know else text,
                                              dont_know=dont_know, analyzer=analyzer)
            except service.Unprocessable as e:
                raise EvalUnavailable(f"ShiftSync extraction failed: {e.message}") from e
        for v in service.views_for(s, h.id):
            for f in v.facts:
                if f.review_state == "ai_extracted" and v.priority == "critical":
                    service.patch_fact(s, f.id, OUTGOING, review_state="operator_confirmed")
        service.confirm_routine(s, h.id, OUTGOING)
        try:
            service.submit(s, h.id, OUTGOING)
        except service.Conflict as e:
            raise EvalUnavailable(f"ShiftSync could not submit: {e.message}") from e
        b = await receive.build_briefing(s, h.id, analyzer=analyzer)
        metrics = service.get_handoff(s, h.id).metrics
    return {"artifact": artifact_from_briefing(b), "asked": asked, "answers": answers,
            "questions_asked": metrics.get("clarification_questions_asked", len(asked)),
            "not_asked": metrics.get("not_asked", 0)}


# ---------- One run ----------

async def run_once(sc: dict[str, Any], condition: str, llm: EvalLLM, analyzer: Analyzer) -> dict[str, Any]:
    asked: list[str] = []
    answers: list[str] = []
    extra: dict[str, Any] = {}
    if condition == "normal":
        artifact = sc["notes"]
    elif condition == "summary":
        artifact = await llm.summarize(sc["notes"])
    else:
        ss = await run_shiftsync(sc, llm, analyzer)
        artifact, asked, answers = ss["artifact"], ss["asked"], ss["answers"]
        extra = {"clarification_questions_asked": ss["questions_asked"], "not_asked": ss["not_asked"]}

    cq = sc["comprehension_questions"]
    reader = await llm.reader_answers(artifact, [q["q"] for q in cq])
    # The fixed disclaimer is not a claim about the handoff; keep it out of grading.
    graded = artifact.replace(receive.DISCLAIMER, "").strip()
    j = await llm.judge(artifact=graded, scenario=sc, reader_answers=reader,
                        questions_asked=asked, operator_answers=answers)
    # "Incorrect facts introduced by AI": the normal handoff has no AI, so it is 0 by definition.
    # A listed statement only counts if it really appears in the graded text; a judge that
    # quotes must_not_claim lines back as "incorrect" would otherwise invent errors.
    incorrect = [] if condition == "normal" else [
        i for i in j.incorrect_statements
        if i.statement and fuzz.partial_ratio(i.statement.lower(), graded.lower()) >= QUOTE_MATCH
    ]
    # Every credit must be grounded in what Shift B reads (missing_detected may also cite a question asked).
    asked_text = "\n".join(asked)
    ungrounded: dict[str, list[dict[str, Any]]] = {}
    for key in ("critical_facts", "ambiguous_resolved", "unknowns_preserved", "missing_detected"):
        sources = (graded, asked_text) if key == "missing_detected" else (graded,)
        kept, dropped = _grounded(getattr(j, key), *sources)
        setattr(j, key, kept)
        if dropped:
            ungrounded[key] = dropped
    gt = sc["ground_truth_facts"]
    n_crit = sum(1 for f in gt if f.get("critical"))
    n_unk = sum(1 for f in gt if f["certainty"] in ("unverified", "unknown"))
    return {
        "critical_facts_transferred": _rate(j.critical_facts, n_crit),
        "missing_details_detected": _rate(j.missing_detected, len(sc["missing_in_notes"])) if condition == "shiftsync" else None,
        "ambiguous_clarified": _rate(j.ambiguous_resolved, len(sc["ambiguous_phrases"])),
        "misunderstandings_prevented": _rate(j.reader_grades, len(cq)),
        "unknowns_preserved": _rate(j.unknowns_preserved, n_unk),
        "incorrect_facts_introduced": len(incorrect),
        "shift_a_words_proxy": _words(sc["notes"]) + sum(_words(a) for a in answers),
        "shift_b_words_proxy": _words(artifact),
        "clarification_questions_asked": extra.get("clarification_questions_asked"),
        "not_asked": extra.get("not_asked"),
        "_artifact": artifact,
        "_incorrect_statements": [i.model_dump() for i in incorrect],
        "_judge": j.model_dump(),
        "_ungrounded": ungrounded,
        "_reader_answers": reader,
    }


def _aggregate(runs: list[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in runs[0]:
        if key.startswith("_"):
            continue
        vals = [r[key] for r in runs if r[key] is not None]
        out[key] = None if not vals else {"mean": statistics.fmean(vals), "min": min(vals), "max": max(vals), "n": len(vals)}
    # Run 1's evidence, so a person can spot-check every score (EVALUATION.md).
    out["examples"] = {"artifact": runs[0]["_artifact"], "incorrect_statements": runs[0]["_incorrect_statements"],
                       "judge": runs[0]["_judge"], "reader_answers": runs[0]["_reader_answers"],
                       "ungrounded_credit_removed": runs[0]["_ungrounded"]}
    return out


async def run(runs: int = 3, only: str | None = None, llm: EvalLLM | None = None,
              analyzer: Analyzer | None = None, write: bool = True) -> dict[str, Any]:
    llm = llm or DefaultEvalLLM()
    analyzer = analyzer or DefaultAnalyzer()
    started = datetime.now(timezone.utc).isoformat()
    base = {"generated_at": started, "provider": os.environ.get("LLM_PROVIDER", "nemotron"), "runs": runs,
            "simulated": True, "method_notes": METHOD_NOTES}
    scenarios = load_scenarios(only)
    try:
        results: dict[str, Any] = {}
        for sc in scenarios:
            results[sc["id"]] = {"problem": sc.get("problem"), "conditions": {}}
            for cond in CONDITIONS:
                per_run = [await run_once(sc, cond, llm, analyzer) for _ in range(runs)]
                results[sc["id"]]["conditions"][cond] = _aggregate(per_run)
        out = {**base, "status": "complete", "scenarios": results}
    except (EvalUnavailable, AnalysisError) as e:
        out = {**base, "status": "not_run", "reason": str(e), "scenarios": {}}
    if write:
        results_path().parent.mkdir(parents=True, exist_ok=True)
        results_path().write_text(json.dumps(out, indent=2), encoding="utf-8")
    return out


def read_results() -> dict[str, Any]:
    p = results_path()
    if not p.exists():
        return {"status": "not_run", "reason": "no benchmark has been run yet", "scenarios": {}}
    return json.loads(p.read_text(encoding="utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser(description="ShiftSync benchmark")
    ap.add_argument("--runs", type=int, default=3)
    ap.add_argument("--scenario", default=None)
    args = ap.parse_args()
    out = asyncio.run(run(args.runs, args.scenario))
    print(f"status: {out['status']}" + (f" ({out.get('reason')})" if out["status"] != "complete" else ""))
    print(f"wrote {results_path()}")


if __name__ == "__main__":
    main()
