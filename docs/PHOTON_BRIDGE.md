# Photon bridge

Diego owns `photon-bridge/`. The bridge is a thin adapter. It does not score facts, pick questions, or decide signoff.

## What it does

- Accept iMessage text and voice, or a local terminal session when no Photon project is configured.
- Post text to `POST /api/ingest/text` and voice bytes to `POST /api/ingest/voice`.
- Send the JSON `reply` back to that conversation.
- Accept `POST /send` from the backend so a question can go out without a new inbound message.
- Skip the bridge's own outbound messages so they are not ingested again.

Voice notes arrive as audio. The bridge does not transcribe them. The backend does.

## What it does not do

- It does not store a roster. Unknown numbers are rejected by the backend and not written down.
- It does not send a clearance to touch equipment. Replies are questions, corrections, and the short signoff notice from the API.
- It does not contain API keys. Project id and secret, if a cloud line is used, stay in an uncommitted environment file.

## Local development

Terminal mode needs no Photon account and is enough to build the interview. A cloud iMessage line is optional for the live demo. Whether a sponsor track applies is a Devpost choice. This repo does not confirm eligibility.

Check the current Photon Spectrum docs when you implement the client. This spec does not freeze SDK call shapes.

## Message copy

The backend writes `reply`. Typical lines:

- After a note, the one interview question.
- After an incoming miss, the correction sentence from the grade.
- After signoff, a single line that the record is stored, with no safety claim.

Keep each reply to one question or one correction.
