# Dev 环境纪律

> 来源：原 CLAUDE.md / docs/project.md 中开发态规则的操性提炼（2026-09-19 harness 改造）；完整流程见 `docs/runbooks/dev-services.md`。

## 常驻 dev 服务

- **固定端口**：API `43011`、Web `43012`；不要反复启动新端口验证问题。
- **web 长期跑生产构建，api 跑 dev**：web 的 SW precache / navigateFallback 只在 prod build 真实存在；启动 web 用 `scripts/ar-dev-web.sh`（`vite preview` + `build --watch`），api 用 `bun run --filter @agents-remote/api dev`。
- **tmux 命名**：开发/验证用 tmux session 统一 `ar-<purpose>` 命名（如 `ar-dev`、`ar-e2e`、`ar-debug`）；不要用 `agents-remote-*`，便于 `tmux list-sessions | grep '^ar-'` 搜索复用。
- **进程必须在 tmux 内启动**：外面跑会变孤儿（PPID=1），只能 `kill` 再在 tmux 内重启；重启前先读 `docs/runbooks/dev-services.md`（标准重启 = `respawn-pane -k`）。
- **kill 前确认归属**：同机多项目跑形态相似的 dev 进程，必须确认 cwd/端口归属本项目，不能仅凭命令形态 + PPID=1 就当孤儿清理。

## 常见坑

- **bun --watch / vite build --watch 偶发不重启**：dev 进程跑旧代码但能响应；改源码后行为像没改时先查 `ps etime` vs 源码 mtime。**注意 `ps` 里查到的常是 tmux wrapper（`tmux new-session ... bun run dev`，etime 以 wrapper 启动起算，不反映 bun 子进程是否热重载）**——etime 新≠代码新。判旧代码要用行为标记（argv 内容、新日志行）或直接 `respawn-pane -k` 重启后再验证（2026-10-16 实证：--settings 断链修复落地后探针假 FAIL，根因是 api 跑旧 argv，etime 检查被 wrapper 误导）。**产物/真机疑似旧代码时，第一动作 = 直接 `respawn-pane -k` 全量重建**——watch 假死时 `touch main.tsx` 无效，长轮询验证 touch 是纯浪费；touch 仅限 watch 确认存活但漏 emit 个别 chunk 的兜底（2026-10-25 实证：web watch 假死致 138bf39 起新代码从未进产物，用户真机「多图一直转圈」即旧并发版症状；验证产物特征串别只扫 index.html 引用的 entry，懒加载 chunk 不在其中，`rg "特征串" web/dist/` 直查最可靠）。
- **vite build --watch 漏 CSS/JS chunk 落盘**：治本方案与交付 checklist 见 `frontend-notes.md` §10（含 JS 变体：改源码后行为像没改先 touch main.tsx 完整 rebuild，再排查）；改 web 包内文件后必跑 `node scripts/ar-verify-css.mjs`（见 `verification.md`）。
- **测试内存上限**：跑 `bun test` 须限内存 ≤2G（systemd-run/ulimit）；renderHook 绝不进 waitFor 回调。
- **e2e 内存限制用 cgroup 不用 ulimit -v**：`bun run e2e` 自起 vite（rolldown WASM 要 reserve 数 GB 虚拟地址），`ulimit -v` 2G/4G 都会 `WebAssembly.instantiate` OOM；用 `systemd-run --scope --user -p MemoryMax=2G bun run e2e`（2026-09-20 实测 29/29 绿）。
- **验证用测试项目**：验证别在 agents-remote 正式项目创建 session，用 `PROJECTS_ROOT` 下的 test 项目。
