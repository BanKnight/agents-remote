# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：align-instance-detail-workspaces
- Roadmap 对应项：v0.8-prototype-ui-alignment / align-instance-detail-workspaces
- 验证对象：Agent / Terminal instance detail terminal-first 工作区、Agent contextual tools、Terminal focused shell、mobile input drawer、source return model 和 browser artifacts
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-26
- 验证范围：实现后的 `SessionDetailRoute`、terminal detail search source、web 质量门禁、桌面/移动真实浏览器路径和截图/日志证据。
- 使用 harness：web format/lint/typecheck/test/build；Playwright + mock API/WebSocket browser harness。
- 本轮结论：通过。
- 后续动作：进入 `distill-change`，沉淀 instance detail deep page、Agent tools 与 Terminal focused shell 的长期规则。

## Harness 清单

- 名称：web quality gates
  类型：format / lint / typecheck / unit test / build
  覆盖承诺：web 实现可格式化、无 lint/type errors、现有 route/model 测试保持通过、生产构建可用。
  执行方式：`bun run format:check && bun run lint && bun --filter @agents-remote/web typecheck && bun --filter @agents-remote/web test && bun --filter @agents-remote/web build`
  结果：通过。
  证据：命令输出显示 format 通过、0 lint warnings/errors、web typecheck 0 error、21 tests / 56 expects 通过、Vite build 成功。

- 名称：browser instance detail check
  类型：真实浏览器自动化 / 截图 / mock API/WebSocket
  覆盖承诺：桌面/移动 Agent detail、Terminal detail、Meta popover、Agent-only tools presence/absence、mobile drawer collapse/expand、+Terminal source context、contextual Files/Git、无 Project 二级底部导航。
  执行方式：`bun .workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail-check.ts`
  结果：通过。
  证据：`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/instance-detail-check.log` 与同目录截图、web/mock-api 日志。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| intents + mobile-session-interaction spec | Agent/Terminal detail 使用 terminal-first 工作区，顶部返回、状态、主输出和底部 input drawer。 | `web/src/routes/SessionDetailRoute.tsx:272`、`web/src/routes/SessionDetailRoute.tsx:389`、`web/src/routes/SessionDetailRoute.tsx:624`、`web/src/routes/SessionDetailRoute.tsx:862` | browser log lines 1, 6, 11, 12；`agent-detail-*.png`、`terminal-detail-*.png` | 通过 |
| project-console-navigation spec | Instance detail 是 deep/contextual page，移动端不显示 Project 二级底部导航。 | `web/src/routes/SessionDetailRoute.tsx:389`、`web/src/routes/SessionDetailRoute.tsx:604`；detail route 不渲染 Project console nav | browser log lines 1, 6, 11, 12；脚本断言 Project workspace nav count 为 0 | 通过 |
| mobile-session-interaction spec | Agent detail 展示 Files/Git/+Terminal/Meta；Terminal detail 不展示 Agent-only tools。 | `web/src/routes/SessionDetailRoute.tsx:427`、`web/src/routes/SessionDetailRoute.tsx:461` | browser log lines 1, 6, 11, 12 | 通过 |
| mobile-session-interaction spec | Meta 使用可关闭浮窗，只展示真实 project/session/provider/status/stream 字段。 | `web/src/routes/SessionDetailRoute.tsx:541`、`web/src/routes/SessionDetailRoute.tsx:561` | browser log lines 2, 7；`agent-meta-*.png` | 通过 |
| project-console-navigation spec + frontend design | +Terminal 复用 create terminal 行为，进入 Terminal focused shell，并保留 Agent source context。 | `web/src/routes/SessionDetailRoute.tsx:152`、`web/src/routes/SessionDetailRoute.tsx:159`、`web/src/routes/SessionDetailRoute.tsx:386`、`web/src/routes/router.tsx:37` | browser log lines 5, 10；脚本断言 URL `fromAgentSession` 和 `Back to Agent detail` | 通过 |
| project-console-navigation spec | Agent Files/Git contextual entries 是只读 resource view，不变成 Project 二级导航。 | `web/src/routes/SessionDetailRoute.tsx:604`、`web/src/routes/SessionDetailRoute.tsx:648`、`web/src/routes/SessionDetailRoute.tsx:732` | browser log lines 3, 4, 8, 9；`agent-files-*.png`、`agent-git-*.png` | 通过 |
| mobile-session-interaction spec | Drawer 展开/收起可恢复，quick keys 发送真实 control sequence，普通文本显式 Send，禁用态遵守 canSend。 | `web/src/routes/SessionDetailRoute.tsx:246`、`web/src/routes/SessionDetailRoute.tsx:251`、`web/src/routes/SessionDetailRoute.tsx:264`、`web/src/routes/SessionDetailRoute.tsx:862`、`web/src/routes/SessionDetailRoute.tsx:932` | browser log lines 11, 12；web tests 21 pass 覆盖 console model quick key / input model | 通过 |
| tasks 3.1 | 质量门禁与真实浏览器证据齐全，artifact 放入 change artifacts。 | `.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail-check.ts` | `instance-detail-check.log`、12 张截图、`web.log`、`mock-api.log` | 通过 |

## Delta 验证

- Scope 内变更：`SessionDetailRoute.tsx` terminal-first chrome、Agent-only tools、Meta popover、+Terminal source context、contextual Files/Git、mobile drawer；`router.tsx` 增加 Terminal detail `fromAgentSession` search 校验；本 change specs/design/plan/tasks/progress/verify/artifacts。
- Scope 外变更：未发现业务 scope 外功能扩张；未修改后端 API、shared DTO、runtime protocol 或 provider adapter。
- 未被 spec/design 支撑的新行为：未发现。Terminal detail source search 是 design 中允许的 Agent-derived Terminal source context。
- 风险：Files/Git contextual view 是最小只读实现，完整 resource page polish 仍属于后续 `align-resource-inspection-pages`；本轮 UI 文案明确 resource-page polish stays in inspection change，未伪装成完整 resource detail。
- 结论：通过。

