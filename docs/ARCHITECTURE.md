# Architecture

Three processes. One product path: note, interview, confirmed record, understanding check, correction, signed record.

```text
phone (voice or text)                         web (leads)
        |                                         |  poll /api/handoff/current every 1.5 s
        v                                         v
photon-bridge :8787  -- POST /api/ingest/* -->  backend :8000
        ^                                         |
        |  POST /send (next question, correction) |
        +-----------------------------------------+
                                              notes → facts → interview → check → handoff gate
```

The bridge has no business logic. It forwards text or audio and sends the `reply` string. The backend owns state. The web app shows the current question, the explicit unknowns, and the signed record.

## Routing

`router.py` classifies an inbound message as a shift note, an interview answer, or a check answer.

- No handoff open, or status `draft`: it is a note.
- Status `interviewing` and the sender is the outgoing lead: it is an interview answer to the open question.
- Status `checking` or `correcting` and the sender is the incoming lead: it is a check answer.
- Anything else from a roster number is stored as a note and does not change fact status.

Diego owns `router.py`. Changing these three kinds is a shared-interface change.

## Note path

1. Reject unknown phone numbers. Do not store them.
2. Speech-to-text for audio only. Photon does not supply a transcript.
3. Store the memo at `clock.now()`.
4. `notes/extract.py` asks the model for candidate facts.
5. `facts/verify.py` drops a quote that is not in the transcript.
6. `facts/status.py` downgrades hedges to `reported` and leaves gaps as `unknown`.
7. `notes/reconcile.py` attaches facts to an item. Asset ids come only from configuration. No match means `asset_id` null, not a guessed id.
8. `interview/gaps.py` and `interview/planner.py` choose at most one next critical question, or end the interview.

Steps 5 through 8 are code. The model does not set status, order, or the gate.

## Check path

`check/questions.py` chooses the next confirmed fact. `check/session.py` asks it. `check/grade.py` proposes `aligned`, `misunderstood`, or `not_mentioned`. Code keeps `aligned` only when the evidence quote is in the answer. Otherwise the handoff moves to `correcting` and the reply is the correction.

## Gate

`handoff/gate.py` reads facts and the latest grades. `handoff/metrics.py` computes the four evaluation numbers when a scenario with ground truth is available. Metrics do not open the gate.

## Clock and config

`clock.now()` is UTC plus a demo offset. Configuration files named in `CLAUDE.md` are not in the repo. The app cannot load them until someone adds them as an implementation task. Do not ship sample secrets or real phone numbers to fill that gap.

## Deferred

A dependency warning that only reads ids already listed in configuration is P2. It is not on the path above. There is no parallel conflict engine to implement for the demo.
