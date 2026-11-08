# UI Spec

**Design goals:** visually polished, modern, responsive (laptop, tablet, wall screen). Built for exhausted operators: large touch targets (≥ 44 px), short text, one primary action per view, voice first. Light theme only (neutral surfaces, thin borders, one accent color).

## Shared visual language (use everywhere, consistently)
**Certainty badges** (icon + word + color, never color alone):
| Certainty | Badge | Color |
|---|---|---|
| confirmed | ✓ Confirmed | green |
| reported | ◔ Reported | blue |
| unverified | ⚠ Unverified | amber |
| unknown | ? Unknown | violet |

**Review state:** small **AI** chip on facts not yet reviewed; ✎ "Edited" chip on operator edits (hover shows the AI's original). **Priority:** Critical (red bar) · Important (amber bar) · Routine (gray, collapsed).
**Source evidence:** every fact has a quote icon; click/hover shows the verbatim statement with the quoted span highlighted, plus ▶ audio. (Source highlighting is P1; plain quotes are P0.)
**Status line** (on every handoff): `Submitted 06:39 · Acknowledged 07:01 · Understanding verified 07:04 · 3 open follow-ups (1 to be assigned)`. Acknowledged and Verified are always shown as separate chips.
**Copy rule:** never show "safe", "cleared", "complete" or "resolved" unless a confirmed fact says so. Standing disclaimer on Shift B screens: *"Acknowledging or verifying this handoff does not close open issues or confirm equipment is safe to operate."*

App shell: top bar with ShiftSync logo + tagline, user switcher (demo: Maya / Jordan / Dana), nav: **Create · Receive · History · Supervisor · Evaluation**.

## Screen 1: Shift A, Create Handoff (`/create`)
Three-column flow on desktop, stacked on tablet:
1. **Capture (left)**: huge round **Record** button (hold or tap-toggle, live waveform, timer), "Type instead" text area, live/completed transcript with uncertain words underlined amber/violet (`mostly`, `not sure`, `looks good`).
2. **Clarify (middle)**: "ShiftSync needs 3 quick answers" with progress `1 of 3`. One card at a time: question, *why asked* tag (e.g. `"mostly finished": what remains?`), mic button, text field, and an outlined **I don't know** button. Answered cards collapse into a stack above, showing their effect ("✓ added: remaining work, reason"). A muted section **Not asked (low priority)** lists the gaps skipped by design.
3. **Structured handoff (right)**: equipment cards update live as facts arrive (animate certainty changes). Each fact row: slot label · value · certainty badge · AI chip · ✓ confirm · ✎ edit. Follow-ups section: description, owner ("To be assigned"), deadline.
Footer: **Review & submit** opens a review drawer: critical facts need individual ✓ (one tap each); "Confirm routine items" button; Submit (disabled with a reason until blockers are cleared). Show elapsed time ("2m 51s").

## Screen 2: Shift B, Receive Handoff (`/receive/:id`)
- Header: from Maya → to Jordan, submitted time, status line, disclaimer.
- **Briefing**: headline + ≤ 6 lines, each with certainty badges and a source link.
- **Equipment cards**, critical and unresolved first: what · why · certainty · what must be verified · next action · owner/deadline · source quotes (expand). Carried-over items are tagged "Carried over from 11/07".
- **Acknowledge receipt** button (secondary style) → chip "Acknowledged, understanding not yet verified".
- **Verify understanding** panel (primary): one question at a time, mic + text. After answering, the result shows:
  - verdict chip: ✓ Consistent / ◐ Partially consistent / ✗ Inconsistent with the handoff
  - **What you said** (with contradicting phrases highlighted red) vs **What the handoff says** (facts with badges) + **Evidence** (Maya's quotes, ▶ audio)
  - feedback text, then **Try again** (attempt 2/2). After 2 attempts: "Talk to Maya, then mark clarified in person" (lead only).
- **Follow-ups** list: assign owner/deadline (lead/supervisor only), close with a statement.

## Screen 3: Handoff History (`/history`) (P1)
Table/cards: handoff, from→to, timestamps per stage, status chips, open questions, pending acknowledgments, verification result. Detail view: full timeline (statements, questions and answers, edits with AI originals, verification attempts, follow-up assignments) with source evidence.

## Screen 4: Supervisor View (`/supervisor`) (P1, minimal)
Four tiles: **Pending handoffs** · **Unresolved questions** · **Outstanding acknowledgments** · **Verification status** (verified / with assistance / in progress), plus **Follow-ups: open · to be assigned · overdue** with inline assign. Handoff quality and completion only, with no equipment telemetry or facility monitoring.

## Screen 5: Evaluation (`/evaluation`) (P1)
Table: rows Normal handoff / AI summary / ShiftSync; columns are the metrics in `EVALUATION.md`, with best values highlighted. "Incorrect facts introduced by AI" gets a prominent column. Drill-down shows side-by-side artifacts for one scenario. Footnote: simulated operators, same model, mean of 3 runs, run timestamp. Empty state until a real run exists; **no placeholder numbers**.

## Demo controls
Hidden panel (press `D`): reset, step through `demo/scenario.json`, simulated clock, LLM provider indicator.

## Implementation notes
- React Router routes above; TanStack Query (`refetchInterval: 1500` on the active handoff).
- `MediaRecorder` → `audio/webm` upload; show "Transcribing…" skeleton; graceful text fallback.
- Components: `CertaintyBadge`, `FactRow`, `EquipmentCard`, `QuestionCard`, `EvidenceQuote`, `StatusLine`, `VerificationResult`, `FollowUpRow`, `RecordButton`.
- Build every screen against fixtures first: `handoff_clarifying.json`, `handoff_in_review.json`, `handoff_submitted.json`, `verification_inconsistent.json`, `supervisor_summary.json`.
