# Product Spec: ShiftSync

This is the final pack. It is the build target. `docs/CONTRACT_MIGRATION.md` records where it differs from an earlier in-person API agreement.

**Tagline:** Less chaos. Clearer communication. Faster handoffs.

## 1. Problem
Critical operational information is frequently **lost, misunderstood, left unresolved or communicated ambiguously** during shift-to-shift handoffs. Basic handoff tools (organized notes, task carry-over, acknowledgment buttons, audit logs) already exist; other teams will build AI summarizers, meeting assistants or handoff dashboards. None of these checks whether understanding actually transferred.

**Our differentiator is not a better handoff document. It's improving and verifying the transfer of understanding between shifts.** ShiftSync stands out by:
1. Detecting important missing information **before Shift A leaves**.
2. Clarifying what operators actually **mean**.
3. Preserving the **reasoning** behind decisions.
4. **Tracking uncertainty** instead of hiding it.
5. **Testing whether Shift B correctly understands** critical information.
6. Doing all of this with **minimal operator effort**.

## 2. The five problems and solutions

### Problem 1: Hidden assumptions → Clarification Engine
Operators say "everything is fine", "it's handled", "the vendor should be done".
- Detect ambiguous, incomplete or vague operational language.
- Identify what information is missing (required facts per item type, `config/slots.yaml`).
- Generate specific, situation-relevant follow-up questions **before Shift A submits**.
- Never assume a task is complete without explicit confirmation.
> Shift A: "The UPS vendor should be done tomorrow." → ShiftSync: "What work remains unfinished, and is UPS-B currently cleared for normal operation?"

### Problem 2: False understanding → Two-Way Understanding Verification
- Concise, prioritized briefing for Shift B.
- Targeted, open-ended questions about the most important unresolved items.
- Shift B explains in natural language (voice or text).
- Compare with the verified handoff; identify important misunderstandings and **show the original evidence** (Shift A's quotes).
- Allow clarification and another attempt.
- **Record acknowledgments separately from verified understanding.**
> ShiftSync: "What is the current status of UPS-B, and what must be verified before testing?" · Shift B: "Maintenance is complete, so we can start testing." · ShiftSync: "That interpretation is inconsistent with the handoff. Maintenance remains incomplete, and clearance must be verified through authorized procedures." *(evidence quotes shown)*

### Problem 3: Lost reasoning → Decision Context Preservation
- Identify decisions (postponed, bypassed, deferred, kept in manual…).
- Extract the rationale when given; ask when it's important and missing.
- Preserve restrictions, conditions and exceptions.
- Show Shift B what happened **and why**, linked to the source.
> Shift A: "We postponed UPS-B testing." → "Why was testing postponed, and what must happen before it can be rescheduled?" → "The vendor hasn't delivered the replacement component."

### Problem 4: Unresolved uncertainty → Uncertainty & Follow-Up Tracking
- Detect uncertain language ("probably", "I think", "maybe", "not sure", "mostly", "looks good").
- **Never** auto-convert uncertain statements into confirmed facts (code-enforced).
- Classify every fact: **confirmed / reported / unverified / unknown** (definitions in `DATA_MODEL.md`).
- Ask whether important claims have been verified.
- Preserve unresolved questions **across handoffs** (carry-over).
- **Authorized users** (leads, supervisors) assign follow-up owners and deadlines; until then the owner shows **"To be assigned"**.
- Unresolved issues stay visible until verified or closed with evidence.
> "I think the cooling vendor finished maintenance." → "Has maintenance completion been confirmed?" → "No, I haven't received confirmation." → Chiller 2 · Maintenance status: **Unverified** · Missing: vendor completion confirmation · Follow-up owner: **To be assigned**

### Problem 5: Handoff fatigue → Adaptive, Low-Friction Experience
- Voice-first, text alternative.
- Auto-extract structure from natural speech; prepopulate everything already said.
- Never ask what's already answered; ask only the most relevant missing questions, most important first (budget: 3 by default).
- Short answers, quick corrections (tap to edit any field), easy review.
- One-tap **"I don't know"**, so nobody is forced to guess.
- Mandatory safety-related checks are kept even when simplifying.
> "Generator 1 maintenance is complete. UPS-B testing is still pending. Vendor returns at 9 AM, and Shift B Lead will follow up." → ShiftSync recognizes owner, schedule and outstanding work, and asks only: "Has UPS-B's operational clearance been confirmed?"

## 3. Core user journey
1. Outgoing handoff (voice/text) → 2. AI analysis → 3. Adaptive clarification → 4. Handoff review and submit → 5. Incoming briefing → 6. Understanding verification → 7. Completion tracking.

**Completion semantics (shown in the UI, never blurred):**
- **Submitted**: Shift A reviewed and submitted.
- **Acknowledged**: Shift B confirmed receipt. *This does not mean understood.*
- **Understanding verified**: Shift B answered every critical verification question correctly (after at most 2 attempts, or the lead marks "clarified in person", which is logged).
- **Open follow-ups**: listed separately. A handoff can be fully verified *and* still have open follow-ups. Neither acknowledgment nor verification closes an operational issue or implies it's safe.

## 4. Priorities
**P0:** voice/text handoff creation · structured extraction · adaptive clarification · uncertainty tracking · incoming briefing · understanding verification · persistent handoff state.
**P1:** handoff history · supervisor overview · source highlighting · additional ingestion (Photon iMessage voice notes) · evaluation dashboard.
**P2:** Outlook integration (only vendor schedule info that feeds a handoff) · additional notification channels · advanced analytics.

**Out of scope, always:** predictive maintenance, equipment control, facility-wide monitoring, alarms/BMS/DCIM, anything that authorizes equipment operations.

## 5. Success criteria for the demo
- Shift A's effort: one recording + ≤ 3 short answers + one review tap, under 3 minutes.
- "Mostly finished", "looks good", "not sure", "should be okay" are all classified correctly; **none** become confirmed.
- What Shift A genuinely doesn't know stays **unknown/unverified**, with "To be assigned" until an authorized user assigns it.
- Shift B confidently misreads UPS-B → ShiftSync catches it, shows Maya's quotes → second attempt correct.
- Acknowledgment and verification are visibly separate; open follow-ups remain open after completion.
- Benchmark numbers on the Evaluation screen come from actual runs.

## 6. Pitch spine
1. "Both shifts think the handoff worked. They understood different things."
2. Summaries make handoffs prettier, not understood. Our differentiator is verifying the transfer of understanding.
3. Live demo of the full interaction (not just LLM output).
4. Evaluation vs a normal handoff and a basic AI summary, including **incorrect facts introduced by AI**.
5. "Less chaos. Clearer communication. Faster handoffs."
