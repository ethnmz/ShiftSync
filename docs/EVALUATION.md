# Evaluation

We test ShiftSync on **predetermined fictional handoff scenarios** and compare it with **a normal handoff** and **a basic AI-generated summary**. **We never invent or claim improvements we haven't measured.** Every number on the Evaluation screen comes from `backend/data/eval_results.json` produced by `python -m app.eval.run`.

## Conditions
1. **Normal handoff**: the outgoing operator's original statement(s), unchanged.
2. **Basic AI summary**: one call, same model: "Summarize this shift handoff for the incoming operator."
3. **ShiftSync**: full pipeline. Clarification questions are answered **only** from the scenario's `outgoing_operator_knowledge` by a simulated outgoing operator (answers "I don't know" when the knowledge says so). Review accepts facts unless they contradict ground truth (counted as an AI error caught by review).

## Metrics (from the requirements)
| Metric | How we measure it |
|---|---|
| **Critical facts correctly transferred** | % of ground-truth critical facts present in the artifact Shift B reads **with the correct certainty** (an unverified claim shown as fact counts as wrong). LLM judge + quote check, spot-checked by a human. |
| **Missing details detected** | ShiftSync only: % of ground-truth `missing_in_notes` items that produced a clarification question or a visible "unknown / to be assigned". |
| **Ambiguous statements clarified** | % of ground-truth `ambiguous_phrases` that end up resolved (confirmed answer) or explicitly marked unverified/unknown. Baselines get 0 for silently passing them through. |
| **Misunderstandings caught** | A simulated incoming operator primed with `likely_misreadings` answers the comprehension questions from each artifact. Normal/summary: counted as caught only if the artifact itself prevents it (graded answer is correct). ShiftSync: the verification loop catches it (first attempt vs final). |
| **Unknown conditions correctly preserved** | % of ground-truth unknown/unverified facts shown as unknown/unverified (never as complete/confirmed). |
| **Incorrect facts introduced by AI** | Count of statements in the artifact that contradict ground truth or aren't supported by any source statement (hallucinated owners, deadlines, completion, clearance). For ShiftSync count both pre-review (AI) and post-review. |
| **Time required** | Live runs: Shift A seconds (statement → submit) and Shift B seconds (open → verified). Simulated runs: words spoken/read as a proxy; label it a proxy. |
| **Clarification questions asked** | Count (and how many were "not asked" by design). |

## Scenarios (`eval/scenarios/*.json`)
| File | Focus |
|---|---|
| `vague_ups.json` | Problem 1: vague "should be fine", "it's handled" |
| `lost_reasoning_chiller.json` | Problem 3: decision without rationale or restore condition |
| `unresolved_owner.json` | Problem 4: "I think they finished", "someone should probably check" |
| `low_effort_complete.json` | Problem 5: an already-complete handoff; ShiftSync should ask ≤ 1 question |

Each has: `notes`, `outgoing_operator_knowledge`, `ground_truth_facts` (slot, value, certainty, critical), `missing_in_notes`, `ambiguous_phrases`, `comprehension_questions` (+ must_convey / must_not_claim), `likely_misreadings`.

## Simulated incoming operator (`eval_reader.md`)
```
You are an incoming data center operator starting a shift: busy and reading quickly. Read ONLY the
HANDOFF and answer each question in 1–2 sentences. If the handoff is vague, answer with the most
natural interpretation a busy person would make. Only say something is unknown if the handoff
explicitly says so.
```

## Honesty rules
- Same model, temperature 0, same reader prompt for all conditions; 3 runs per scenario; report the mean and min–max.
- Simulated operators are a proxy for real people. Say so on the screen and in the pitch.
- Tune prompts on `demo/`, never on `eval/` wording.
- Show effort next to quality. If ShiftSync takes longer than a normal handoff, show it.
- If a metric looks worse for ShiftSync, show it anyway and explain.
