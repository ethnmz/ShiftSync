@AGENTS.md

# CLAUDE.md — ShiftSync

> **Less chaos. Clearer communication. Faster handoffs.**

HackUTD 2026 · NorthMark Compute & Cloud (NMC²) track. 24-hour hackathon. The pack also names Nvidia (Nemotron) and, if the optional iMessage channel is built, Photon. This repository does not confirm sponsor eligibility.

You are the team's senior full-stack engineer, AI architect and product design partner. This file is the permanent project context. **Read it at the start of every session.** Detailed specs live in `docs/`. This file wins on product behavior if a doc conflicts. `AGENTS.md` wins on who owns a file, branches, and the board. The role table in the original pack's team plan is not the team's split.

---

## 1. Product vision

**Core problem:** critical operational information is lost, misunderstood, left unresolved or communicated ambiguously during shift-to-shift handoffs.

ShiftSync helps **outgoing operators communicate the right information** and **incoming operators understand what they are taking responsibility for**.

- We are **not** building an AI note-taker or a summarization dashboard.
- We **are** building a **two-way, AI-assisted handoff process** that improves completeness, clarity, understanding and accountability **while minimizing operator effort**.
- **Scope: shift handoffs only.** No predictive maintenance, equipment control, facility-wide monitoring or unrelated data center operations.

**Ultimate goal:** outgoing operators communicate naturally, AI catches important gaps, uncertainty stays visible, and incoming operators demonstrate understanding before the handoff is considered verified.

## 2. The five problems (every feature must serve at least one)

| # | Problem | Solution | Key rule |
|---|---|---|---|
| 1 | **Hidden assumptions**: "everything is fine", "it's handled", "the vendor should be done" | **Clarification Engine**: detect vague/incomplete language, identify what's missing, ask specific questions *before Shift A submits* | Never assume a task is complete without explicit confirmation |
| 2 | **False understanding**: Shift B acknowledges without understanding | **Two-Way Understanding Verification**: concise briefing, targeted questions, natural-language answers compared with verified handoff info, misunderstandings shown **with original evidence**, another attempt allowed | **Acknowledgment ≠ verified understanding**: record them separately |
| 3 | **Lost reasoning**: what happened, but not why | **Decision Context Preservation**: identify decisions, extract rationale, ask when an important rationale is missing, keep restrictions/conditions/exceptions, link to source | Shift B sees both *what* and *why* |
| 4 | **Unresolved uncertainty**: unknowns look complete | **Uncertainty & Follow-Up Tracking**: classify every fact `confirmed / reported / unverified / unknown`; ask whether key claims are verified; follow-ups with owner + deadline assigned by authorized users; unresolved items stay visible across handoffs | **Never** convert uncertain statements into confirmed facts |
| 5 | **Handoff fatigue** | **Adaptive, low-friction**: voice-first (text alternative), auto-extraction, never re-ask what's answered, ask only the most important missing questions, one-tap "Unknown", quick corrections, easy review | Mandatory safety checks are never skipped for convenience |

## 3. Core user journey (one seamless experience)

1. **Outgoing handoff**: Shift A records (or types) a natural-language handoff.
2. **AI analysis**: extract equipment/locations, completed work, unfinished work, critical warnings, decisions + rationale, uncertainties, follow-up actions, owners and deadlines.
3. **Adaptive clarification**: targeted questions about important omissions, ambiguity and uncertainty (prioritized, budgeted, one at a time).
4. **Handoff review**: Shift A reviews/edits the structured handoff and submits.
5. **Incoming briefing**: Shift B gets a concise, prioritized handoff distinguishing confirmed facts, reported claims, unverified claims, unknowns and outstanding responsibilities.
6. **Understanding verification**: Shift B answers targeted questions; ShiftSync detects misunderstandings, shows evidence, allows another attempt.
7. **Completion**: track submitted, acknowledged, verification results, unresolved questions, assigned follow-ups, completion status.

> A handoff can be received while operational issues remain unresolved. **Never imply that acknowledgment, verification or completion proves safety or closes those issues.**

## 4. Screens (see `docs/UI.md`)
1. **Shift A: Create Handoff**: big record button, text alternative, transcript, extracted items, clarification questions, editable structured summary, review and submit.
2. **Shift B: Receive Handoff**: prioritized briefing (critical/unresolved first), equipment cards, source statements, next actions and owners, verification interaction, acknowledgment controls.
3. **Handoff History** (P1): past handoffs, status, timestamps, outstanding questions, pending acknowledgments, evidence and clarification history.
4. **Supervisor View** (P1, minimal): pending/completed handoffs, unresolved questions, outstanding acknowledgments, verification status. **Handoff quality only, no facility monitoring.**
5. **Evaluation** (P1): benchmark results (see `docs/EVALUATION.md`).

## 5. AI architecture and hard rules

AI is used for: speech transcription, structured extraction, ambiguity detection, clarification questions, decision-rationale extraction, uncertainty classification, briefing generation and understanding verification. **Structured outputs validated by Pydantic schemas, always.**

