#!/usr/bin/env bash
# PostToolUse hook — 对 Write/Edit 保存的文件自动跑 oxfmt
# 输入：stdin 传入 PostToolUse JSON payload。实测（2026-09-19 探针）Claude Code 不导出
# CLAUDE_TOOL_INPUT/CLAUDE_TOOL_NAME 环境变量，只能从 stdin 解析（22router 原版按环境变量
# 解析，真实会话中从不触发——本项目已修正）。
set -uo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"

INPUT="$(cat 2>/dev/null)"
[[ -n "$INPUT" ]] || exit 0

# 解析 tool_name 与 tool_input.file_path（jq 缺失时用 node 兜底）
TOOL_NAME=""
FILE_PATH=""
if command -v jq >/dev/null 2>&1; then
  TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)
  FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
else
  TOOL_NAME=$(printf '%s' "$INPUT" | node -e 'try{const i=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(i.tool_name||""))}catch{}' 2>/dev/null)
  FILE_PATH=$(printf '%s' "$INPUT" | node -e 'try{const i=JSON.parse(require("fs").readFileSync(0,"utf8"));const t=i.tool_input||{};process.stdout.write(String(t.file_path||""))}catch{}' 2>/dev/null)
fi

# 仅处理 Write / Edit
[[ "$TOOL_NAME" == "Write" || "$TOOL_NAME" == "Edit" ]] || exit 0

# 没有 file_path 就退出
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
