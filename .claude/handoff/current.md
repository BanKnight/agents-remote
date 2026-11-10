# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-10 16:10（**地址栏批 `6cf6375` + SW reload 拦截 `6aabf38` + 桌面
> PWA 跳出 `a0cd822` + 地址跟随补全 `5caa354`**；14 commit 已 push 至 `5003fc8`，其后
> 2 commit（a0cd822/2f7eda7 已 push）+ 5caa354 待确认）

## 一句话状态

用户反馈「非 PWA 可以自由输地址，预览层地址栏为什么不能改」→ 地址栏批交付（`6cf6375`）：
点地址变输入框（Enter 提交 / Esc·blur 取消，非 / 开头按站点根相对解析），iframe 内点
站内链接顶栏地址跟随（同源读 contentWindow.location），导航地址是预览层内部 state
（关闭即弃重开回入口）。不 clamp 路径——404 / app shell 被 frame-ancestors 'none'
拒的失败态自然呈现，与 CSP 语义自洽。探针 10/10 + 全门禁绿。汇报页同步更新（⑤ 条目）。
追加 `6aabf38`：桌面 PWA「什么都不做自动刷回工作台」报障根因 = vite-plugin-pwa
autoUpdate 默认 activated(isUpdate) → 整页 reload；main.tsx 传空 onNeedReload 拦截，
语义改「发版静默生效」（precache 照常更新、页面不打断、下次刷新用新版）。

## 本 session 焦点

### 关键发现（不可丢）

- **respawn-pane -k（SIGKILL）不杀 api spawn 的 CLI 子进程**：api 瞬间死来不及清理，
  CLI 变孤儿存活——本会话在 2026-11-10 重启中存活并直接完成验证闭环（此前「api 热重
  启杀 4 个 CLI 会话」的代价模型只适用 watch 热重启/优雅退出路径；SIGKILL 路径 CLI
  活，但不可依赖，改 api 前仍须 handoff save + 用户确认）。
- **curl -sI（HEAD）不走 pages serve 分支**：serve 面 GET-only——验 CSP 头必须 GET
  （`curl -s -D - -o /dev/null`）。
- **dev api 不挂 WEB_DIST_DIR**：43011 `/` = 404 JSON 是预期，'none' 分支由单测保障。
- **探针 record() 漏传 ok 参数 = 无条件 FAIL**（本批 2g 假挂实锤——waitForFunction
  其实过了，record("name") 没 ok 值恒 falsy）；span.font-mono 选择器过时（地址栏已
  改 button[title^='http']）。
- **vite-plugin-pwa autoUpdate 的自动 reload**（`6aabf38` 治理）：registerSW 默认新 SW
  activated(isUpdate) → 整页 reload；SW 排查链 = curl /p/ 无 redirect（排除 serve 层）
  → sw.ts denylist `/^\/p\//` 在场（排除 navigateFallback 劫持）→ register.js 源码
  实锤。onNeedReload 空回调拦截（1.3.0 register.js 原生回调）；防回归断言在
  pwa-manifest.test.ts。SW 行为探针结构性测不出（Playwright 全新 context 无持久 SW）。
- probe-fab.mjs 5 处过期 FAIL（drawer/header 新建入口早前 UI 演进已迁移）——待拍板
  重构或退役。

### 进度

- ✅ standalone gate 批（`e5e4839`+`bb4b2f6`）+ CSP 批（`009a3fc`）+ 地址栏批（`6cf6375`）
- ✅ 汇报页 site/index.html → `/p/agents-remote/` 200（随开发滚动更新，⑤ 条目已加）

## 下一步

1. **push 待确认**：`2f7eda7..5caa354` 共 1 commit（地址跟随补全批）。
2. **真机验收（交用户）**：iOS PWA 点行 → 预览层（地址含域名、可点编辑导航、iframe
   内导航地址跟随、无「新窗口」钮、关闭回工作台回入口页）；桌面点行 → 原生新标签；
   FAB ＋ 添加根双端。
3. probe-fab.mjs 过期断言（5 FAIL）重构 / 退役待拍板。
4. wiki 格式对齐批（排队）→ wiki Quartz（先 /check-deps）。

## 易丢的关键上下文

- 重启纪律：respawn-pane -k 目标 window（name=api/web），绝不 kill tmux server。
- 探针跑法 `bun scripts/X.mjs`（repo 根，43011/43012）；bun test 2G / e2e 4G cgroup。
- web=prod build + watch（tmux `ar-dev:web`）；改 vite.config 必须 respawn。
- site/（pages 根内容）untracked 不入库——汇报页属运行时内容物，随开发滚动更新。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
