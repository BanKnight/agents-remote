# tasks

## 执行顺序

1. 先重组 Agent/Terminal detail 的 terminal-first chrome 和 shared detail skeleton。
2. 再实现 Agent-only Files/Git/+Terminal/Meta tools，并确保 Terminal detail 保持 focused shell。
3. 然后收敛 Agent contextual Files/Git 最小只读入口/视图和 mobile drawer/quick key 密度。
4. 最后运行 web 检查并用真实浏览器采集桌面/移动 Agent/Terminal detail 证据。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 重组 terminal-first detail chrome
  - 验收标准：Agent Session detail 与 Terminal Session detail 都使用紧凑顶部返回、marker/title/status、terminal output 主区和底部 input drawer；移动端不显示 Project 二级底部导航；保留 reconnect、resize、close confirm、stream error、recovering、runtime ended 和 input disabled 状态；长 project/session id 不横向溢出。
  - 依据：`plan.md`；`specs/mobile-session-interaction/spec.md`；`specs/project-console-navigation/spec.md`；`design/overview.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/design/frontend-ui-architecture.md`；`docs/specs/mobile-session-interaction/spec.md`；`docs/design/mobile-session-interaction.md`；`web/src/routes/SessionDetailRoute.tsx`；`web/src/routes/console-model.ts`
  - 修改范围：`web/src/routes/SessionDetailRoute.tsx`；必要时 `web/src/routes/console-model.ts` 与 tests
  - 依赖：无
  - 并行：否（阻塞所有后续 detail actions 和 browser harness）

### 2. 核心实现任务

- [x] 2.1 增加 Agent-only tools、Meta popover 和 +Terminal 行为
  - 验收标准：Agent detail header 显示 Files、Git、+Terminal、Meta；Terminal detail 不显示这些 Agent-only tools；Meta 以可关闭浮窗展示真实 project/session/provider/status/stream 字段；+Terminal 使用现有 `createTerminalSession` mutation，pending/error 可见，成功进入 Terminal detail 或等价 focused shell；不新增 API/DTO。
  - 依据：`plan.md`；`specs/mobile-session-interaction/spec.md`；`specs/project-console-navigation/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/SessionDetailRoute.tsx`；`web/src/api/client.ts`；`packages/shared/src/index.ts`；`docs/specs/session-runtime/spec.md`
  - 修改范围：`web/src/routes/SessionDetailRoute.tsx`；必要时 `web/src/api/client.ts` import 使用、route/search tests
  - 依赖：1.1
  - 并行：否（与 1.1/2.2 修改同一 detail chrome 和 state）

- [x] 2.2 收敛 Agent contextual Files/Git 最小只读入口或视图
  - 验收标准：从 Agent detail 点击 Files/Git 后进入同一 Agent context 的只读 resource view 或明确的 contextual entry；移动端使用顶部返回到 Agent detail，不显示 Project 二级底部导航；不提供 Files/Git 写操作，不伪造文件或 diff 数据；若只落地入口到 Project workspace，必须保留 source context 并在 UI 中不暗示已完成 contextual deep resource polish。
  - 依据：`plan.md`；`specs/project-console-navigation/spec.md`；`design/overview.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/SessionDetailRoute.tsx`；`web/src/routes/ProjectConsoleRoute.tsx` Files/Git panel 现状；`web/src/api/client.ts` Files/Git read-only client；`docs/specs/project-console-navigation/spec.md`
  - 修改范围：`web/src/routes/SessionDetailRoute.tsx`；必要时局部 helper/test；避免大规模搬迁 `ProjectConsoleRoute.tsx`
  - 依赖：2.1
  - 并行：否（同一 Agent detail header/context state；与后续 resource inspection 有边界风险）

- [x] 2.3 对齐 mobile drawer、quick keys 和 long-text 密度
  - 验收标准：移动端 input drawer 展开/收起可见且可恢复；quick keys 在 drawer 中可扫读并只发送真实 control sequence；普通文本仍显式 Send；disconnected/ended/closing 禁用发送；drawer 收起不关闭 stream、不清空 input；terminal output、header actions、session id 和长 output 不横向溢出。
  - 依据：`plan.md`；`specs/mobile-session-interaction/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/SessionDetailRoute.tsx`；`web/src/routes/console-model.ts`；`web/src/routes/console-model.test.ts`
  - 修改范围：`web/src/routes/SessionDetailRoute.tsx`；必要时 `web/src/routes/console-model.ts` 和 tests
  - 依赖：1.1、2.1
  - 并行：否（与 detail layout 和 Agent tools 同一移动端结构）

### 3. 集成与验证任务

- [x] 3.1 运行 web 检查并准备 instance detail 浏览器证据
  - 验收标准：`bun run format:check`、`bun run lint`、`bun --filter @agents-remote/web typecheck`、`bun --filter @agents-remote/web test`、`bun --filter @agents-remote/web build` 通过；真实浏览器检查桌面/移动 Agent detail、Terminal detail、Meta popover、Agent-only tools absence/presence、mobile drawer collapse/expand、+Terminal pending/error 或 success、contextual Files/Git entry 和无 Project 二级底部导航；截图/日志放入本 change artifacts 供 verify-change 使用。
  - 依据：`plan.md`；`specs/mobile-session-interaction/spec.md`；`specs/project-console-navigation/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/project.md` 测试与质量门禁；现有 browser harness 模式；`web/src/routes/SessionDetailRoute.tsx`
  - 修改范围：`.workflow/changes/align-instance-detail-workspaces/artifacts/`；必要时新增本 change 专用 browser check 脚本
  - 依赖：2.1、2.2、2.3
  - 并行：否（必须在实现完成后执行）

## 依赖图

- 1.1 → 2.1 → 2.2 → 3.1
- 1.1 → 2.3 → 3.1

## 可并行任务

- （无；实现集中在同一 Session detail route，验证依赖实现完成）

## 阻塞项

- （无）
