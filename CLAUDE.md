@AGENTS.md

This guide is the product direction. `docs/PRODUCT.md` restates it for scope. If a feature list drifts from the five failure modes below, this guide wins until the team agrees on a change. `AGENTS.md` wins on the board, branches, and file owners. `docs/IMPORT_NOTES.md` says what is not built yet.

# CLAUDE.md — ShiftSync

HackUTD 2026 · **NorthMark Compute & Cloud (NMC²)** track ("Keep the World Running"). Photon and Nvidia are optional submission choices. This repository does not confirm sponsor eligibility.

## The problem we own

> **Information is communicated, but the meaning doesn't always transfer.**

Shift A believes they explained the situation. Shift B believes they understood it. They leave with different interpretations. Example: Shift A says *"The UPS vendor is coming back tomorrow. Everything should be fine."* Shift A means *"work is unfinished; the vendor still has to verify."* Shift B hears *"maintenance is done."*

Basic handoff software (note organization, carrying tasks forward, acknowledgment buttons, audit logs) **already exists** (e.g. TeamAssurance, Shift Handover Log). We build those only as plumbing and **never pitch them as the innovation**.

## The product in one paragraph

**ShiftSync turns a rushed, messy handoff into a short, two-way conversation** over iMessage (via Photon). The outgoing lead sends one end-of-shift voice note. The **Handoff Interviewer** asks only the few questions needed to pin down vague statements, missing safety details, the *reasons* behind decisions and *who owns each unknown*. Then the **Understanding Check** asks the incoming lead open-ended questions, grades their answers against Shift A's confirmed handoff, catches misunderstandings and corrects them until the meaning has transferred. Unknowns stay explicitly unknown, never quietly upgraded to "done".

**Product principle: Maximum understanding. Minimum effort.**

## The five failure modes (every feature must map to one)

| # | Failure mode | ShiftSync's response | Where in code |
|---|---|---|---|
| 1 | Hidden assumptions ("it's handled") | Detect vague language; ask for the missing operational detail | `interview/gaps.py` (vague, hedge), `prompts/interview.md` |
| 2 | False understanding (clicks "acknowledge" without understanding) | Open-ended understanding check graded against the confirmed record, plus a correction loop | `check/` |
| 3 | Lost reasoning (knows *what*, not *why*) | Capture rationale, conditions and exceptions as required facts | slots `rationale`, `restore_condition`, `contingency` |
| 4 | Unresolved uncertainty (nobody knows, looks complete) | Every fact is `confirmed` / `reported` / `unknown`; unknowns need a human-assigned owner and due time | `Fact.status`, `follow_up` |
| 5 | Handoff fatigue (long forms get rushed) | Adaptive: ask only for missing *critical* slots, strict question budget, one question at a time | `interview/planner.py`, `config/slots.yaml` |

Read `docs/PRODUCT.md` for the feature list. It matches this guide. Scope changes still need the team agreement in `AGENTS.md`.

## Non-negotiable design principles

1. **Never make something look more certain than it is.** Hedged statements ("I think", "should be fine", "probably") can only produce `reported` facts, never `confirmed`. Code enforces this with the hedge lexicon in `config/slots.yaml`, whatever the LLM says.
2. **Never invent owners, times or facts.** Follow-up owners and due times come from a human answer. If nobody gives one, the unknown is shown as **UNASSIGNED** and blocks completion.
3. **Ask less, ask better.** The interviewer has a question budget (default 3 per outgoing lead). Gaps on non-safety slots are recorded as "not asked (low priority)" rather than asked.
4. **The LLM interprets; code decides.** LLMs extract facts, phrase questions and grade answers. Which gaps exist, which question comes next, severity, gating and scoring are deterministic code driven by `config/slots.yaml` and `config/rules.yaml`.
5. **Every fact cites its source.** Each fact carries a verbatim quote verified against the transcript (fuzzy ≥ 0.85) and who said it.
6. **Prove it.** `eval/` compares ShiftSync against (a) raw notes and (b) a plain AI summary on the same scenarios, using four metrics: completeness, interpretation, action clarity and efficiency.
7. **Demo reliability beats features.** Everything replays offline from `demo/scenario.json`.

## Repo layout

