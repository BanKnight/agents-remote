# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：build-responsive-pwa-console-shell
- Roadmap 对应项：v0.2-project-console-shell / 响应式 PWA 控制台外壳
- 验证对象：Project list/create/enter、Project console shell、Agent 默认焦点、Terminal/Git/Files 占位、PWA manifest/icons/meta、测试与浏览器验证证据
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-25
- 验证范围：specs、design、plan/tasks 与当前实现 diff 的一致性；自动化测试；tmux 本地服务；`agent-browser` 桌面/移动浏览器路径；PWA manifest 和 icon 静态资源。
- 使用 harness：workspace quality commands、Bun unit tests、HTTP/curl integration、tmux dev services、agent-browser browser E2E、screenshot artifacts。
- 本轮结论：通过；无 CRITICAL/WARNING。
- 后续动作：进入 `distill-change`。

## Harness 清单

- 名称：Workspace quality commands
  类型：format/lint/typecheck/unit/build
  覆盖承诺：代码格式、静态质量、类型安全、自动化测试和生产构建。
  执行方式：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`
  结果：通过；api 41 tests、shared 2 tests、web 14 tests，build 成功。
  证据：命令输出记录于本轮对话；`tasks.md` 3.2 已记录。

- 名称：Frontend model and manifest tests
  类型：Bun unit tests
  覆盖承诺：Project URL-sensitive 名称编码、Agent 默认焦点、Terminal/Git/Files 占位、runtime input disabled、PWA manifest 必备字段和 192/512 icons。
  执行方式：`bun run test` 中的 `web/src/routes/console-model.test.ts`、`web/src/routes/pwa-manifest.test.ts`、`web/src/api/client.test.ts`
  结果：通过。
  证据：`web/src/routes/console-model.test.ts:12`、`web/src/routes/console-model.test.ts:18`、`web/src/routes/console-model.test.ts:24`、`web/src/routes/console-model.test.ts:31`、`web/src/routes/pwa-manifest.test.ts:17`、`web/src/routes/pwa-manifest.test.ts:27`、`web/src/api/client.test.ts:10`、`web/src/api/client.test.ts:29`、`web/src/api/client.test.ts:74`。

- 名称：tmux + HTTP integration
  类型：integration / CLI
  覆盖承诺：API 可认证访问 Project list/detail；web dev proxy 能通过 cookie 访问 Project API；manifest 和 icons 可被 web 服务提供。
  执行方式：tmux sessions `agents-remote-api-shell`、`agents-remote-web-shell`；`curl` 登录、Project list/detail、web proxy、manifest、icons。
  结果：通过。
  证据：API health 返回 `{"ok":true,"service":"api"}`；Project detail 验证 `hello world 中文`；`/manifest.webmanifest` 返回 standalone manifest；icons HTTP 200 image/png。

- 名称：agent-browser desktop/mobile E2E
  类型：browser E2E / screenshot
  覆盖承诺：单密码登录 gate、Project 列表、进入 URL-sensitive Project、Agent 默认焦点、Terminal coming soon 占位、底部 disabled runtime input、桌面和移动视口。
  执行方式：`agent-browser --session agents-remote-shell ... open/fill/click/snapshot/screenshot/eval`
  结果：通过。
  证据：`artifacts/console-desktop.png`（1280x900）、`artifacts/console-mobile.png`（390x844）；浏览器 eval 返回 manifest link `/manifest.webmanifest` 和 theme color `#020617`。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| `specs/pwa-console-shell/spec.md` | 第一轮 PWA 可安装外壳，standalone、theme/icons，不要求离线 | `web/index.html:6`、`web/index.html:15`、`web/public/manifest.webmanifest:2`、`web/public/manifest.webmanifest:7`、`web/public/manifest.webmanifest:8`、`web/public/manifest.webmanifest:11` | `web/src/routes/pwa-manifest.test.ts:17`、`web/src/routes/pwa-manifest.test.ts:27`；curl manifest/icons；agent-browser eval manifest/theme | 通过 |
