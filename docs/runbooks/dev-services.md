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

### 人在 tmux 内手动重启

在对应 window/pane 直接操作：

- **api**：`C-c` → `bun run --filter @agents-remote/api dev`。
- **web**：`C-c`（脚本 trap 会清 watch）→ `scripts/ar-dev-web.sh`。
- **强制重建 web**：`C-c` 后重跑脚本（首步全量 build）。

### 从外部通过 tmux 重启（脚本 / agent）

> 🔴 **红线：只重启目标 window 内的服务进程，绝不杀 tmux 本身。**
> 禁止 `tmux kill-server`、`tmux kill-session -t ar-dev`、`kill <tmux-server-pid>`，也不要用 `tmux kill-window` 当作重启手段——服务进程退出后 `remain-on-exit off`（本项目默认，见 `~/.tmux.conf` 未设）已会自动关闭 window，再去 kill window/session 只会把整个开发环境连带毁掉。**重启 = 让目标进程重新跑起来，不是 = 摧毁 window/session。**

脆弱点（踩过的坑）：window **index 会变**（增删 window、renumber、或进程退出导致 window 自动关闭后），硬编码 `ar-dev:0` 作 target 会在「list 完到 send-keys 之间」的任意时刻失效，报 `can't find window: 0`。因此：

1. **用 window name 作 target，不用 index**。name（`api`/`web`）稳定；启动 window 时务必用 `tmux new-window -n api` / `-n web` 固定 name。

2. **send-keys 前即时确认 target 存在**，不要复用几步之前的旧 list 结果（中间隔真实等待时间，状态可能已变）：

   ```bash
   tmux list-windows -t ar-dev -F '#{window_name} #{pane_current_command}'
   # 应能看到 api / web
   ```

3. **确认存在后按 name 发 C-c 再重启**：

   ```bash
   tmux send-keys -t ar-dev:api C-c
   sleep 2
   tmux send-keys -t ar-dev:api 'bun run --filter @agents-remote/api dev' Enter
   ```

4. **target window 不存在时（进程已退出 → window 被 `remain-on-exit off` 自动关闭）→ 用 `new-window` 重建，不要 kill 任何东西**：

   ```bash
   tmux new-window -t ar-dev -n api -c /home/deploy/workspace/agents-remote \
     'bun run --filter @agents-remote/api dev'
   ```

   `send-keys` 报 `can't find window: api` 本身是无害信号——它说明 tmux 找不到 target 而拒绝发 keys，**没有**真正发出去；此时进程早已不在，直接走 `new-window`。

## 关闭 / 清理孤儿

进程必须在 tmux 内管理。如果某进程变孤儿（`PPID=1`，tmux 外残留），只能 `kill <pid>` 清理后再在 tmux 内重启：

```bash
ps -ef | grep -E 'vite|bun' | grep -v grep
kill <pid>
```

> ⚠️ 这里 `kill` 的是**孤儿服务进程**（命令列为 `bun run src/index.ts` / `vite` 等）。**绝不 kill `tmux` server**——它的命令列为 `tmux: server`（`/usr/bin/tmux`），杀掉会让 `ar-dev` 等所有 session 连同 web/api 一起没。拿不准时先看命令列再 kill。

按 `ar-<purpose>` 命名 tmux session（`ar-dev`、`ar-e2e`、`ar-debug`），便于 `tmux list-sessions | grep '^ar-'` 搜索与复用。

## 验证 PWA 行为

只有 prod build（preview）下 SW 才真实工作。验证项：

- Application → Service Workers：`sw.js` 已注册、activated。
- Application → Cache Storage：`workbox-precache-v2` 含 `index.html` + 所有 chunk + 图标 + 字体（23 entries）。
- reload 应瞬开（index.html + 资源走 precache，无网络等待）。
- 后台放置较长时间后回前台：无卡顿，直接显示深色背景 → React 渲染。

dev 模式（`vite` dev server）下不要验收这些——SW 行为不代表生产。
