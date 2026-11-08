# API Contract

This is the final spec pack's contract. It replaces the earlier interview/signoff routes. Differences from the in-person nine-item agreement are in `docs/CONTRACT_MIGRATION.md`. All four people approved the pack's version of all six differences on the board on 2026-11-08 (https://github.com/ethnmz/hackutd2026/issues/1#issuecomment-6716896792 and the replies below it). An open follow-up with no owner does not block completion.

Base `http://localhost:8000/api`. JSON, ISO 8601 UTC. Frontend types: `frontend/src/api/types.ts`; fixtures in `src/api/fixtures/`. Demo auth: `X-User: <roster id>` header (role from roster). Role checks are enforced for submit, acknowledge, follow-up assignment and clarified-in-person.

**Errors** (every 4xx): `{ "detail": { "code": "...", "message": "display-ready text", ...extra } }`. Codes include `not_found`, `forbidden`, `unknown_user`, `conflict`, `unprocessable`, `submit_blocked` (extra: `blockers`), `analysis_failed` (extra: `statement_id`; the statement is kept and nothing else changes), and `unknown_sender` (403 from `POST /inbound/imessage`; nothing is stored), `transcription_failed` (422 from `POST /handoffs/{id}/statements` and `POST /verification/{vid}/answer`; extra: `audio_saved: true`; the UI shows `message` next to the text box).

## Handoffs
- `POST /handoffs` `{ "outgoing_id": "maya", "incoming_id": "jordan" }` → `HandoffDetail` (state `draft`; carried-over open items/follow-ups attached)
- `GET /handoffs?state=&limit=` → list (History, Supervisor)
- `GET /handoffs/{id}` → full `HandoffDetail` (below)

## Shift A: create, clarify, review, submit
- `POST /handoffs/{id}/statements` (multipart `file` audio **or** JSON `{ "text": "..." }`, optional `question_id`) → transcribes, analyzes, recomputes gaps → `HandoffDetail`
- `POST /handoffs/{id}/questions/{qid}/answer` `{ "text": "..." }` or `{ "dont_know": true }` → `HandoffDetail`
- `PATCH /facts/{fid}` `{ "value"?, "normalized"?, "certainty"?, "review_state": "operator_confirmed|operator_edited|operator_rejected" }` → `HandoffDetail`. Note: certainty can only be **raised** if `text` (a new operator statement) is included; it's stored as a `review_edit` statement.
- `POST /handoffs/{id}/review/confirm-routine` → confirms all non-critical AI facts → `HandoffDetail`
- `POST /handoffs/{id}/submit` → `HandoffDetail`, or 409 `submit_blocked` with `detail.blockers: [Blocker]` if critical facts are unreviewed or safety questions are pending

## Shift B: receive, acknowledge, verify
- `GET /handoffs/{id}/briefing` → `Briefing` (409 `conflict` before submit). Optional `X-User`: the incoming lead's first view is logged for `shift_b_seconds`.
- `POST /handoffs/{id}/acknowledge` → `HandoffDetail`, state `acknowledged` (records an Acknowledgment; **not** verification)
- `POST /handoffs/{id}/verification/start` → `{ "state": "verifying", "check": Check }` (creates checks, returns the first; repeat calls return the current pending check). 409 `nothing_to_verify` if no item qualifies.
- `POST /verification/{vid}/answer` (multipart audio or `{ "text": "..." }`) → `VerificationAttempt` (includes `next_check` and `handoff_state`). 422 `analysis_failed` if grading fails; no attempt is recorded. 422 `transcription_failed` if a voice answer can't be transcribed.
- `POST /verification/{vid}/clarified-in-person` `{ "note": "..." }` (lead or supervisor; only when the check is `needs_clarification`) → `HandoffDetail`

## Follow-ups
- `GET /followups?status=open` (Supervisor, Shift B)
- `PATCH /followups/{id}` `{ "owner_id", "deadline" }` (lead/supervisor only; logged) → `HandoffDetail` of the follow-up's handoff
- `POST /followups/{id}/close` `{ "text": "Vendor emailed completion report at 09:40" }` (creates a closure statement) → `HandoffDetail`

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
  "checks": [ Check ],   // attempt history; the answer key is never sent
  "metrics": { … }
}
// Item. carried_over_from is null unless the item came from an earlier handoff.
{ "id":"I-1","title":"UPS-B maintenance","kind":"vendor_work","asset_ids":["UPS-B"],"priority":"critical","is_decision":false,"open":true,
  "carried_over_from": null,   // or { "handoff_id":"H-0006","item_id":"I-0002","handoff_created_at":"2026-11-07T12:30:00Z" }
  "facts":[ { "id":"F-3","slot":"operational_clearance","value":"Not cleared: in maintenance bypass","normalized":"not_cleared",
              "certainty":"confirmed","certainty_reason":"operator stated","review_state":"ai_extracted",
              "quote":"No, it's still in maintenance bypass.","source_statement_id":"S-3",
              "ai_proposed_value":null,   // set only when an operator edited the AI value
              "history":[] } ] }          // prior versions, oldest first:
              // { "value","normalized","certainty","review_state","quote","source_statement_id","at" }
