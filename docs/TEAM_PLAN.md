# Team plan

The final spec pack shipped a different four-way split (capture UI with Shift A, Shift B UI with eval). **That split is not adopted.** The roles below are the ones the team kept. Product behavior is the pack: outgoing note, analysis, at most three clarifications, operator review and submit, briefing, a separate acknowledgment, then a targeted check with evidence and a retry.

Times in the pack assumed a Sunday-morning submission. They were not re-checked. Treat the list as an order of work, not a deadline.

Shared contracts are `docs/API.md`, `docs/DATA_MODEL.md`, and `docs/AI_PIPELINE.md`. The pack is the current text. `docs/CONTRACT_MIGRATION.md` lists where that text differs from the in-person nine-item agreement. Changing a shared field still needs all four people.

## Roles

| Person | Login | Role | Owns |
|---|---|---|---|
| Ethan Meza | `ethnmz` | Frontend & Demo | All screens in `frontend/`: Create, Receive, History, Supervisor, and Evaluation. Design, fixtures, pitch, and video. `docs/DEMO_SCRIPT.md` and `docs/UI.md`. Not the speech-to-text service. |
| Diego Lozano | `Navibytes` | Bridge & Voice | `photon-bridge/` (optional, after the web P0), `backend/app/stt/`, audio and text ingest, and `router` for capture and voice answers. Not the outgoing screen. |
| Akshi Biswal | `biswalakshi` | AI | `backend/app/llm/`, `backend/app/prompts/`, `backend/app/extract/`, quote verification, and the grading prompt in `backend/app/verify/`. Not the verdict-floor code. |
| Aditri Tangeti | `aditrit06` | Core Logic & Data | Models, SQLite, `handoff/state.py`, `clarify/gaps.py`, `clarify/planner.py`, `followups/`, briefing selection, verification answer keys, certainty floor, verdict floor, metrics, demo seed, the eval runner, and backend tests. Not the Evaluation screen. |

`backend/app/certainty/` is split: Akshi owns the quote check, Aditri owns the floor that lowers certainty. `backend/app/verify/` is split the same way: Akshi owns the grade call, Aditri owns the floor and the answer key.

Photon is Diego's, and only after the web path works. Outlook in the pack is P2 and is not a request to connect an account.

## Order of work

1. Read `docs/CONTRACT_MIGRATION.md` before editing the API or data model.
2. Web P0: one handoff from voice or text through clarification, review, submit, briefing, acknowledgment, and verification.
3. History, supervisor, and evaluation screens, and the eval runner, with no invented scores.
4. Optional Photon bridge.

## Tests Aditri owns

`test_certainty_floor.py`, `test_gaps.py`, `test_planner.py`, `test_verdict_floor.py`, `test_state_machine.py`, `test_followup_ownership.py`, `test_demo_scenario.py`. They do not exist yet.
