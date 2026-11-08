# Data Model (SQLModel + SQLite)

Static data (assets, roster, rules, runbooks) lives in `config/*.yaml` and is loaded at startup. Persons and assets are also mirrored into tables for joins.

## Enums

```python
Role          = "tech" | "lead" | "manager" | "vendor"
MemoSource    = "imessage_voice" | "imessage_text" | "web" | "standup" | "seed"
ItemKind      = "lockout_tagout" | "bypass" | "vendor_work" | "maintenance" | "alarm"
              | "directive" | "observation" | "task"
ItemStatus    = "open" | "monitoring" | "resolved"
Severity      = "critical" | "warning" | "info"          # set ONLY by rules.py
Action        = "bypassed" | "restored" | "locked_out" | "lockout_removed"
              | "work_started" | "work_paused" | "work_resumed" | "work_completed"
              | "alarm" | "alarm_cleared" | "reading" | "directive_issued" | "directive_lifted"
              | "test_started" | "energize" | "load_increase" | "note"
EventType     = "opened" | "updated" | "mentioned" | "clarified" | "severity_changed"
              | "escalated_stale" | "acknowledged" | "ownership_transferred" | "resolved"
              | "conflict_raised"
HandoffStatus = "draft" | "outgoing_review" | "briefing" | "readback_review" | "complete"
```

Closing actions: `restored, lockout_removed, work_completed, alarm_cleared, directive_lifted`.
Start actions (conflict-checked): `test_started, work_started, energize, load_increase`.

## Tables

### Person
`id (str, from roster), name, role, phone (E.164), shift_team ("night"|"day"|null), vendor_company (nullable)`

### Asset
`id ("BRK-4"), name, type ("breaker"|"ups"|"pdu"|"chiller"|"crac"|"generator"|"ats"|"valve"|"rack"|"hall"), hall, aliases (JSON list), feeds (JSON list of asset ids)`. Upstream lookup = reverse of `feeds`.

### Shift
`id, team, lead_id, starts_at, ends_at, status ("active"|"handing_off"|"closed")`. Current shift = the one whose window contains `clock.now()`.

### Memo
| field | type | notes |
|---|---|---|
| id | str | `M-0001` |
| shift_id | str | |
| author_id | str | Person |
| source | MemoSource | |
| text | str | transcript or text body |
| audio_path | str? | `data/audio/M-0001.wav` |
| received_at | datetime | `clock.now()` or scenario `at` |
| status | str | `processed` \| `needs_review` \| `rejected` |
| extraction_json | JSON | raw validated LLM output (for debugging/demo "show your work") |

### LedgerItem
| field | type | notes |
|---|---|---|
| id | str | `L-0001` |
| kind | ItemKind | |
| title | str | short, e.g. "LOTO on Breaker 4 (Siemens, UPS-B battery work)" |
| asset_ids | JSON list | primary first |
| hall | str? | derived from primary asset |
| status | ItemStatus | |
| severity | Severity | rules-only |
| state_detail | str | latest state in plain words, e.g. "Paused – vendor waiting on part; tag still on" |
| vendor | str? | |
| tag_holder | str? | for LOTO: who may remove the tag |
| directive_scope | JSON? | for directives: `{hall, categories:[...], until}` |
| contingency | str? | |
| contingency_source | str? | `memo` \| `runbook` |
| owner_id | str | current shift lead by default |
| opened_at, opened_by, opened_memo_id | | |
| last_update_at, last_mentioned_at | datetime | |
| shifts_open | int | recomputed |
| handoffs_unmentioned | int | consecutive completed handoffs where item wasn't covered in read-back or memos |
| stale | bool | from stale.py |
| resolved_at, resolved_by, resolved_memo_id | | |

### ItemEvent (append-only audit trail)
`id, item_id, type (EventType), at, actor_id?, memo_id?, quote?, detail (JSON)`

### Clarification
`id, handoff_id?, item_id?, memo_id, ask_to (person id), question, reason ("ambiguous_asset"|"unclear_status"|"missing_closure"|"rule"), priority (critical|warning|info), status ("queued"|"sent"|"answered"|"dismissed"), answer_text?, answer_memo_id?, asked_at?, answered_at?`

### Conflict
`id, memo_id, level ("HALT"|"WARN"), asset_id, action, message, blocking_item_ids (JSON), at, resolved (bool), override_by?, override_reason?`

### Handoff
`id, from_shift_id, to_shift_id, from_lead_id, to_lead_id, status (HandoffStatus), started_at, completed_at?, score (float?), score_breakdown (JSON?)`

### Acknowledgment
`id, handoff_id, item_id, person_id, method ("tap"|"readback"), at`

### Readback
`id, handoff_id, person_id, memo_id?, transcript, results (JSON list of {item_id, verdict: covered|missed|misstated, evidence_quote?, issue?}), at`

## Derived values
- **Facility status**: RED if any open critical item or unresolved HALT; AMBER if any open warning; else GREEN.
- **shifts_open**: count of Shift windows overlapping `[opened_at, now]`.
- **Handoff score**: see `rules.yaml → scoring`.
