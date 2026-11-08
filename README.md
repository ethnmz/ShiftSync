# ShiftSync

**Less chaos. Clearer communication. Faster handoffs.**

ShiftSync is a two-way shift-handoff tool for data center operators, built at HackUTD 2026. At a shift change, the outgoing operator says something like "UPS-B is mostly finished, everything else should be okay," and the incoming operator hears "finished" and "okay." ShiftSync catches the vague and missing parts before the outgoing shift leaves. It keeps uncertain claims marked as uncertain. Then it asks the incoming operator a few targeted questions and checks the answers against what was actually said.

It is not a note-taker or a summary dashboard. The goal is a handoff where both sides understand the same thing, at low effort for tired operators.

> Acknowledging or checking a handoff is software state only. A correct answer on a source-grounded check does not prove that someone understood, and it never certifies that equipment is safe or that an issue is closed. Clearance must go through the facility's authorized procedures.

## How a handoff works

1. **Outgoing note.** Shift A records a voice note or types one.
2. **Analysis.** The note becomes items and facts: equipment, completed and unfinished work, decisions and their reasons, owners and deadlines. Each fact links to a verbatim quote and gets a certainty level: `confirmed`, `reported`, `unverified` or `unknown`. Code lowers certainty when the words are hedged ("mostly", "I think", "looks good"). It never raises it.
3. **Targeted clarifications.** ShiftSync asks at most three questions, one at a time and most important first. One tap answers "I don't know". Gaps it chose not to ask about are listed as "Not asked".
4. **Operator review.** Shift A checks or edits each critical fact, then submits. AI-extracted facts stay tagged until a person reviews them.
5. **Incoming briefing.** Shift B sees critical and unresolved items first, with the source quotes and open follow-ups. A follow-up owner shows as "To be assigned" until a lead or supervisor assigns one.
6. **Acknowledgment.** Shift B acknowledges receipt. This is its own step and timestamp, and the UI labels it "understanding not yet verified".
7. **Understanding check.** Shift B answers open questions in their own words. A wrong answer shows Shift A's original quotes, and Shift B gets another attempt. After two misses, a lead talks to Shift A and marks the check "clarified in person". That action is logged.

Open follow-ups stay open after the check. Whether an *unassigned* follow-up should block completion is still an open team decision. See [docs/CONTRACT_MIGRATION.md](docs/CONTRACT_MIGRATION.md).

## What exists today

The project is mid-hackathon, and the code is spread across branches. Here is the honest state.

