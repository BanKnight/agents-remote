# verify

本文件记录 `align-mobile-app-shell` 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：align-mobile-app-shell
- Roadmap 对应项：v0.5-mobile-ux-polish / align-mobile-app-shell
- 验证对象：移动端 App-like shell 基线、首页 Project 主路径、低频 Create/Adopt Project 入口、全局移动 viewport/overflow 基线。
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-25
- 验证范围：spec/design/tasks 与当前代码差异的一致性；前端质量门禁；移动端真实浏览器首页路径与截图 artifact。
- 使用 harness：format/lint/typecheck/test/build；headless browser mobile smoke；git diff delta review。
- 本轮结论：通过，无 CRITICAL / WARNING。
- 后续动作：可进入 `distill-change`。

## Harness 清单

- 名称：format check
  类型：静态质量门禁
  覆盖承诺：格式化一致性，避免实现阶段遗留格式问题。
  执行方式：`bun run format:check`
  结果：通过。
  证据：命令输出 `All matched files use the correct format.`
- 名称：lint
  类型：静态质量门禁
  覆盖承诺：前端/仓库代码无 lint 警告错误。
  执行方式：`bun run lint`
  结果：通过。
  证据：命令输出 `Found 0 warnings and 0 errors.`
- 名称：typecheck
  类型：类型检查
  覆盖承诺：React/TypeScript 变更与 workspace 类型契约一致。
  执行方式：`bun run typecheck`
  结果：通过。
  证据：api/shared/web/e2e typecheck 全部完成。
- 名称：unit/integration tests
  类型：自动化测试
  覆盖承诺：现有 API/shared/web 测试无回归。
  执行方式：`bun run test`
  结果：通过。
  证据：api 75 pass；shared 6 pass；web 22 pass。
- 名称：build
  类型：构建验证
  覆盖承诺：生产构建可用。
  执行方式：`bun run build`
  结果：通过。
  证据：api/shared/web build 全部完成，Vite 输出 dist assets。
- 名称：mobile home browser smoke
  类型：headless browser script + 截图/日志 artifact
  覆盖承诺：移动端登录后首页使用 Project 主路径、Create/Adopt 次级可见、无横向页面溢出。
  执行方式：临时 Playwright 脚本 `bun /tmp/align-mobile-home-check.ts`，390x844 mobile viewport，临时 PROJECTS_ROOT/API/Web 服务。
  结果：通过。
  证据：`.workflow/changes/align-mobile-app-shell/artifacts/mobile-home.png`、`mobile-home-api.log`、`mobile-home-web.log`。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| spec: Mobile console presents an app-like shell | 手机视口登录后页面呈现深色、全高、App-like 控制台布局，并使用项目术语 | `web/src/routes/HomeRoute.tsx:46` 使用 `min-h-dvh overflow-x-hidden` 和深色 shell；`web/src/routes/HomeRoute.tsx:55` 使用 Project/Agent Sessions/Terminal/Files/Git 术语 | `mobile-home browser smoke` 登录后等待 `Projects` 与 Project link，截图 `artifacts/mobile-home.png` | 通过 |
| spec: Mobile pages avoid viewport-level overflow | 登录后移动端页面默认不产生页面级横向溢出 | `web/src/styles/index.css:17-26` root/body 使用 `100dvh` 与 `overflow-x:hidden`；`web/src/routes/HomeRoute.tsx:46` 首页防横向溢出；`web/src/routes/ProjectConsoleRoute.tsx:132-187` console shell 补 `min-w-0`/`overflow-x-hidden` | Browser smoke 在 390px viewport 执行 `document.documentElement.scrollWidth > window.innerWidth`，未发现横向溢出；截图 artifact 已保存 | 通过 |
| spec: Home low-frequency Project creation is visually de-emphasized | 移动首页优先展示 Project，Create/Adopt 次级但可发现且流程完整 | `web/src/routes/HomeRoute.tsx:74-128` Create/Adopt 为次级 aside + 展开表单；`web/src/routes/HomeRoute.tsx:147-170` Project list/空态为主路径并保留创建入口 | Browser smoke 看到 Project link；任务 3.1 对照保留空输入禁用、提交中、错误、成功导航逻辑；质量门禁通过 | 通过 |
| spec: Wider viewport compatibility | 同一信息架构在宽屏保持可用 | `web/src/routes/HomeRoute.tsx:66` 使用响应式 `lg:grid-cols`；`web/src/routes/ProjectConsoleRoute.tsx:132-187` 保留原 Project console 响应式结构 | `bun run build` / `typecheck` 通过；Delta review 未发现新增独立 desktop 路由或分叉逻辑 | 通过 |
| design/frontend | 沿用 React/Tailwind/TanStack Query，不新增依赖或 API | `web/src/routes/HomeRoute.tsx:13-27` 仍用 TanStack Query/mutation；`package.json` 未新增依赖；无 API/shared 改动 | `git diff` 显示代码变更限定在 `web/src/styles/index.css`、`HomeRoute.tsx`、`ProjectConsoleRoute.tsx` 与 workflow artifacts | 通过 |
| tasks 1.1-4.1 | tasks 全部完成并有实现/验证证据 | `.workflow/changes/align-mobile-app-shell/tasks.md` 全部勾选；progress implementation 已标记完成 | format/lint/typecheck/test/build 通过；browser smoke artifact 已保存 | 通过 |

## Delta 验证

