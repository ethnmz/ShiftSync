#!/usr/bin/env bash
# UserPromptSubmit: if a watch is already the reader, stay silent so two readers do not race.
# Otherwise surface posts since the last check. Never fails.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
if tools/board watch-status >/dev/null 2>&1; then
  exit 0
fi
out="$(tools/board unread 2>/dev/null)" || exit 0
[ -n "$out" ] && printf 'New board posts (issue #%s):\n%s\n' "${BOARD_ISSUE:-1}" "$out"
exit 0
