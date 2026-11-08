# Import notes

These notes are not part of the ten uploaded files. The uploads were copied into the paths below without editing their wording.

| Uploaded heading | Path in this repo |
|---|---|
| CLAUDE.md — ShiftSync | `CLAUDE.md` after the `@AGENTS.md` line |
| Product Spec: Handoff Ledger | `docs/PRODUCT.md` |
| Architecture | `docs/ARCHITECTURE.md` |
| Data Model (SQLModel + SQLite) | `docs/DATA_MODEL.md` |
| API Contract | `docs/API.md` |
| AI Pipeline | `docs/AI_PIPELINE.md` |
| Photon Bridge (iMessage) | `docs/PHOTON_BRIDGE.md` |
| UI Spec (frontend/) | `docs/UI.md` |
| Demo Script (~3 minutes) | `docs/DEMO_SCRIPT.md` |
| Team Plan: 4 people, overnight | `docs/TEAM_PLAN.md` |

`docs/PRODUCT.md` is the scope document from the pack. `AGENTS.md` is the collaboration rules. The uploaded guide tells you to read `docs/PRODUCT.md` first.

## Not in the upload

`CLAUDE.md` lists `docs/EVALUATION.md` (four metrics across three conditions). That file was not among the ten uploads. It is not invented here.

Also named by the pack and not included: `.env.example`, `config/slots.yaml`, `config/rules.yaml`, `config/assets.yaml`, `config/runbooks.yaml`, `config/roster.yaml`, `demo/scenario.json`, and `eval/scenarios/*.json`. No application tree was created.

The only phone number in the copies is the fictional `+15550100002` in `docs/API.md`. No project secret was in the uploads. The Photon page names the public hackathon promo code `HACKWITHPHOTON` and the env var names for a project id and secret. Real values stay in an uncommitted `.env`.

## Two descriptions in one pack

The uploaded `CLAUDE.md` centers understanding transfer: an outgoing interview and an incoming open-ended check. Its backend map is `notes/`, `facts/`, `interview/`, `check/`, `handoff/` (`state`, `gate`, `metrics`, `briefing`), `ask.py`, and `eval/`.

`docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATA_MODEL.md`, `docs/AI_PIPELINE.md`, `docs/UI.md`, and `docs/DEMO_SCRIPT.md` still describe the fuller ledger: I-PASS briefing, read-back, conflict HALT, and the older modules (`pipeline/`, `handoff/clarify.py`, `readback.py`, `rules.py`, `conflicts.py`, `stale.py`). `docs/TEAM_PLAN.md` assigns those older filenames. The four role names did not change.

Do not start both trees. `AGENTS.md` gives each new module one owner. Cutting or keeping a ledger feature that the guide no longer names is a contract change: all four agree on the board first.

## Warnings kept off the source text

- Sponsor lines in the guide, the product spec, and the team plan say the project is eligible for Photon and Nvidia and should be selected on Devpost. This import does not confirm eligibility or qualification.
- `docs/AI_PIPELINE.md` names `claude-sonnet-5-5` and `claude-haiku-5-5`, and points at Nemotron model cards for the slug. Those ids were not verified here. Do not treat them as known-good model ids.
- The handoff score and the covered / missed / misstated grade are demo metrics. They do not certify that someone understood, and they do not certify a safe facility. RED / AMBER / GREEN is a label computed from the spec, not a safety certification.
- `docs/DEMO_SCRIPT.md` is a rehearsal of about three minutes. A submitted video is often limited to two minutes. The ten files do not state a two-minute limit; do not rehearse the three-minute script as if it were the submission cut.
- HALT text tells a person not to proceed. That is a message in the demo. It is not a control system, not permission to do physical work, and not permission to skip it. People on site decide.

## Role file crosswalk

Confirmed names: Ethan Meza, Frontend & Demo; Diego Lozano, Bridge & Voice; Akshi Biswal, AI; Aditri Tangeti, Ledger Core. GitHub logins other than `ethnmz` are still unknown.

`docs/TEAM_PLAN.md` path → file to use from the uploaded guide → owner:

| Team-plan path | Use this file instead | Owner |
|---|---|---|
| `photon-bridge/` | `photon-bridge/` | Diego |
| `backend/app/stt/` | `backend/app/stt/` | Diego |
| `routes/ingest.py` | `backend/app/routes/ingest.py`, `backend/app/notes/ingest.py` | Diego |
| `notify.py` | `backend/app/notify.py` | Diego |
| `backend/app/llm/`, `prompts/` | same | Akshi |
| `pipeline/extract.py` | `backend/app/notes/extract.py` | Akshi |
| `handoff/clarify.py` | `backend/app/interview/session.py` | Akshi |
| `readback.py` | `backend/app/check/grade.py`, `backend/app/check/session.py` | Akshi |
| `ask.py` | `backend/app/ask.py`, `backend/app/routes/ask.py` | Akshi |
| `tests/test_scenario.py` | `backend/tests/test_scenario.py` | Akshi |
| `models.py` | `backend/app/models.py`, `backend/app/db.py` | Aditri |
| `pipeline/reconcile.py` | `backend/app/notes/reconcile.py` | Aditri |
| `rules.py`, `conflicts.py`, `stale.py` | no parallel modules; deterministic status, gate, and metrics below | Aditri |
| `handoff/state.py` | `backend/app/handoff/state.py` | Aditri |
| `score.py` | `backend/app/handoff/metrics.py`, `backend/app/handoff/gate.py` | Aditri |
| `briefing.py` | `backend/app/handoff/briefing.py` | Aditri |
| `demo/` | `backend/app/demo/`, `backend/app/routes/demo.py` | Aditri |
| `frontend/`, `docs/DEMO_SCRIPT.md` | same | Ethan |

Modules the guide adds and the team plan does not name:

| File | Owner | Why this person |
|---|---|---|
| `backend/app/router.py` | Diego | Inbound dispatch. Changing message kinds is a team contract. |
| `backend/app/schemas.py` | Akshi | Schemas were the AI role. Field changes are a team contract. |
| `backend/app/facts/verify.py` | Akshi | Quote verification was the AI role. |
| `backend/app/facts/status.py` | Aditri | Code, not the model, sets confirmed / reported / unknown. |
| `backend/app/interview/gaps.py`, `interview/planner.py` | Aditri | Which gaps exist and which question is next are deterministic. |
| `backend/app/check/questions.py` | Aditri | Same deterministic choice for the check. |
| `backend/app/main.py`, `clock.py`, `config.py` | Aditri | App assembly and ledger configuration. |
| `backend/app/eval/` | Aditri | Metrics. The missing `docs/EVALUATION.md` is not filled in here. |
| `backend/app/routes/handoff.py` | Aditri | Handoff routes sit with the state machine. |

`docs/API.md`, `docs/DATA_MODEL.md`, and `docs/AI_PIPELINE.md` are shared contracts. All four agree on the board before a change, then one person edits: Aditri for the API and data model, Akshi for the AI pipeline.

The pack does not require a 3D view. A P2 floor-plan mention in `docs/PRODUCT.md` is not a 3D task and is not P0.
