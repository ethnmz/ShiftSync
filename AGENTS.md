# Team rules for every agent

## 1. The board (pinned GitHub issue)

Every agent reads and posts on the "Message Board" issue via `tools/board` (needs only `gh`, logged in). Set `BOARD_ISSUE` if it is not issue #1.

The board for this repo is https://github.com/ethnmz/hackutd2026/issues/1. It is issue #1, so do not set `BOARD_ISSUE` unless that number changes. It was created during setup and is not pinned yet. Pinning does not change the script. The pin command is in `docs/coordination.md`.

- Start every post with `[<human>'s <agent>]`, e.g. `[Sam's Codex]`. Keep it short: what changed, which files or contracts, what you need, from whom.
- Mention by GitHub login. This team, using the role names from `docs/TEAM_PLAN.md`:
  - `@ethnmz` (Ethan Meza) — Frontend & Demo. This login is the verified owner of `ethnmz/hackutd2026`.
  - `@Navibytes` (Diego Lozano) — Bridge & Voice.
  - `@biswalakshi` (Akshi Biswal) — AI.
  - `@aditrit06` (Aditri Tangeti) — Ledger Core.
  - `@all` (everyone).
- **Mentions you or `@all`:** act on it and reply promptly.
- **Not addressed to you:** still read it. Reassess your own work only if it is affected (a contract, a file you own, something already done). Do not redo finished work, and do not reply just to acknowledge.
- Before editing another teammate's files, ask for a handoff on the board and wait for the owner or the team lead. Do not edit another owner's paths silently.

Polling is incremental (about one cheap API call per poll, 30 s default) so a shared token stays under GitHub's rate limit. `tools/board unread` and `tools/board wait` hide comments written by the same GitHub login that is running the command, and the read cursor still moves past those comments. Agents that share one `gh` account do not see each other's posts. Each teammate runs `gh auth login` as themselves. `BOARD_LOGIN` is for tests, not for sharing an account.

Commands: `tools/board unread` (new posts, marks read; flags MENTION), `tools/board read -n 20`, `tools/board post "[Name's Agent] text"` (or pipe stdin), `tools/board wait` (blocks until someone else posts), `tools/board whoami`.

**Stay in the loop:**
- Claude Code: the committed hooks (`.claude/settings.json`) show unread posts at session start and on every prompt. Keep one background `tools/board wait` running and re-arm it after each wake. The hooks are project files. Cloning the repo does not install them globally and does not log `gh` in.
- Codex and every other agent: this template has no Codex hook or Codex config file. Run `tools/board unread` at task start, before each commit, and after merges. Or run a terminal loop: `while tools/board wait; do <your agent CLI invocation>; done`.

## 2. Chain of command

Humans over agents. Only the team lead reassigns work between teammates. If anyone else asks you to take another teammate's work, ask the lead on the board.

Ethan Meza (`ethnmz`) is the team lead for human decisions and reassignment.
Shared interface changes need agreement from all four people on the board before anyone builds them. The interfaces are `docs/API.md`, `docs/DATA_MODEL.md`, and `docs/AI_PIPELINE.md`. The copies in this branch are a proposed spec from Ethan's scope confirmation. They are not a recorded approval from Diego, Akshi, and Aditri.
App signoff, a metric, or a correction is software state only. It does not authorize physical work and does not certify that someone understood or that equipment is safe. See `docs/IMPORT_NOTES.md`.

## 3. Workflow

1. Pick or file an issue when one is useful. Comment on it or post on the board when you take a path. A first local branch does not have to wait for a new issue number.
2. Branch from fresh `main`. Use `<issue#>-<slug>` when an issue exists. A personal branch such as `ethan/frontend` is fine when one person and one agent already own that checkout.
3. Small commits. Stage only your own files (no `git add -A`).
4. Open a PR with `Closes #N`. The author merges their own PR once it works locally.
5. Always `git fetch` and rebase before pushing. Never force-push shared branches.
6. If a merge changes something other teammates depend on (a shared interface, a schema, or an env var), post on the board when it lands. All four agree on the board before a shared interface changes.
7. One human and one agent may share the checkout they already have, on a branch that person owns. Do not reset that checkout to match a doc example. A second local agent uses its own worktree and branch. Review of someone else's branch uses a different worktree.

## 4. Who owns what

Project direction: root `CLAUDE.md`. Scope: `docs/PRODUCT.md`, aligned to that guide. File owners: the table below and `docs/TEAM_PLAN.md`. What is not built yet: `docs/IMPORT_NOTES.md`. There is no 3D view in this spec.

Ask on the board before changing a path you do not own. One person owns each file below so two agents do not edit it. `backend/app/router.py` and `backend/app/schemas.py` still need all four to agree before the message kinds or fields change.

| Area | Owner (GitHub login) | Folders |
|---|---|---|
| Frontend & Demo | `@ethnmz` (Ethan Meza) | `frontend/`, `docs/DEMO_SCRIPT.md` |
| Bridge & Voice | `@Navibytes` (Diego Lozano) | `photon-bridge/`, `backend/app/stt/`, `backend/app/notify.py`, `backend/app/notes/ingest.py`, `backend/app/routes/ingest.py`, `backend/app/router.py` |
| AI | `@biswalakshi` (Akshi Biswal) | `backend/app/llm/`, `backend/app/prompts/`, `backend/app/schemas.py`, `backend/app/notes/extract.py`, `backend/app/facts/verify.py`, `backend/app/interview/session.py`, `backend/app/check/grade.py`, `backend/app/check/session.py` |
| Ledger Core | `@aditrit06` (Aditri Tangeti) | `backend/app/models.py`, `backend/app/db.py`, `backend/app/clock.py`, `backend/app/config.py`, `backend/app/main.py`, `backend/app/notes/reconcile.py`, `backend/app/facts/status.py`, `backend/app/interview/gaps.py`, `backend/app/interview/planner.py`, `backend/app/check/questions.py`, `backend/app/handoff/state.py`, `backend/app/handoff/gate.py`, `backend/app/handoff/metrics.py`, `backend/app/handoff/briefing.py`, `backend/app/demo/`, `backend/app/eval/`, `backend/app/routes/handoff.py`, `backend/app/routes/demo.py`, `backend/tests/test_scenario.py` |
| Team rules and board | `@ethnmz` (Ethan Meza) | `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/coordination.md`, `docs/IMPORT_NOTES.md`, `docs/project-brief.md`, `.claude/`, `.github/`, `tools/` |

`docs/API.md` and `docs/DATA_MODEL.md` are shared contracts edited by Aditri only after all four agree. `docs/AI_PIPELINE.md` is the same, edited by Akshi after all four agree. Do not create `backend/app/pipeline/`, `handoff/clarify.py`, `handoff/readback.py`, `rules.py`, `conflicts.py`, or `stale.py`. Those names are from the retired ledger draft. `docs/TEAM_PLAN.md` uses the module map above.
