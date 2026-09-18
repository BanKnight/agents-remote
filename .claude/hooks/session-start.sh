#!/usr/bin/env bash
# SessionStart hook — 把 handoff/current.md 作为 additionalContext 注入
# 触发：startup / resume / clear / compact（省略 matcher = 全部 SessionStart）
# stdout 即注入到 Claude 的上下文；对缺失文件容错。
set -uo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
CURRENT="$ROOT/.claude/handoff/current.md"

echo "<onboarding>"
echo "# agents-remote session 恢复"
echo "（来源：SessionStart hook 自动注入 handoff）"
echo
if [ -f "$CURRENT" ]; then
  echo "## handoff/current.md"
  cat "$CURRENT"
else
  echo "## handoff/current.md（尚不存在——首次启动或尚未 /handoff save）"
fi
echo
echo "## 提醒"
echo "- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。"
echo "- 到达里程碑或感知将 compact 时，主动 /handoff save。"
echo "</onboarding>"
