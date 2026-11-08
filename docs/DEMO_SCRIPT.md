# Demo Script (~3 minutes)

**Setup:** laptop on the projector showing the web app (Floor Feed). One phone (the "technician") with iMessage open to the Photon line, mirrored or visible to judges. Backend reset and seeded with `history` (the 3-day-old Valve B bypass). Clock set to Sat 23:00 local. Demo Control panel (`D`) open on a second screen.

Steps match `demo/scenario.json`. **Live** = sent from the phone. **Replay** = `POST /demo/step/n` (pre-recorded transcripts, reliable). Rule: send 1–2 steps live, replay the rest.

---

### 0. Hook (15 s)
> "At 7 a.m., the night shift at a data center goes home. Everything they know about the building leaves with them, except what made it into a Slack message. One missed sentence, like 'the lockout tag is still on breaker 4', can take down a hall or hurt someone. Hospitals solved this with a structured handoff protocol called I-PASS. We brought it to the data center."

### 1. The night shift (45 s): Floor Feed screen
- **Replay steps 1–3:** stand-up directive (Hall C power limit), Chiller 2 bypass, Hall B temp reading. Point at the ledger filling up: severities, source quotes.
- **LIVE step 4 (phone voice note):** *"Siemens guys are here, starting on the UPS B battery string. They locked out breaker 4, tag's on it, the guy's name is Dave Smith."* Phone gets the `Logged ✅ LOTO on BRK-4 (critical)` reply within seconds. **Say:** "Voice note, no app, no typing."
- **Replay steps 5–8.** Call out step 6: *"Quiet night honestly… coffee machine's broken… oh and the vendor left early… badge reader's sticking."* **Say:** "That is exactly the sentence that gets lost."

### 2. Outgoing check (30 s): Handoff screen
- Click **Start handoff** (clock 06:30). The AI asks the outgoing techs via iMessage:
  - to Priya: *which vendor, and is the tag still on Breaker 4?*
  - to Luis: *Chiller 2 is still in bypass. Should day shift keep it that way?*
- **Replay answers (steps 9–10)** (or answer live on the phone). The gate turns green.
- **Say:** "We fix ambiguity while the person who knows the answer is still in the building."

### 3. Incoming briefing (30 s): Briefing screen
- RED status bar. Headline. Critical items: BRK-4 LOTO (vendor paused), CHL-2 bypass, **VLV-B bypass: 3 days, 9 shifts, not mentioned in the last 4 handoffs (STALE)**. Contingency: "If Hall B > 27 °C → portable unit PC-2."
- **Say:** "This is I-PASS: severity, summary, actions, contingencies. 60 seconds to read."

### 4. Read-back (30 s): the moment
- **Replay step 11** (or say it live as Jordan): *"OK so chiller 2's in bypass, Hall B's running warm, keep an eye on it, gen 1 filter's done, and no load tests in Hall C."*
- Screen: ✓ Chiller 2 · ✓ Hall C directive · ✗ **MISSED: Breaker 4 lockout** · ✗ **MISSED: Siemens work on UPS B (paused)** · ✗ **MISSED: Valve B bypass**. Jordan must tap-acknowledge each one. Score rises to 100%, then **Complete handoff**.
- **Say:** "He read the briefing. He still missed the lockout. Now the system knows, and so does he."

### 5. The save (20 s)
- Clock 08:10. **LIVE (phone, as day tech Sam):** *"Starting the UPS B load bank test now."*
- Phone receives **🛑 HALT** within seconds; the dashboard shows a red banner citing BRK-4 → UPS-B, Dave Smith, Siemens paused 03:15.
- **Say:** "Every one of those was a sentence someone could have missed."

### 6. Close (10 s)
> "AI reads the messy notes. Rules make the safety calls. Every fact links back to who said it. Handoff Ledger."

---

## Backup plans
- Photon down → send the same lines via the web "Log memo" box (same pipeline), or replay.
- LLM slow → pre-warm by replaying the full scenario once before judging; keep `demo_snapshot.db` to restore a finished state.
- Judges ask "what if the tech never logs it?" → future work: building-alarm feed (P2 #16), or show it if built.

## Likely judge questions
- *Why not just a better Slack channel?* Slack doesn't track state, verify understanding or block conflicting actions.
- *Can the AI hallucinate a closure?* No. Closures need an explicit closing action plus a quote verified against the transcript. Severity and HALTs are rule-based.
- *Privacy?* Roster-only senders, local storage, audit trail. Only STT/LLM providers see text.
- *Scale?* Same ledger per site; the rules file is per-facility configuration.