// certainty_reason values: hedge:"<term>", uncertainty:"<term>", observation:"<term>" (term is underlinable),
// or no_quote, operator stated, operator lowered.
// FollowUp. owner/assigned_by are {id, name} or null; owner_label is always a display string.
{ "id":"FU-2","item_id":"I-3","description":"Confirm what the Chiller 2 cooling inspection found / whether it was completed",
  "missing_information":"Vendor inspection report","owner":null,"owner_label":"To be assigned","deadline":null,
  "assigned_by":null,"assigned_at":null,"status":"open" }
// once assigned: "owner":{"id":"jordan","name":"Jordan Blake"},"owner_label":"Jordan Blake",
//   "assigned_by":{"id":"jordan","name":"Jordan Blake"},"assigned_at":"2026-11-08T13:01:00Z"
// Blocker (in detail.blockers of a 409 submit_blocked). message is display-ready.
{ "code":"unreviewed_critical_fact","message":"Review work status on UPS-B maintenance","item_id":"I-1","fact_id":"F-1" }
{ "code":"pending_safety_question","message":"Answer the pending safety question (\"I don't know\" is allowed)","item_id":"I-1","question_id":"Q-2" }
// Briefing
{ "headline":"…", "lines":[ { "text":"…","item_id":"I-1","fact_ids":["F-3"],"certainty":"confirmed" } ],
  "items":[ Item ], "open_followups":[ FollowUp ], "disclaimer":"Acknowledging this handoff does not close open issues or confirm equipment is safe to operate." }
// Check
{ "id":"V-1","item_id":"I-1","question":"What is the current status of UPS-B, and what must be verified before testing?",
  "status":"pending|verified|needs_clarification|clarified_in_person","attempts":[ { "statement_id","answer_text","verdict","misconception","conveyed_fact_ids","missing_fact_ids","contradictions","feedback","evidence","at" } ] }
// VerificationAttempt. evidence entries are { statement_id, quote, fact_id }. next_check is a Check (the same one while retrying) or null.
{ "check_id":"V-1","attempt":1,"verdict":"inconsistent","misconception":"treated_incomplete_as_complete",
  "conveyed_fact_ids":[],"missing_fact_ids":["F-1","F-3"],"contradictions":[{"fact_id":"F-1","claimed":"maintenance is complete"}],
  "feedback":"That interpretation is inconsistent with the handoff. …","evidence":[{"statement_id":"S-2","quote":"…"}],
  "status":"pending","next_check":null,"handoff_state":"verifying" }
```

## Supervisor
`GET /supervisor/summary` → `{ "pending_handoffs": [...], "completed_today": [...], "unresolved_questions": n, "outstanding_acknowledgments": [...], "verification": {"verified": n, "with_assistance": n, "in_progress": n}, "followups": {"open": n, "unassigned": n, "overdue": n} }`

## Evaluation
`POST /eval/run {provider?}` · `GET /eval/results` (see `EVALUATION.md`)

## Demo control
`POST /demo/reset` · `POST /demo/clock` · `POST /demo/step/{n}` (replays `demo/scenario.json` through the real endpoints) · `GET /demo/scenario`

## Optional: Photon bridge
`POST /inbound/imessage` `{ "sender_phone", "text" | audio }` → routes to the sender's open draft handoff (or creates one) → `{ "reply", "followups": [] }`. 403 `unknown_sender` if the number is not on the roster; nothing is stored.
