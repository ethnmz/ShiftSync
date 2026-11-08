# Team plan (abridged)

Provenance: abridged from the uploaded `CLAUDE.md` and `TEAM_PLAN.md`, approved by Ethan on Nov 7, 2026. This is not the original team-plan document and not the rest of the ten-file specification. Those files were not imported. Roles below are confirmed. Interface names and paths are the intended map. Their implementation is proposed. Field-level schemas were not in the abridged handoff, so this file does not invent them.

## Roles

| Person | Confirmed role | Paths |
|---|---|---|
| Ethan Meza (`ethnmz`) | Frontend, screens, demo | `frontend/`, `docs/DEMO_SCRIPT.md` |
| Diego Lozano (`GITHUB_LOGIN_DIEGO`) | Photon messaging, voice input | `photon-bridge/`, `backend/app/stt/`, `backend/app/routes/ingest.py`, `backend/app/notify.py` |
| Akshi Biswal (`GITHUB_LOGIN_AKSHI`) | AI extraction, prompts, checks | `backend/app/llm/`, `backend/app/prompts/`, `backend/app/pipeline/extract.py`, `backend/app/handoff/clarify.py`, `backend/app/handoff/readback.py`, `backend/app/ask.py`, `backend/tests/test_scenario.py` |
| Aditri Tangeti (`GITHUB_LOGIN_ADITRI`) | Database, equipment rules, handoff logic | `backend/app/models.py`, `backend/app/pipeline/reconcile.py`, `backend/app/pipeline/rules.py`, `backend/app/pipeline/conflicts.py`, `backend/app/pipeline/stale.py`, `backend/app/handoff/state.py`, `backend/app/handoff/score.py`, `backend/app/handoff/briefing.py`, `backend/app/demo/` |

`GITHUB_LOGIN_DIEGO`, `GITHUB_LOGIN_AKSHI`, and `GITHUB_LOGIN_ADITRI` are placeholders. The handoff included phone setup with Diego's bridge work and a scenario test with Akshi's checks. It did not include GitHub usernames.

The frontend is meant to build against fixtures first. The five AI tasks named in the handoff are extract, clarify, brief, readback, and ask, through `backend/app/llm/client.py` `complete_json`. That client file is inside Akshi's `backend/app/llm/` tree. It is not in the repo yet.

## Shared interfaces (proposed)

The handoff names four shared surfaces and who they sit between. It does not include their fields. All four people agree on the board before anyone builds or changes them.

| Name | Between |
|---|---|
| ExtractionResult | Akshi and Aditri |
| Ingest response | Diego and Aditri |
| Briefing, gate, and score | Aditri and Ethan |
| Bridge `/send` | Diego and Aditri |

## Intended stack (not installed)

From the same abridged handoff. This pull request does not install it and does not add provider credentials.

- `backend/`: FastAPI, Python 3.11, SQLModel, SQLite, Pydantic v2.
- `frontend/`: React, Vite, TypeScript, Tailwind, TanStack Query polling.
- `photon-bridge/`: TypeScript on Spectrum.
- Spacetime is not part of this stack.
- Claude, Nemotron, and speech-to-text providers are configurable in the handoff. Model slugs in the source pack were not verified, so this file does not repeat them as valid ids.
- Photon or Nvidia sponsor-track eligibility was not verified.

## Rules that travel with the data

- The model extracts. Code decides severity, closure, and gates.
- Item events are append-only. An item stays unresolved until a closing observation that cites a source.
- Every fact quotes a source. Validate the quote, the schema, and the asset id. Retry once, then use a review-safe fallback.
- A fuzzy quote match does not prove the fact is true.
- The demo clock is simulated. Equipment dependencies come from configuration, not from the model.
- Offline synthetic replay and a scenario regression test are part of the intended demo. The test file is Akshi's `backend/tests/test_scenario.py`.
- No secrets and no real phone numbers.

## 3D view

Pending a separate scope decision. Not required, and not cancelled, by this role update.

## Missing from this repo

`PRODUCT.md`, `ARCHITECTURE`, `DATA_MODEL`, `API`, `AI_PIPELINE`, `PHOTON_BRIDGE`, `UI`, `DEMO_SCRIPT`, the original `TEAM_PLAN`, asset/rule/runbook/roster config, and `demo/scenario.json` were named as intent and were not copied in.
