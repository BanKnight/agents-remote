#!/usr/bin/env bash
# agents-remote 容器入口（部署形态批）：
# ① root 启动时修三个挂载点属主（bind mount 首次由 docker 创建时属主 root），
#   再 drop 到 agent(uid 1000) 运行；
# ② 首启 config 引导：loadConfig 在 config.yaml 缺失时 createTemplate + CONFIG_REQUIRED
#   退出（env 全量提供也拦不住，api/src/config.ts readConfig）——APP_PASSWORD 有值时
#   生成最小 config.yaml；文件已存在则不动（env 覆盖仍生效，改密码只需改 env 重启）。
set -euo pipefail

if [ "$(id -u)" = "0" ]; then
  mkdir -p /data/run /data/projects
  chown agent:agent /home/agent /data/run /data/projects
  exec gosu agent "$0" "$@"
fi

CONFIG_DIR="${HOME}/.agents-remote"
CONFIG_FILE="${CONFIG_DIR}/config.yaml"
if [ ! -f "$CONFIG_FILE" ] && [ -n "${APP_PASSWORD:-}" ]; then
  umask 077
  mkdir -p "$CONFIG_DIR"
  # 密码刻意不写入 config.yaml：APP_PASSWORD env 在 applyEnvOverrides 中覆盖
  # （api/src/config.ts），文件里只放非敏感值——密码只存在于容器 env，避免
  # 在挂载卷上留下随备份扩散的明文副本，也避免 heredoc 拼接特殊字符破坏 YAML。
  cat > "$CONFIG_FILE" <<EOF
projects_root: "${PROJECTS_ROOT:-/data/projects}"
api_port: ${API_PORT:-4311}
web_port: ${WEB_PORT:-4311}
web_api_base_url: "/api"
EOF
fi

# 缺省启动 api（CMD）；透传参数支持调试/测试（docker run <image> sh 等）。
if [ "$#" = "0" ]; then
  set -- bun /app/api/dist/index.js
fi
exec "$@"
