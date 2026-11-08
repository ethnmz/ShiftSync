# Team plan

Roles are confirmed. The module list is the one in `CLAUDE.md`. Shared files in `docs/API.md`, `docs/DATA_MODEL.md`, and `docs/AI_PIPELINE.md` are proposed. Building them still waits on agreement from all four people. This plan does not open that agreement by itself.

| Person | Login | Role | Files |
|---|---|---|---|
| Ethan Meza | `ethnmz` | Frontend & Demo | `frontend/`, `docs/DEMO_SCRIPT.md` |
| Diego Lozano | `Navibytes` | Bridge & Voice | `photon-bridge/`, `backend/app/stt/`, `backend/app/notify.py`, `backend/app/notes/ingest.py`, `backend/app/routes/ingest.py`, `backend/app/router.py` |
| Akshi Biswal | `biswalakshi` | AI | `backend/app/llm/`, `backend/app/prompts/`, `backend/app/schemas.py`, `backend/app/notes/extract.py`, `backend/app/facts/verify.py`, `backend/app/interview/session.py`, `backend/app/check/grade.py`, `backend/app/check/session.py`, `backend/app/routes/ask.py` only if a later ask box is agreed |
| Aditri Tangeti | `aditrit06` | Ledger Core | `backend/app/models.py`, `backend/app/db.py`, `backend/app/clock.py`, `backend/app/config.py`, `backend/app/main.py`, `backend/app/notes/reconcile.py`, `backend/app/facts/status.py`, `backend/app/interview/gaps.py`, `backend/app/interview/planner.py`, `backend/app/check/questions.py`, `backend/app/handoff/state.py`, `backend/app/handoff/gate.py`, `backend/app/handoff/metrics.py`, `backend/app/handoff/briefing.py` (the confirmed, reported, and unknown groups, not an I-PASS page), `backend/app/demo/`, `backend/app/eval/`, `backend/app/routes/handoff.py`, `backend/app/routes/demo.py`, `backend/tests/test_scenario.py` |

`ask.py` is not P0. Do not build it in the first slice. There is no `backend/app/pipeline/` tree and no `readback.py`. Do not add them beside this map.

Ethan may keep the local `ethan/frontend` checkout. Frontend work starts when he chooses to, against `docs/API.md`. The app is not ready now.

## Build order

1. Agree the three shared docs, or leave them as this proposal.
2. Add `config/slots.yaml`, `config/rules.yaml`, `config/assets.yaml`, and `config/roster.yaml`, plus `demo/scenario.json`, as an implementation task. They are not in the repo. Roster phones in that file must be fictional.
3. Ingest a text note and store facts with statuses.
4. Interview within the budget of 3, one question at a time.
5. Block signoff on UNASSIGNED unknowns.
6. Run the incoming check and one correction.
7. Screens for that path only.
8. Evaluation harness from `docs/EVALUATION.md`, with no filled-in scores.

## Ownership inside shared directories

`interview/` is split: Aditri owns `gaps.py` and `planner.py`. Akshi owns `session.py`.

`check/` is split: Aditri owns `questions.py`. Akshi owns `grade.py` and `session.py`.

`facts/` is split: Aditri owns `status.py`. Akshi owns `verify.py`.

`handoff/` is Aditri's. `notes/ingest.py` is Diego's. `notes/extract.py` is Akshi's. `notes/reconcile.py` is Aditri's.
