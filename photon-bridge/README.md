# Photon bridge (optional P1)

An operator texts or sends a voice note to the ShiftSync iMessage line. It becomes a statement on their open handoff and goes through the same extraction, certainty floors and clarification as the web app. The next clarifying question comes back as a bubble. Review, submit and Shift B stay in the web app. Spec: `docs/PHOTON_BRIDGE.md`.

## Run

```bash
cd backend && uvicorn app.main:app --port 8000     # the backend must be up
cd photon-bridge && npm install
npm start          # terminal chat (no account needed), speaking as Maya
npm test           # handler tests with fake Spectrum objects
npm run check      # type check
```

Runs on Node ≥ 20.12 through `tsx`. Bun is not needed.

## iMessage

1. Create a project at https://app.photon.codes. Copy `.env.example` to `.env` and fill in `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET`.
2. The roster's phone numbers are fictional. In `.env`, map each teammate's real number (or Apple ID) to a roster phone with `SENDER_MAP`. Never commit real numbers.
3. Each teammate texts the line once before the demo.

## What happens to a message

The bridge only moves bytes. The backend (`POST /api/inbound/imessage`, `backend/app/routes/inbound.py`) decides everything else.

| Message | Result |
|---|---|
| First text or voice note | Starts a handoff to the next shift's lead from `config/roster.yaml`. The reply names them. |
| Text or voice note | Stored verbatim (`imessage_text` / `imessage_voice`, audio kept). The reply lists what was added, with uncertainty marked: `UPS-B (⚠ unverified: "mostly")`. |
| Message while a question is pending | Counts as the answer. "don't know", "idk" or "not sure" on its own records Unknown. |
| No more questions | A link to review and submit in the web app (`FRONTEND_URL` on the backend, default `http://localhost:5173`). |
| Handoff submitted less than a shift ago | Refused, with a note to tell the incoming lead directly. Nothing new is started. |
| Number not on the roster | Refused. Nothing is stored. |
| Voice note that can't be transcribed | Audio kept, and the reply asks for a text instead. |

Differences from the reference code in the spec: Node and `tsx` instead of Bun. There is also no `/send` endpoint for proactive messages yet, because nothing calls it. Questions go out as follow-up bubbles in the reply.
