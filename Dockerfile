# agents-remote 生产镜像（2026-10-27 部署形态批；同日瘦身批改为 runtime 精确组装）。
# 多阶段：builder（oven/bun 全量安装 + 构建 shared/api/web）→ runtime（node:24-slim
# 携 node 供 skills CLI spawn，装 bun 运行时 + tmux/git/claude/codex 外部进程依赖）。
#
# runtime 基镜像 = node:24-slim（Active LTS；floating tag 跟随官方安全补丁重建，
# 2026-10-20 全线安全发布即 v24.22.1）——不钉 digest：镜像随 CI 重建持续吃安全修复，
# 钉死反而冻结安全态。web/api 的构建期依赖（vite/tailwind/mermaid 等）不进镜像：
# builder 只拷贝 runtime 真正需要的四样（见下方「runtime 体积构成」）。
#
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
# ── runtime 体积构成（四样，替代整棵 node_modules：~1.27GB → ~280MB）──────────
#   /runtime/claude-code-linux-x64  claude 原生二进制树（254MB 自包含 ELF，不依赖
#                                   node/wrapper；claude-runtime.ts 裸名 PATH spawn）
#   /runtime/claude                 裸名 symlink → 上树的 claude
#   /runtime/api/node_modules       api bundle 唯一运行时解析点：skills CLI 树
#                                   （skill-process.ts 以 ["node", <绝对路径>] spawn，
#                                   createRequire 从 /app/api/dist 向上解析到
#                                   /app/api/node_modules/skills；依赖 tar/yaml 被 bun
#                                   hoist 进 .bun/skills@*/node_modules/ 三件套，按同款
#                                   相对布局补齐到 api/node_modules）
#   /app/{api,web}/dist             构建产物（api 是 @bun 全 bundle，零第三方运行时依赖）
# cp -L 解开 bun isolated store 的 symlink 布局成自洽实体。glob 在镜像内 fresh
# frozen install 下只命中锁文件选中的单一版本；将来锁文件出现多版本时 cp 会显式
# 报错（fail loud 好过静默拷错版本）。
RUN mkdir -p /runtime/api/node_modules \
  && cp -rL api/node_modules/skills /runtime/api/node_modules/skills \
  && cp -rL node_modules/.bun/skills@*/node_modules/tar /runtime/api/node_modules/tar \
  && cp -rL node_modules/.bun/skills@*/node_modules/yaml /runtime/api/node_modules/yaml \
  && cp -rL node_modules/.bun/@anthropic-ai+claude-code-linux-x64@*/node_modules/@anthropic-ai/claude-code-linux-x64 \
       /runtime/claude-code-linux-x64 \
  && ln -s /runtime/claude-code-linux-x64/claude /runtime/claude

# ── runtime ──────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends tmux git gosu \
  && rm -rf /var/lib/apt/lists/*
# bun 运行时（静态入 glibc 链，node:24-slim 的 bookworm 基可直接跑）。
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
# codex CLI：npm 分发（原生二进制经 optional deps 落位）。默认钉版本（供应链规则：
# 发布 ≥7 天才 bump，升级显式改这里）；--build-arg CODEX_VERSION=latest 可覆盖。
# NPM_REGISTRY 逃生口：默认官方源（CI/海外零改动）；国内构建慢/卡时传
# --build-arg NPM_REGISTRY=https://registry.npmmirror.com（同源镜像，产物一致）。
ARG CODEX_VERSION=0.163.0
ARG NPM_REGISTRY=https://registry.npmjs.org
RUN npm install -g --silent --registry=${NPM_REGISTRY} @openai/codex@${CODEX_VERSION} \
  && npm cache clean --force

ENV NODE_ENV=production \
    WEB_DIST_DIR=/app/web/dist \
    PATH=/runtime:${PATH}
WORKDIR /app
COPY --from=builder /runtime/claude-code-linux-x64 /runtime/claude-code-linux-x64
# 裸名入口 symlink 在 final 层内建：COPY 会把单文件 symlink 解引用成实体
# （实测重复拷 265MB claude 二进制）。
RUN ln -s /runtime/claude-code-linux-x64/claude /runtime/claude
COPY --from=builder /runtime/api/node_modules /app/api/node_modules
COPY --from=builder /app/api/dist ./api/dist
COPY --from=builder /app/web/dist ./web/dist
COPY package.json bun.lock ./
COPY api/package.json api/
COPY docker/entrypoint.sh ./docker/entrypoint.sh

# 与典型宿主 uid 对齐（bind mount 下文件属主一致，容器内外都能直接读写）。
# node:24-slim 自带 node 用户恰占 uid/gid 1000——先删再建同名占用者。
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
