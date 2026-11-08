# Data Model (SQLModel + SQLite, persistent)

This is the final spec pack's model. Field-name changes from the in-person agreement are mapped in `docs/CONTRACT_MIGRATION.md`.

Static config in `config/*.yaml` loads at startup (persons and assets are mirrored into tables).

## The four layers (never mix them)
| Layer | Where | Mutable? |
|---|---|---|
| 1. Source statements | `Statement` (verbatim transcript/answer, audio) | **Immutable** |
| 2. AI-extracted info | `Fact` with `review_state = ai_extracted` | Replaced by re-extraction until reviewed |
| 3. Operator-confirmed info | `Fact` with `review_state = operator_confirmed / operator_edited` | Only by operators (logged) |
| 4. Unverified info | `Fact.certainty ∈ {unverified, unknown}` | Visible everywhere, including after review |

`review_state` (who has looked at it) and `certainty` (how sure we are about the world) are **independent**. An operator can confirm that "Chiller 2 status is unknown" is a correct record; the certainty stays `unknown`.

## Certainty levels (Problem 4), code-enforced floors in `app/certainty/`
| certainty | Meaning | Typical language | Floor rule |
|---|---|---|---|
| `confirmed` | Stated as first-hand, verified fact, no hedging | "Load test is not done." "It is in maintenance bypass." | Only if the quote has no hedge/uncertainty/observation term |
| `reported` | Stated plainly but not as verified: observation or second-hand | "Generator 1 looks good", "vendor says it's done" | Quotes with `observation_terms` or attribution cap here |
| `unverified` | A specific claim exists, but it's hedged or explicitly not verified | "I think they finished", "mostly finished", "should be done", "haven't received confirmation" | Quotes with `hedges` cap here |
| `unknown` | The state itself isn't known | "I'm not sure what happened", "no idea", "don't know" | Quotes with `uncertainty_terms` → unknown |

Lexicons live in `config/slots.yaml → language`. The floor can only **lower** certainty. Raising certainty needs a **new statement** from an operator (e.g. a clarification answer), never inference.

## Enums
```python
Role         = "tech" | "lead" | "supervisor" | "vendor"
StatementSrc = "voice_web" | "text_web" | "imessage_voice" | "imessage_text" | "seed"
StatementRole= "handoff" | "clarification_answer" | "review_edit" | "verification_answer" | "followup_update"
ItemKind     = "maintenance" | "vendor_work" | "testing" | "inspection" | "bypass" | "lockout_tagout"
             | "decision" | "warning" | "general_claim" | "observation"
WorkStatus   = "complete" | "incomplete" | "pending" | "not_started" | "unknown"
Certainty    = "confirmed" | "reported" | "unverified" | "unknown"
ReviewState  = "ai_extracted" | "operator_confirmed" | "operator_edited" | "operator_rejected"
Priority     = "critical" | "important" | "routine"          # rules.yaml only
HandoffState = "draft" | "analyzing" | "clarifying" | "in_review" | "submitted"
             | "acknowledged" | "verifying" | "verified" | "verified_with_assistance"
GapType      = "vague_statement" | "missing_required" | "uncertain_claim" | "missing_rationale"
             | "missing_condition" | "unscoped_claim" | "missing_owner_or_deadline"
Verdict      = "consistent" | "partially_consistent" | "inconsistent"
Misconception= "treated_incomplete_as_complete" | "treated_unverified_as_confirmed" | "assumed_clearance"
             | "missed_required_verification" | "missed_rationale" | "missed_condition" | "wrong_owner"
             | "wrong_equipment" | "other"
```

## Tables

**Person** `id, name, role, team, phone?` · **Asset** `id, name, type, location, aliases[]` · **Shift** `id, team, lead_id, starts_at, ends_at`

**Handoff**
`id, from_shift_id, to_shift_id, outgoing_id, incoming_id, state (HandoffState), created_at, submitted_at?, acknowledged_at?, acknowledged_by?, verification_started_at?, verified_at?, question_budget_used, metrics (JSON), carried_over_item_ids (JSON)`

**Statement** (layer 1, immutable)
`id, handoff_id, speaker_id, source, role (StatementRole), text, audio_path?, at, question_id?` (if it answers a clarification)

**Item** (an equipment- or topic-level card)
`id, handoff_id, origin_item_id?` (carried over from an earlier handoff) `, kind, title, asset_ids[], location?, priority (rules), is_decision (bool), open (bool), created_from_statement_id`

**Fact**
| field | notes |
|---|---|
| id, item_id | |
| slot | from `slots.yaml` (e.g. `work_status`, `operational_clearance`, `rationale`, `restore_condition`, `remaining_work`, `next_action`, `owner`, `deadline`) |
| value | short plain text |
| normalized | enum value if the slot defines `values` |
| certainty | Certainty (after floor) |
| certainty_reason | e.g. `hedge:"mostly"`, `uncertainty:"not sure"`, `operator stated` |
| review_state | ReviewState |
| source_statement_id, quote | verbatim span, verified (fuzzy ≥ 85) |
| superseded_by? | history kept |
| ai_proposed_value? | if the operator edited, keep what AI proposed (for the "incorrect facts introduced by AI" metric) |

**FollowUp** (Problem 4)
`id, item_id, handoff_id, description` (e.g. "Obtain vendor completion confirmation for Chiller 2 inspection") `, missing_information, owner_id? (null → "To be assigned"), deadline?, assigned_by?, assigned_at?, status ("open"|"in_progress"|"closed"), closed_by?, closed_at?, closure_statement_id?`
- Created automatically (deterministic) for every critical/important fact with certainty `unverified`/`unknown` or work_status `incomplete/pending/unknown`.
- `owner_id`/`deadline` set only when: (a) Shift A's statement explicitly names them (quote-verified), or (b) a user with role `lead`/`supervisor` assigns them in the UI (`assigned_by` logged).
- Closing requires a closure statement (who verified what). Open follow-ups carry over to the next handoff.

**ClarificationQuestion** (Problem 1, 3, 4, 5)
`id, handoff_id, item_id, gap_type, slots[], priority_score, text, status ("pending"|"answered"|"answered_unknown"|"not_asked"), reason_not_asked?, answer_statement_id?, asked_at?, answered_at?`

**Acknowledgment** (separate from verification!)
`id, handoff_id, person_id, at, scope ("handoff"|"item"), item_id?`

**VerificationCheck** (Problem 2)
`id, handoff_id, item_id, question, answer_key (JSON: must_convey[{fact_id, statement}], must_not_claim[]), status ("pending"|"verified"|"needs_clarification"|"clarified_in_person"), attempts (JSON)`
Attempt: `{statement_id, answer_text, verdict, conveyed_fact_ids, missing_fact_ids, contradictions[{fact_id, claimed}], misconception, feedback, evidence[{statement_id, quote}], at}`

**AuditEvent**
`id, handoff_id?, item_id?, actor_id?, type, at, detail (JSON)`. Types include `fact_extracted, certainty_floored, question_asked, answered_unknown, fact_edited, submitted, acknowledged, verification_attempt, clarified_in_person, followup_assigned, followup_closed, carried_over`.

## Derived views
- **Briefing**: open items sorted by priority; per item: what/why/certainty/next action/owner/source quotes.
- **Handoff status line**: `Submitted 06:45 · Acknowledged 07:01 · Understanding verified 07:06 (1 corrected) · 2 open follow-ups (1 to be assigned)`.