| `specs/pwa-console-shell/spec.md` | 移动端优先、深色-only 控制台，桌面宽屏可用 | `web/src/routes/HomeRoute.tsx:7`、`web/src/routes/ProjectConsoleRoute.tsx:15` | agent-browser desktop/mobile snapshots；`artifacts/console-desktop.png`、`artifacts/console-mobile.png` | 通过 |
| `specs/project-console-navigation/spec.md` | 已认证用户从 Project 列表进入 Project-scoped console 并保留 Project 上下文 | `web/src/routes/AuthGate.tsx:5`、`web/src/routes/HomeRoute.tsx:7`、`web/src/routes/ProjectConsoleRoute.tsx:15` | agent-browser 登录、Project 列表、点击 `hello world 中文` 进入 console；curl web proxy auth flow | 通过 |
| `specs/project-console-navigation/spec.md` | Project URL-sensitive 字符可表达 | `web/src/api/client.ts:60`、`web/src/routes/console-model.ts:42` | `web/src/api/client.test.ts:74`、`web/src/routes/console-model.test.ts:12`；curl detail `hello%20world%20%E4%B8%AD%E6%96%87` | 通过 |
| `specs/project-console-navigation/spec.md` | Agent Sessions 是 Project console 默认焦点 | `web/src/routes/console-model.ts:12`、`web/src/routes/ProjectConsoleRoute.tsx:15` | `web/src/routes/console-model.test.ts:18`；agent-browser snapshot 显示 Agent Sessions 默认焦点 | 通过 |
| `specs/project-console-navigation/spec.md` | Terminal/Git/Files 为辅助入口且未实现能力只展示占位 | `web/src/routes/console-model.ts:12`、`web/src/routes/ProjectConsoleRoute.tsx:225` | `web/src/routes/console-model.test.ts:24`；agent-browser Terminal click 文本显示 Placeholder only / no file Git sessions | 通过 |
| `specs/project-console-navigation/spec.md` | 底部输入 affordance 不发送真实 runtime 输入 | `web/src/routes/console-model.ts:58`、`web/src/routes/ProjectConsoleRoute.tsx:160` | `web/src/routes/console-model.test.ts:31`；agent-browser 文本显示 Disabled / no Agent or Terminal input is sent | 通过 |
| `tasks.md` | 所有实现任务完成并有验证证据 | `tasks.md:14`、`tasks.md:23`、`tasks.md:34`、`tasks.md:43`、`tasks.md:52`、`tasks.md:63`、`tasks.md:72`、`tasks.md:81`、`tasks.md:92` | grep 无未完成 `- [ ]`；quality commands 和 agent-browser 证据 | 通过 |

## Delta 验证

- Scope 内变更：`web` 前端路由、登录 gate、Project list/detail/create UI、Project console shell、Jotai UI state、PWA static assets、前端 tests；change workflow artifacts 和 screenshots。
- Scope 外变更：无 API runtime、session runtime、Files/Git 写操作、service worker 或新增 npm 依赖。
- 未被 spec/design 支撑的新行为：补充了登录 gate，属于长期 `private-access-auth` spec 中“未认证用户打开 Web/PWA 入口看到单密码登录入口”的既有约束，且是访问受保护 Project API 的必要外壳，不视为 scope 外扩张。
- 风险：service worker/offline 未实现，符合 spec/design 非目标；真机安装未做，但浏览器 manifest/icons/eval 和 desktop/mobile E2E 已覆盖本轮 installable shell 证据。
- 结论：通过。

## Scenario 验证

- 场景：单密码登录后看到 Project 列表
  路径类型：正常 / 用户可见
  验证方式：agent-browser open/fill/click/snapshot
  证据：snapshot 显示 Project control plane、Projects、`hello world 中文`、Create or adopt a Project
  结果：通过

