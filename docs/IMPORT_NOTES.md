# What is and is not in the repo

The live spec is `CLAUDE.md` and `docs/PRODUCT.md`. They describe the same product: an outgoing interview and an incoming understanding check. The earlier ledger draft (I-PASS lanes, tap acknowledgments, a conflict engine) is not a second build target. It remains in git history on the merged setup commit `73709cd` if you need the old wording.

## Not built

These names appear in the guide and are implementation tasks. They are not empty files pretending to run:

- `config/slots.yaml`, `config/rules.yaml`, `config/assets.yaml`, `config/runbooks.yaml`, `config/roster.yaml`
- `demo/scenario.json`
- `eval/scenarios/`
- `.env.example` and any real secrets
- `backend/`, `frontend/`, `photon-bridge/`

Commands in `CLAUDE.md` such as `uvicorn` and `pytest` fail until that code exists. `docs/EVALUATION.md` is a plan with no measured numbers.

## Limits that stay in force

- Do not put a model slug in the spec. The provider switch is `claude` or `nemotron`. The id comes from the environment when someone builds.
- Do not state that Photon or Nvidia eligibility is confirmed.
- The submitted demo is at most 2 minutes. `docs/DEMO_SCRIPT.md` keeps a longer rehearsal in a separate section.
- Signoff, grades, and metrics do not authorize physical work and do not prove understanding.
- Shared API, data-model, and prompt-schema changes need all four people. This alignment was authorized as a proposed spec by Ethan. It is not their approval.
