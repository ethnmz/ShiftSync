# Proposed shared shapes

Status: **proposal**. Not implemented. No package, server, or database is created by this file. Diego Lozano (`GITHUB_LOGIN_DIEGO`) approves changes and is the person who can mark the proposal accepted on the Message Board. Until that post exists, callers treat every field below as a draft.

Synthetic fictional data only. Ids such as `RACK-A-12` are examples, not a real site. Nothing here authorizes physical work. `cleared` is a human status. Agents leave `clearance` null.

## Source

```json
{
  "source_id": "src-transcript-014",
  "kind": "voice_transcript",
  "locator": "00:12:40-00:12:51",
  "excerpt": "CRAH-2 is still in alarm at the end of the shift."
}
```

`kind` is one of `voice_transcript`, `vendor_email`, `maintenance_record`.

## Equipment event

```json
{
  "event_id": "evt-1001",
  "equipment_id": "CRAH-2",
  "summary": "Cooling unit still in alarm.",
  "unresolved": true,
  "condition": "alarm",
  "sources": [
    {
      "source_id": "src-transcript-014",
      "kind": "voice_transcript",
      "locator": "00:12:40-00:12:51",
      "excerpt": "CRAH-2 is still in alarm at the end of the shift."
    }
  ]
}
```

`sources` has at least one entry. An event with an empty source list does not match this proposal.

## Planned task

```json
{
  "task_id": "task-77",
  "title": "Inspect RACK-A-12 filters",
  "target_equipment_id": "RACK-A-12",
  "depends_on_equipment_ids": ["CRAH-2", "UPS-B"],
  "status": "awaiting_human_review",
  "clearance": null
}
```

`status` is one of `draft`, `awaiting_human_review`, `cleared`, `blocked`. `cleared` requires `clearance` set by a person, for example `{ "cleared_by": "name", "note": "walked the floor" }`. Extraction and check code do not write that object.

## Check result

```json
{
  "task_id": "task-77",
  "conflicts": [],
  "omitted_unresolved": [
    {
      "equipment_id": "CRAH-2",
      "event_id": "evt-1001",
      "reason": "Maintenance note for RACK-A-12 does not mention the open CRAH-2 alarm."
    }
  ],
  "dependency_gaps": [],
  "requires_human_review": true
}
```

`conflicts` lists unresolved conditions that disagree, each with `equipment_id`, `event_ids`, and `why`. `dependency_gaps` lists a configured dependency that is missing or still unresolved, each with `equipment_id` and `reason`. `requires_human_review` stays true until a person clears the task. The check does not set `status` to `cleared`.

## Facility view selection

Read-only demo state for the 3D view. Not a simulation result.

```json
{
  "selected_kind": "planned_task",
  "selected_id": "task-77",
  "highlighted_equipment_ids": ["RACK-A-12", "CRAH-2", "UPS-B"]
}
```

`selected_kind` is `equipment` or `planned_task`. Reset is an empty selection: no `selected_id`, empty `highlighted_equipment_ids`. Highlighting shows the target plus configured dependencies. It does not start, stop, or clear equipment.

## Example the checks are meant to catch

A synthetic transcript records an open alarm on `CRAH-2`. A later synthetic maintenance record describes work on `RACK-A-12` and never mentions that alarm. The planned task depends on `CRAH-2` and `UPS-B`. The proposed check reports `CRAH-2` under `omitted_unresolved` and leaves the task in `awaiting_human_review`.
