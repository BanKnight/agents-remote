#!/usr/bin/env bash
# ar-cleanup-test-sessions: kill dev-environment terminal sessions accumulated
# under the test project (`ar-terminal-test-*`).
#
# Why this exists: dev API (port 43011) uses the default session prefix `ar`
# (not the E2E harness's `e2e-ar`). Manual UI verification + ad-hoc verify
# scripts (e.g. scripts/f3-verify.mjs) that open terminals under the `test`
# project leak tmux sessions with no finally-block cleanup, which accumulate
# and raise system load. The E2E harness (scripts/run-e2e.ts) is unrelated —
# it runs in a temp env with `e2e-ar` prefix and cleans up its own sessions.
#
# Safety boundary — matches ONLY `^ar-terminal-test-`:
#   ar-         = dev API default prefix
#   terminal-   = TerminalSession type segment
#   test-       = projectKey `test` (exact, followed by `-<hash>`)
# Never matches: real projects (agents-remote / novels / lang-partner /
#   claude-template), or E2E harness sessions (e2e-ar-*).
#
# Usage:
#   scripts/ar-cleanup-test-sessions.sh            # dry-run: list only
#   scripts/ar-cleanup-test-sessions.sh --force    # actually kill

set -euo pipefail

PATTERN='^ar-terminal-test-'
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

sessions=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep "$PATTERN" || true)

if [ -z "$sessions" ]; then
  echo "no ${PATTERN}* sessions found"
  exit 0
fi

count=$(printf '%s\n' "$sessions" | wc -l | tr -d ' ')
echo "found ${count} test-project terminal session(s):"
printf '%s\n' "$sessions" | sed 's/^/  /'

if [ "$FORCE" -ne 1 ]; then
  echo ""
  echo "dry-run only — re-run with --force to kill them."
  exit 0
fi

echo ""
echo "killing..."
printf '%s\n' "$sessions" | while IFS= read -r s; do
  tmux kill-session -t "$s" 2>/dev/null || true
done
echo "done — killed ${count} session(s)."
