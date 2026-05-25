# verify

本文件记录 `align-home-project-entry` 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：align-home-project-entry
- Roadmap 对应项：v0.8-prototype-ui-alignment / Home / Project entry prototype alignment
- 验证对象：Home / Projects 一级 shell、Project entry 列表、低频 Create/adopt 入口和默认进入 Agent workspace 的实现
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-26
- 验证范围：spec/design/tasks 承诺的 Home / Project entry 结构、状态保留、URL-visible 默认 workspace、桌面端/移动端浏览器行为和 web 质量门禁。
- 使用 harness：format check、lint、web typecheck、web unit tests、web build、Playwright browser harness。
- 本轮结论：通过；无 CRITICAL / WARNING。
- 后续动作：进入 distill-change，沉淀 Home / Project entry 的长期 WHAT 和已验证 UI architecture 规则。

## Harness 清单

- 名称：repository format check
  类型：format
  覆盖承诺：实现文件和验证脚本符合项目格式要求。
  执行方式：`bun run format:check`
  结果：通过
  证据：命令输出 All matched files use the correct format.

- 名称：repository lint
  类型：lint
  覆盖承诺：Home route 调整和 browser check 脚本不引入 lint warning/error。
  执行方式：`bun run lint`
  结果：通过
  证据：命令输出 Found 0 warnings and 0 errors.

- 名称：web typecheck
  类型：typecheck
  覆盖承诺：Home route、Router search、TanStack Query/Mutation 和 React props 类型正确。
  执行方式：`bun --filter @agents-remote/web typecheck`
  结果：通过
  证据：命令退出码 0。

- 名称：web unit tests
  类型：unit test
  覆盖承诺：现有 web 行为模型未被 Home 调整破坏。
  执行方式：`bun --filter @agents-remote/web test`
  结果：通过
  证据：21 pass、0 fail、56 expect calls。

- 名称：web build
  类型：build
  覆盖承诺：生产构建可用。
  执行方式：`bun --filter @agents-remote/web build`
  结果：通过
  证据：Vite build completed successfully。

- 名称：Home entry browser check
  类型：headless browser / screenshot artifact
  覆盖承诺：桌面端和移动端 Home Projects workspace、低频 Create/adopt 入口、Project entry 默认 Agent workspace。
  执行方式：`bun .workflow/changes/align-home-project-entry/artifacts/browser-home-entry-check.ts`
  结果：通过
  证据：`.workflow/changes/align-home-project-entry/artifacts/browser-home-entry/home-entry-check.log` 与同目录截图。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| spec: Home presents Projects as a level-one workspace | Home 桌面端展示一级导航 + Projects 工作区，移动端展示底部一级导航 + 主工作区 | `web/src/routes/HomeRoute.tsx:56`、`web/src/routes/HomeRoute.tsx:58`、`web/src/routes/HomeRoute.tsx:104`、`web/src/routes/HomeRoute.tsx:109`、`web/src/routes/HomeRoute.tsx:136` | `home-entry-check.log` 中 desktop/mobile Home Projects workspace visible；`home-entry-desktop.png`、`home-entry-mobile.png` | 通过 |
| spec: Home top copy stays concise and contextual | 顶部只保留 Projects 上下文、标题和一句简短说明 | `web/src/routes/HomeRoute.tsx:61`、`web/src/routes/HomeRoute.tsx:63`、`web/src/routes/HomeRoute.tsx:66`、`web/src/routes/HomeRoute.tsx:69` | browser check 验证 heading `Open a server Project` 和说明文案可见 | 通过 |
| spec: Project list rows support fast recognition and entry | Project 条目展示 marker、名称、截断路径、状态摘要和 Open 行为 | `web/src/routes/HomeRoute.tsx:199`、`web/src/routes/HomeRoute.tsx:214`、`web/src/routes/HomeRoute.tsx:221`、`web/src/routes/HomeRoute.tsx:223`、`web/src/routes/HomeRoute.tsx:226`、`web/src/routes/HomeRoute.tsx:229`、`web/src/routes/HomeRoute.tsx:235` | browser check 使用长 Project 名称打开项目；桌面/移动截图保存 | 通过 |
| spec: Create or adopt Project is a low-frequency Home action | Create/adopt 默认作为轻量入口；展开后保留输入、禁用、提交中和错误位置；空态提升创建入口 | `web/src/routes/HomeRoute.tsx:73`、`web/src/routes/HomeRoute.tsx:90`、`web/src/routes/HomeRoute.tsx:183`、`web/src/routes/HomeRoute.tsx:189`、`web/src/routes/HomeRoute.tsx:273`、`web/src/routes/HomeRoute.tsx:298`、`web/src/routes/HomeRoute.tsx:309` | `home-entry-setup-desktop.png`、`home-entry-setup-mobile.png`；browser log desktop/mobile setup panel visible | 通过 |
| spec: Entering a Project defaults to the Agent workspace | Project Link 和创建成功导航显式传入默认 Agent workspace search | `web/src/routes/HomeRoute.tsx:31`、`web/src/routes/HomeRoute.tsx:34`、`web/src/routes/HomeRoute.tsx:216`、`web/src/routes/HomeRoute.tsx:217` | browser log desktop/mobile Project entry opens default Agent workspace with URL workspace=agents；`project-default-agent-desktop.png`、`project-default-agent-mobile.png` | 通过 |
| tasks 1.1/2.1/3.1 | 所有实现和验证任务完成 | `.workflow/changes/align-home-project-entry/tasks.md` | format/lint/typecheck/test/build/browser check 全部通过 | 通过 |

## Delta 验证

