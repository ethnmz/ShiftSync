# Architecture

## Components
```
 Shift A / Shift B / Supervisor  (browser: laptop, tablet, wall screen)
        │  React + TS + Tailwind  (voice via MediaRecorder)        Optional P1: iPhone → iMessage → Photon bridge
        ▼                                                                                   │
 ┌──────────────────────────────────── FastAPI backend ─────────────────────────────────────▼──┐
 │ routes/  →  handoff service (deterministic state machine)                                    │
 │   stt/        audio → ffmpeg → text                                                          │
 │   extract/    LLM: statements → items + facts (with quotes)          ┐                       │
 │   certainty/  code: quote verify + certainty floors                  │ analysis              │
 │   clarify/    code: gaps + priority + budget → LLM phrases 1 question│                       │
 │   review/     operator edits/confirms (layer 3)                      ┘                       │
 │   briefing/   code selects + orders; LLM writes concise lines                                │
 │   verify/     code picks checks + answer keys; LLM grades; code floors verdict               │
 │   followups/  code creates; authorized users assign; carry-over                              │
 │   eval/       benchmark runner                                                               │
 │ SQLite (persistent)  ·  data/audio/  ·  data/llm_log.jsonl                                    │
 └──────────────────────────────────────────┬───────────────────────────────────────────────────┘
                                            ▼
                     NVIDIA Nemotron (default) / Claude (fallback)  ·  Whisper (OpenAI or local)
```

## Handoff state machine (`app/handoff/state.py`, deterministic)
```
draft ─record/type─▶ analyzing ─▶ clarifying ─(no eligible gaps | budget spent)─▶ in_review
in_review ─submit (Shift A)─▶ submitted ─acknowledge (Shift B)─▶ acknowledged
acknowledged ─start verification─▶ verifying ─all critical checks verified─▶ verified
                                              └ any check "clarified_in_person" ─▶ verified_with_assistance
```
- Shift A may add more speech/text in `clarifying` or `in_review`; re-analysis keeps answered questions answered (never re-ask).
- Acknowledgment is its own step and timestamp. Verification is required for `verified`, and the UI never collapses the two.
- Open follow-ups never block any transition and never close automatically.

## Stage 2: Analysis pipeline
```
Statement → LLM extract (items, facts, decisions, rationale, owners/deadlines with quotes)
          → verify quotes (rapidfuzz ≥ 85, drop failures, log)
          → certainty floor (lexicons) → resolve assets (registry + aliases)
          → merge into existing items (new fact supersedes same slot; keep history)
          → priority (rules.yaml) → auto follow-ups for uncertain/incomplete critical facts
```

## Stage 3: Adaptive clarification (`app/clarify/`)
1. `gaps.py` (deterministic) checks each item against `slots.yaml`:
   - `vague_statement`: a required safety slot is filled only by a quote containing a `vague_terms` phrase ("should be okay", "it's handled", "mostly")
   - `missing_required`: a required slot is empty (e.g. `operational_clearance` for power/cooling work that isn't complete)
   - `uncertain_claim`: a critical fact is `unverified`/`unknown` and Shift A hasn't been asked whether it's verified
   - `missing_rationale` / `missing_condition`: an item with `is_decision` or a non-normal state lacks `rationale` / `restore_condition`
   - `unscoped_claim`: catch-alls like "everything else should be okay" with no equipment named
   - `missing_owner_or_deadline`: open critical work with no owner/deadline stated (asked at most once; answer "don't know" → follow-up stays "To be assigned")
2. `planner.py`: score = gap weight + priority bonus (`slots.yaml → priority`). Never re-ask a slot that already has an operator answer (including "don't know"). Group ≤ 2 slots on the same item into one question. Pick the top one; stop when the budget is spent or no gap scores ≥ threshold. Remaining gaps → `not_asked` with a reason (shown in review).
3. LLM `clarify` phrases the question using Shift A's own words.
4. Answer (voice/text/**"I don't know"** button) → new Statement → re-extract scoped to the item → re-floor → recompute gaps. That's the adaptivity: one answer can close several gaps.

## Stage 4: Review
Structured summary, editable inline. Every AI-extracted fact shows an **AI** tag until Shift A taps ✓ (confirm) or edits it (`operator_edited`, original AI value kept). "Confirm all" is allowed for non-critical items; **critical facts must be confirmed individually** (one tap each). Submitting is blocked only by: unreviewed critical facts, and pending required safety questions (which can be answered "I don't know").

## Stage 5: Briefing (`app/briefing/`)
Code selects and orders: critical open items → items with unverified/unknown facts → decisions with rationale → routine/completed (collapsed). The LLM writes ≤ 6 concise lines from operator-reviewed facts only and must keep certainty words. Every line links to its fact ids and source quotes.

## Stage 6: Understanding verification (`app/verify/`)
1. Select up to `per_verification` items (default 3): critical + (unverified/unknown/incomplete) first, then decisions with rationale.
2. Build an **answer key** deterministically from reviewed facts: `must_convey` (status, what must be verified/done, why, owner if assigned) and `must_not_claim` (e.g. "complete", "cleared", "confirmed" when the facts say otherwise).
3. LLM `verify_question` phrases an open-ended question (never yes/no).
4. Shift B answers (voice/text) → LLM `grade` → **code floor**: any contradiction of a critical fact → `inconsistent`; any missing critical fact → at most `partially_consistent`.
5. If not consistent: show feedback plus **evidence quotes** from Shift A, then another attempt. After 2 attempts → `needs_clarification` → lead talks to Shift A and marks `clarified_in_person` (logged).

## Completion and metrics (`app/handoff/metrics.py`)
Per handoff: time Shift A (first statement → submit), time Shift B (open → verified), clarification questions asked / not asked, answered "don't know", facts by certainty, AI facts edited/rejected by operator (proxy for AI errors), verification first-attempt rate, misunderstandings caught, open follow-ups (assigned / to be assigned).

## Optional P1 channel: Photon iMessage
An operator texts or sends a voice note to the ShiftSync iMessage line → bridge → `POST /api/statements` for their draft handoff; clarification questions are mirrored back. Same pipeline, same rules. See `PHOTON_BRIDGE.md`.

## Fallbacks
| Failure | Fallback |
|---|---|
| Nemotron slow/down | `LLM_PROVIDER=claude`, restart |
| STT fails | Keep audio, show "couldn't transcribe" + text box |
| Invalid LLM JSON twice | No state change; show "Couldn't analyze that. Try again or type it." |
| Grader unsure | `partially_consistent` (never `consistent` by default) |
| Venue Wi-Fi | Local Whisper + replay from `demo/scenario.json` + `demo_snapshot.db` |
