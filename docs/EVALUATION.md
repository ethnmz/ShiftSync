# Evaluation plan

This file is a new plan written for this spec. It is not an uploaded original, and it contains no results.

The point is to compare three ways of handing the same synthetic note, on purpose-built scenarios, after someone runs them. A higher number is not a claim that ShiftSync is safer, and it is not proof that a person understood.

## Conditions

Use the same scenario for each:

1. **Raw note.** The incoming person sees only the transcript.
2. **Plain summary.** One model summary of that transcript, with no interview and no status labels.
3. **ShiftSync.** The interview, the fact statuses, and the understanding check defined in `docs/PRODUCT.md`.

## Metrics

Score each condition against ground truth written in the scenario file. Ground truth is authored with the scenario. It is not produced by the model under test.

| Metric | What to count |
|---|---|
| Completeness | Critical slots that appear as `confirmed` or as an explicit `unknown`. A missing slot scores 0. A hedge stored as `confirmed` scores 0. |
| Interpretation | Ground-truth meanings the incoming answer preserves. "Maintenance is done" against "vendor still has to verify" scores 0 for that fact. |
| Action clarity | Unknowns that name a human owner and a due time. UNASSIGNED scores 0. An owner the model invented scores 0. |
| Efficiency | `1 - (questions asked / budget)` for the outgoing interview, plus the count of correction turns. Fewer questions score higher only when completeness did not fall. |

Each metric is a fraction from 0 to 1. Report the four numbers per condition. Do not collapse them into a single "safety" score. Do not fill this table until a run exists.

## Scenarios

`eval/scenarios/` is not in the repo. When it is added, start with three synthetic notes:

- the hedged UPS vendor line from `docs/DEMO_SCRIPT.md`
- a note that names a condition and a restore step
- a note that says "I don't know" and never names an owner

Each file needs the transcript, the critical slots, and the ground-truth status. No live phone numbers.

## What a run must not say

Do not write "we reduced errors" or "the model understood." The allowed sentence is: on this synthetic set, condition C scored these four fractions. `backend/tests/test_scenario.py` can assert the gate and the hedge downgrade without being this benchmark.