- Scope 内变更：`web/src/routes/HomeRoute.tsx` 的 Home 信息层级、Project entry 行、Create/adopt 低频面板；本 change 的 specs/design/plan/tasks/verify/artifacts。
- Scope 外变更：无后端 API、shared DTO、Project 二级 workspace、Session detail、Files/Git/Terminal 行为变更。
- 未被 spec/design 支撑的新行为：无。
- 风险：Home 创建入口默认降级可能影响发现性，但空态、提交中和错误态保持可见，header 中保留 `New / Adopt` 入口；风险已被设计接受。
- 结论：通过。

## Scenario 验证

- 场景：桌面端 Home / Projects 主路径
  路径类型：正常 / 用户可见
  验证方式：browser check 1440x1000 登录后检查 Home heading、Projects 工作区、Primary navigation、Project entry。
  证据：`.workflow/changes/align-home-project-entry/artifacts/browser-home-entry/home-entry-desktop.png`、`home-entry-check.log`
  结果：通过

- 场景：移动端 Home / Projects 主路径
  路径类型：正常 / 用户可见
  验证方式：browser check 390x844 登录后检查 Home heading、Projects 工作区、Primary mobile navigation、Project entry。
  证据：`.workflow/changes/align-home-project-entry/artifacts/browser-home-entry/home-entry-mobile.png`、`home-entry-check.log`
  结果：通过

- 场景：低频 Create/adopt 入口
  路径类型：用户可见 / 边界
  验证方式：browser check 点击 `New / Adopt`，检查 Create/adopt panel 和 Project folder input。
  证据：`home-entry-setup-desktop.png`、`home-entry-setup-mobile.png`、`home-entry-check.log`
  结果：通过

- 场景：从 Home 打开 Project 默认进入 Agent workspace
  路径类型：正常
  验证方式：browser check 点击 Project entry，检查 Project heading 可见且 URL 包含 `workspace=agents`。
  证据：`project-default-agent-desktop.png`、`project-default-agent-mobile.png`、`home-entry-check.log`
  结果：通过

- 场景：长 Project 名称/路径不破坏布局
  路径类型：边界 / 用户可见
  验证方式：browser harness 使用 `agents-remote-with-a-long-readable-path-name` 测试项目并在桌面/移动截图中确认可进入。
  证据：`home-entry-desktop.png`、`home-entry-mobile.png`
  结果：通过

## Evidence 清单

- 类型：测试
  路径或命令：`bun run format:check`
  结果：通过
  说明：格式符合项目规范。

- 类型：测试
  路径或命令：`bun run lint`
  结果：通过
  说明：0 warnings / 0 errors。

- 类型：测试
  路径或命令：`bun --filter @agents-remote/web typecheck`
  结果：通过
  说明：Home route 类型与 Router search 约束通过。

- 类型：测试
  路径或命令：`bun --filter @agents-remote/web test`
  结果：通过
  说明：21 pass / 0 fail。

- 类型：测试
  路径或命令：`bun --filter @agents-remote/web build`
  结果：通过
  说明：Vite production build 通过。

- 类型：交互日志
  路径或命令：`.workflow/changes/align-home-project-entry/artifacts/browser-home-entry/home-entry-check.log`
  结果：通过
  说明：记录桌面/移动 Home、setup panel 和 default Agent workspace 验证结果。

- 类型：代码引用
  路径或命令：`web/src/routes/HomeRoute.tsx:56`、`web/src/routes/HomeRoute.tsx:61`、`web/src/routes/HomeRoute.tsx:168`、`web/src/routes/HomeRoute.tsx:212`、`web/src/routes/HomeRoute.tsx:273`
  结果：通过
  说明：Home shell、header、Project list、Project row 和 setup panel 实现位置。

## 交互式 Artifact 清单

- 类型：截图
  路径或命令：`.workflow/changes/align-home-project-entry/artifacts/browser-home-entry/home-entry-desktop.png`
  结果：通过
  说明：桌面端 Home Projects workspace。

- 类型：截图
  路径或命令：`.workflow/changes/align-home-project-entry/artifacts/browser-home-entry/home-entry-mobile.png`
  结果：通过
  说明：移动端 Home Projects workspace 和底部一级导航。

- 类型：截图
  路径或命令：`.workflow/changes/align-home-project-entry/artifacts/browser-home-entry/home-entry-setup-desktop.png`
  结果：通过
  说明：桌面端低频 Create/adopt 面板展开态。

- 类型：截图
  路径或命令：`.workflow/changes/align-home-project-entry/artifacts/browser-home-entry/home-entry-setup-mobile.png`
  结果：通过
  说明：移动端低频 Create/adopt 面板展开态。

- 类型：截图
  路径或命令：`.workflow/changes/align-home-project-entry/artifacts/browser-home-entry/project-default-agent-desktop.png`
  结果：通过
  说明：桌面端从 Home 打开 Project 后默认 Agent workspace。

- 类型：截图
  路径或命令：`.workflow/changes/align-home-project-entry/artifacts/browser-home-entry/project-default-agent-mobile.png`
  结果：通过
  说明：移动端从 Home 打开 Project 后默认 Agent workspace。

- 类型：服务日志
  路径或命令：`.workflow/changes/align-home-project-entry/artifacts/browser-home-entry/api.log`、`web.log`
  结果：通过
  说明：browser harness 的临时 API/Web 服务日志。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | specs 的 5 条 added requirements、tasks 1.1/2.1/3.1 均有代码与 browser/command 证据。 |
| Correctness | 通过 | format/lint/typecheck/test/build 通过，browser harness 验证桌面/移动主路径和默认 workspace。 |
| Coherence | 通过 | 实现沿用已验证 shell foundation、shared primitives、TanStack Query 和 Router search，不新增架构或 API 变更。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- （无）

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无
