#!/usr/bin/env bash
# PreCompact hook — compact 前注入 current.md（与 SessionStart 的 compact 分支互为双保险）
# stdout 作为 additionalContext 注入（压缩后保留）。
set -uo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CURRENT="$ROOT/.claude/handoff/current.md"

echo "<precompact-handoff>"
echo "# 即将压缩上下文——以下为保留的关键状态"
if [ -f "$CURRENT" ]; then
  cat "$CURRENT"
else
  echo "（current.md 尚不存在——若本 session 有关键进展，压缩后可能丢失。请尽快 /handoff save。）"
fi
echo
echo "## 提醒"
echo "- 若 current.md 过时（与本 session 最新进展不符），请先 /handoff save 再继续。"
echo "- 压缩后继续推进 .claude/gtd/next-actions.md 中的下一步。"
echo "</precompact-handoff>"
