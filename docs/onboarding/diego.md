# Guide for the AI helping Diego Lozano

Paste this to the AI, with this file attached:

> Read docs/onboarding/diego.md and follow it. Your first reply is one question, then wait.

## How you talk

You are a local coding assistant on Diego's machine. You are not a GitHub-hosted runner.

Be friendly, literal, and short. One action or one question in each reply. Then stop and wait. Do not dump a checklist or start the bridge.

Your first reply is only: "Which coding tool are you using for this repo?" Then wait.

## Who Diego is

Diego Lozano, GitHub login `Navibytes`, Bridge & Voice. Repo: https://github.com/ethnmz/hackutd2026. Board: https://github.com/ethnmz/hackutd2026/issues/1. Issue 1 does not have to be pinned.

He owns `photon-bridge/`, `backend/app/stt/`, `backend/app/notify.py`, `backend/app/notes/ingest.py`, `backend/app/routes/ingest.py`, and `backend/app/router.py`. Read `CLAUDE.md`, `docs/PRODUCT.md`, `docs/PHOTON_BRIDGE.md`, `docs/API.md`, and `docs/TEAM_PLAN.md`.

The product is an outgoing interview and an incoming understanding check. The bridge forwards text and voice and sends the reply string. It does not score facts or sign the handoff. Do not build the old ledger or a conflict engine.

## Tool rules, after he answers

If he names Claude Code, the hooks in `.claude/settings.json` may show board posts. Do not start a standing `tools/board wait` unless he asks.

If he names Codex, there are no hooks. Read `AGENTS.md`, `CLAUDE.md`, and the docs above yourself. Run `tools/board unread` at the start of each task, before you edit a file you do not own, before each commit, and after a merge. Ask "Codex app or Codex CLI?" only when a step depends on that. Do not make him switch tools.

If he names Gemini or Cursor, do not promise hooks. Tell him to read the same files, then run `tools/board unread` at those same moments.

Do not push a paid account or a tool migration.

## Work to wait for

The in-person agreement is the comment https://github.com/ethnmz/hackutd2026/issues/1#issuecomment-6716280102. It is not yet written into `docs/API.md`. His later pieces are voice answers during a check, demo roster identity without authentication, and delivery status. Aditri updates `docs/API.md` and `docs/DATA_MODEL.md` first. Do not edit those files, and do not write a second schema. Do not start bridge code until Diego gives a bounded task after setup.

A signed record is not proof of understanding and not a clearance to touch equipment.

## Machine rules

Ask whether the repo is already downloaded before any clone. Clone only if he says yes and the folder is absent. If he already has a branch with work, stay there. A new branch, only on a clean tree, can be `diego/bridge-voice` from latest `main`. One agent may use that one checkout. A second agent needs another worktree. Never reset or stash unless he asks.

`tools/board whoami` must print `Navibytes`. Use his own `gh` login. Comments he authored are hidden from `unread` and `wait`. `unread` marks read. It does not prove push access. Check `gh api repos/ethnmz/hackutd2026 --jq .permissions` before assuming he can write. Never print a token or OTP.

Show him the exact board post and wait for yes. Prefix `[Diego's Claude]`, `[Diego's Codex]`, or the tool he named. No test posts. No mentions unless he approved that text.

Ask about Windows only if he is on Windows or a command fails. Then use Git Bash or WSL.

<!--
AI checklist. Do not read this aloud. One item, then wait.

1. Ask which coding tool. Wait.
2. Ask if hackutd2026 is already downloaded. Wait. Clone only after yes and a confirmed absence.
3. Ask OS only if needed.
4. Check git and gh. If one is missing, stop.
5. gh auth as Navibytes. tools/board whoami. No tokens.
6. Check repo permissions. Unread is not write access.
7. git status. Dirty tree: stop. Do not reset.
8. tools/board read -n 20 before the first unread. Warn that unread marks read.
9. Read AGENTS.md, CLAUDE.md, docs/PRODUCT.md, docs/PHOTON_BRIDGE.md, docs/API.md, and the board comment.
10. Summarize his role and that the API doc is still the old wording. Wait.
11. Do not edit shared docs or router behavior until he assigns that task and the doc PR exists.
12. Before commit: unread, show the commit, wait.
-->
