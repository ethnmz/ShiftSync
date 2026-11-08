# Demo Script

The body below is a **rehearsal of about 3 minutes**. The submitted video must be **2 minutes or less**. Use the hook, the recording, one clarification, the bad incoming answer with the correction, and the status line. Leave the supervisor view and the evaluation screen out of the submitted cut. No deadline in this file was re-checked.

# Rehearsal (~3 minutes)

**Goal:** show the value of the *complete interaction*, not just LLM output.
**Setup:** laptop on projector at `/create` as Maya. Second browser (or tablet) logged in as Jordan. Backend reset with history (carried-over CRAC 3 follow-up). Clock 06:35. Demo panel (`D`) ready for replay of any step in `demo/scenario.json`.

### 0. Hook (15 s)
> "Every shift change, someone says 'it's mostly done, everything else should be okay.' The next shift hears 'done' and 'okay.' Other tools turn that into a nicer summary. ShiftSync makes sure the meaning actually transfers. Less chaos. Clearer communication. Faster handoffs."

### 1. Shift A records (20 s): Problems 5, 1, 4
- **Live**, Maya presses Record: *"UPS-B maintenance is mostly finished. The vendor is coming back tomorrow. Generator 1 looks good. I'm not sure what happened with the cooling inspection, but everything else should be okay."*
- Cards appear. Point at the badges: UPS-B work **⚠ Unverified ("mostly")**, Generator 1 **◔ Reported ("looks good")**, cooling inspection **? Unknown ("not sure")**, "everything else should be okay" **⚠ Unverified, no equipment named**.
- **Say:** "Nothing she hedged became a fact."

### 2. Adaptive clarification (50 s): Problems 1, 3, 4, 5
- "ShiftSync needs 3 quick answers."
- Q1 (*"mostly finished": what remains?*) → *"The replacement battery module didn't arrive, so the vendor couldn't do the final load test. That's what they're coming back for."* → remaining work and **why** appear.
- Q2 (*clearance not stated*) → *"No. It's still in maintenance bypass. It's not cleared until the vendor finishes the load test and signs off."* → **✓ Not cleared**, required verification.
- Q3 (*"not sure": what's known?*) → *"It was Chiller 2. The vendor was here in the afternoon but I never got a report. I honestly don't know if they finished."* → Chiller 2 **? Unknown**, follow-up **owner: To be assigned**.
- Point at **Not asked (low priority)**: "everything else" scope, UPS-B owner. **Say:** "Three questions, not a 15-field form, and it never guesses an owner."

### 3. Review and submit (15 s)
- Tap ✓ on each critical fact, "Confirm routine", **Submit**. Timer: about 3 minutes.

### 4. Shift B receives (20 s): Problems 2, 3, 4
- Switch to Jordan's screen. Briefing: UPS-B not cleared, load test pending (battery module not delivered), Chiller 2 inspection result unknown with owner to be assigned, the unverified catch-all, and the carried-over CRAC 3 follow-up. Point at the disclaimer.
- Jordan taps **Acknowledge** → chip "Acknowledged, understanding not yet verified". Jordan assigns himself the Chiller 2 follow-up by 10:00.

### 5. Understanding verification (45 s): Problem 2, the key moment
- Q: "What is the current status of UPS-B, and what must be verified before testing?"
- **Live**, Jordan, confidently: *"Maintenance is complete, so we can start testing."*
- ✗ **Inconsistent with the handoff**: *"That interpretation is inconsistent with the handoff. Maintenance remains incomplete, and clearance must be verified through authorized procedures."* plus Maya's quotes with ▶ audio.
- Jordan, attempt 2: *"UPS-B isn't finished. The final load test is still pending because the battery module didn't arrive. It's in maintenance bypass and not cleared until the vendor finishes the test and signs off."* → ✓ **Consistent**.
- Chiller 2 question → ✓ first try.
- **Say:** "He acknowledged it. He was confident. He was wrong. A checkbox would never have caught that."

### 6. Completion + proof (15 s)
- Status line: Submitted · Acknowledged · **Understanding verified** · 3 open follow-ups (1 to be assigned). **Say:** "Verified understanding doesn't mean the UPS is fixed; that stays open and owned."
- Optional: Supervisor view shows the unassigned UPS-B follow-up; Dana assigns it.
- Evaluation screen: **only real numbers** from our runs vs normal handoff and AI summary, including incorrect facts introduced by AI.

### 7. Close (5 s)
> "Outgoing operators talk naturally. AI catches the gaps. Uncertainty stays visible. Incoming operators prove they understood. ShiftSync."

## Backups
Any step can be replayed from the demo panel. If Nemotron is slow, switch `LLM_PROVIDER=claude` before judging. Keep a pre-recorded audio file of Maya's statement in case the mic fails.

## Likely judge questions
- **"How is this different from an AI summary?"** Summaries pass "mostly finished" through or turn it into "finished". We classify certainty, ask about the gap and verify the receiver's understanding. Show the evaluation table.
- **"Can the AI mark something safe or complete?"** No. Code caps certainty based on the operator's words; completion and clearance need explicit statements; feedback never authorizes operations.
- **"Isn't this more work?"** One recording plus at most 3 answers; the "I don't know" button; the not-asked list shows what we skipped.
- **"What if nobody knows?"** It stays unknown, with a follow-up assigned by a lead or supervisor, and carries over to the next handoff.
