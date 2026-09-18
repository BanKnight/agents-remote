#!/usr/bin/env bash
# PostToolUse hook — 对 Write/Edit 保存的文件自动跑 oxfmt
# 触发条件：settings.json 中限定 matcher=["Edit","Write"]
# 输入：CLAUDE_TOOL_INPUT 为 JSON，形如 {"file_path": "...", "content": "..."}
set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
TOOL_INPUT="${CLAUDE_TOOL_INPUT:-}"

# 仅处理 Write / Edit
[[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" ]] || exit 0

# 没有输入就退出
[[ -n "$TOOL_INPUT" ]] || exit 0

# 解析 file_path（jq 可能不存在，用 node 兜底）
FILE_PATH=""
if command -v jq >/dev/null 2>&1; then
  FILE_PATH=$(printf '%s' "$TOOL_INPUT" | jq -r '.file_path // empty' 2>/dev/null)
else
  FILE_PATH=$(node -e "
    try {
      const input = JSON.parse(process.env.TOOL_INPUT || '{}');
      if (input.file_path) process.stdout.write(input.file_path);
    } catch {}
  " 2>/dev/null)
fi

[[ -n "$FILE_PATH" ]] || exit 0

# 拒绝显式的 .. 跳转（即使 realpath 不存在也安全）
[[ "$FILE_PATH" == *..* ]] && exit 0

# 确保是绝对路径且位于项目内
if [[ "$FILE_PATH" != /* ]]; then
  FILE_PATH="$ROOT/$FILE_PATH"
fi

# 必须能成功规范化路径；realpath 失败时不回退到原始路径
RP=$(realpath -m "$FILE_PATH" 2>/dev/null) || exit 0
FILE_PATH="$RP"

[[ "$FILE_PATH" == "$ROOT"/* ]] || exit 0
[[ -f "$FILE_PATH" ]] || exit 0

# 只格式化 oxfmt 能处理的扩展名
EXT="${FILE_PATH##*.}"
[[ "$EXT" =~ ^(ts|tsx|js|jsx|mjs|cjs|json)$ ]] || exit 0

OXFMT="$ROOT/node_modules/.bin/oxfmt"
if [[ -x "$OXFMT" ]]; then
  "$OXFMT" --write "$FILE_PATH" >/dev/null 2>&1 || true
fi

exit 0
