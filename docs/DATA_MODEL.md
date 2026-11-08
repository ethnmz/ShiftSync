# Data model

Proposed. Aditri owns the tables. A field change is a shared-interface change and needs all four people. This file does not create a database.

Static configuration (`config/slots.yaml`, `config/rules.yaml`, `config/assets.yaml`, `config/roster.yaml`) is an implementation task. Those files are not in the repo. Until they exist, code has nothing to load. Do not invent asset dependencies at runtime.

Time is `clock.now()` only. The demo clock may be offset. Identifiers: items `I-0001`, facts `F-0001`, memos `M-0001`, questions `Q-0001`, checks `C-0001`.

## Enums

```text
FactStatus     = confirmed | reported | unknown
GapDisposition = ask | not_asked_low_priority
Grade          = aligned | misunderstood | not_mentioned
HandoffStatus  = draft | interviewing | confirmed | checking | correcting | signed
MemoSource     = imessage_voice | imessage_text | web
SlotName       = what_is_unfinished | who_verifies | current_state | rationale
               | restore_condition | contingency | owner | due
ItemKind       = vendor_return | equipment_condition | restriction
```

`confirmed` is only stored after `facts/status.py` and `facts/verify.py` both pass. A hedge match forces `reported`.

## Memo

`id`, `author_id`, `source`, `text`, `audio_path?`, `received_at`, `status` (`processed` | `needs_review` | `rejected`).

`needs_review` means extraction failed twice or the quote check dropped every observation. No guessed facts are written.

## Item

`id`, `kind`, `asset_id?` (null when the registry does not resolve it), `summary` (words from the note, not a new fact).

## Fact

`id`, `item_id`, `slot`, `status`, `text`, `quote`, `speaker_id`, `memo_id`, `quote_verified` (bool, set by code), `hedge_downgraded` (bool, set by code).

Unknown follow-up, stored on the fact:

```json
{ "owner_id": null, "due": null, "state": "UNASSIGNED" }
```

or, after a human answer:

```json
{ "owner_id": "maya", "due": "2026-11-08T15:00:00Z", "state": "assigned", "assigned_by": "maya" }
```

`owner_id` and `due` are copied from a human answer only.

## Question

`id`, `handoff_id`, `phase` (`interview` | `check`), `about_fact_id?`, `about_slot`, `text`, `asked_at`, `answer_text?`, `answer_memo_id?`.

Interview questions count toward the budget of 3. Check questions do not.

## Check grade

`id`, `question_id`, `fact_id`, `grade`, `evidence_quote?`, `correction?`.

`evidence_quote` must verify against the answer text before code stores `aligned`.

## Handoff

`id`, `from_lead_id`, `to_lead_id?`, `status`, `questions_asked`, `budget` (default 3), `started_at`, `signed_at?`.

## State transitions

```text
draft
  -- note stored, extract finished --> interviewing
interviewing
  -- next critical gap, under budget --> interviewing
  -- budget used or no critical gap left --> confirmed
confirmed
  -- incoming check starts --> checking
checking
  -- grade aligned, more safety facts --> checking
  -- grade not aligned --> correcting
correcting
  -- answer still not aligned --> correcting
  -- answer aligned, more safety facts --> checking
sign from checking or correcting
  -- gate fails --> status unchanged, blockers returned
  -- gate passes --> signed
```

Signoff blockers are only:

- a fact with `state: UNASSIGNED`
- a confirmed safety fact whose latest grade is `misunderstood` or `not_mentioned`

## Metrics snapshot

Written by `handoff/metrics.py` for evaluation. Not a safety certificate.

`completeness`, `interpretation`, `action_clarity`, `efficiency`. Each is a number from 0 to 1 computed from a scenario's ground truth. Definitions are in `docs/EVALUATION.md`. No snapshot exists until a scenario is run.

## Not in this model

There is no conflict table, no per-item tap acknowledgment, and no stale-item counter in the P0 schema. Those belonged to an earlier ledger draft. A later P2 may add them only after a team agreement, and only using dependencies that are already in configuration.
