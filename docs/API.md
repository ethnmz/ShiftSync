# API

Proposed contract. Base `http://localhost:8000/api`. JSON. Times are ISO 8601 UTC. All four people agree before a field changes. The frontend mirrors these shapes when it is built. Nothing here is running.

Poll `GET /handoff/current` every 1.5 seconds.

## Ingest

`POST /ingest/text`

```json
{ "sender_phone": "+15550100002", "text": "The UPS vendor is coming back tomorrow. Everything should be fine.", "source": "imessage_text", "at": null }
```

`POST /ingest/voice` is multipart: `sender_phone`, `source` (`imessage_voice` or `web`), optional `at`, and `file`. `+15550100002` is a fictional example, not a real number.

Both return:

```json
{
  "memo_id": "M-0001",
  "handoff_id": "H-0001",
  "status": "interviewing",
  "reply": "Got it. One question: what is still unfinished when the vendor returns?",
  "question": {
    "id": "Q-0001",
    "phase": "interview",
    "slot": "what_is_unfinished",
    "text": "What is still unfinished when the vendor returns?"
  }
}
```

`reply` is what the bridge sends back. `question` is null when the note produced no critical gap and the status is already `confirmed`.

Unknown sender: `403` with `{ "reply": "This number is not on the roster." }` The body is not stored.

If extraction fails twice: `200` with `status` left unchanged, `memo_id` set, `reply` explaining the note needs review, and no new facts.

## Handoff

`GET /handoff/current` returns the handoff, its facts, the open question if any, and the gate.

```json
{
  "id": "H-0001",
  "status": "confirmed",
  "questions_asked": 1,
  "budget": 3,
  "facts": [
    {
      "id": "F-0001",
      "slot": "what_is_unfinished",
      "status": "confirmed",
      "text": "The vendor still has to verify the UPS.",
      "quote": "vendor still has to verify",
      "quote_verified": true,
      "hedge_downgraded": false,
      "follow_up": null
    },
    {
      "id": "F-0002",
      "slot": "who_verifies",
      "status": "unknown",
      "text": "No one named who verifies.",
      "quote": null,
      "quote_verified": false,
      "hedge_downgraded": false,
      "follow_up": { "owner_id": null, "due": null, "state": "UNASSIGNED" }
    }
  ],
  "open_question": null,
  "gate": {
    "passed": false,
    "blockers": [{ "type": "unassigned_unknown", "fact_id": "F-0002" }]
  }
}
```

`POST /handoff/start` `{ "from_lead_id": "maya" }` creates the handoff from the latest processed memo if ingest did not already open one.

`POST /interview/answer`

```json
{ "question_id": "Q-0001", "text": "The vendor still has to verify the UPS. I don't know who." }
```

Response: updated facts, `questions_asked`, the next question or `status: confirmed`. An answer that names an owner and a due time may set `follow_up.state` to `assigned`. The model does not choose that owner or time.

`POST /check/start` `{ "to_lead_id": "jordan" }` moves `confirmed` to `checking` and returns the first open-ended question.

`POST /check/answer` `{ "question_id": "Q-0004", "text": "Maintenance is done." }`

```json
{
  "status": "correcting",
  "grade": {
    "fact_id": "F-0001",
    "grade": "misunderstood",
    "evidence_quote": "Maintenance is done.",
    "correction": "Shift A said the vendor still has to verify the UPS. That part is not done."
  },
  "open_question": {
    "id": "Q-0005",
    "phase": "check",
    "slot": "what_is_unfinished",
    "text": "What is still left on the UPS after the vendor returns?"
  }
}
```

`POST /handoff/sign` returns `409` and the same `gate.blockers` list when the gate fails. On success, `status` is `signed` and the body is the record from `GET /handoff/current` plus `signed_at`.

There is no endpoint that starts, stops, or clears equipment.

## Demo clock

`POST /demo/clock` `{ "at": "2026-11-08T06:30:00Z" }` or `{ "advance_minutes": 30 }` sets the simulated clock. `POST /demo/reset` is defined for a later seed script. That script and `demo/scenario.json` are not in the repo.

## Bridge send

`POST http://localhost:8787/send` `{ "phone": "+15550100002", "text": "..." }` returns `{ "ok": true }` or `{ "ok": false, "error": "no_space_for_sender" }`. Backend wrapper: `notify.py`. On failure the UI shows that the question can be answered on the web screen.
