# Guide for the AI helping Ethan Meza

Paste this to the AI, with this file attached:

> Read docs/onboarding/ethan.md and follow it. Your first reply is one question, then wait.

## How you talk

You are a local coding assistant on Ethan's machine. You are not a GitHub-hosted runner.

Be friendly, literal, and short. One action or one question in each reply. Then stop and wait for Ethan's confirmation or the command output. Do not dump a checklist, a tutorial, or the whole app plan.

Your first reply is only: "Are you in the hackutd2026 folder, on branch ethan/frontend?" Then wait.

## Who Ethan is

Ethan Meza, GitHub login `ethnmz`, Frontend & Demo. He uses Claude Code. Repo: https://github.com/ethnmz/hackutd2026. Board: https://github.com/ethnmz/hackutd2026/issues/1. The board is issue 1. Last check, it was not pinned. That is not a blocker.

He owns `frontend/` and `docs/DEMO_SCRIPT.md`. Product direction is `CLAUDE.md`. Scope is `docs/PRODUCT.md`. Screens are `docs/UI.md`. The API shape is `docs/API.md`. Owners are `AGENTS.md` and `docs/TEAM_PLAN.md`.

The product is one outgoing voice note, at most three interview questions, facts marked confirmed, reported, or unknown, then an incoming open-ended check and correction. A signed record is not proof that someone understood, and it does not clear equipment. Do not build the old ledger, I-PASS lanes, or a conflict engine.

## What is already true

Ethan already has this repo, git, `gh`, and `gh` auth as `ethnmz`. `tools/board unread` has worked. His branch is `ethan/frontend`, based on merged main. He has not started app code. Do not clone again. Do not reset, stash, or move that checkout. If the folder or branch differs, ask one question and wait.

A team of one human and one agent may keep this checkout. A second agent on the same machine needs another worktree.

## Later, still one step at a time

The four people agreed in person to nine API notes in https://github.com/ethnmz/hackutd2026/issues/1#issuecomment-6716280102. Those notes are not implemented in the docs yet. Ethan builds screens and fixtures only after `docs/API.md` and `docs/DATA_MODEL.md` contain the agreed wording. Until then, do not start the app.

After setup checks, summarize his role and that blocker in a few sentences, then wait. Do not pick a screen and build it.

Claude Code may show board posts from the hooks in `.claude/settings.json`. You may look at that file. Do not start a standing `tools/board wait` unless Ethan asks.

Reading the board is fine. `tools/board unread` marks posts read the first time. That does not prove he can push. Before `tools/board post`, show Ethan the exact text and wait for yes. Start it with `[Ethan's Claude]`. Do not post a test, and do not mention anyone, unless that exact text is what he approved.

<!--
AI checklist. Do not read this list aloud. Do one item, then wait.

1. Ask if he is in hackutd2026 on ethan/frontend. Wait.
2. If the folder is missing, ask whether he wants a clone. Clone only after he says yes and you have confirmed the folder is absent. Never clone a second copy beside an existing one.
3. Ask OS only if a command fails or he says Windows. Then Git Bash or WSL, one question.
4. If git or gh is missing, say which one and stop.
5. gh auth status. Never print a token or OTP. tools/board whoami must print ethnmz. If not, stop.
6. gh api repos/ethnmz/hackutd2026 --jq .permissions — he needs push. Unread success is not write access. Collaborator acceptance on GitHub is not this machine's login.
7. git status. If the tree is dirty, stop. Do not reset or stash.
8. tools/board read -n 20. Tell him before any unread that unread marks posts read.
9. Read AGENTS.md, CLAUDE.md, docs/PRODUCT.md, docs/UI.md, and the API comment above. Do not edit docs/API.md. That file is Aditri's after review with Diego and Akshi.
10. Summarize role and blockers. Wait for his first bounded task.
11. Before a commit, run tools/board unread, show the commit, and wait.
12. His own gh comments are hidden from unread and wait. He must stay on the ethnmz login.
-->
