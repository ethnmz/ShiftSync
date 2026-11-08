# UI Spec (frontend/)

**Audience:** stressed shift leads on a wall screen or tablet. **Theme:** dark control room (`#0B0F14` background), high contrast, large type (base 18 px, headlines 32 px+). Severity colors: critical `#EF4444`, warning `#F59E0B`, info `#64748B`, ok `#22C55E`. Color is never the only signal: always include an icon and text label.

**Global header (all screens):** site name · current shift + lead · simulated clock · **facility status pill** (RED/AMBER/GREEN) · active HALT banner (full-width red, sticky) when `active_halts` is non-empty.

Routes and screens, in demo order:

## 1. `/` Floor Feed (night shift view)
- **Left column (40%): Memo stream**, newest on top, animated in. Each card: author avatar/initials, time, source icon (🎙️ voice / 💬 text / 📋 stand-up), transcript, ▶ audio play, and **chips for what was extracted** (e.g. `BRK-4 · lockout · critical`). Chit-chat that was ignored is shown greyed ("ignored: coffee machine, badge reader") to prove we read everything.
- **Right column (60%): Ledger board**: three lanes Critical / Warning / Info. Item card: equipment name (big), one-line state, age, `open N shifts`, STALE badge, vendor/tag-holder, ❓ if a clarification is pending. Click → **Item drawer** (event timeline with quotes + audio, contingency, linked memos).
- Footer: "Log memo" text box (fallback ingest) + **Start handoff** button (lead only).

## 2. `/handoff/outgoing` Outgoing check
- Title: "Before you leave: 3 questions". List of clarifications: to whom, question, status (sent via iMessage ⏳ / answered ✅ with answer text). Web "answer here" fallback per question.
- Gate panel on the right: checklist of blockers. **Send to day shift →** button enabled when the gate passes.

## 3. `/handoff/briefing` I-PASS briefing (the main screen)
- Top: huge status bar with headline (from `/handoff/briefing`).
- Four stacked sections with I-PASS letters as large side labels:
  **I** Severity reasons · **P** Item one-liners (critical first) · **A** Action list · **S** Contingencies ("IF … → THEN …", with a "suggested" tag for runbook-sourced items).
- Each P item: one-liner, source quote (italic, with ▶), age/shift count, STALE badge, **Acknowledge** button (big, right-aligned). Acked → green check, who and when.
- "Resolved this shift" collapsed at the bottom.
- Persistent right rail: **Completeness meter** (radial %) + gate blockers + **Start read-back** button.

## 4. `/handoff/readback` Read-back
- Big mic button ("Hold to record", MediaRecorder → `POST /handoff/readback` multipart) **or** "Waiting for Jordan's iMessage voice note…" (the backend treats the incoming lead's voice note during `briefing` as the read-back).
- Results list, one row per item: ✓ covered (green, with evidence quote) · ⚠ misstated (amber, issue text) · ✗ missed (red, pulsing, **Acknowledge** button).
- When the gate passes: **Complete handoff** → confetti-free success screen: score, who acknowledged what, ownership transferred to Jordan.

## 5. Ask drawer (global, `/` key or button)
- Chat-style input; answers show citation chips (memo id + quote, click → item/memo). Suggested questions: "Did the vendors finish the electrical work?", "What's bypassed right now?", "Anything I shouldn't touch in Hall B?"

## 6. Demo Control panel (press `D`, hidden)
- Scenario steps with ▶ buttons (`POST /demo/step/{n}`), clock display + "advance 30 min", **Reset**, provider toggle indicator (Claude/Nemotron).

## Implementation notes
- TanStack Query, `refetchInterval: 2000` on `/status`, `/items`, `/memos`, `/handoff/current`.
- New critical item or HALT → toast + short sound (muted by default; toggle in header).
- Build every screen against `src/api/fixtures/*.json` first (copy shapes from `docs/API.md`).
- Keyboard: `A` acknowledge focused item, `J/K` move focus. Nice-to-have only.
