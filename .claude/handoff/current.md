# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-10 15:40（**CSP 批 `009a3fc` 落地 + 进度汇报页上 pages**；
> push 待确认——`50f8e86..009a3fc` 共 9 commit）

## 一句话状态

CSP frame-ancestors 已落地并实证（`/p/` 'self' 直连+proxy 双验、preview shell 'none'
curl 实证、static-web 生产形态单测保障；probe 回归 7/7 证预览层不受影响），api+web
已 respawn 生效（`009a3fc`）。进度汇报页（site/index.html，双主题单文件）已放
PROJECTS_ROOT/agents-remote/site/ → `/p/agents-remote/` 公开 serve 200——用户点
pages 行即可看到（同时也是 pages 功能测试内容，untracked 运行时内容不入库）。

## 本 session 焦点

### 关键发现（不可丢）

- **respawn-pane -k（SIGKILL）不杀 api spawn 的 CLI 子进程**：api 瞬间死来不及清理，
  CLI 变孤儿存活——本会话在 2026-11-10 重启中存活并直接完成验证闭环（此前「api 热重
  启杀 4 个 CLI 会话」的代价模型只适用 watch 热重启/优雅退出路径；SIGKILL 路径 CLI
  活，但不可依赖，改 api 前仍须 handoff save + 用户确认）。
- **curl -sI（HEAD）不走 pages serve 分支**：serve 面 GET-only（index.ts 分支条件
  `request.method === "GET"`）——HEAD 落到 /api JSON 面，验 CSP 头必须用 GET
  （`curl -s -D - -o /dev/null`）。
- **dev api 不挂 WEB_DIST_DIR**：43011 `/` = 404 JSON 是预期，static-web 只在生产
  形态挂——'none' 分支由单测断言保障，dev 不可见非缺陷。
- probe-fab.mjs 5 处过期 FAIL（drawer/header 新建入口早前 UI 演进已迁移）——待拍板
  重构或退役。

### 进度

- ✅ standalone gate 批（`e5e4839` + `bb4b2f6`）+ CSP 批（`009a3fc`）全门禁绿
- ✅ 进度汇报页 site/index.html → `/p/agents-remote/` 200（用户测试 pages 用）

## 下一步

1. **push 待确认**：`50f8e86..009a3fc` 共 9 commit。
2. **真机验收（交用户）**：iOS PWA 点行 → 预览层（地址含域名、无「新窗口」钮、关闭
   回工作台、无蓝环）；桌面点行 → 原生新标签；FAB ＋ 添加根双端；pages 里看汇报页。
3. probe-fab.mjs 过期断言（5 FAIL）重构 / 退役待拍板。
4. wiki 格式对齐批（排队）→ wiki Quartz（先 /check-deps）。

## 易丢的关键上下文

- 重启纪律：respawn-pane -k 目标 window（name=api/web），绝不 kill tmux server。
- 探针跑法 `bun scripts/X.mjs`（repo 根，43011/43012）；bun test 2G / e2e 4G cgroup。
- web=prod build + watch（tmux `ar-dev:web`）；改 vite.config 必须 respawn。
- site/（pages 根内容）untracked 不入库——汇报页属运行时内容物。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
