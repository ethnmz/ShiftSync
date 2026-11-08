# Architecture

## Components

```
 iPhone (tech)                                        Web app (shift leads)
 iMessage text / voice note                           React + Vite  :5173
        │  ▲                                                 │  ▲ polls /api/* every 2 s
        ▼  │ replies (ack, questions, HALT)                  ▼  │
 ┌───────────────────┐   POST /api/ingest/*   ┌──────────────────────────────────┐
 │  photon-bridge    │ ─────────────────────▶ │  backend  (FastAPI :8000)        │
 │  Bun + spectrum-ts│ ◀───────────────────── │                                  │
 │  :8787 (local)    │   POST /send           │  ingest → stt → extract (LLM)    │
 └───────────────────┘   (proactive msgs)     │   → verify quotes → reconcile    │
                                              │   → rules → conflicts → notify   │
                                              │  handoff: clarify / briefing /   │
                                              │   readback (LLM) / gate / score  │
                                              │  SQLite  data/ledger.db          │
                                              │  audio   data/audio/*.wav        │
                                              └──────────────┬───────────────────┘
                                                             │
                               Claude API  /  NVIDIA NIM (Nemotron)  /  STT (OpenAI or local Whisper)
```

## Processes
1. **backend**: owns all state and logic. Single source of truth.
2. **photon-bridge**: thin adapter. No business logic. Forwards inbound messages and sends whatever text the backend returns. Keeps a `Map<senderId, space>` so the backend can send proactive messages (clarifications, HALTs) to people who have messaged before.
3. **frontend**: read-mostly UI plus handoff actions (start handoff, acknowledge, read-back, ask).

## Memo pipeline (`app/pipeline/ingest.py::process_memo`)

```
1. receive      text or audio bytes + sender phone + source
2. identify     phone → Person via roster (unknown → reject)
3. stt          audio → ffmpeg → 16 kHz WAV → transcript   (skip for text)
4. store        Memo(raw_text, audio_path, received_at=clock.now(), shift_id=current)
5. classify     is this an answer to a pending Clarification from this person?
                  yes → handoff/clarify.py::record_answer → re-run extract on answer → stop
6. extract      LLM(task="extract") → [Observation]       (prompt in AI_PIPELINE.md)
7. verify       drop observations whose quote isn't in the transcript (fuzzy ≥ 0.85)
8. resolve      asset mentions → asset IDs (LLM suggestion validated against assets.yaml aliases)
9. reconcile    per observation: link to open item | open new item | update | resolve
                (closure only for closing actions: restored, lockout_removed, work_completed,
                 alarm_cleared, directive_lifted)
10. rules       recompute severity for touched items (rules.yaml)
11. conflicts   if observation.action ∈ START_ACTIONS → check dependency graph + directives
                  → Conflict(level=HALT|WARN) → immediate reply via bridge
12. clarify     observation.ambiguities → queued Clarification (asked at handoff,
                  or immediately if rules.yaml says ask_immediately for this severity)
13. reply       short confirmation to sender, e.g. "Logged: LOTO on BRK-4 (critical) ✅"
```

Steps 6–8 are the only LLM-dependent steps in the memo path. Everything after is deterministic.

## Handoff state machine (`app/handoff/state.py`)

```
 draft ──start_outgoing──▶ outgoing_review ──all critical clarifications answered──▶ briefing
                                  │  (bot sends questions via iMessage, collects answers)
 briefing ──readback submitted──▶ readback_review ──all critical items acked──▶ complete
```
- `start_outgoing` (Shift A lead, web button or iMessage "start handoff"): generate clarifications for open items/memos from this shift with unresolved ambiguities, plus **rule-generated** questions (e.g. any `bypass` item with no update in > 4 h: "Still bypassed?").
- `briefing`: build the I-PASS view (deterministic structure + LLM one-liners).
- `readback`: grade → mark covered items as acked (method=`readback`); missed/misstated critical items need a tap ack (method=`tap`).
- `complete`: transfer ownership of all open items to the incoming lead; compute and store the final score; post a summary to both leads via iMessage.

## Conflict detection (`app/pipeline/conflicts.py`)
- `START_ACTIONS = {test_started, work_started, energize, load_increase}`.
- For the target asset `a`: collect `a` + all **upstream** assets (assets that feed `a`, recursively) + `a`'s hall.
- HALT if any open item on that set has kind `lockout_tagout`, or `vendor_work` with status paused/active.
- WARN/HALT per `rules.yaml` for active `directive` items whose scope matches the hall and whose category matches the action category.
- WARN if a cooling `bypass` is open for the hall and the action category is `heavy_load`.
- Output: `Conflict{level, message, blocking_item_ids, memo_id}` → iMessage reply + red dashboard banner.

## Clock
`app/clock.py` keeps `offset`. `clock.now() = datetime.utcnow() + offset`. `/api/demo/clock` sets simulated time. The seed script sets the clock to each scenario step's `at` before posting it, so stale/age logic works.

## Environment
See `.env.example`. Backend reads `.env` via `pydantic-settings`. The bridge reads its own env (`SPECTRUM_*`, `BACKEND_URL`, `BRIDGE_PORT`).

## Failure modes and fallbacks
| Failure | Fallback |
|---|---|
| Photon/iMessage down | Bridge's terminal provider, or web "Log memo" box, or seed script |
| STT fails | Store the memo with `needs_review`, show "transcription failed" with audio player |
| LLM JSON invalid twice | Memo flagged `needs_review`; no ledger change (never guess) |
| LLM provider down | Switch `LLM_PROVIDER` and restart (~10 s) |
| Venue Wi-Fi | Pre-seeded DB snapshot `backend/data/demo_snapshot.db` + local Whisper |
