# tasks

## 执行顺序

1. 基础/阻塞任务：重组 Session detail 移动端外壳，移除 fixed input panel 和页面 padding 补偿。
2. 核心实现任务：调整输入控件顺序、quick key 集合和连接恢复呈现。
3. 集成与验证任务：运行质量门禁，更新 tasks/progress，准备 verify 阶段移动截图 artifact。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 重组 Session detail 为全高移动控制台工作台
  - 验收标准：
    - `web/src/routes/SessionDetailRoute.tsx` 根容器使用动态视口高度、`overflow-x-hidden`、`min-w-0` 和 flex column。
    - 顶部 header 更紧凑，包含返回 Project、session type/name、runtime status、transport status 和 close/reconnect/resize 操作。
    - 输出区占据剩余空间并在区域内部滚动，页面不依赖 `pb-32/pb-36` 为 fixed input panel 让位。
  - 依据：`plan.md`；`specs/mobile-session-interaction/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/SessionDetailRoute.tsx`；`docs/design/mobile-session-interaction.md`
  - 修改范围：`web/src/routes/SessionDetailRoute.tsx`
  - 依赖：无
  - 并行：否（阻塞所有后续 UI 任务）

### 2. 核心实现任务

- [x] 2.1 将输入区改为非遮挡布局并把 quick keys 放在 textarea 上方
  - 验收标准：
    - `MobileInputPanel` 不再 fixed 到 viewport 底部，而是作为 Session detail 布局底部区域渲染。
    - 展开状态下 quick key bar 位于 textarea 上方；textarea 与 Send/status 在其下方。
    - 收起状态保留明显恢复入口，不关闭 WebSocket，不清空输入。
  - 依据：`plan.md`；`specs/mobile-session-interaction/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/SessionDetailRoute.tsx`
  - 修改范围：`web/src/routes/SessionDetailRoute.tsx`
  - 依赖：1.1
  - 并行：否（依赖外壳布局，修改同一组件）

- [x] 2.2 扩展 Agent quick keys 支持选择输入
  - 验收标准：
    - Agent Session 默认 quick keys 包含上/下方向键和 Enter，并保留 Esc、Tab、Ctrl+C 等常用控制键。
    - Terminal Session quick keys 保持普通 shell 控制键集合。
    - `web/src/routes/console-model.test.ts` 覆盖 Agent/Terminal quick key 集合和关键控制序列。
  - 依据：`plan.md`；`specs/mobile-session-interaction/spec.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/console-model.ts`；`web/src/routes/console-model.test.ts`
  - 修改范围：`web/src/routes/console-model.ts`；`web/src/routes/console-model.test.ts`
  - 依赖：2.1
  - 并行：否（需与输入区 quick key 展示顺序一致）

- [x] 2.3 改善重新进入详情页的连接恢复呈现
  - 验收标准：
    - 初始进入或点击 Reconnect 时清除旧 stream error，并优先展示 connecting/recovering 状态。
    - WebSocket error/close 后仍提供可理解错误或断开状态、Reconnect 和返回 Project 路径。
    - 页面不在重新进入仍存在 session 的初始阶段立即显示 `Session stream connection failed.` 作为最终失败结论。
  - 依据：`plan.md`；`specs/mobile-session-interaction/spec.md`；`design/ui-ux.md`；`design/frontend.md`；`docs/specs/session-runtime/spec.md`
  - 必读上下文：`web/src/routes/SessionDetailRoute.tsx`
  - 修改范围：`web/src/routes/SessionDetailRoute.tsx`
  - 依赖：1.1、2.1
  - 并行：否（同一 WebSocket 状态区域）

### 3. 集成与验证准备任务

- [x] 3.1 运行实现阶段质量门禁并更新进度
  - 验收标准：
    - 运行 `bun run format:check`、`bun run lint`、`bun run typecheck`、`bun run test`、`bun run build`，并修复失败或记录阻塞。
    - 如 e2e 受 session detail 文案或布局影响，更新并运行相关 e2e。
    - 所有实现任务完成后，`progress.md` 更新为 `当前阶段：待验证`，implementation 标记已完成并追加进展记录。
  - 依据：`plan.md`；`design/frontend.md`；`progress.md`
  - 必读上下文：`package.json`；`e2e/terminal-session.spec.ts`；`progress.md`
  - 修改范围：`.workflow/changes/rework-session-mobile-console/tasks.md`；`.workflow/changes/rework-session-mobile-console/progress.md`；必要时 e2e 文件
  - 依赖：2.1、2.2、2.3
  - 并行：否（必须在实现完成后执行）

## 依赖图

- 1.1 → 2.1 → 2.2 → 3.1
- 1.1 → 2.3 → 3.1

## 可并行任务

- 无。主要实现集中在 `web/src/routes/SessionDetailRoute.tsx`，quick key model 也需要与输入区呈现一起验证，顺序执行更安全。

## 阻塞项

- （无）
