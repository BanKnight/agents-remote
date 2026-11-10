# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-10 15:13（**CSP frame-ancestors 落地中**——用户已授权重启 api；
> 本会话将随 api 热重启死亡，本文件是交接锚点）

## 一句话状态

standalone gate 批（`e5e4839`+`bb4b2f6`）已交付（双 reviewer 无 P0/P1，P2 全消化）。
用户指示「先重启吧」= 授权重启 api 落地上批遗留的 **CSP frame-ancestors**（security
review P2）：`/p/` serve 加 `'self'`（防外站嵌入，预览层同源放行）+ app shell 加
`'none'`（clickjacking）。改动正在工作区，**未提交**；api 改动落盘瞬间 bun --watch
热重启会杀掉本会话（预期内）——下个会话按「下一步」接手。

## 本 session 焦点

### CSP 改动设计（已定稿，正在/已落盘）

- **`api/src/index.ts`**：模块级常量 `PAGES_SERVE_CSP_HEADERS = { "Content-Security-Policy": "frame-ancestors 'self'" }`（pagesServeErrorPage 上方）——spread 进 5 处：401 分支（:264 附近）、304 分支、200 serve 分支（:272 附近）、`pagesServeErrorResponse` 四分支（:2339-2362，整函数替换）。
- **`api/src/static-web.ts`**：serveFile 里 `file.type.startsWith("text/html")` 时加 `frame-ancestors 'none'`（app shell 唯一 HTML 面 = index.html / SPA fallback；资产非文档不加；notFound 404 空响应不动）。
- **`web/vite.config.ts`**：新 plugin `previewHtmlFrameAncestors()`（previewBadAsset404 旁）——preview 中间件对 HTML 面（无扩展名路径 = SPA fallback / `.html` 结尾）`res.setHeader("Content-Security-Policy", "frame-ancestors 'none'")`；`/api`、`/p/` 代理前缀跳过（`/p/` 的 CSP 由 api 出 `'self'`）；只挂 preview（dev 逃生口不挂，对齐 previewBadAsset404）。
- **测试**：`static-web.test.ts` 根路径测试补 `'none'` 断言 + /assets 测试补 `toBeNull()` 负向断言；`index.test.ts` pages serve 测试（:877 附近）补 `'self'` 断言。既有断言全是 `headers.get` 单头形态，加头不破坏。

### 进度

- ✅ standalone gate 批全链（`e5e4839` + `bb4b2f6` + handoff `b65e2d0`）——上一节记档保留
- 🔄 CSP 改动落盘（本会话死亡前最后一组并行 Edit；vite.config 已先改——它不杀会话）

## 下一步（下个会话按序执行）

1. **`git status` / `git diff` 核对改动是否全部落盘**（并行 Edit 与 SIGTERM 有竞态，可能个别文件没写上）——预期 5 文件：api/src/index.ts、api/src/static-web.ts、api/src/static-web.test.ts、api/src/index.test.ts、web/vite.config.ts。缺哪个按上方设计补。
2. **respawn api + web**（标准重启 = respawn-pane -k；改了 vite.config 必须 respawn web，watch 只重 build 不重 config）：
   ```bash
   tmux respawn-pane -k -t ar-dev:api 'bun run --filter @agents-remote/api dev'
   tmux respawn-pane -k -t ar-dev:web 'scripts/ar-dev-web.sh'
   ```
3. **验证三个头**（curl 硬数据）：
   - `curl -sI localhost:43011/p/agents-remote/ | grep -i content-security` → `frame-ancestors 'self'`
   - `curl -sI localhost:43012/p/agents-remote/ | grep -i content-security` → `'self'`（proxy 透传）
   - `curl -sI localhost:43012/ | grep -i content-security` → `'none'`
   - 预览层 iframe 同源加载不受影响（'self' 放行）——跑 `bun scripts/probe-pages-anchor-row.mjs` 回归 7/7
4. **跑全门禁**（api 代码改动 = 全门禁：format/lint/typecheck/test；format 若因折行差异挂 → `bun run format` 范围脚本修复）→ **commit**（消息主题：`feat(api,web): CSP frame-ancestors——/p/ 'self' 防外站嵌入 + app shell 'none' 防clickjacking`，尾行 Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>）→ 更新本 handoff。
5. **push 待确认**（累计 `50f8e86..` 全部，届时数 git log）。
6. probe-fab.mjs 5 处过期 FAIL（drawer/header 新建入口在早前 UI 演进已迁移，探针没跟上）——待用户拍板重构或退役。
7. wiki 格式对齐批（排队）→ wiki Quartz（先 /check-deps）。

## 易丢的关键上下文

- **重启纪律**：只 respawn-pane -k 目标 window（name=api/web），绝不 kill tmux server；runbook = docs/runbooks/dev-services.md。
- 重启 api 杀 4 个活动 CLI 会话——用户 2026-11-10 15:13 前后明确授权（「先重启吧」）。
- 探针跑法 `bun scripts/X.mjs`（repo 根，43011/43012）；bun test 2G / e2e 4G cgroup。
- web=prod build + watch（tmux `ar-dev:web`）；**改 vite.config 必须 respawn**。
- 本会话 CLI 由 api spawn——**改 api 文件 = watch 热重启 = 本会话死亡**（本次已用此机制完成重启，今后改 api 前必须先 handoff save + 用户确认）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
