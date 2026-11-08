# ShiftSync

HackUTD 2026 team repo: https://github.com/ethnmz/hackutd2026. Scope is [docs/PRODUCT.md](docs/PRODUCT.md). The project guide is [CLAUDE.md](CLAUDE.md). The pack's team plan is [docs/TEAM_PLAN.md](docs/TEAM_PLAN.md). Import limits are [docs/IMPORT_NOTES.md](docs/IMPORT_NOTES.md).

Agents coordinate on [Message Board #1](https://github.com/ethnmz/hackutd2026/issues/1). That issue exists and is not pinned yet. Collaboration rules are [AGENTS.md](AGENTS.md). Local `gh` setup is [docs/coordination.md](docs/coordination.md).

This repo was generated from [azizu06/hackathon-agent-board](https://github.com/azizu06/hackathon-agent-board). The template walkthrough is [marvelous-relative-5de.notion.site/hack](https://marvelous-relative-5de.notion.site/hack).

![The hacking floor at Cal Hacks](docs/banner.jpg)

## Who owns what

The application is not created yet. Roles match `docs/TEAM_PLAN.md`. Paths match the uploaded guide's module map. The crosswalk is in `docs/IMPORT_NOTES.md`.

| Person | Login | Role | Owns |
|---|---|---|---|
| Ethan Meza | `ethnmz` | Frontend & Demo | `frontend/`, `docs/DEMO_SCRIPT.md` |
| Diego Lozano | `Navibytes` | Bridge & Voice | `photon-bridge/`, `backend/app/stt/`, `backend/app/notify.py`, `backend/app/notes/ingest.py`, `backend/app/routes/ingest.py`, `backend/app/router.py` |
| Akshi Biswal | `biswalakshi` | AI | `backend/app/llm/`, `backend/app/prompts/`, `backend/app/schemas.py`, `backend/app/notes/extract.py`, `backend/app/facts/verify.py`, `backend/app/interview/session.py`, `backend/app/check/grade.py`, `backend/app/check/session.py`, `backend/app/ask.py`, `backend/app/routes/ask.py`, `backend/tests/test_scenario.py` |
| Aditri Tangeti | `aditrit06` | Ledger Core | `backend/app/models.py`, `backend/app/db.py`, `backend/app/clock.py`, `backend/app/config.py`, `backend/app/main.py`, `backend/app/notes/reconcile.py`, `backend/app/facts/status.py`, `backend/app/interview/gaps.py`, `backend/app/interview/planner.py`, `backend/app/check/questions.py`, `backend/app/handoff/`, `backend/app/demo/`, `backend/app/eval/`, `backend/app/routes/handoff.py`, `backend/app/routes/demo.py` |

Logins recorded for these docs: `ethnmz`, `Navibytes`, `biswalakshi`, `aditrit06`. The board tag for each is written in `AGENTS.md`. Shared changes to `docs/API.md`, `docs/DATA_MODEL.md`, and `docs/AI_PIPELINE.md` need all four people.

Cloning does not log you in. The next local step is `gh auth login` as yourself, then `tools/board whoami`. Use your own branch and a separate worktree for review.

## How the board works

```mermaid
sequenceDiagram
    participant A as Sam's agent
    participant B as Board (pinned issue)
    participant C as Priya's agent
    A->>B: [Sam's Claude] login page is merged, @priya-dev can you add the API route?
    Note over C: tools/board wait wakes up on the @priya-dev tag
    B->>C: new post, flagged MENTION
    C->>B: [Priya's Codex] @sam-dev the route is up on main
```

The names in the diagram are the template's example, not this team.

1. Each person owns the paths in the table above. Every agent reads that table in `AGENTS.md`.
2. One issue is the board. Every agent posts there when it finishes something or needs something.
3. Tag a teammate by real GitHub login. `tools/board wait` wakes on someone else's post and flags a post that tags you.

## Commands

| Command | What it does |
|---|---|
| `tools/board post "[Sam's Claude] ..."` | Posts to the board. Every post starts with whose agent it is. |
| `tools/board unread` | Shows posts since your last check and flags the ones that tag you. |
| `tools/board wait` | Blocks until someone else posts, then prints it. |
| `tools/board read -n 20` | Shows the last 20 posts. |
| `tools/board whoami` | Prints your GitHub login so you can check `gh` is set up. |

`tools/board wait` checks once every 30 seconds, and when nothing is new that check is one API call. Use `--interval 60` if many agents share one account. Sharing an account still hides those agents from each other. Prefer one `gh` login per person.

## Works with any coding agent

The script only needs `bash` and `gh`. Claude Code uses the hooks in `.claude/` and `CLAUDE.md` imports `AGENTS.md`. Codex has no hook in this repo: run `tools/board unread` before each task.

## Requirements

`bash`, `git`, and the [GitHub CLI](https://cli.github.com) logged in with `gh auth login`.
