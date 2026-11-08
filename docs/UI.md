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

App shell (Receive and the P1 screens): compact left rail with ShiftSync logo + tagline, nav **New handoff · Receive**, P1 screens (History · Supervisor · Evaluation) listed as not built, demo user switcher (Maya / Jordan / Dana, labeled "not sign-in"), and an "Offline demo data" / "Live API" indicator. Create runs full screen without the rail.

## Screen 1: Shift A, Create Handoff (`/create`)
Three separate full-screen pages, one step each: `/create` (Record) → `/create/:id/clarify` → `/create/:id/review` (`/create/:id/record` to add more). A top bar holds the ShiftSync mark, a **Record · Clarify · Review** step pill, the elapsed time ("2m 51s") and the demo user. The first note moves straight on to Clarify; the last answer moves on to Review.
1. **Record**: a centered conversation card. Header: **Record / Type** toggle and ✕ (leave; the handoff stays saved), a "Handoff to Jordan Blake" tag. The note shows as a bubble (voice notes get ▶ and a waveform from the levels measured while recording); a typing indicator while ShiftSync analyzes; then ShiftSync's reply listing the extracted items with certainty badges and **Continue to clarify →**. A type-instead box with a mic sits at the bottom of the card. A large black **● Record** pill is docked at the bottom of the screen; while recording it shows Discard · live level meter · timer · **■ Finish**. Transcription happens after Finish, so nothing claims to be live text. Microphone denied or unsupported falls back to typing.
2. **Clarify**: progress bar `1 of up to 3 answered`, one question at a time: question, *why asked* line (e.g. `"mostly finished": what's left and why?`), answer box, **Answer by voice**, outlined **I don't know**, **Send answer**. What the last answer added shows under the card ("✓ Added: remaining work, reason"). An **Answered** list and a muted **Not asked (low priority)** list sit below.
3. **Review**: facts on the left, the source transcript on the right (stacked on small screens). Critical items first with a "3 of 8 checked" bar; each fact row: slot label · value · certainty badge · review chip (AI · not checked / Checked / Edited / Removed) · quote link · **✓ Correct** · ✎ edit. Selecting a quote highlights the passage in the transcript. **Confirm routine items** for non-critical facts, a follow-ups list (owner "To be assigned"), and a sticky bar with backend blockers and **Submit handoff** (disabled with a reason until critical facts are checked). After submit: status line and **Open the incoming view →**.

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