```
shiftsync/
├── CLAUDE.md
├── .env.example
├── docs/
│   ├── PRODUCT.md        ← problem, 5 failure modes, P0/P1/P2
│   ├── ARCHITECTURE.md   ← components, conversation routing, interview + check loops
│   ├── DATA_MODEL.md     ← Item, Fact (confirmed/reported/unknown), Interview, Check, metrics
│   ├── API.md            ← REST contract
│   ├── AI_PIPELINE.md    ← providers, prompts, schemas, guardrails
│   ├── EVALUATION.md     ← how we prove we're better (4 metrics × 3 conditions)
│   ├── PHOTON_BRIDGE.md  ← iMessage bridge (spectrum-ts, TypeScript)
│   ├── UI.md             ← screens
│   ├── DEMO_SCRIPT.md    ← submitted cut ≤2 min; longer rehearsal kept separate
│   └── TEAM_PLAN.md      ← 4 people, overnight milestones
├── config/
│   ├── slots.yaml        ← required facts per item kind, safety flags, hedge lexicon, budget
│   ├── rules.yaml        ← gating; dependency warnings are P2 only, not the core path
│   ├── assets.yaml       ← equipment registry + dependencies + aliases
│   ├── runbooks.yaml     ← suggested contingencies
│   └── roster.yaml       ← people, roles, phones
├── demo/scenario.json    ← the demo handoff, scripted, with expected outcomes (also a test)
├── eval/scenarios/*.json ← 3 failure scenarios with ground truth for the benchmark
├── backend/              ← FastAPI (Python 3.11+)    [to build]
├── frontend/             ← React + Vite + TS         [to build]
└── photon-bridge/        ← Bun/Node + spectrum-ts    [to build]
```

## Stack

- **backend/**: Python 3.11, FastAPI, SQLModel + SQLite, Pydantic v2, `pyyaml`, `rapidfuzz`, `httpx`, `anthropic`, `openai` (NVIDIA's OpenAI-compatible endpoint + OpenAI Whisper), optional `faster-whisper`. `ffmpeg` converts iMessage audio (often `.caf`) to 16 kHz mono WAV.
- **frontend/**: React 18, Vite, TypeScript, Tailwind, TanStack Query (poll every 1.5 s), React Router.
- **photon-bridge/**: Bun (or Node ≥ 18.17) + `spectrum-ts`. Spectrum is **TypeScript-only**, hence a separate process.
- **LLM**: `LLM_PROVIDER=claude|nemotron` with per-task overrides. **STT**: `STT_PROVIDER=openai|local`. Photon delivers voice-note audio but **no transcript**.

## Commands (create as you scaffold)

```bash
cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
pytest -q                                  # unit + scenario test
python -m app.demo.seed --reset            # load config + history
python -m app.demo.seed --step 3           # replay demo step 3 through the real pipeline
python -m app.eval.run                     # benchmark → backend/data/eval_results.json

cd frontend && npm install && npm run dev  # :5173, proxies /api → :8000
cd photon-bridge && bun install && bun run dev
```

## Backend module map

`app/main.py`, `db.py`, `models.py`, `schemas.py`, `clock.py`, `config.py`, `llm/` (providers + `complete_json`), `stt/`, `notify.py` (→ bridge), `router.py` (decides whether an inbound message is a shift note, an interview answer or a check answer), `notes/` (`ingest.py`, `extract.py`, `reconcile.py`), `facts/` (`status.py`: hedge enforcement, `verify.py`: quote check), `interview/` (`gaps.py`, `planner.py`, `session.py`), `check/` (`questions.py`, `grade.py`, `session.py`), `handoff/` (`state.py`, `gate.py`, `metrics.py`, `briefing.py`), `eval/`, `demo/`, `routes/`. `ask.py` is not on the P0 path.

## Conventions

- Time: `clock.now()` only (simulated clock for the demo).
- IDs: assets from `assets.yaml` (`UPS-B`, `BRK-4`, `CHL-2`); items `I-0001`, facts `F-0001`, memos `M-0001`, questions `Q-0001`, checks `C-0001`.
- All LLM calls go through `app/llm/client.py::complete_json(task, system, user, schema)` with Pydantic validation, one retry, then a safe fallback (never guess).
- Prompts live in `backend/app/prompts/*.md` (copied from `docs/AI_PIPELINE.md`). Log every LLM call to `data/llm_log.jsonl`.
- Frontend: `src/screens/<Screen>/`, `src/components/`, `src/api/` (types mirror `docs/API.md`, fixtures in `src/api/fixtures/`).
- Keep it small. This is a hackathon. If a feature doesn't map to one of the 5 failure modes, don't build it.

## Testing

- `tests/test_scenario.py` replays `demo/scenario.json` and asserts each step's `expect` block. Run it after every prompt edit.
- Unit-test the deterministic parts: `gaps.py`, `planner.py` (budget + priority), `status.py` (hedge downgrade), `gate.py`, `metrics.py`, `verify.py`.

## Security and privacy

Only roster numbers are accepted; unknown senders are rejected and not stored. Keys only in `.env`. Audio stays local in `backend/data/audio/`. Only the configured STT/LLM providers see content. Every confirmation, correction and sign-off is recorded with person, time and quote.
