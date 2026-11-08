# Handoff Ledger

Provenance: Ethan approved these roles and this description on Nov 7, 2026. The text is an abridged handoff from an uploaded `CLAUDE.md` and `TEAM_PLAN.md`. It is not the ten-file specification. Those originals are not in this repository, and this file is not a verbatim copy of them.

Repo: https://github.com/ethnmz/hackutd2026. The earlier working name ShiftSync is retired. RoomBand and PNC are not this project.

## What it is

Handoff Ledger is a persistent data-center handoff ledger for a NorthMark track. People leave voice notes. The ledger can ask clarification questions, show an incoming briefing, check a spoken read-back, record critical acknowledgments, and later warn about conflicts.

It is not general monitoring and it is not physical control. Sponsor eligibility for Photon or Nvidia was not verified in the handoff.

The model extracts. Application code decides severity, closure, and gates. An item stays unresolved until a closing observation that cites a source. Every fact quotes a source. A fuzzy quote match does not prove the fact is true. Warnings and gates do not authorize physical work and do not certify a safe state. A read-back check tests that the source was mentioned, not that someone understood it.

Configured equipment dependencies come from configuration. The model does not invent them. Time in the demo uses a simulated clock (`clock.now()`). Demo data stays synthetic. Do not commit secrets or real phone numbers.

## Who owns the work

Confirmed roles. GitHub logins other than `ethnmz` are still unknown.

- Ethan Meza (`ethnmz`) — frontend, screens, and demo.
- Diego Lozano (`GITHUB_LOGIN_DIEGO`) — Photon messaging and voice input.
- Akshi Biswal (`GITHUB_LOGIN_AKSHI`) — AI extraction, prompts, and checks.
- Aditri Tangeti (`GITHUB_LOGIN_ADITRI`) — database, equipment rules, and handoff logic.

Shared interface changes need all four to agree on the Message Board. The file map is in `AGENTS.md`. The abridged plan is `docs/TEAM_PLAN.md`.

## 3D view

An earlier 3D facility view is absent from this handoff. Ethan approved the roles, not a decision to add or remove that view. It stays pending a separate scope decision. It is not required work, and it is not cancelled.

## Not imported

The handoff names these as intent documents: `PRODUCT.md` (source of truth), `ARCHITECTURE`, `DATA_MODEL`, `API`, `AI_PIPELINE`, `PHOTON_BRIDGE`, `UI`, `DEMO_SCRIPT`, and `TEAM_PLAN`, plus config for assets, rules, runbooks, and roster, and `demo/scenario.json`. Naming them is not proof they exist here. This commit does not recreate them.
