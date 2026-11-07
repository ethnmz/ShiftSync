# ShiftSync project brief

Working name: **ShiftSync**. Branding is not final. Team repo: https://github.com/ethnmz/hackutd2026. HackUTD 2026. Earlier RoomBand music and PNC finance ideas are abandoned and are not part of this repo.

## What it is

A prototype of shift handoff for a fictional NorthMark Compute & Cloud data center. People leave source-backed notes about equipment. The next person can see what is still unresolved before anyone clears work.

Inputs are synthetic only:

- voice transcripts
- vendor emails
- maintenance records

Those inputs become equipment events. Each event points at the source excerpt it came from. The prototype then checks planned tasks against configured equipment dependencies, including conflicting unresolved conditions and unresolved conditions that a source dropped. A person reviews the result and clears it. An agent or model never authorizes physical work.

## What Ethan is building

Ethan Meza (`ethnmz`) owns an interactive 3D view of the fictional facility:

- racks, cooling, and backup power
- select one piece of equipment or one planned task
- highlight the equipment that selection affects
- reset the demo

The view is a read-only demonstration. It is not a validated engineering simulation, a control system, or a digital twin of a real site.

## Who decides

- Ethan decides product scope and reassigns work.
- Diego Lozano approves shared-contract and integration changes. His GitHub login is not known yet (`GITHUB_LOGIN_DIEGO`).
- Aditri Tangeti owns the event/state store, the dependency checks, and tests for those checks (`GITHUB_LOGIN_ADITRI`).
- Akshi Biswal owns transcription, extraction, and explanations that stay tied to source excerpts (`GITHUB_LOGIN_AKSHI`).

## In bounds for the first build

- Ingest the three synthetic source types into the proposed event shape in `contracts/PROPOSAL.md`.
- Keep every event tied to at least one source excerpt.
- Flag conflicting unresolved conditions, omitted unresolved conditions, and planned tasks whose configured dependencies are not satisfied.
- Leave clearance to a human.
- Demo the 3D view against fictional equipment ids.

## Not required

Whole-shift scheduling and other extra brainstorm features are not confirmed. Do not turn them into required tasks. Nemotron, Spacetime, and Photon were mentioned as optional technologies and are not chosen. Do not install their APIs or write the plan as if one of them is required. No web framework, database, or deploy target is chosen either.
