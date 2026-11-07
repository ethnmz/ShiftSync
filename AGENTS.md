# Team rules for every agent

## 1. The board (pinned GitHub issue)

Every agent reads and posts on the "Message Board" issue via `tools/board` (needs only `gh`, logged in). Set `BOARD_ISSUE` if it is not issue #1.

The board for this repo is https://github.com/ethnmz/hackutd2026/issues/1. It is issue #1, so do not set `BOARD_ISSUE` unless that number changes. It was created during setup and is not pinned yet. Pinning does not change the script. The pin command is in `docs/coordination.md`.

- Start every post with `[<human>'s <agent>]`, e.g. `[Sam's Codex]`. Keep it short: what changed, which files or contracts, what you need, from whom.
- Mention by GitHub login. This team:
  - `@ethnmz` (Ethan Meza) — UI/UX, 3D facility view, workflow, and human decisions. This login is the verified owner of `ethnmz/hackutd2026`.
  - `GITHUB_LOGIN_DIEGO` (Diego Lozano) — integration, deploy, and shared contracts. No GitHub login is recorded in this repo. This placeholder is a label, not an account. Do not invent a login and do not mention a guess.
  - `GITHUB_LOGIN_ADITRI` (Aditri Tangeti) — event/state store, dependency checks, and tests. Same placeholder rule.
  - `GITHUB_LOGIN_AKSHI` (Akshi Biswal) — transcription, extraction, and source-grounded explanations. Same placeholder rule.
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

Ethan Meza (`ethnmz`) is the team lead. Human product decisions and any reassignment go through him.
Diego Lozano approves shared-contract and integration changes before they merge. Until `GITHUB_LOGIN_DIEGO` is replaced, ask for Diego by name on the board.
No agent marks a task cleared. Model output never authorizes physical work. Clearance is a human action.

## 3. Workflow

1. Pick or file an issue. Comment on it or post on the board when you take it.
2. Branch `<issue#>-<slug>` from fresh `main`.
3. Small commits. Stage only your own files (no `git add -A`).
4. Open a PR with `Closes #N`. The author merges their own PR once it works locally.
5. Always `git fetch` and rebase before pushing. Never force-push shared branches.
6. If a merge changes something other teammates depend on (an API, a schema, an env var, or `contracts/PROPOSAL.md`), post on the board when it lands. Contract and integration changes need Diego's approval before that merge.
7. Each local agent uses its own git worktree and branch. Review and tests use a separate worktree from the checkout being edited.

## 4. Who owns what

ShiftSync ownership. Placeholders are not GitHub logins. Paths do not overlap. Ask on the board before changing a path you do not own. Product scope is `docs/project-brief.md`. Local setup is `docs/coordination.md`. `contracts/PROPOSAL.md` stays a proposal until Diego approves it on the board.

| Area | Owner (GitHub login) | Folders |
|---|---|---|
| UI/UX and 3D facility view | `@ethnmz` (Ethan Meza) | `ui/` |
| Integration, deploy, shared contracts | `GITHUB_LOGIN_DIEGO` (Diego Lozano) | `integration/`, `contracts/` |
| Event/state store, dependency checks, tests | `GITHUB_LOGIN_ADITRI` (Aditri Tangeti) | `services/event-store/` |
| Transcription, extraction, explanations | `GITHUB_LOGIN_AKSHI` (Akshi Biswal) | `services/extraction/` |
| Team rules, board, product brief | `@ethnmz` (Ethan Meza) | `docs/`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/`, `.github/`, `tools/` |
