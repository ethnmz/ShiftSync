# Product: ShiftSync

Status: proposed spec. Ethan confirmed this scope. Diego, Akshi, and Aditri have not yet signed the shared interfaces in `docs/API.md`, `docs/DATA_MODEL.md`, and `docs/AI_PIPELINE.md`. Until they do, build to this document and treat a field change as a team decision.

`CLAUDE.md` is the product direction. This file is the feature list for that direction.

## Problem

Information is communicated, but the meaning does not always transfer. Shift A can say "the UPS vendor is coming back tomorrow, everything should be fine" and mean the work is unfinished. Shift B can hear that maintenance is done.

Note lists, carried-forward tasks, and acknowledgment buttons already exist in other tools. Those are plumbing. They are not the pitch.

## What we build

ShiftSync is a short two-way handoff over iMessage, with a web screen for the leads.

1. The outgoing lead sends one end-of-shift voice note.
2. The **Handoff Interviewer** asks only the missing critical questions, one at a time, at most three.
3. The record that leaves Shift A states each fact as `confirmed`, `reported`, or `unknown`. An unknown without a human-assigned owner and due time is **UNASSIGNED** and blocks app signoff.
4. The **Understanding Check** asks the incoming lead open-ended questions, compares the answers with Shift A's confirmed record, and corrects mismatches.
5. Signoff stores a record with the quotes and the correction history. It does not certify understanding or a safe site.

Product principle: maximum understanding, minimum effort.

## Five failure modes

| # | Failure | What the product does |
|---|---|---|
| 1 | Hidden assumptions ("it's handled") | Detect vague language and ask for the missing operational detail. |
| 2 | False understanding (a tap with no explanation) | Open-ended check, then a correction loop. A click is not the check. |
| 3 | Lost reasoning (knows what, not why) | Require `rationale`, `restore_condition`, and `contingency` when that slot is critical. |
| 4 | Unresolved uncertainty that looks complete | Status is `confirmed`, `reported`, or `unknown`. Unknowns need a person and a due time. |
| 5 | Handoff fatigue | Ask only missing critical slots, default budget 3, one question at a time. |

## Facts

- `confirmed`: the speaker stated it outright, the quote verifies against the transcript, and the hedge check did not fire.
- `reported`: the speaker hedged ("I think", "should be fine", "probably") or the model claimed `confirmed` and code downgraded it.
- `unknown`: the slot is missing, or the speaker said they do not know. Silence does not fill it.

Code in `facts/status.py` applies the hedge lexicon from `config/slots.yaml`. The model cannot upgrade a hedge. Code in `facts/verify.py` drops a fact whose quote is not in the transcript at fuzzy ratio ≥ 0.85.

Owners, due times, and equipment dependencies come from a human answer or from configuration. The model does not invent them.

## Interview

Critical gaps are chosen by `interview/gaps.py` and ordered by `interview/planner.py`. Safety slots come first, then an unknown with no owner, then rationale. Non-safety gaps past the budget are stored as `not_asked_low_priority`. They are not shown as done.

The outgoing budget is 3 questions for that lead. One question is in flight at a time.

## Understanding check

`check/questions.py` picks the next open-ended question from confirmed facts, safety slots first. `check/grade.py` may label an answer `aligned`, `misunderstood`, or `not_mentioned`. Code accepts `aligned` only when the evidence quote verifies against the answer text. In doubt, the grade stays off `aligned`.

A `misunderstood` or `not_mentioned` safety fact shows a correction and waits for another answer. Signoff stays blocked while any confirmed safety fact is still in that state. The grade means the answer text matched the record. It does not prove the person understood.

## Signoff

`handoff/gate.py` allows signoff only when:

- no unknown is UNASSIGNED
- no confirmed safety fact is still `misunderstood` or `not_mentioned`
- the outgoing budget has been applied (asked, or explicitly not asked because it was low priority)

The gate is an application lock. It does not control equipment and it does not clear anyone to do physical work.

## Priority

**P0, the demo:** ingest one voice note, extract source-backed facts, run the interview within the budget, show explicit unknowns, run the check and one correction, sign the record.

**P1:** the four evaluation metrics in `docs/EVALUATION.md` on synthetic scenarios. No published scores until a run exists.

**P2, not this core:** a conflict warning that uses dependencies already written in configuration, stale-item reminders, and a free-form ask box. Do not build a second ledger product beside the interview. Do not add those until the P0 path works and the team agrees.

## Out of scope

Real building controls, a certified safe state, a 3D facility view, multi-site support, and a claim that the team has qualified for a sponsor prize.

## Demo success

Using the fictional UPS vendor sentence in `docs/DEMO_SCRIPT.md`:

- The hedged line cannot become a `confirmed` "maintenance is done."
- The interview asks what is unfinished, within the three-question budget.
- An unknown with no owner blocks signoff until a person assigns an owner and a due time.
- The incoming answer "maintenance is done" is corrected against the confirmed record.
- The signed screen shows quotes. It does not say the site is safe.
