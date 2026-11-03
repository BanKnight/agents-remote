# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-03（TanStack 三库升级 `e3bfc65` + e2e 顺序依赖修复 `98675ef`，已 push）

## 一句话状态

**TanStack 三库维护升级完成并推送**：调研定案不迁 TanStack Start 1.0（全栈框架，
与本项目 SPA + 独立 Bun API 架构不匹配，优势全部吃不到）——只升 Router/Query/Virtual
stable 线（全部 ≥7 天发布版本）。升级后全套验证踩出并根治一个 e2e 顺序依赖缺陷
（mcp git 卡测试，与升级无关），42/42 绿。ar-dev-web 已 respawn 吃到新依赖。

## 本 session 焦点

### 关键决策（不可丢）

- **不迁 TanStack Start 的论据**：Start = Vite+Nitro 全栈框架（SSR/server functions），
  本项目 = 纯 SPA（vite prod build+preview :43012）+ 独立 Bun API（:43011）。优势对照
  逐条不成立（无 SEO 诉求、server functions 的痛点已被 shared 类型契约解决、部署现状
  更简、PWA/SW 策略与验证基建都要重做）。我们恰是 Start 官方尊重的 SPA 形态。
- **供应链判定**（今天 2026-11-03）：router 1.170.46（10-22 ✓ 直接升）；query latest
  5.105.3 昨天发布 <7 天 → 取 5.105.0（10-26 ✓）；virtual latest 3.14.25 <7 天 → 取
  3.14.23（10-26 ✓）且**精确版本钉死**——`^3.14.23` 会被 bun 解析到 <7 天的 3.14.25。
- **e2e 顺序依赖缺陷（升级无关，实证归因）**：mcp-app-card「stale → real refresh」
  两轮全套连跑挂、单跑绿。失败值「1 个文件变更」是**另一个真实值**而非 stale 值——
  git-diff「提交」用例（#27）把 demo 仓库构造态 commit 掉，真实 listDiff 只剩
  notes.txt untracked。刷新链路全程正常。修复 = 测试开头清残迹（checkout/reset）+
  重建 3 文件形态（README worktree + index.ts staged + 遗留 notes.txt untracked），
  断言与执行序解耦；run-e2e.ts 加 `E2E_PROJECTS_ROOT` seam。
- **e2e 内存上限 2G → 4G**（dev-environment.md 已更新）：42 测试规模下 2G 被顶爆，
  journal `2G memory peak` → OOM kill → systemd 停 scope 给余下进程发 SIGTERM
  （bun 报「Polite quit request」）——**e2e 中途集体 SIGTERM 先查 OOM journal，
  不是 timeout**。9-20 的 2G 经验值随测试规模过期。

### 进度

- ✅ TanStack 调研 + 三库升级 `e3bfc65`（web/package.json + bun.lock；全门禁绿）
- ✅ e2e 顺序依赖修复 `98675ef`（run-e2e.ts + mcp-app-card.spec.ts + dev-environment.md；
  修复后全套 42/42 绿）
- ✅ ar-dev-web respawn（新依赖进产物；CSS 硬闸 + 43012 text/css 验证通过）
- ✅ 两 commit 已 push（`6ff4eb2..98675ef`）
- ✅ /handoff save（本次）

### 阻塞 / 风险

- 无阻塞。升级后 bundle 由 e2e 全链覆盖；Router 5 个月 patch 跨度，用户日常使用中
  如遇路由异常优先怀疑此处（探针/e2e 已全绿，非待验证项）。
- swap 又近满（511Mi/512Mi）——上次治理后 208MB，当日又满；未再深查构成（本批
  e2e 连跑数轮 chromium 压力是主要嫌疑），下次治理批次处理。

## 下一步

1. 遗留：v1.7 真机验证清单反馈（含平板长按探针盲区）；wiki/ 目录 git 归属；
   swap 扩容 2G（仅建议，未拍板）+ swap 构成复查。
2. 真机验证状态：⚙（agent TUI 模式 composer 配置按钮）与通知自愈两批
   （`d3eb1d4` + `630db9b`）**用户均已确认通过**，无待验证项。

## 易丢的关键上下文

- **e2e 内存跑法**：`systemd-run --scope --user -p MemoryMax=4G bun run e2e`
  （勿 ulimit -v，rolldown WASM 会 OOM；前台跑会撞 Bash 工具 600s 超时——
  42 测试 ~6.5 分钟临界，用后台跑）。
- **测试间共享 demo 仓库**：demo 是全套 e2e 共享的文件系统单例，凡依赖 git 状态
  的断言必须自建现场，不依赖初始构造态（mcp-app-card git 卡是先例）。
- **探针/依赖升级验证路径**：typecheck 三包 → 全量 test（2G cgroup）→ e2e
  （4G cgroup 后台）→ respawn ar-dev-web → ar-verify-css + curl content-type。
- 单测限内存 2G（峰值 ~500M）继续有效；pre-commit hook 内已自带。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