Keep **four layers** separate in data and UI:
1. **Source statements**: verbatim transcripts and answers (immutable).
2. **AI-extracted information**: `review_state = ai_extracted` (shown with an "AI" tag until reviewed).
3. **Operator-confirmed information**: `review_state = operator_confirmed | operator_edited` (after Shift A's review).
4. **Unverified information**: certainty `unverified` / `unknown`, which is visible everywhere and never hidden by review.

**Never hallucinate** equipment status, owners, deadlines, safety clearance or maintenance completion. Every important fact links to a verbatim source quote (code-verified). **Deterministic code** owns handoff states, required fields, priority, question budget, certainty floors, verdict floors and acknowledgment tracking; LLMs never decide these alone. **AI must not authorize equipment operations or replace facility safety procedures.** Corrections say things like "must be verified through authorized procedures", never "you may proceed".

## 6. Tech stack
- **frontend/**: React 18 + TypeScript + Vite + Tailwind CSS, TanStack Query, React Router. Voice via browser `MediaRecorder`.
- **backend/**: Python 3.11 FastAPI, SQLModel + **SQLite** (persistent: `backend/data/shiftsync.db`), Pydantic v2, `rapidfuzz`, `openai` SDK (NVIDIA's OpenAI-compatible endpoint and OpenAI Whisper), `anthropic` (fallback provider), optional `faster-whisper`, `ffmpeg`.
- **LLM**: `LLM_PROVIDER=nemotron` or `claude`. The pack prefers Nemotron with Claude as a fallback. Model ids in `.env.example` are blank until someone confirms a current model card. Do not treat an unverified slug as valid.
- **STT**: `STT_PROVIDER=openai|local`.
- **Optional channel (P1)**: Photon iMessage bridge (`photon-bridge/`, TypeScript) so operators can send voice notes from their phone into the same pipeline. See `docs/PHOTON_BRIDGE.md`.
- **P2**: Outlook integration only if it directly feeds handoff information (e.g. vendor visit times).

## 7. Repo layout
```
shiftsync/
├── CLAUDE.md
├── .env.example
├── docs/      PRODUCT · ARCHITECTURE · DATA_MODEL · API · AI_PIPELINE · UI · EVALUATION · DEMO_SCRIPT · TEAM_PLAN · PHOTON_BRIDGE
├── config/    slots.yaml (required facts, language lexicons, budgets) · rules.yaml (severity, states) · assets.yaml · roster.yaml · runbooks.yaml
├── demo/      scenario.json  (the demo, scripted + expected outcomes = regression test)
├── eval/      scenarios/*.json (benchmark scenarios with ground truth)
├── backend/   [to build]  app/{main,db,models,schemas,clock,config}.py, llm/, stt/, extract/, certainty/, clarify/, review/, briefing/, verify/, followups/, handoff/, eval/, demo/, routes/, prompts/
├── frontend/  [to build]  src/{screens,components,api}/
└── photon-bridge/ [optional]
```

## 8. Commands (create as you scaffold)
```bash
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
pytest -q                             # unit tests + demo scenario test
python -m app.demo.seed --reset       # load roster/assets + carry-over history
python -m app.eval.run                # benchmark → data/eval_results.json
cd frontend && npm install && npm run dev   # :5173, proxies /api → :8000
```

## 9. Development priorities
- **P0 (must work):** voice/text handoff creation · structured extraction · adaptive clarification · uncertainty tracking · incoming briefing · understanding verification · persistent handoff state.
- **P1:** handoff history · supervisor overview · source highlighting · additional ingestion (Photon iMessage) · evaluation dashboard.
- **P2:** Outlook integration · additional notification channels · advanced analytics.

## 10. Evaluation (see `docs/EVALUATION.md`)
Measured on predetermined fictional scenarios against **a normal handoff** and **a basic AI summary**: critical facts transferred, missing details detected, ambiguous statements clarified, misunderstandings caught, unknowns preserved, time to complete, clarification questions asked, **incorrect facts introduced by AI**. **Never claim results we haven't measured.**

## 11. Rules for Claude Code
- Always prioritize the five handoff problems; never add features without a clear link to handoff reliability.
- Keep the experience intuitive for exhausted, busy operators: big targets, short text, voice first.
- Avoid unnecessary architecture and overengineering; prefer simple, maintainable, demo-ready code.
- Keep AI suggestions visibly separate from verified information.
- Write modular, readable, typed code. **Add tests for critical handoff logic** (certainty floors, gap detection, question planning, verdict floors, state transitions, follow-up rules).
- Make the UI visually polished and responsive.
- **Never silently invent missing facts.** Make assumptions explicit (code comments + PR/commit notes) when implementing unspecified details.
- **Before large implementation changes, explain what will be built and why**, then build.
- Finish one excellent end-to-end workflow (the demo in `docs/DEMO_SCRIPT.md`) before anything else.

## 12. Conventions
- Time: `clock.now()` only (simulated clock for demos).
- IDs: assets from `config/assets.yaml` (`UPS-B`, `GEN-1`, `CHL-2`); handoffs `H-0001`, items `I-…`, facts `F-…`, statements `S-…`, questions `Q-…`, checks `V-…`, follow-ups `FU-…`.
- All LLM calls go through `app/llm/client.py::complete_json(task, system, user, schema)` (validate → 1 retry → safe fallback that changes nothing).
- Prompts live in `backend/app/prompts/*.md`; log every call to `data/llm_log.jsonl`.
- Frontend types mirror `docs/API.md`; build screens against `src/api/fixtures/` first.
- Privacy: roster-only users, keys only in `.env`, audio stored locally, only the configured STT/LLM providers see content; every acknowledgment, verification and follow-up assignment is audit-logged.
