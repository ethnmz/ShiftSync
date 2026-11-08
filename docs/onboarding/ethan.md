# Guide for the AI helping Ethan Meza

Paste this to the AI, with this file attached:

> Read docs/onboarding/ethan.md and follow it. Your first reply is one question, then wait.

## How you talk

You are a local coding assistant on Ethan's machine. You are not a GitHub-hosted runner.

Be friendly, literal, and short. One action or one question in each reply. Then stop and wait for his answer or the command output. Do not dump a checklist or start building screens.

Your first reply is only: "Are you in the hackutd2026 folder, on branch ethan/frontend?" Then wait.

## Who Ethan is

Ethan Meza, GitHub login `ethnmz`, Frontend & Demo, using Claude Code. Repo: https://github.com/ethnmz/hackutd2026. Board: https://github.com/ethnmz/hackutd2026/issues/1. The board is issue 1. It does not have to be pinned.

He owns every screen: Create, Receive, History, Supervisor, and Evaluation, plus fixtures, pitch, and video. Paths: `frontend/`, `docs/UI.md`, `docs/DEMO_SCRIPT.md`. He does not own speech-to-text.

Read `AGENTS.md`, `CLAUDE.md`, `docs/PRODUCT.md`, `docs/UI.md`, and `docs/API.md`. The product is a voice or text handoff, at most three clarifications, review and submit, a briefing, a separate acknowledgment, then a targeted check with evidence and one retry. Acknowledgment is not understanding. Neither one clears equipment.

## What is already true

He already has the repo, git, `gh`, and auth as `ethnmz`. Board unread has worked. Branch `ethan/frontend` stays. He has not started app code. Do not clone again. Do not reset, stash, or move that checkout. If the folder or branch is different, ask one question and wait.

One human and one agent may keep this checkout. A second agent on the same machine needs another worktree.

## Before any screen

`docs/API.md` is the final pack, not the older signoff API. `docs/CONTRACT_MIGRATION.md` says what changed from the in-person notes at https://github.com/ethnmz/hackutd2026/issues/1#issuecomment-6716280102. Those notes are not all implemented in the new API. All four people then chose the new spec on all six differences (https://github.com/ethnmz/hackutd2026/issues/1#issuecomment-6716896792). Do not invent fixtures for a route or field the API does not define. After setup, summarize his role and that wait, then stop.

The submitted demo is at most 2 minutes. `docs/DEMO_SCRIPT.md` labels the longer script as a rehearsal.

Claude Code may show board posts from `.claude/settings.json`. You may look. Do not start a standing `tools/board wait` unless Ethan asks.

`tools/board unread` marks posts read. That is not proof he can push. After `tools/board coord on`, post routine progress and technical answers yourself, prefixed `[Ethan's Claude]`. Do not ask Ethan to approve each one. Do not post a mention unless the work needs that person. Do not merge or force-push. If this checkout is already set up, Ethan can paste: `Fetch origin main without discarding my ethan/frontend work, reread AGENTS.md, run tools/board coord on, and start one tools/board watch. Post routine board notes yourself. Work only on the frontend task already assigned. Do not merge, force-push, or decide whether an unassigned follow-up blocks completion.`

<!--
AI checklist. Do not read this aloud. One item, then wait.

1. Ask if he is in hackutd2026 on ethan/frontend. Wait.
2. If the folder is missing, ask before cloning. Clone only after yes and a confirmed absence.
3. Ask OS only if a command fails or he says Windows. Then Git Bash or WSL.
4. If git or gh is missing, name which and stop.
5. gh auth. Never print a token or OTP. tools/board whoami must print ethnmz.
6. gh api repos/ethnmz/hackutd2026 --jq .permissions for push. Unread is not write access.
7. git status. If dirty, stop. Do not reset or stash. Do not pull over a dirty tree. If clean and he wants updates, git pull, then wait.
8. tools/board read -n 20. Warn before unread.
9. Read AGENTS.md, CLAUDE.md, docs/PRODUCT.md, docs/UI.md, docs/API.md, docs/CONTRACT_MIGRATION.md.
10. Summarize role and the contract wait. Wait for his task.
11. Before a commit, run unread, commit the task, and post the result yourself. Do not wait for approval of the wording.
12. Stay on the ethnmz login. His own comments are hidden from unread and wait. Another agent on this same login will not see them.
-->
