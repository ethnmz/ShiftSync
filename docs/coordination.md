# Coordination and local setup

Repo: https://github.com/ethnmz/hackutd2026. Board issue: https://github.com/ethnmz/hackutd2026/issues/1.

This file is the checklist the template does not finish for you. Cloning, or opening this pull request, does not make anyone's agent operational.

## What setup already did

- Created the Message Board as issue #1, so `tools/board` can use its default `BOARD_ISSUE=1`.
- Left `tools/board`, `.claude/settings.json`, and both hook scripts unchanged.
- Copied the final ten-file upload into `CLAUDE.md` and `docs/`. `docs/EVALUATION.md` was named and not included. Those files are on this branch until the pull request is merged. `main` does not have them yet.

## What setup could not do

The GitHub integration used for setup cannot act as a repo admin.

| Step | Result | Command for Ethan, after `gh auth login` as ethnmz |
|---|---|---|
| Create issue #1 | Created: https://github.com/ethnmz/hackutd2026/issues/1 | Already done. Do not open a second board. |
| Create label `board` | HTTP 403, `Resource not accessible by integration`, on `POST /repos/ethnmz/hackutd2026/labels` | `gh label create board --repo ethnmz/hackutd2026 --description "Pinned agent message board" --color 1D76DB` then `gh issue edit 1 --repo ethnmz/hackutd2026 --add-label board` |
| Pin issue #1 | HTTP 403 from GraphQL `pinIssue`. `gh issue pin` has no separate success path. Pinned list was empty after the attempt. | `gh issue pin 1 --repo ethnmz/hackutd2026` |

Confirm the pin with the issue sidebar, or:

```bash
gh api graphql -f query='query { repository(owner:"ethnmz", name:"hackutd2026") { pinnedIssues(first:5) { nodes { issue { number title } } } } }'
```

If that pin command is unavailable on an older `gh`, open https://github.com/ethnmz/hackutd2026/issues/1 and use **Pin issue**. The script does not check whether the issue is pinned.

## Every teammate, on their own machine

1. Merge is Ethan's call. Until then, check out `cursor/shiftsync-team-setup-7a71` rather than expecting these files on `main`.
2. `gh auth login` with that person's own GitHub account.
3. `tools/board whoami` from the repo root. It must print that person's login.
4. The logins in `AGENTS.md` are the ones supplied for this setup: `ethnmz`, `Navibytes`, `biswalakshi`, `aditrit06`. `tools/board whoami` should print the login of the account that ran `gh auth login`.
5. Claude Code users open this project in Claude Code. Codex and other agents run the manual commands below.

`tools/board whoami` was not verified here. This environment's GitHub integration returns HTTP 403 for `gh api user`, which is how the script looks up the login. That failure does not configure a laptop.

## How the hooks actually behave

Claude Code hooks are the committed project files `.claude/settings.json`, `.claude/hooks/board-session-start.sh`, and `.claude/hooks/board-prompt.sh`.

- `SessionStart` runs the session hook on `startup`, `resume`, and `clear` (timeout 20 seconds). It prints unread posts, or a one-line unreachable message, then tells Claude to start one background `tools/board wait` unless `BOARD_WAIT=off`.
- `UserPromptSubmit` runs the prompt hook on every prompt (timeout 10 seconds). It prints unread posts and stays silent when there are none.
- Both hooks exit 0. A dead board does not fail the Claude session.
- They work only when Claude Code is running in this project, `gh` is on `PATH`, and `gh auth login` has succeeded. They call `tools/board unread`.
- `BOARD_WAIT=off` only changes the session hook's instruction. It does not remove the hooks. Do not delete or disable the hook entries.
- Nothing in this template installs hooks into the user account. Do not copy them into `~/.claude` as a substitute, and do not start `tools/board wait` as a standing process during setup.

Codex is not wired up. The template has no `.codex` directory, no Codex hook, and no extra Codex rules file. `CLAUDE.md` is one line, `@AGENTS.md`, and only Claude Code uses it that way. Codex sees `AGENTS.md` only if the Codex product reads that file on its own. It sees board posts only when a person or agent runs `tools/board unread` or `tools/board wait`. A wake loop, in a terminal the person chooses, is:

```bash
while tools/board wait; do <your agent command>; done
```

Do not start that loop as part of repository setup.

## Same-account posts

`unread` and `wait` keep comments whose author login differs from the login running the command. They still advance the local cursor past comments they hide. Two agents on one `gh` login therefore miss each other's posts and will not be woken by them. The rate-limit note in the template (`--interval 60` when many agents share an account) does not fix that filter. Use one login per person. `BOARD_LOGIN` skips the real lookup for a test. It is not a second identity.

Local read state is under `.board/`, which `.gitignore` already ignores. That includes the cached login and the comment cursor. Do not commit it. If a checkout was copied from someone else, delete `.board/login` and run `tools/board whoami` again.

## Branches and worktrees

Agents do not share one working tree. From a fresh `main` after this setup is merged:

```bash
git fetch origin
git worktree add ../hackutd-work -b <issue#>-<slug> origin/main
```

Use a different worktree to review a pull request or run tests. Do not point that review checkout at the branch an agent is editing. The normal branch name is `<issue#>-<slug>`. Never force-push.

## Ownership

Ask on issue #1 before editing a path you do not own, and wait for the owner or Ethan. Shared interface changes need all four people to agree on the board. Ethan still decides reassignment. The map is the table in `AGENTS.md`. `docs/IMPORT_NOTES.md` is the crosswalk from the team-plan filenames to that table.
