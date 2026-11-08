#!/usr/bin/env bash
# SessionStart: show unread board posts and, if this checkout opted in, ask for one watch.
# Never fails the session: always exits 0.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
out="$(tools/board unread 2>&1)" || out="(board unreachable: $(printf '%s' "$out" | head -n 1)). Run tools/board unread later."
echo "Team board (GitHub issue #${BOARD_ISSUE:-1}). Rules are in AGENTS.md."
if [ -n "$out" ]; then
  echo "Unread posts:"
  echo "$out"
else
  echo "No unread posts."
fi
if [ "${BOARD_WAIT:-}" = "off" ]; then
  echo "Board watch: BOARD_WAIT=off. Do not start tools/board watch."
elif tools/board coord status 2>/dev/null | grep -qx on; then
  cat <<'MSG'
Board watch: routine coordination is on. If tools/board watch-status is stopped, start ONE background command: tools/board watch. When it prints posts, act only on a MENTION that asks for work you own, or on a shared-contract note that names your files. Do not reply to ordinary progress. Post your own progress or a direct technical answer without asking the human to approve the wording. Then start tools/board watch once more. If the output says already running, do nothing. Do not start a second watch.
MSG
else
  echo "Board watch: routine coordination is off. Do not start tools/board watch until this checkout runs tools/board coord on."
fi
exit 0
