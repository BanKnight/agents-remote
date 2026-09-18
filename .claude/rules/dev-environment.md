# Dev 环境纪律

> 来源：原 CLAUDE.md / docs/project.md 中开发态规则的操性提炼（2026-09-19 harness 改造）；完整流程见 `docs/runbooks/dev-services.md`。

## 常驻 dev 服务

- **固定端口**：API `43011`、Web `43012`；不要反复启动新端口验证问题。
- **web 长期跑生产构建，api 跑 dev**：web 的 SW precache / navigateFallback 只在 prod build 真实存在；启动 web 用 `scripts/ar-dev-web.sh`（`vite preview` + `build --watch`），api 用 `bun run --filter @agents-remote/api dev`。
- **tmux 命名**：开发/验证用 tmux session 统一 `ar-<purpose>` 命名（如 `ar-dev`、`ar-e2e`、`ar-debug`）；不要用 `agents-remote-*`，便于 `tmux list-sessions | grep '^ar-'` 搜索复用。
- **进程必须在 tmux 内启动**：外面跑会变孤儿（PPID=1），只能 `kill` 再在 tmux 内重启；重启前先读 `docs/runbooks/dev-services.md`（标准重启 = `respawn-pane -k`）。
- **kill 前确认归属**：同机多项目跑形态相似的 dev 进程，必须确认 cwd/端口归属本项目，不能仅凭命令形态 + PPID=1 就当孤儿清理。

## 常见坑

- **bun --watch / vite build --watch 偶发不重启**：dev 进程跑旧代码但能响应；改源码后行为像没改时先查 `ps etime` vs 源码 mtime。
- **vite build --watch 漏 CSS 落盘**：治本方案与交付 checklist 见 `frontend-notes.md` §10；改 web 包内文件后必跑 `node scripts/ar-verify-css.mjs`（见 `verification.md`）。
- **测试内存上限**：跑 `bun test` 须限内存 ≤2G（systemd-run/ulimit）；renderHook 绝不进 waitFor 回调。
- **验证用测试项目**：验证别在 agents-remote 正式项目创建 session，用 `PROJECTS_ROOT` 下的 test 项目。
