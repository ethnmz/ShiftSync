# Coordination and local setup

Repo: https://github.com/ethnmz/hackutd2026. Board issue: https://github.com/ethnmz/hackutd2026/issues/1.

This file is the local checklist. Cloning does not log `gh` in or start an agent.

## What is already on main

- The board is issue #1, so `BOARD_ISSUE` stays unset. https://github.com/ethnmz/hackutd2026/issues/1
- `tools/board` reads and posts there. `tools/board coord on` lets that checkout post routine notes without a human approving each one.
- Claude Code hooks are `.claude/settings.json` and the two scripts in `.claude/hooks/`. They run only while Claude Code is open in this project.

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

1. Use current `main`. Do not check out an old setup branch.
2. `gh auth login` as yourself. `tools/board whoami` must print your login: `ethnmz`, `Navibytes`, `biswalakshi`, or `aditrit06`.
3. `tools/board coord on` once in that checkout when you want routine AI-to-AI posts. This does not grant your login to anyone else.
4. Claude Code keeps one `tools/board watch` after that. Codex CLI, if `codex exec --help` matches, can run `tools/codex-wake --once`. The Codex app only gets the pasted activation. Other tools run `tools/board unread` themselves.

A cloud agent session is not a laptop agent. `gh api user` failing in a cloud session does not configure a laptop.

## How the hooks actually behave

Claude Code hooks are the committed project files `.claude/settings.json`, `.claude/hooks/board-session-start.sh`, and `.claude/hooks/board-prompt.sh`.

- `SessionStart` runs on `startup`, `resume`, and `clear` (timeout 20 seconds). It prints unread posts. If `tools/board coord` is on and `BOARD_WAIT` is not `off`, it tells Claude to start one `tools/board watch`.
- `UserPromptSubmit` runs on every prompt (timeout 10 seconds). It stays silent while a watch process is alive, so it does not race the watcher. Otherwise it prints unread posts.
- Both hooks exit 0. A dead board does not fail the Claude session.
- They run only inside an open Claude Code session in this project, with `gh` logged in. Closing the app or sleeping the computer stops them. They do not start Codex.
- `BOARD_WAIT=off` tells the session hook not to arm a watch. It does not delete the hooks.
- `tools/codex-wake` is optional and unverified until the local `codex exec --help` advertises `--sandbox` and `workspace-write`. There is no Codex hook in this repo.

## Same-account posts

`unread` and `wait` keep comments whose author login differs from the login running the command. They still advance the local cursor past comments they hide. Two agents on one `gh` login therefore miss each other's posts and will not be woken by them. The rate-limit note in the template (`--interval 60` when many agents share an account) does not fix that filter. Use one login per person. `BOARD_LOGIN` skips the real lookup for a test. It is not a second identity.

Local read state is under `.board/`, which `.gitignore` already ignores. That includes the cached login and the comment cursor. Do not commit it. If a checkout was copied from someone else, delete `.board/login` and run `tools/board whoami` again.

## Branches and worktrees

One person and one agent may keep working in the checkout they already have. Ethan's local `ethan/frontend` checkout is that case. Do not delete it or move it just to match a sample command.

When a second agent will edit on the same machine, give it another worktree:

```bash
git fetch origin
git worktree add ../hackutd-other -b <login>-<slug> origin/main
```

Use `<issue#>-<slug>` when the work already has an issue. Review of a branch you are not editing belongs in a separate worktree. Never force-push.

## Ownership

Do not edit a path you do not own. A shared-contract change is one board note to the owners it affects, then one editor. Ethan still decides reassignment, merges, and the open follow-up gate question. The map is `AGENTS.md`. Ethan's existing `ethan/frontend` checkout stays valid.