| Area | State | Where |
|---|---|---|
| Web frontend: Home, Create (Record, Clarify, Review), Receive (briefing, acknowledgment, understanding check, follow-ups) | Built. Runs on **offline fixtures by default**. | `frontend/` on branch `ethan/frontend` (not yet merged to `main`) |
| Backend core: SQLite models, handoff state machine, gap detection, question planner and budget, certainty floor, verdict floor, follow-up ownership rules, demo seed, Shift A and follow-up routes | Merged. 84 backend tests pass. | `backend/` on `main` (PR #9) |
| Shift B routes: briefing, acknowledgment, verification, clarified in person | Open PR | [#12](https://github.com/ethnmz/hackutd2026/pull/12) |
| LLM extraction with validated output and quote checks | Open PR | [#14](https://github.com/ethnmz/hackutd2026/pull/14) |
| Speech-to-text (OpenAI Whisper or local `faster-whisper`) | Open PR | [#11](https://github.com/ethnmz/hackutd2026/pull/11) |
| Demo replay routes and the benchmark runner | Open PR | [#13](https://github.com/ethnmz/hackutd2026/pull/13) |
| Statement and voice-answer ingest routes | Branch, no PR yet | `diego/ingest-route` |
| History, Supervisor and Evaluation screens | Not built (P1). The routes show a "not built yet" page. | — |
| Photon iMessage bridge | Not built (optional P1). No `photon-bridge/` folder exists. | [docs/PHOTON_BRIDGE.md](docs/PHOTON_BRIDGE.md) |
| Outlook integration | Not built (P2) | — |

### Offline demo vs live API

- **Offline demo (default).** With no backend, the frontend replays [demo/scenario.json](demo/scenario.json) in the browser through `frontend/src/api/fixtures/sim.ts`. The first note loads the scripted scenario whatever you say or type, and later answers replay the scripted ones. Fixture mode does not transcribe audio or call a model. It is a rehearsal of the flow, not a test of the AI.
- **Live API.** Start the frontend with `VITE_API_MODE=live` and it calls FastAPI through the Vite `/api` proxy on port 8000. `main` alone does not yet support the full flow live: statement ingest, extraction, transcription and the Shift B routes are in the open PRs above.
- **Demo identity.** A user switcher (Maya, Jordan, Dana from [config/roster.yaml](config/roster.yaml)) sends an `X-User` header. It is a demo selector, not sign-in.

## Architecture

```
Browser (React)  ──/api──▶  FastAPI backend  ──▶  SQLite  (backend/data/shiftsync.db)
  Create · Receive             routes → handoff service (deterministic state machine)
  voice via MediaRecorder      clarify/  certainty/  verify/  followups/  briefing/
                                    │
                                    └──▶  LLM (Nemotron or Claude) · speech-to-text (Whisper)
                                          used for extraction, wording, grading only
```

Deterministic code owns handoff states, required facts, priority, the question budget, certainty floors, verdict floors and acknowledgment tracking. Models extract facts, phrase questions, write briefing lines and grade answers. Code then checks every quote against the source and caps the result. Every LLM call is meant to go through one function that validates the output and falls back to "change nothing" on failure. Product config lives in [config/](config/) (`slots.yaml`, `rules.yaml`, `assets.yaml`, `roster.yaml`, `runbooks.yaml`). Full design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Stack (from the repo's manifests):**
- Frontend: React 18.3, TypeScript 5.6, Vite 5.4, Tailwind CSS 3.4, TanStack Query 5, React Router 6, Vitest 2, Inter bundled locally.
- Backend: FastAPI, Uvicorn, SQLModel on SQLite, Pydantic v2, PyYAML, rapidfuzz, `openai` and `anthropic` SDKs, pytest.
- LLM: `LLM_PROVIDER=nemotron` (NVIDIA's OpenAI-compatible endpoint) or `claude`. The model ids in `.env.example` are blank on purpose until someone confirms a current model card.

## Run it locally

Prerequisites: Node and npm for the frontend, and Python 3.11+ for the backend. The backend tests were also run on Python 3.13.

### Offline demo (frontend only, no keys)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Start a handoff under **New handoff**, or open **Receive** and press **Load the scripted demo handoff**. In development an Agentation feedback toolbar also mounts. It posts to a local tool on `localhost:4747` and does nothing if that tool isn't running.

Other frontend scripts:

```bash
npm test            # vitest: review, submit and receive rules against the fixtures
npm run typecheck   # tsc -b
npm run build       # typecheck + production build into dist/
```

### Backend (from a checkout of `main`)

`backend/` is on `main` and not on `ethan/frontend` yet.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
python -m app.demo.seed --reset
uvicorn app.main:app --reload --port 8000
```

`GET /api/health` returns `{"ok": true}`. To point the frontend at it, run `VITE_API_MODE=live npm run dev` in `frontend/`.

### Environment variables

Copy [.env.example](.env.example) to `.env` and fill in only what you need. `.env` is gitignored. Never commit keys. The backend on `main` reads these from the process environment and does not load `.env` by itself, so export them in your shell or use a loader of your choice.

| Variable | Used for |
|---|---|
| `DATABASE_URL`, `CONFIG_DIR`, `SCENARIO_PATH`, `EVAL_DIR` | Paths. Defaults work from `backend/`. |
| `LLM_PROVIDER` | `nemotron` or `claude` |
| `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NEMOTRON_MODEL` | Nemotron (model id left blank until confirmed) |
| `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | Claude fallback |
| `STT_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_STT_MODEL`, `LOCAL_WHISPER_MODEL` | Speech-to-text (PR #11) |
| `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `BACKEND_URL`, `BRIDGE_PORT` | Optional Photon bridge (not built) |
| `VITE_API_MODE` | Frontend. Set to `live` to use the backend. Anything else uses fixtures. |

The core tests and the offline demo need no keys.

## Tests and evaluation

- **Backend** (`main`): `pytest -q` covers the certainty floor, gap detection, question planner, verdict floor, state transitions, follow-up ownership, the database and the handoff service. 84 tests pass on `main` at `d252039`.
- **Frontend**: `npm test` runs 12 flow tests against the fixture simulator. Covered: certainty is never raised without an operator statement, submit is blocked until critical facts are checked, acknowledgment is separate from verification, a wrong answer allows a retry, the "clarified in person" path, and that only a lead or supervisor assigns owners.
- **Benchmark**: [docs/EVALUATION.md](docs/EVALUATION.md) defines the method. It compares a normal handoff, a basic AI summary and ShiftSync on four fictional scenarios in [eval/scenarios/](eval/scenarios/), and it counts incorrect facts introduced by AI. The runner (`python -m app.eval.run`) is in open PR #13 and needs a configured LLM. **No benchmark results have been recorded yet, and this README makes no performance claims.** Simulated operators are a proxy for real people.

## Team

| Person | GitHub | Role | Owns |
|---|---|---|---|
| Ethan Meza (lead) | `ethnmz` | Frontend & Demo | `frontend/` (all screens), UI spec, demo script, pitch and video |
| Diego Lozano | `Navibytes` | Bridge & Voice | Speech-to-text, statement and voice-answer ingest, optional Photon bridge |
| Akshi Biswal | `biswalakshi` | AI | LLM client, prompts, extraction, quote check, grading call |
| Aditri Tangeti | `aditrit06` | Core Logic & Data | Models, SQLite, state machine, gaps, planner, follow-ups, briefing selection, certainty and verdict floors, demo seed, eval runner, backend tests |

Full path ownership is in [AGENTS.md](AGENTS.md) and [docs/TEAM_PLAN.md](docs/TEAM_PLAN.md).

HackUTD 2026, NorthMark Compute & Cloud (NMC²) track. The spec pack also mentions NVIDIA (Nemotron) and Photon. This repo does not claim eligibility for any sponsor prize.

## Docs

| Doc | What it covers |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | Scope, the five handoff problems, completion semantics |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Components, state machine, pipeline stages, fallbacks |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md), [docs/API.md](docs/API.md) | Shared contracts (editor: Aditri) |
| [docs/AI_PIPELINE.md](docs/AI_PIPELINE.md) | Model tasks and prompts (editor: Akshi) |
| [docs/UI.md](docs/UI.md) | Screens and visual language |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | Demo rehearsal and judge Q&A |
| [docs/EVALUATION.md](docs/EVALUATION.md) | Benchmark method and honesty rules |
| [docs/CONTRACT_MIGRATION.md](docs/CONTRACT_MIGRATION.md) | Changes from the in-person agreement and open decisions |
| [docs/PHOTON_BRIDGE.md](docs/PHOTON_BRIDGE.md) | Optional iMessage channel (not built) |
| [CLAUDE.md](CLAUDE.md) | Project guide for coding agents |

No demo video or screenshots are published yet.

## Team coordination

Agents and humans coordinate on the [Message Board, issue #1](https://github.com/ethnmz/hackutd2026/issues/1). The rules are in [AGENTS.md](AGENTS.md), local `gh` setup is in [docs/coordination.md](docs/coordination.md), and each person's guide is in [docs/onboarding/README.md](docs/onboarding/README.md).

Cloning does not log you in. Run `gh auth login` as yourself, then `tools/board whoami`. Use one `gh` login per person, because `unread` and `wait` hide posts from the login running them.

| Command | What it does |
|---|---|
| `tools/board post "[Name's Agent] ..."` | Posts to the board. Every post starts with whose agent it is. |
| `tools/board unread` | Shows new posts and flags the ones that mention you |
| `tools/board wait` | Blocks until someone else posts (checks every 30 s, `--interval 60` to slow it) |
| `tools/board read -n 20` | Shows the last 20 posts |
| `tools/board whoami` | Prints your GitHub login |
| `tools/board coord on` | Lets this checkout's agent post routine notes without approval per message |

The script needs only `bash`, `git` and the [GitHub CLI](https://cli.github.com). Claude Code uses the hooks in `.claude/`. Codex and other tools run `tools/board unread` before each task. Merges and releases stay with a human.

The board tooling came from the [azizu06/hackathon-agent-board](https://github.com/azizu06/hackathon-agent-board) template.
