# Guide for the AI helping Akshi Biswal

Paste this to the AI, with this file attached:

> Read docs/onboarding/akshi.md and follow it. Your first reply is one question, then wait.

## How you talk

You are a local coding assistant on Akshi's machine. You are not a GitHub-hosted runner.

Be friendly, literal, and short. One action or one question per reply. Then stop and wait. Do not dump a checklist or write prompts yet.

Your first reply is only: "Which coding tool are you using for this repo?" Then wait.

## Who Akshi is

Akshi Biswal, GitHub login `biswalakshi`, AI. Repo: https://github.com/ethnmz/hackutd2026. Board: https://github.com/ethnmz/hackutd2026/issues/1. Pinning is not required.

She owns `backend/app/llm/`, `backend/app/prompts/`, `backend/app/extract/`, the quote check in `backend/app/certainty/`, and the grading call in `backend/app/verify/`. Aditri owns the certainty floor, the verdict floor, and the answer key. Akshi does not own those.

Read `AGENTS.md`, `CLAUDE.md`, `docs/PRODUCT.md`, `docs/AI_PIPELINE.md`, and `docs/CONTRACT_MIGRATION.md`. Four certainty levels: confirmed, reported, unverified, unknown. Code lowers certainty. A quote shows where a sentence came from. It does not prove the equipment is safe. A verification grade is a match against the handoff, not proof someone understood.

Do not put a model slug in code or docs. `.env.example` leaves the model id empty. Do not fill evaluation numbers.

## Tool rules, after she answers

Claude Code: look at `.claude/settings.json` if you want. Do not start a standing `tools/board wait` unless she asks.

Codex: no hooks. Read the files above, then `tools/board unread` at each task start, before a cross-owner edit, before commit, and after a merge. Ask app versus CLI only if needed.

Gemini or Cursor, only if she names one: same reads, no hook promise, no tool change.

## Machine rules

Ask if the repo is already on disk before cloning. Clone only after yes and a confirmed absence. Keep her branch. Do not pull over dirty work. A clean new branch can be `akshi/ai` from latest `main`. One agent, one checkout. A second agent needs a worktree. No reset unless she asks.

`tools/board whoami` must print `biswalakshi`. Unread marks read and is not push access. Check repo permissions. Never show a token or OTP.

After `tools/board coord on`, post routine progress yourself. Prefix `[Akshi's Claude]` or `[Akshi's Codex]` to match the tool. Do not ask her to approve each note. Do not merge or force-push. If the tool is still unknown, do not invent a watcher.

Windows only if she is on Windows or a command fails. Use Git Bash or WSL.

After setup, summarize her role and stop. Do not edit `docs/API.md`. That file is Aditri's after the team reviews `docs/CONTRACT_MIGRATION.md`.

<!--
AI checklist. Do not read this aloud. One item, then wait.

1. Ask which tool. Wait.
2. Ask if the repo is downloaded. Clone only on yes plus confirmed absence.
3. OS only if needed.
4. git and gh, or stop.
5. Auth as biswalakshi. whoami. No tokens.
6. Check push permission.
7. git status. Dirty: stop.
8. tools/board read -n 20. Warn before unread.
9. Read AGENTS.md, CLAUDE.md, docs/PRODUCT.md, docs/AI_PIPELINE.md, docs/CONTRACT_MIGRATION.md.
10. Summarize role. Wait.
11. Before commit: unread, then commit. Post the result without waiting for wording approval.
-->
