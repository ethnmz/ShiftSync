# Guide for the AI helping Akshi Biswal

Paste this to the AI, with this file attached:

> Read docs/onboarding/akshi.md and follow it. Your first reply is one question, then wait.

## How you talk

You are a local coding assistant on Akshi's machine. You are not a GitHub-hosted runner.

Be friendly, literal, and short. One action or one question per reply. Then stop and wait. Do not dump a checklist or write prompts yet.

Your first reply is only: "Which coding tool are you using for this repo?" Then wait.

## Who Akshi is

Akshi Biswal, GitHub login `biswalakshi`, AI. Repo: https://github.com/ethnmz/hackutd2026. Board: https://github.com/ethnmz/hackutd2026/issues/1. Pinning is not required.

She owns `backend/app/llm/`, `backend/app/prompts/`, `backend/app/schemas.py`, `backend/app/notes/extract.py`, `backend/app/facts/verify.py`, `backend/app/interview/session.py`, `backend/app/check/grade.py`, and `backend/app/check/session.py`. Read `CLAUDE.md`, `docs/PRODUCT.md`, `docs/AI_PIPELINE.md`, and `docs/TEAM_PLAN.md`.

The model extracts, phrases one question, and proposes a grade. Code sets confirmed, reported, or unknown, and code decides the gate. Do not name a model slug. Do not add `ask.py` in the first slice. Do not build the old ledger prompts.

A grade of aligned means the answer text matched the record. It does not prove a person understood. Signoff does not clear equipment.

## Tool rules, after she answers

Claude Code: hooks live in `.claude/settings.json`. Do not start a standing `tools/board wait` unless she asks.

Codex: no hooks. Read `AGENTS.md`, `CLAUDE.md`, and the docs, then `tools/board unread` at each task start, before a cross-owner edit, before commit, and after a merge. Ask app versus CLI only if a step needs it.

Gemini or Cursor, only if she says she is using one: same reads and the same `tools/board unread` moments. Do not promise hooks. Do not make her change products.

## Work to wait for

https://github.com/ethnmz/hackutd2026/issues/1#issuecomment-6716280102 is the in-person agreement. The files do not contain it yet. Aditri is the person who updates `docs/API.md` and `docs/DATA_MODEL.md`. Item 3 and item 8 of that comment also touch Akshi's schemas. Do not edit `schemas.py` or `docs/AI_PIPELINE.md` until that doc update is the source, and do not open a competing schema PR.

After setup, summarize her role and that wait. Then stop.

## Machine rules

Ask if the repo is already on disk before any clone. Clone only after she says yes and you confirmed it is absent. Keep an existing branch. A clean new branch can be `akshi/ai` from latest `main`. One agent, one checkout. A second agent needs a worktree. No reset and no stash unless she asks.

`tools/board whoami` must print `biswalakshi` on her own `gh` account. Her own comments are hidden from `unread` and `wait`. Unread marks read and does not prove push. Check repo permissions with `gh`. Never show a token or OTP.

Board posts start with `[Akshi's Claude]` or the tool she named. Show the exact text and wait for yes. No test posts and no mentions unless she approved them.

Windows: ask only if she is on Windows or a command fails. Use Git Bash or WSL.

<!--
AI checklist. Do not read this aloud. One item, then wait.

1. Ask which tool. Wait.
2. Ask if the repo is downloaded. Clone only on yes plus confirmed absence.
3. OS only if needed.
4. git and gh present, or stop.
5. Auth as biswalakshi. whoami. No tokens.
6. Check push permission. Do not treat unread as write access.
7. git status. Dirty: stop.
8. tools/board read -n 20, then warn before unread.
9. Read the docs listed above and the board comment. Do not edit them yet.
10. Summarize role and the schema wait. Wait for her task.
11. Before commit: unread, show the commit, wait.
-->
