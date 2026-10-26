# agents-remote 生产镜像（2026-10-27 部署形态批）。
# 多阶段：builder（oven/bun 全量安装 + 构建 shared/api/web）→ runtime（node:22-slim
# 携 node 供 skills CLI spawn，装 bun 运行时 + tmux/git/claude/codex 外部进程依赖）。
# 单进程承载完整站点：api 内置静态 serve（WEB_DIST_DIR，见 api/src/static-web.ts），
# 无需独立 web 服务器/反代层。会话数据全部落在三个挂载点（见 docker-compose.yml
# 顶部「会话记录落点表」）：/home/agent、/data/run、/data/projects。

# ── builder：全量安装 + 构建 ──────────────────────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app
# 根 package.json 的 prepare 会 git config core.hooksPath——上下文无 .git（.dockerignore
# 排除）时补空仓库，否则 bun install 的 lifecycle 失败连带 install 失败。bun 镜像无 git。
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/* && git init -q .
COPY package.json bun.lock ./
COPY api/package.json api/
COPY web/package.json web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
# 构建完成后裁剪到生产依赖树：runtime 只需要 claude CLI（node_modules/.bin）+
# skills CLI + api 运行时依赖；web 的 react 等纯构建期依赖被裁掉一半以上体积。
RUN bun install --production --frozen-lockfile

# ── runtime ──────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends tmux git gosu \
  && rm -rf /var/lib/apt/lists/*
# bun 运行时（静态入 glibc 链，node:22-slim 的 debian 基可直接跑）。
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
# codex CLI：npm 分发（原生二进制经 optional deps 落位）。默认钉版本（供应链规则：
# 发布 ≥7 天才 bump，升级显式改这里）；--build-arg CODEX_VERSION=latest 可覆盖。
ARG CODEX_VERSION=0.163.0
RUN npm install -g --silent @openai/codex@${CODEX_VERSION} && npm cache clean --force

ENV NODE_ENV=production \
    WEB_DIST_DIR=/app/web/dist \
    PATH=/app/node_modules/.bin:${PATH}
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/api/dist ./api/dist
COPY --from=builder /app/web/dist ./web/dist
COPY package.json bun.lock ./
COPY api/package.json api/
COPY docker/entrypoint.sh ./docker/entrypoint.sh

# 与典型宿主 uid 对齐（bind mount 下文件属主一致，容器内外都能直接读写）。
# node:22-slim 自带 node 用户恰占 uid/gid 1000——先删再建同名占用者。
RUN userdel -r node 2>/dev/null || true; groupdel node 2>/dev/null || true; \
  groupadd -g 1000 agent && useradd -m -u 1000 -g 1000 agent \
  && chmod +x docker/entrypoint.sh
# 数据挂载点默认值（compose 会 bind mount 覆盖；裸 docker run 时也落在可写层）。
RUN mkdir -p /data/run /data/projects && chown agent:agent /data/run /data/projects

EXPOSE 4311
HEALTHCHECK --interval=30s --timeout=5s --retries=5 --start-period=20s \
  CMD ["bun", "-e", "const r = await fetch('http://127.0.0.1:4311/api/health'); if (!r.ok) process.exit(1);"]
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["bun", "/app/api/dist/index.js"]
