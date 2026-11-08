#!/usr/bin/env bash
# Local mocks only. Does not post to GitHub or start a standing watcher.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/repo/tools" "$TMP/repo/.board"
cp "$ROOT/tools/board" "$ROOT/tools/codex-wake" "$TMP/repo/tools/"
chmod +x "$TMP/repo/tools/board" "$TMP/repo/tools/codex-wake"
git -C "$TMP/repo" init -q
git -C "$TMP/repo" remote add origin https://github.com/ethnmz/hackutd2026.git

cat > "$TMP/bin/gh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${GH_LOG:?}"
joined="$*"
case "$joined" in
  *".full_name"*) echo ethnmz/hackutd2026 ;;
  *" user "*|user*) echo "${FAKE_LOGIN:-alice}" ;;
  *".comments"*) echo "${FAKE_COUNT:-0}" ;;
  *"comments?"*)
    if [ -n "${FAKE_ROWS:-}" ]; then printf '%s\n' "$FAKE_ROWS"; fi
    ;;
  *"/comments"*)
    if printf '%s' "$joined" | grep -q -- '-f body='; then
      echo "https://example.test/comment"
    fi
    ;;
esac
exit 0
EOF
chmod +x "$TMP/bin/gh"

export PATH="$TMP/bin:$PATH"
export GH_LOG="$TMP/gh.log"
export BOARD_REPO=ethnmz/hackutd2026
export BOARD_ISSUE=1
cd "$TMP/repo"

fail() { echo "FAIL: $*" >&2; exit 1; }

# Prefix rejection happens after repo lookup, and must not create a comment.
: > "$GH_LOG"
if "$TMP/repo/tools/board" post "hello" >/dev/null 2>&1; then fail "bad prefix should exit nonzero"; fi
grep -q 'body=' "$GH_LOG" && fail "bad prefix posted"
echo "ok prefix"

# Self posts are hidden. A mention of the reader is flagged.
b64() { printf '%s' "$1" | base64 -w 0; }
row_bob="$(printf '10\tbob\t2026-01-01T00:00:00Z\t%s' "$(b64 "[Bob's Codex] @alice look at photon-bridge")")"
row_me="$(printf '11\talice\t2026-01-01T00:00:01Z\t%s' "$(b64 "[Alice's Codex] my own note")")"
export FAKE_LOGIN=alice FAKE_COUNT=2
export FAKE_ROWS="$row_bob"$'\n'"$row_me"
out="$("$TMP/repo/tools/board" unread)"
printf '%s\n' "$out" | grep -q 'bob' || fail "missing other author"
printf '%s\n' "$out" | grep -q 'MENTION' || fail "missing mention flag"
printf '%s\n' "$out" | grep -q 'my own note' && fail "showed own comment"
echo "ok filter"

# Second unread is empty once the cursor has moved.
out2="$("$TMP/repo/tools/board" unread || true)"
[ -z "$out2" ] || fail "second unread should be empty: $out2"
echo "ok cursor"

# Watch stays down until coord is on, and BOARD_WAIT=off wins.
rm -f .board/coord-on .board/watch.pid
msg="$("$TMP/repo/tools/board" watch --timeout 1 || true)"
printf '%s\n' "$msg" | grep -q 'coordination is off' || fail "watch should be off: $msg"
"$TMP/repo/tools/board" coord on >/dev/null
msg="$(BOARD_WAIT=off "$TMP/repo/tools/board" watch --timeout 1 || true)"
printf '%s\n' "$msg" | grep -q 'BOARD_WAIT=off' || fail "opt-out ignored: $msg"
echo "ok watch gates"

# One live watch only. The holder times out quickly. The second does not start.
unset BOARD_WAIT
export FAKE_COUNT=0 FAKE_ROWS=
"$TMP/repo/tools/board" watch --timeout 2 >/tmp/watch1.out 2>/tmp/watch1.err &
holder=$!
sleep 0.3
msg="$("$TMP/repo/tools/board" watch --timeout 2)"
printf '%s\n' "$msg" | grep -q 'already running' || fail "second watch started: $msg"
wait "$holder" && fail "holder should time out" || code=$?
[ "${code:-0}" -eq 124 ] || fail "holder exit $code"
sleep 0.2
if "$TMP/repo/tools/board" watch-status >/dev/null 2>&1; then fail "lock left behind"; fi
echo "ok singleton"

# Codex runner: missing binary, bad help, then one verified fake exec. No live post.
export CODEX_LOG="$TMP/codex.log"
rm -f "$CODEX_LOG"
if "$TMP/repo/tools/codex-wake" --once --wait 1 >/tmp/wake.out 2>/tmp/wake.err; then
  fail "missing codex should fail"
fi
grep -q unverified /tmp/wake.err /tmp/wake.out
echo "ok missing codex"

cat > "$TMP/bin/codex" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "exec" ] && [ "${2:-}" = "--help" ]; then
  if [ -n "${BAD_HELP:-}" ]; then echo "exec prompt"; exit 0; fi
  echo "codex exec --sandbox read-only|workspace-write --ephemeral prompt via stdin -"
  exit 0
fi
printf '%s\n' "$*" >> "${CODEX_LOG:?}"
cat >> "${CODEX_LOG:?}"
exit "${CODEX_EXIT:-0}"
EOF
chmod +x "$TMP/bin/codex"
if BAD_HELP=1 "$TMP/repo/tools/codex-wake" --once --wait 1 >/tmp/wake.out 2>/tmp/wake.err; then
  fail "bad help should be unverified"
fi
grep -q unverified /tmp/wake.err /tmp/wake.out
echo "ok bad help"

unset BAD_HELP
export FAKE_COUNT=1
export FAKE_ROWS="$(printf '30\tbob\t2026-01-02T00:00:00Z\t%s' "$(b64 "[Bob's Codex] @alice status")")"
rm -f .board/cursor-* 
"$TMP/repo/tools/codex-wake" --once --wait 2 > /tmp/wake.out
grep -q 'sandbox workspace-write' "$CODEX_LOG" || fail "sandbox not passed"
grep -q -- '--yolo' "$CODEX_LOG" && fail "yolo was passed"
grep -q 'untrusted data' "$CODEX_LOG" || fail "prompt missing untrusted marker"
grep -q 'body=' "$GH_LOG" && fail "wake posted to the board"
echo "ok codex wake"

# A failed exec stops inside the fail budget.
export CODEX_EXIT=9 CODEX_WAKE_FAILS=1
rm -f .board/cursor-*
export FAKE_ROWS="$(printf '40\tbob\t2026-01-03T00:00:00Z\t%s' "$(b64 "[Bob's Codex] again")")"
if "$TMP/repo/tools/codex-wake" --once --wait 2 >/dev/null 2>/tmp/wake.err; then
  fail "exec failure should exit nonzero"
fi
grep -q 'codex exec failed' /tmp/wake.err || fail "failure not reported"
echo "ok exec failure"
echo "all automation tests passed"
