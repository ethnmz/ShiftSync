# Product Spec: Handoff Ledger

## 1. Problem

NorthMark's challenge: *"A missed warning, an unclear handoff, or the wrong information at the wrong time can turn a small issue into a major disruption."*

Data center shift handoffs today are:
- **Scattered**: Slack messages, whiteboard notes, a hurried email, a hallway conversation.
- **Asynchronous**: the person who knows the details has gone home when the question comes up.
- **Memory-dependent**: nobody checks that the incoming shift actually *understood* what they read.
- **Short-lived**: issues that span several shifts get dropped ("orphaned bypasses").

One missed sentence about a bypassed chiller or a lockout/tagout (LOTO) on a breaker can cause an outage, or put a technician in danger.

## 2. Our answer

**Handoff Ledger**: technicians text or send voice notes to an iMessage number while they work. AI turns them into a persistent, source-cited **risk ledger**, and the handoff itself follows a structured protocol borrowed from medicine.

### Why I-PASS
I-PASS is a structured handoff protocol adopted by many hospitals after a large multi-site study (NEJM, 2014) reported fewer medical errors. *(Verify the exact figures before quoting them on stage.)* We map it onto the data center:

| I-PASS | In Handoff Ledger |
|---|---|
| **I**llness severity | Facility status bar: RED / AMBER / GREEN (computed by rules) |
| **P**atient summary | One line per open ledger item, grouped by equipment/hall |
| **A**ction list | What the incoming shift must do, with owner and deadline |
| **S**ituation awareness & contingency | "If X happens → do Y" for every critical item |
| **S**ynthesis by receiver | **Read-back check**: incoming lead summarizes aloud; AI finds what they missed |

**Pitch line:** *"Hospitals reduced handoff errors with a structured protocol. Data centers still hand off with Slack messages. We brought that protocol to the data center floor, and AI enforces it."*

## 3. Users

- **Floor technician**: busy, gloves on. Sends a voice note via iMessage. Never opens our web app.
- **Outgoing shift lead (Shift A)**: answers clarification questions (via iMessage) before leaving.
- **Incoming shift lead (Shift B)**: reads the briefing, does the read-back, acknowledges items. Uses the web app on a big screen or tablet.
- **Site manager** (secondary): sees the audit trail and the handoff completeness score.

## 4. Features and priorities

**P0 = must exist for the demo. P1 = should exist. P2 = only if ahead of schedule.**

### P0: core loop
1. **Ingest via Photon iMessage**: text and voice notes → speech-to-text → stored `Memo` with audio. Web/text ingest and the seed script use the same pipeline.
2. **Extraction**: LLM turns a memo into structured `Observation`s (asset, action, vendor, quote, ambiguities), resolved against `config/assets.yaml`.
3. **Persistent ledger**: reconcile observations into `LedgerItem`s (open → update → resolve) with an append-only event history. Items close **only** on an explicit closing action plus a verified quote.
4. **Rules engine**: severity from `config/rules.yaml` (LOTO = critical, cooling/power bypass = critical, …).
5. **Outgoing quality check**: when Shift A starts the handoff, the AI turns ambiguities into clarification questions, sends them via iMessage to the memo's author, and attaches the answers. The handoff can't move forward while questions on critical items are unanswered.
6. **I-PASS briefing screen** for Shift B, with per-item **Acknowledge**, source quote, audio playback, age, "open for N shifts" and contingency.
7. **Read-back check**: Shift B lead sends a voice note (or records in the web app) summarizing the handoff. AI grades each open critical/warning item as covered / missed / misstated. Missed critical items need an individual acknowledgment.
8. **Conflict halt**: when a new memo starts an action (test, energize, start work) that conflicts with an open item (LOTO upstream in the dependency graph, paused vendor work, a stand-up directive), the system replies instantly in iMessage with **"HALT"** and shows a red alert on the dashboard.
9. **Handoff gate + completeness score**: the handoff completes only when every critical item is acknowledged, critical clarifications are answered and the read-back is done. Score shown as a percentage.

### P1
10. **Stale-item escalation**: items open across several shifts, or not mentioned in recent handoffs, get escalated ("Valve B bypassed 72 h across 9 shifts, not mentioned in last 4 handoffs").
11. **Contingency plans**: from the memo if stated, otherwise from `config/runbooks.yaml` (labeled "suggested").
12. **Stand-up capture**: record the pre-shift stand-up in the web app → extract **directives** ("no load tests in Hall C") → these feed the conflict check.
13. **Ask the ledger**: Q&A drawer. Full ledger plus recent memos in context (no vector DB needed); answers cite memo IDs and say "not in the logs" when unknown.
14. **Ownership transfer**: on handoff completion, every open item's owner moves to the incoming lead (logged as an event).

### P2
15. Investigator agent with tool calls (search_memos, get_item_history, get_dependencies), mainly for the **Nvidia** track when run on Nemotron.
16. Simulated building alarms feed → "unlogged anomaly" detection (an alarm with no memo about it).
17. Slack notification for HALT events.
18. Floor-plan view with items pinned to halls.

### Explicitly out of scope
Outlook/Calendar integration, real BMS/DCIM integrations, user auth beyond a roster, mobile app, multi-site support. Mention them as "future work" in the pitch.

## 5. Success criteria for the demo
- A memo arrives via iMessage and becomes a ledger item on screen in **< 10 s**.
- The ambiguous 03:15 memo produces a clarification question, and the answer resolves it.
- The read-back that omits Breaker 4 is caught as **missed (critical)**.
- "Starting UPS B load bank test" gets a **HALT** reply in iMessage within ~5 s, citing the Breaker 4 LOTO and the paused Siemens work.
- The stale Valve B bypass appears in the briefing with its shift count.

## 6. How this maps to judging
- **Track fit:** directly targets "unclear handoff" and "wrong information at the wrong time".
- **Trust:** rule-based safety decisions, verified source quotes, audit trail.
- **Usability:** technicians use iMessage (no new app); leads get a single-purpose briefing screen.
- **Photon track:** iMessage is the entire field interface, both inbound voice notes and outbound clarifications and HALT alerts.
- **Nvidia track:** multi-step agent pipeline (extract → reconcile → rules → clarify → read-back) with tool use, running on Nemotron.
