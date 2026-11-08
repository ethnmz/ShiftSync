# API Contract

This is the final spec pack's contract. It replaces the earlier interview/signoff routes. Differences from the in-person nine-item agreement are in `docs/CONTRACT_MIGRATION.md`. All four people approved the pack's version of all six differences on the board on 2026-11-08 (https://github.com/ethnmz/hackutd2026/issues/1#issuecomment-6716896792 and the replies below it). An open follow-up with no owner does not block completion.

Base `http://localhost:8000/api`. JSON, ISO 8601 UTC. Frontend types: `frontend/src/api/types.ts`; fixtures in `src/api/fixtures/`. Demo auth: `X-User: <roster id>` header (role from roster). Role checks are enforced for submit, acknowledge, follow-up assignment and clarified-in-person.

## Handoffs
- `POST /handoffs` `{ "outgoing_id": "maya", "incoming_id": "jordan" }` → `Handoff` (state `draft`; carried-over open items/follow-ups attached)
- `GET /handoffs?state=&limit=` → list (History, Supervisor)
- `GET /handoffs/{id}` → full `HandoffDetail` (below)

## Shift A: create, clarify, review, submit
- `POST /handoffs/{id}/statements` (multipart `file` audio **or** JSON `{ "text": "..." }`, optional `question_id`) → transcribes, analyzes, recomputes gaps → `HandoffDetail`
- `POST /handoffs/{id}/questions/{qid}/answer` `{ "text": "..." }` or `{ "dont_know": true }` → `HandoffDetail`
- `PATCH /facts/{fid}` `{ "value"?, "normalized"?, "certainty"?, "review_state": "operator_confirmed|operator_edited|operator_rejected" }`. Note: certainty can only be **raised** if `text` (a new operator statement) is included; it's stored as a `review_edit` statement.
- `POST /handoffs/{id}/review/confirm-routine` → confirms all non-critical AI facts
- `POST /handoffs/{id}/submit` → 409 with `blockers` if critical facts are unreviewed or required questions are pending

## Shift B: receive, acknowledge, verify
- `GET /handoffs/{id}/briefing` → `Briefing`
- `POST /handoffs/{id}/acknowledge` → state `acknowledged` (records an Acknowledgment; **not** verification)
- `POST /handoffs/{id}/verification/start` → creates checks, returns the first
- `POST /verification/{vid}/answer` (multipart audio or `{ "text": "..." }`) → `VerificationAttempt` + next check
- `POST /verification/{vid}/clarified-in-person` `{ "note": "..." }` (lead only)

## Follow-ups
- `GET /followups?status=open` (Supervisor, Shift B)
- `PATCH /followups/{id}` `{ "owner_id", "deadline" }` (lead/supervisor only; logged)
- `POST /followups/{id}/close` `{ "text": "Vendor emailed completion report at 09:40" }` (creates a closure statement)

## Shapes
```jsonc
// HandoffDetail
{
  "id": "H-0007", "state": "clarifying",
  "outgoing": {"id":"maya","name":"Maya Chen"}, "incoming": {"id":"jordan","name":"Jordan Blake"},
  "statements": [ { "id":"S-1","speaker_id":"maya","role":"handoff","text":"UPS-B maintenance is mostly finished…","audio_url":"/api/statements/S-1/audio","at":"…" } ],
  "items": [ Item ],
  "questions": [ { "id":"Q-1","item_id":"I-1","gap_type":"missing_rationale","text":"…","status":"pending","why_asked":"\"mostly finished\" — what's left and why?" } ],
  "not_asked": [ { "item_id":"I-2","slots":["confirmation_source"],"reason":"routine item, budget" } ],
  "budget": { "used": 1, "max": 3 },
  "followups": [ FollowUp ],
  "status_line": { "submitted_at": null, "acknowledged_at": null, "verified_at": null, "open_followups": 2, "unassigned_followups": 1 },
  "metrics": { … }
}
// Item
{ "id":"I-1","title":"UPS-B maintenance","kind":"vendor_work","asset_ids":["UPS-B"],"priority":"critical","is_decision":false,"open":true,
  "facts":[ { "id":"F-3","slot":"operational_clearance","value":"Not cleared: in maintenance bypass","normalized":"not_cleared",
              "certainty":"confirmed","certainty_reason":"operator stated","review_state":"ai_extracted",
              "quote":"No, it's still in maintenance bypass.","source_statement_id":"S-3","history":[] } ] }
// FollowUp
{ "id":"FU-2","item_id":"I-3","description":"Confirm what the Chiller 2 cooling inspection found / whether it was completed",
  "missing_information":"Vendor inspection report","owner":null,"owner_label":"To be assigned","deadline":null,"status":"open" }
// Briefing
{ "headline":"…", "lines":[ { "text":"…","item_id":"I-1","fact_ids":["F-3"],"certainty":"confirmed" } ],
  "items":[ Item ], "open_followups":[ FollowUp ], "disclaimer":"Acknowledging this handoff does not close open issues or confirm equipment is safe to operate." }
// VerificationAttempt
{ "check_id":"V-1","attempt":1,"verdict":"inconsistent","misconception":"treated_incomplete_as_complete",
  "conveyed_fact_ids":[],"missing_fact_ids":["F-1","F-3"],"contradictions":[{"fact_id":"F-1","claimed":"maintenance is complete"}],
  "feedback":"That interpretation is inconsistent with the handoff. …","evidence":[{"statement_id":"S-2","quote":"…"}],
  "status":"pending","next_check":null }
```

## Supervisor
`GET /supervisor/summary` → `{ "pending_handoffs": [...], "completed_today": [...], "unresolved_questions": n, "outstanding_acknowledgments": [...], "verification": {"verified": n, "with_assistance": n, "in_progress": n}, "followups": {"open": n, "unassigned": n, "overdue": n} }`

## Evaluation
`POST /eval/run {provider?}` · `GET /eval/results` (see `EVALUATION.md`)

## Demo control
`POST /demo/reset` · `POST /demo/clock` · `POST /demo/step/{n}` (replays `demo/scenario.json` through the real endpoints) · `GET /demo/scenario`

## Optional: Photon bridge
`POST /inbound/imessage` `{ "sender_phone", "text" | audio }` → routes to the sender's open draft handoff (or creates one) → `{ "reply", "followups": [] }`
