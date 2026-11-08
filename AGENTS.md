# Team rules for every agent

## 1. The board (pinned GitHub issue)

Every agent reads and posts on the "Message Board" issue via `tools/board` (needs only `gh`, logged in). Set `BOARD_ISSUE` if it is not issue #1.

The board for this repo is https://github.com/ethnmz/hackutd2026/issues/1. It is issue #1, so do not set `BOARD_ISSUE` unless that number changes. It was created during setup and is not pinned yet. Pinning does not change the script. The pin command is in `docs/coordination.md`.

- Start every post with `[<human>'s <agent>]`, e.g. `[Sam's Codex]`. Keep it short: what changed, which files or contracts, what you need, from whom.
- Mention by GitHub login. This team:
  - `@ethnmz` (Ethan Meza) — frontend, screens, and demo. This login is the verified owner of `ethnmz/hackutd2026`.
  - `GITHUB_LOGIN_DIEGO` (Diego Lozano) — Photon messaging and voice input. No GitHub login is recorded in this repo. This placeholder is a label, not an account. Do not invent a login and do not mention a guess.
  - `GITHUB_LOGIN_AKSHI` (Akshi Biswal) — AI extraction, prompts, and checks. Same placeholder rule.
  - `GITHUB_LOGIN_ADITRI` (Aditri Tangeti) — database, equipment rules, and handoff logic. Same placeholder rule.
  - `@all` (everyone) — use this only after those three placeholders are replaced with real logins.
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
Shared interface changes need agreement from all four people on the board before anyone builds them. That replaces the earlier rule that Diego alone approved contracts.
The model extracts. Application code decides severity, closure, and gates. Warnings and gates do not authorize physical work and do not certify a safe state.

## 3. Workflow

1. Pick or file an issue. Comment on it or post on the board when you take it.
2. Branch `<issue#>-<slug>` from fresh `main`.
3. Small commits. Stage only your own files (no `git add -A`).
4. Open a PR with `Closes #N`. The author merges their own PR once it works locally.
5. Always `git fetch` and rebase before pushing. Never force-push shared branches.
6. If a merge changes something other teammates depend on (a shared interface, a schema, or an env var), post on the board when it lands. All four agree on the board before a shared interface changes.
7. Each local agent uses its own git worktree and branch. Review and tests use a separate worktree from the checkout being edited.

## 4. Who owns what

Project name: **Handoff Ledger**. The short description and the limit of what was imported are in `docs/project-brief.md`. Roles below are confirmed. File paths are the ownership map from that abridged handoff. This setup does not create the application tree. `docs/TEAM_PLAN.md` is a summary, not the original team-plan document.

Paths do not overlap. `backend/app/pipeline/` and `backend/app/handoff/` are shared directories: own only the files listed on your row. Ask on the board before changing a path you do not own.

An earlier 3D facility view is pending a separate scope decision. It is not a required task, and this update does not cancel it.

| Area | Owner (GitHub login) | Folders |
|---|---|---|
| Frontend, screens, demo | `@ethnmz` (Ethan Meza) | `frontend/`, `docs/DEMO_SCRIPT.md` |
| Photon messaging, voice input | `GITHUB_LOGIN_DIEGO` (Diego Lozano) | `photon-bridge/`, `backend/app/stt/`, `backend/app/routes/ingest.py`, `backend/app/notify.py` |
| AI extraction, prompts, checks | `GITHUB_LOGIN_AKSHI` (Akshi Biswal) | `backend/app/llm/`, `backend/app/prompts/`, `backend/app/pipeline/extract.py`, `backend/app/handoff/clarify.py`, `backend/app/handoff/readback.py`, `backend/app/ask.py`, `backend/tests/test_scenario.py` |
| Database, equipment rules, handoff logic | `GITHUB_LOGIN_ADITRI` (Aditri Tangeti) | `backend/app/models.py`, `backend/app/pipeline/reconcile.py`, `backend/app/pipeline/rules.py`, `backend/app/pipeline/conflicts.py`, `backend/app/pipeline/stale.py`, `backend/app/handoff/state.py`, `backend/app/handoff/score.py`, `backend/app/handoff/briefing.py`, `backend/app/demo/` |
| Team rules and board | `@ethnmz` (Ethan Meza) | `docs/project-brief.md`, `docs/coordination.md`, `docs/TEAM_PLAN.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.github/`, `tools/` |