## Scenario 验证

- 场景：桌面 Agent detail 主路径
  路径类型：正常 / 用户可见
  验证方式：browser harness 打开 Agent detail，检查 terminal output、Agent tools、quick keys、无 Project secondary nav，并截图。
  证据：`agent-detail-desktop.png`、browser log line 1。
  结果：通过。

- 场景：移动 Agent detail 主路径
  路径类型：正常 / 用户可见
  验证方式：390px viewport 打开 Agent detail，检查 terminal-first、Agent tools、quick keys、无 Project secondary nav，并截图。
  证据：`agent-detail-mobile.png`、browser log line 6。
  结果：通过。

- 场景：Agent Meta overlay
  路径类型：用户可见 / 边界
  验证方式：打开 Meta，检查真实字段说明和可关闭行为，并截图。
  证据：`agent-meta-desktop.png`、`agent-meta-mobile.png`、browser log lines 2, 7。
  结果：通过。

- 场景：Agent contextual Files/Git
  路径类型：正常 / 用户可见
  验证方式：点击 Files/Git，检查只读 contextual view、无写操作文案、无 Project secondary nav，并截图。
  证据：`agent-files-desktop.png`、`agent-files-mobile.png`、`agent-git-desktop.png`、`agent-git-mobile.png`、browser log lines 3, 4, 8, 9。
  结果：通过。

- 场景：Agent +Terminal source context
  路径类型：正常 / 用户可见
  验证方式：点击 +Terminal，mock API 创建 Terminal，检查 URL 带 `fromAgentSession`、Terminal detail 不显示 Agent tools、顶部返回指向 Agent detail。
  证据：browser log lines 5, 10；`browser-instance-detail-check.ts` 断言。
  结果：通过。

- 场景：桌面/移动 Terminal detail focused shell
  路径类型：正常 / 用户可见
  验证方式：打开 Terminal detail，检查 focused shell、无 Agent-only tools、drawer collapse/expand、文本 Send 清空输入，并截图。
  证据：`terminal-detail-desktop.png`、`terminal-detail-mobile.png`、browser log lines 11, 12。
  结果：通过。

## Evidence 清单

- 类型：测试
  路径或命令：`bun run format:check && bun run lint && bun --filter @agents-remote/web typecheck && bun --filter @agents-remote/web test && bun --filter @agents-remote/web build`
  结果：通过。
  说明：web static checks、tests 和 build 全部通过。

- 类型：自动化测试报告 / 交互日志
  路径或命令：`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/instance-detail-check.log`
  结果：通过。
  说明：记录桌面/移动 Agent detail、Terminal detail、Meta、Files/Git、+Terminal source context、drawer 的验证结果。

- 类型：代码引用
  路径或命令：`web/src/routes/SessionDetailRoute.tsx:152`、`web/src/routes/SessionDetailRoute.tsx:386`、`web/src/routes/SessionDetailRoute.tsx:461`、`web/src/routes/SessionDetailRoute.tsx:648`、`web/src/routes/SessionDetailRoute.tsx:732`、`web/src/routes/SessionDetailRoute.tsx:862`
  结果：通过。
  说明：对应 +Terminal、source return、Agent tools、Files/Git contextual view 和 input drawer 实现。

- 类型：代码引用
  路径或命令：`web/src/routes/router.tsx:37`
  结果：通过。
  说明：Terminal detail search 校验支持 `fromAgentSession` source context。

## 交互式 Artifact 清单

- 类型：截图
  路径或命令：`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/agent-detail-desktop.png`
  结果：通过。
  说明：桌面 Agent terminal-first detail。

- 类型：截图
  路径或命令：`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/agent-detail-mobile.png`
  结果：通过。
  说明：移动 Agent terminal-first detail，无 Project 二级底部导航。

- 类型：截图
  路径或命令：`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/agent-meta-desktop.png`、`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/agent-meta-mobile.png`
  结果：通过。
  说明：Agent Meta popover。

- 类型：截图
  路径或命令：`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/agent-files-desktop.png`、`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/agent-files-mobile.png`
  结果：通过。
  说明：Agent contextual Files view。

- 类型：截图
  路径或命令：`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/agent-git-desktop.png`、`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/agent-git-mobile.png`
  结果：通过。
  说明：Agent contextual Git view。

- 类型：截图
  路径或命令：`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/terminal-detail-desktop.png`、`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/terminal-detail-mobile.png`
  结果：通过。
  说明：Terminal focused shell 与 recoverable drawer。

- 类型：浏览器日志 / 服务日志
  路径或命令：`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/web.log`、`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/mock-api.log`
  结果：通过。
  说明：browser harness 运行期间 web dev 与 mock API 请求日志。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | specs/design/tasks 中 Agent/Terminal detail、Agent tools、Meta、Files/Git、+Terminal、drawer、browser artifacts 均有证据覆盖。 |
| Correctness | 通过 | 质量门禁、浏览器路径和截图/日志均通过；未新增后端协议或 DTO。 |
| Coherence | 通过 | 实现遵守 frontend UI architecture 三层模型、mobile deep detail 顶部返回/底部 runtime input 规则和 Terminal focused shell 边界。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- 后续 `align-resource-inspection-pages` 可以继续提升 Files/Git contextual/resource pages 的内容密度和 deep resource polish；本 change 已保持最小只读边界，不阻塞通过。

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无
