# Design Overview

本文件汇总 `setup-e2e-quality-baseline` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：setup-e2e-quality-baseline
- 所属 version：v0.3-session-runtime-quality

## 输入依据

- intents：用户希望尽早建立自动化 E2E 质量基线，覆盖 `web + api + session runtime` 的核心联通；第一条 smoke path 覆盖登录、Project 列表、进入 Project、创建 Terminal Session、WebSocket/终端真实交互；Terminal 路径使用真实 `tmux/shell`，Agent 真实 Claude/Codex CLI 可后置或使用可控替身。
- specs：`specs/e2e-quality-baseline/spec.md`
- 相关长期 docs：
  - `docs/project.md`
  - `docs/specs/private-access-auth/spec.md`
  - `docs/specs/project-console-navigation/spec.md`
  - `docs/specs/session-runtime/spec.md`
  - `docs/specs/mobile-session-interaction/spec.md`
  - `docs/design/session-runtime-boundaries.md`
  - `docs/design/frontend-stack.md`
- 技术资料核对：`technology-research` 读取 testing / Bun-Vite baseline，并用 Context7 核对 Playwright 与 Bun 官方资料；2026-05-25 通过 npm metadata 核对 `@playwright/test` 当前版本与发布时间。

## 设计范围

### 本次覆盖

- 建立可重复运行的第一条 E2E baseline，聚焦登录 → Project → Terminal Session → Session detail → WebSocket/终端输入输出。
- E2E 测试环境准备：临时 `PROJECTS_ROOT`、临时 runtime dir、测试密码、独立端口、api/web dev services。
- 浏览器驱动与用户路径断言：登录、Project 列表/console、创建 Terminal Session、打开 detail、等待 connected、发送确定性输入、观察输出。
- 失败 evidence：Playwright screenshot/trace/test-results，加上 api/web 服务日志和必要 session context。
- 项目脚本入口：提供可持续的 `e2e` 命令，供本地和后续 CI 复用。

### 本次不覆盖

- 不把所有用户路径都纳入 E2E；只建立高价值 smoke baseline。
- 不依赖真实 Claude/Codex CLI 做 Agent E2E 通过条件。
- 不引入完整 CI pipeline、并行矩阵、跨浏览器矩阵或 visual regression。
- 不替代 unit/integration/type/lint/build 质量门禁。
- 不把手动 mobile/PWA 真机手感测试自动化为本 change 的必需项。

## 子域选择

| 子域           | 是否创建 | 原因                                                                      |
| -------------- | -------- | ------------------------------------------------------------------------- |
| product        | 否       | 用户路径和验收场景已由 intents/spec 明确，设计重点不在产品流程扩展。      |
| ui-ux          | 否       | 本 change 不新增用户可见 UI，只驱动现有登录/Project/Session detail 路径。 |
| frontend       | 否       | 前端实现变化主要是测试接入，不改变 route/component/state 设计。           |
| architecture   | 是       | 需要明确 E2E harness、工具选型、环境编排、模块边界和依赖安全。            |
| api            | 否       | 不新增或修改 HTTP/WS API；只通过现有 API 和浏览器路径验证。               |
| data           | 否       | 不新增持久数据模型；测试使用临时目录和 runtime dir。                      |
| business-rules | 否       | 无新增业务规则；质量基线规则在 architecture/error-handling 覆盖。         |
| error-handling | 是       | 需要明确失败 evidence、依赖缺失、超时、服务日志和报告策略。               |
| risks          | 否       | 风险集中在 architecture/error-handling，暂不需要单独风险文件。            |

## 总体设计结论

- 第一轮 E2E baseline 采用 Playwright Test 作为浏览器 E2E harness；使用 Bun 脚本准备临时环境、启动/清理 api/web 进程，并把 Playwright 作为可持续质量入口接入项目脚本。
- Terminal runtime path 必须使用真实 `tmux/shell` 与 WebSocket stream，不用 mock 替代；Agent 真实 CLI 不作为第一条 baseline 的通过条件。
- Playwright 负责 browser automation、web-first assertions、failure screenshots/traces/test-results；Bun 负责脚本和进程编排，避免把环境准备逻辑塞进测试断言里。
- E2E 默认只跑 Chromium/mobile-or-desktop 单项目 smoke，后续再扩展多浏览器、mobile viewport、Agent fake provider 或 CI artifact 上传。

## 关键决策

- 选择 `@playwright/test`：官方支持 `webServer`、baseURL、screenshots/traces/videos/test-results、browser automation 和 auto-wait，契合用户要求的登录/Project/Terminal detail 浏览器路径与失败 artifacts。
- 不选择纯 Bun + fetch/WebSocket 作为唯一 baseline：它可验证 API/stream 协议，但无法覆盖真实浏览器登录、路由、按钮交互、截图和用户路径 evidence。
- 不继续依赖 `agent-browser`/手动 smoke 作为长期 baseline：它适合交互式验证和临时调试，但不是项目内可提交、可重复、可 CI 化的测试入口。
- 新增 npm dev dependency 是合理的：`@playwright/test` 当前版本 `1.60.0` 发布于 2026-05-11，距离 2026-05-25 超过 7 天；包源为 Microsoft Playwright，license Apache-2.0。若安装时 lockfile 解析到更新版本，必须重新检查 7 天规则。

## 开放问题

- 后续 CI 运行环境是否预装 Playwright 浏览器依赖，还是由 install/setup 步骤安装 Chromium。
- E2E 默认 viewport 使用桌面还是手机；第一条 smoke 可优先桌面稳定路径，移动端专项可在后续扩展。
- Agent fake provider 是否在本 change 中预留测试 seam，还是留给后续 Agent provider E2E change。

## 后续沉淀候选

- `docs/specs/e2e-quality-baseline/spec.md`：长期 E2E baseline 行为契约。
- `docs/architecture/e2e-quality-baseline.md` 或 `docs/runbooks/e2e-quality-baseline.md`：E2E harness、环境变量、artifact 和故障定位规则。