- Scope 内变更：
  - `web/src/styles/index.css`：root/body 动态视口与横向 overflow 基线。
  - `web/src/routes/HomeRoute.tsx`：首页 Project 主路径、Create/Adopt 次级可展开入口、长文本与卡片 `min-w-0`/truncate 处理。
  - `web/src/routes/ProjectConsoleRoute.tsx`：Project console shell 的 `dvh`、`overflow-x-hidden`、`min-w-0` 最小对齐。
  - `.workflow/changes/align-mobile-app-shell/`：spec/design/plan/tasks/progress/artifacts/verify 运行态产物。
- Scope 外变更：未发现。
- 未被 spec/design 支撑的新行为：未发现。Create/Adopt 入口呈现方式变化受 spec/design 支撑；服务端行为和 API 未变。
- 风险：全局 `overflow-x-hidden` 可能掩盖部分子组件宽度问题，但实现同时在首页/console 关键容器补充 `min-w-0` 与截断，并通过移动 smoke 检查无页面级横向溢出。
- 结论：通过。

## Scenario 验证

- 场景：已认证用户在移动视口打开首页
  路径类型：正常 / 用户可见
  验证方式：headless browser 390x844 登录，等待 `Projects` 标题和 Project link，检查横向 overflow，保存截图。
  证据：`.workflow/changes/align-mobile-app-shell/artifacts/mobile-home.png`
  结果：通过
- 场景：已有 Project 时首页优先展示 Project 入口
  路径类型：正常 / 用户可见
  验证方式：browser smoke 创建临时 `demo-mobile-project-with-long-name`，登录后等待该 Project link 可见。
  证据：`.workflow/changes/align-mobile-app-shell/artifacts/mobile-home.png`
  结果：通过
- 场景：Create/Adopt 入口降级后仍可发现并保留行为
  路径类型：边界 / 用户可见
  验证方式：代码 trace 确认 `setupVisible` 在空态、pending、error 或用户展开时显示表单；submit 仍 trim 空输入、调用 `createProject`、成功后 invalidate 并 navigate。
  证据：`web/src/routes/HomeRoute.tsx:28-42`、`web/src/routes/HomeRoute.tsx:94-120`
  结果：通过
- 场景：移动页面无页面级横向溢出
  路径类型：边界 / 用户可见
  验证方式：browser smoke 执行 `document.documentElement.scrollWidth > window.innerWidth` 断言为 false。
  证据：`.workflow/changes/align-mobile-app-shell/artifacts/mobile-home.png`、服务日志无错误。
  结果：通过
- 场景：失败/质量回归路径
  路径类型：失败 / 工程质量
  验证方式：format/lint/typecheck/test/build 全部执行。
  证据：本轮命令输出记录。
  结果：通过

## Evidence 清单

- 类型：测试
  路径或命令：`bun run format:check`
  结果：通过
  说明：格式检查通过。
- 类型：测试
  路径或命令：`bun run lint`
  结果：通过
  说明：0 warnings / 0 errors。
- 类型：测试
  路径或命令：`bun run typecheck`
  结果：通过
  说明：api/shared/web/e2e typecheck 完成。
- 类型：测试
  路径或命令：`bun run test`
  结果：通过
  说明：api 75 pass；shared 6 pass；web 22 pass。
- 类型：测试
  路径或命令：`bun run build`
  结果：通过
  说明：api/shared/web build 完成。
- 类型：截图
  路径或命令：`.workflow/changes/align-mobile-app-shell/artifacts/mobile-home.png`
  结果：通过
  说明：390x844 移动视口登录后首页截图。
- 类型：日志
  路径或命令：`.workflow/changes/align-mobile-app-shell/artifacts/mobile-home-api.log`
  结果：通过
  说明：browser smoke 使用的临时 API 服务日志。
- 类型：日志
  路径或命令：`.workflow/changes/align-mobile-app-shell/artifacts/mobile-home-web.log`
  结果：通过
  说明：browser smoke 使用的临时 Web 服务日志。
- 类型：代码引用
  路径或命令：`web/src/styles/index.css:17-26`、`web/src/routes/HomeRoute.tsx:28-170`、`web/src/routes/ProjectConsoleRoute.tsx:75-187`
  结果：通过
  说明：实现位置覆盖 spec/design/tasks 关键承诺。

## 交互式 Artifact 清单

- 类型：截图
  路径或命令：`.workflow/changes/align-mobile-app-shell/artifacts/mobile-home.png`
  结果：通过
  说明：移动端首页 Project 主路径和次级 Create/Adopt 入口的可审查 UI artifact。
- 类型：服务日志
  路径或命令：`.workflow/changes/align-mobile-app-shell/artifacts/mobile-home-api.log`
  结果：通过
  说明：移动浏览器 smoke 期间 API 服务日志。
- 类型：服务日志
  路径或命令：`.workflow/changes/align-mobile-app-shell/artifacts/mobile-home-web.log`
  结果：通过
  说明：移动浏览器 smoke 期间 Web/Vite 服务日志。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | specs/design/tasks 的核心承诺均有实现与验证证据；UI artifact 已采集。 |
| Correctness | 通过 | 质量门禁、构建、浏览器移动 smoke 与横向溢出断言均通过。 |
| Coherence | 通过 | 实现沿用现有 React/Tailwind/TanStack Query 路径，不新增 API/依赖，变更范围符合 plan 不做事项。 |

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
