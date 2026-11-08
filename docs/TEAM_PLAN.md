# Team Plan: 4 people, overnight

> Times assume a Sunday-morning submission deadline; shift them if yours differs. Work **contract-first**: `docs/API.md` and `docs/DATA_MODEL.md` are frozen at 20:00 unless all four agree.

## Roles

| # | Owner | Area | Main files |
|---|---|---|---|
| P1 | **Bridge & Voice** | Photon bridge, STT, ingest endpoints, iMessage UX, phone setup | `photon-bridge/`, `backend/app/stt/`, `routes/ingest.py`, `notify.py` |
| P2 | **AI** | LLM provider abstraction, all 5 prompts, schemas, quote verification, scenario test | `backend/app/llm/`, `prompts/`, `pipeline/extract.py`, `handoff/clarify.py`, `readback.py`, `ask.py`, `tests/test_scenario.py` |
| P3 | **Ledger core** | DB models, reconcile, rules, conflicts, stale, handoff state machine, gate/score, demo endpoints, seed | `models.py`, `pipeline/reconcile.py`, `rules.py`, `conflicts.py`, `stale.py`, `handoff/state.py`, `score.py`, `briefing.py`, `demo/` |
| P4 | **Frontend & Demo** | All screens, design, fixtures, demo control panel, pitch, Devpost, video | `frontend/`, `docs/DEMO_SCRIPT.md` |

## Milestones

| Time | Milestone | Done when |
|---|---|---|
| 20:00 | **Scaffold** | Repos run; FastAPI `/health`; Vite app with routes; bridge echoes in terminal mode; config YAMLs load |
| 22:00 | **Vertical slice** | Text memo via `POST /ingest/text` → extract → ledger item → visible on Floor Feed |
| 00:00 | **iMessage live** | Voice note from a phone → transcript → item → reply in iMessage |
| 02:00 | **All P0** | Clarifications, briefing, read-back, acks, gate, conflict HALT working end-to-end with `scenario.json` |
| 04:00 | **P1 + polish** | Stale escalation, contingencies, stand-up capture, Ask drawer; `test_scenario.py` green |
| 05:30 | **Feature freeze** | Only bug fixes after this |
| 06:00 | **Rehearse ×3** | Full demo with live phone + replay fallback; record backup video |
| 07:00 | **Submit** | Devpost (select NorthMark + Photon + Nvidia), public GitHub, video, README |

## Interfaces to agree on first (by 20:00)
1. `ExtractionResult` schema (P2 ↔ P3), in `docs/AI_PIPELINE.md`.
2. Ingest response shape (P1 ↔ P3), in `docs/API.md`.
3. Briefing / Gate / Score JSON (P3 ↔ P4), in `docs/API.md`. P4 builds on fixtures until then.
4. Bridge `/send` (P1 ↔ P3).

## Rules for the night
- Commit small and often to `main` through short-lived branches; whoever breaks `test_scenario.py` fixes it.
- Use Claude Code per area: start each session with "Read CLAUDE.md and docs/<your area>.md".
- Don't add features at 4 a.m. Rehearse instead.
- Someone sleeps 1–2 hours in rotation; the demo presenter should be rested.
