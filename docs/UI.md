# UI

Audience: the two shift leads. The pitch is the conversation, not a dashboard. Ethan owns `frontend/`. Build screens against `docs/API.md`. The app is not created yet. Poll `GET /handoff/current` every 1.5 seconds.

Color is never the only signal. `unknown` and UNASSIGNED use a text label, not a red "facility unsafe" banner. Do not display a site-wide safe or unsafe certification.

## 1. `/handoff/out` Outgoing note

One voice or text capture for the end-of-shift note. After ingest, show a single question card: the question text, who it is for, and an answer box. Show `questions_asked` of `budget` (for example "1 of 3"). No list of extra questions.

## 2. `/handoff/record` Confirmed handoff

Shown when status is `confirmed`. Three groups, in this order:

- Confirmed facts, each with its quote.
- Reported facts, each marked hedged.
- Unknowns. UNASSIGNED unknowns name the missing owner and due time and offer two fields a person must fill. Assigned unknowns show the person and the time they entered.

A primary button "Ask the incoming lead" calls `POST /check/start`. It stays disabled while any unknown is UNASSIGNED. The disabled state says the record cannot be signed off inside the app. It does not say the building is unsafe.

## 3. `/handoff/in` Incoming check

One open-ended question. The incoming lead answers in text or by voice. When status is `correcting`, show the correction under the answer, then the follow-up question. Do not offer a single "I acknowledge" button as a substitute.

## 4. `/handoff/signed` Signed record

Status `signed`. List facts, grades, corrections, and quotes. Footer line, always visible: "This record checks what was said against Shift A's confirmed note. It does not show that someone understood, and it does not clear equipment."

## 5. `/` Support strip

Shift name, simulated clock, and whether app signoff is blocked. Link to the active handoff screen. This strip is not the demo. Do not build a lane board, a floor plan, or a 3D view for P0.

## Demo control

A hidden panel for the people running the demo may call `POST /demo/clock` and, once a seed script exists, reset. Do not put that panel in the submitted video.