- 场景：Project 名称包含空格和中文时进入 Project console
  路径类型：边界
  验证方式：curl encoded detail + agent-browser 点击 Project link
  证据：curl `/api/projects/hello%20world%20%E4%B8%AD%E6%96%87` 返回正确 project；agent-browser URL 为 encoded Project path
  结果：通过

- 场景：Project console 默认聚焦 Agent Sessions 且无 runtime 不伪造会话
  路径类型：正常 / 用户可见
  验证方式：agent-browser snapshot/text + unit tests
  证据：snapshot 显示 Agent Sessions、No runtime connected、No Agent Sessions yet；`console-model.test.ts`
  结果：通过

- 场景：Terminal/Git/Files 尚未实现时只展示占位，不执行写操作或 runtime 操作
  路径类型：用户可见 / 失败防护
  验证方式：agent-browser 点击 Terminal，读取 body text
  证据：文本包含 `Placeholder only. This entry does not read files, run Git, or start sessions in this change.`
  结果：通过

- 场景：PWA manifest 和 icon 静态资源可被浏览器发现
  路径类型：正常 / 用户可见
  验证方式：curl `/manifest.webmanifest`、icons HEAD；agent-browser eval manifest link/theme color
  证据：manifest includes standalone/theme/icons；icons HTTP 200 image/png；eval manifest `/manifest.webmanifest`、theme `#020617`
  结果：通过

- 场景：移动端和桌面视口均可展示 console shell
  路径类型：用户可见
  验证方式：agent-browser viewport 1280x900 与 390x844 screenshot
  证据：`artifacts/console-desktop.png`、`artifacts/console-mobile.png`
  结果：通过

## Evidence 清单

- 类型：测试
  路径或命令：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`
  结果：通过
  说明：覆盖 workspace 格式、lint、类型、unit tests、生产构建。

- 类型：测试
  路径或命令：`web/src/api/client.test.ts`、`web/src/routes/console-model.test.ts`、`web/src/routes/pwa-manifest.test.ts`
  结果：通过
  说明：覆盖 auth、Project API 路径、URL 编码、默认 Agent 焦点、占位状态、runtime disabled、PWA manifest。

- 类型：e2e
  路径或命令：`agent-browser --session agents-remote-shell ...`
  结果：通过
  说明：验证登录、Project list、Project console、Terminal 占位、desktop/mobile viewport。

- 类型：截图
  路径或命令：`.workflow/changes/build-responsive-pwa-console-shell/artifacts/console-desktop.png`
  结果：通过
  说明：1280x900 desktop console shell。

- 类型：截图
  路径或命令：`.workflow/changes/build-responsive-pwa-console-shell/artifacts/console-mobile.png`
  结果：通过
  说明：390x844 mobile console shell。

- 类型：集成日志
  路径或命令：tmux sessions `agents-remote-api-shell`、`agents-remote-web-shell` + curl commands
  结果：通过
  说明：API health、auth、Project list/detail、web proxy、manifest/icons 均可用。

- 类型：代码引用
  路径或命令：`web/src/routes/AuthGate.tsx:5`、`web/src/routes/HomeRoute.tsx:7`、`web/src/routes/ProjectConsoleRoute.tsx:15`、`web/src/routes/console-model.ts:12`、`web/src/routes/console-model.ts:58`、`web/index.html:15`、`web/public/manifest.webmanifest:7`
  结果：通过
  说明：关键实现点可追踪。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | specs、design、tasks 的核心承诺均有实现和自动化/浏览器/HTTP 证据；所有 tasks 已勾选。 |
| Correctness | 通过 | 质量命令全通过；Project API 编码、auth、PWA manifest、占位行为均被测试或 E2E 覆盖。 |
| Coherence | 通过 | 沿用 TanStack Router/Query、Jotai、Tailwind 和同域 `/api` client；未引入 service worker、新依赖、runtime 或 Git/Files 写操作。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- 真机安装到手机桌面的最终系统 UI 可在后续人工验证中补充；本轮已覆盖 manifest/icons/standalone 字段和浏览器可见性，不阻塞通过。

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无
