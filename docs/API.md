# API Contract

Base: `http://localhost:8000/api`. JSON everywhere. Times are ISO 8601 UTC. The frontend mirrors these types in `frontend/src/api/types.ts` and starts with fixtures in `frontend/src/api/fixtures/`.

## Ingest (used by bridge, web, seed)

### `POST /ingest/text`
```json
{ "sender_phone": "+15550100002", "text": "Siemens guys are here...", "source": "imessage_text", "at": null }
```
`at` (optional): scenario timestamp (seed only). Response for all ingest endpoints:
```json
{
  "memo_id": "M-0004",
  "reply": "Logged ✅ LOTO on BRK-4 (critical) · Siemens work on UPS-B",
  "conflicts": [ { "level": "HALT", "message": "HALT: ...", "blocking_item_ids": ["L-0003"] } ],
  "items_touched": ["L-0003", "L-0004"],
  "clarification_answered": null
}
```
The bridge sends `reply` back to the sender, and sends each conflict message as a separate message first if present.

### `POST /ingest/voice` (multipart)
Fields: `sender_phone`, `source` (`imessage_voice`|`standup`|`web`), `at?`, `file` (audio bytes, any format ffmpeg reads). Same response.

### Unknown sender → `403 {"reply": "This number isn't on the NorthMark roster."}`

## Ledger

- `GET /status` → `{ "facility": "RED", "now": "...", "current_shift": {...}, "counts": {"critical":3,"warning":2,"info":1}, "active_halts": [Conflict] }`
- `GET /items?status=open|resolved|all` → `[LedgerItem]` (sorted severity desc, then opened_at)
- `GET /items/{id}` → `LedgerItem & { "events": [ItemEvent], "memos": [Memo] }`
- `GET /memos?limit=50` → `[Memo & { "items": [id] }]` newest first
- `GET /memos/{id}/audio` → audio file
- `GET /conflicts?active=true` → `[Conflict]`
- `POST /conflicts/{id}/override` `{ "person_id", "reason" }` → logs override (requires lead)

## Handoff

- `GET /handoff/current` → `Handoff & { "clarifications": [Clarification], "briefing": Briefing|null, "readback": Readback|null, "acks": [Acknowledgment], "gate": Gate, "score": Score }`
- `POST /handoff/start` `{ "from_lead_id": "maya" }` → creates handoff, generates + sends clarifications → status `outgoing_review`
- `POST /clarifications/{id}/answer` `{ "text": "..." }` → web fallback for answering
- `POST /clarifications/{id}/dismiss` `{ "person_id", "reason" }`
- `POST /handoff/advance` → `outgoing_review → briefing` (409 if gate fails; body lists blockers)
- `GET /handoff/briefing` → Briefing
- `POST /handoff/readback` (JSON `{person_id, text}` or multipart audio) → Readback (also triggered when the incoming lead sends an iMessage voice note while status = `briefing`)
- `POST /handoff/ack` `{ "item_id", "person_id", "method": "tap" }`
- `POST /handoff/complete` → 409 with blockers unless gate passes

### Briefing
```json
{
  "facility": "RED",
  "headline": "3 critical items: Breaker 4 locked out for paused Siemens work; Chiller 2 bypassed; Valve B bypassed 3 days.",
  "illness_severity": { "level": "RED", "reasons": ["LOTO active on BRK-4", "Cooling redundancy reduced in Hall B"] },
  "patient_summary": [ { "item_id": "L-0003", "one_liner": "...", "severity": "critical", "age_hours": 5.9, "shifts_open": 1, "stale": false, "source_quote": "...", "memo_id": "M-0004", "owner": "maya" } ],
  "action_list": [ { "item_id": "L-0003", "action": "Leave tag on BRK-4; do not energize/test UPS-B until Siemens returns", "by": null } ],
  "contingencies": [ { "item_id": "L-0002", "if": "Hall B cold aisle > 27°C", "then": "Start portable unit PC-2; page facilities on-call", "source": "runbook" } ],
  "resolved_this_shift": [ { "item_id": "L-0005", "one_liner": "Generator 1 filter swap complete" } ]
}
```

### Gate / Score
```json
{ "gate": { "passed": false, "blockers": [ {"type":"unacked_critical","item_id":"L-0003"}, {"type":"unanswered_clarification","clarification_id":"C-0001"} ] },
  "score": { "total": 0.72, "parts": { "clarifications": 1.0, "critical_acks": 0.5, "readback_coverage": 0.67, "stale_addressed": 0.0 } } }
```

## Ask
- `POST /ask` `{ "question": "Did the vendors finish the electrical work?" }` → `{ "answer": "...", "citations": [ {"memo_id":"M-0006","quote":"..."} ], "confidence": "high|medium|low" }`

## Demo control
- `POST /demo/reset` → wipe DB, load config, load `scenario.history`
- `POST /demo/clock` `{ "at": "2026-11-08T05:15:00Z" }` or `{ "advance_minutes": 30 }`
- `POST /demo/step/{n}` → replay scenario step n (sets clock, posts memo through the real pipeline)
- `GET /demo/scenario` → step list for the hidden Demo Control panel (press `D`)

## Bridge (backend → bridge, local only)
- `POST http://localhost:8787/send` `{ "phone": "+1555...", "text": "..." }` → `{ "ok": true }` or `{ "ok": false, "error": "no_space_for_sender" }`
  - Backend wrapper: `app/notify.py::send(person_id, text)`; on failure, logs and surfaces in the UI ("couldn't reach Priya by iMessage, answer here instead").
