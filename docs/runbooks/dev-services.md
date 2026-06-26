# Dev Services Runbook

ar-dev tmux session 的启动、重启与关闭流程。**web 长期跑生产构建（`vite preview` + `build --watch`），api 跑 dev**，固定端口 API `43011` / Web `43012`。

## 为什么 web 跑 prod build

web 的 service worker（precache、`navigateFallback`、`registerSW`）**只在生产构建产物里真实存在**。dev 模式的 HMR 与生产 PWA 行为不一致——splash、缓存、后台恢复 reload 这类问题只在 prod 才暴露，过去多次出现「dev 正常、prod 出问题」的偏差。

因此本地开发也用 prod build 跑 web（`vite preview` 服务 `dist/`，`vite build --watch` 保存即重建），让本地行为对齐生产。api 不涉及 SW，保留 dev（HMR、快速重启）保住 DX。

代价：web 失去 HMR，每次改动要重建（~1s）+ 手动刷新，组件状态丢失。可接受；若某次需要大量纯 UI 迭代，可临时用 `bun run --filter @agents-remote/web dev` 回 dev 模式作为逃生口（但不要用它验证 PWA 行为）。

## 端口与代理

- API dev：`43011`。
- Web preview：`43012`（`vite.config.ts` 的 `preview.port`）。
- preview 的 `proxy` 把 `/api`（含 WebSocket）转发到 api dev，与 dev 模式一致；Cloudflare Tunnel 指向 `43012` 不变。
- preview 绑定 `host: true`（0.0.0.0）+ `allowedHosts`，tunnel 域名可达。

## 启动 ar-dev

在 tmux session `ar-dev` 内（建议两个 pane/window 分别跑 api 和 web，便于独立重启）：

```bash
# api pane
bun run --filter @agents-remote/api dev

# web pane
scripts/ar-dev-web.sh
```

`scripts/ar-dev-web.sh` 做三件事：
1. 阻塞式 `vite build`（让 preview 启动即有 `dist/`）。
2. 后台 `vite build --watch`（保存即重建 `dist/`）。
3. 前台 `vite preview`（服务 `dist/`，端口/代理来自 `vite.config.ts` 的 `preview` 块）。

退出脚本（`C-c`）会自动 kill 后台 watch 进程。

## 重启

- **重启 api**：在 api pane 发 `C-c`，再 `bun run --filter @agents-remote/api dev`。
- **重启 web**：在 web pane 发 `C-c`（脚本 trap 会清 watch），再 `scripts/ar-dev-web.sh`。
- **强制重建 web**：`C-c` 后重跑脚本即可（首步会全量 build）。

## 关闭 / 清理孤儿

进程必须在 tmux 内管理。如果某进程变孤儿（`PPID=1`，tmux 外残留），只能 `kill <pid>` 清理后再在 tmux 内重启：

```bash
ps -ef | grep -E 'vite|bun' | grep -v grep
kill <pid>
```

按 `ar-<purpose>` 命名 tmux session（`ar-dev`、`ar-e2e`、`ar-debug`），便于 `tmux list-sessions | grep '^ar-'` 搜索与复用。

## 验证 PWA 行为

只有 prod build（preview）下 SW 才真实工作。验证项：

- Application → Service Workers：`sw.js` 已注册、activated。
- Application → Cache Storage：`workbox-precache-v2` 含 `index.html` + 所有 chunk + 图标 + 字体（23 entries）。
- reload 应瞬开（index.html + 资源走 precache，无网络等待）。
- 后台放置较长时间后回前台：无卡顿，直接显示深色背景 → React 渲染。

dev 模式（`vite` dev server）下不要验收这些——SW 行为不代表生产。
