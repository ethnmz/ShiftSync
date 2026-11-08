# Contract migration

The files in `docs/API.md` and `docs/DATA_MODEL.md` are the final spec pack. They replace the earlier routes (`/ingest`, `/handoff/current`, `/check/start`, `/handoff/sign`). No application code on `main` implements either contract. No teammate branch was on the remote when this was written.

The four people agreed in person to nine notes. The record of the proposal is https://github.com/ethnmz/hackutd2026/issues/1#issuecomment-6716280102. That agreement was about the earlier contract. It is not an approval of every change in the pack.

## What the pack already covers

| In-person note | Where it went |
|---|---|
| Owner and due time are structured, not invented by the model | `PATCH /followups/{id}` with `owner_id` and `deadline`, lead or supervisor only. A quote in Shift A's statement can also set them. The old `POST /facts/{id}/follow_up` name is not kept. |
| A check can start while an owner is still unassigned | Verification start is not blocked by an open follow-up. |
| Grade, correction, and evidence history for the signed screen | `VerificationCheck.attempts` stores verdict, feedback, evidence quotes, and the answer. |
| Voice answers during the check | `POST /verification/{vid}/answer` accepts audio. It is not `POST /ingest/voice`. |
| Who said it, and who assigned the follow-up | `Statement.speaker_id`, `Fact.source_statement_id`, `FollowUp.assigned_by`, `FollowUp.assigned_at`. There is no `Fact.said_by` field. |

## What the pack changes, approved by all four

On the board, all four people chose the pack's rule on all six points below (question: https://github.com/ethnmz/hackutd2026/issues/1#issuecomment-6716896792). None of these is still open.

1. **Unassigned follow-ups do not block completion.** The pack says open follow-ups never block a transition, and a handoff can be verified while a follow-up is still "To be assigned." The in-person note blocked signoff until an unknown had an owner and a due time. The team chose the pack's rule instead. The follow-up stays open and carries over to the next handoff.
2. **No `ready_to_sign` state and no single Sign button.** Receipt is `POST /handoffs/{id}/acknowledge`. Understanding is the verification loop, ending in `verified` or `verified_with_assistance`. The old signoff status is not reintroduced.
3. **Submit is blocked by unreviewed critical facts and pending safety questions**, including when the answer was "I don't know." It is not blocked by a missing owner.
4. **Shift and clock are not fields on `GET /handoffs/{id}`.** Demo clock endpoints exist (`POST /demo/clock`). `now`, shift, and lead are not added to the handoff payload.
5. **Delivery status (`sent` / `failed`) is not in the P0 API.** The web app is the primary path, so a failed iMessage is not required for the answer box. It is not added.
6. **Demo identity.** The UI switches Maya, Jordan, and Dana with an `X-User` roster id. That is a demo selector, not authentication. `config/roster.yaml` still has fictional phones for the optional bridge. A phone-free `GET /roster` (id, name, role) is not in the pack and is not added.

Do not restore `/ingest`, `/handoff/sign`, or `ready_to_sign` just to keep the old names.
