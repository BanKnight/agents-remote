# Frontend Design

## Change

- change-id：rework-session-mobile-console

## 前端范围

- 技术栈：沿用 React 19 + TypeScript + Vite + TanStack Router + TanStack Query + Tailwind CSS，不新增依赖。
- 主要实现入口：`web/src/routes/SessionDetailRoute.tsx`。
- 相关 model/helper：`web/src/routes/console-model.ts` 与 `web/src/routes/console-model.test.ts`，用于 quick key 集合、发送可用性和文本规范化测试。
- 相关 e2e：`e2e/terminal-session.spec.ts`，按需补充 Agent/Terminal detail 移动 smoke 或截图脚本。
- 不修改 `api/`、`packages/shared/`、session runtime API 或 WebSocket envelope。

## 模块划分

- `SessionDetail` 继续负责 detail query、WebSocket 生命周期、send/close/reconnect 状态和页面组合。
- Header 组件负责返回、session identity、runtime/transport status、close/reconnect/resize 操作。
- Output 组件负责终端输出的主区域、高度、滚动和空输出占位。
- Input controls 组件负责展开/收起、quick keys、textarea、Send 和不可发送提示；它不负责 WebSocket 连接生命周期。
- Quick key model 保持在 `console-model.ts`，通过测试固定 Agent/Terminal 默认集合。

## 组件边界

- Compact session header：接收 projectName/sessionId/sessionType/title/status/action callbacks，只展示和触发操作，不直接管理 WebSocket。
- Terminal output panel：接收 output 字符串，不管理输入状态，不发送消息。
- Mobile input controls：接收 canSend/input/quickKeys/isOpen 和回调；控制布局顺序，不决定 canSend 规则。
- QuickKeyBar：只渲染 quick key 按钮并触发 `onQuickKey`，不接触 textarea。

## 状态管理

- 继续使用 TanStack Query 管理 session detail server state。
- WebSocket、connectionStatus、streamError、output、input、inputPanelOpen 继续留在 `SessionDetailRoute.tsx` 局部 state。
- 新增恢复状态时优先使用现有 `connectionStatus` 与一个轻量派生文案，不新增全局 atom。
- `canSendToSession` 继续作为发送可用性 helper，避免 UI 与发送逻辑分叉。

## 路由 / 页面接入

- 路由保持 `/projects/$projectName/agent-sessions/$sessionId` 与 `/projects/$projectName/terminal-sessions/$sessionId`。
- 返回入口导航到 `/projects/$projectName`。
- 不新增 Session detail 子路由、modal route 或 bottom nav。

## 工程约束

- 根容器使用 `min-h-dvh`、`overflow-x-hidden`、`min-w-0`，内部使用 flex column 与 `min-h-0` 让输出区正确获得剩余高度。
- 不用 fixed bottom input panel；移除依赖 `pb-32/pb-36` 抵消 fixed panel 的布局方式。
- 长 Project 名、displayName、session id、status 和输出长行需要 `min-w-0`、`truncate`、`break-all` 或局部滚动。
- Quick keys 在 textarea 上方渲染；Agent quick keys 需要包含 Enter 以支持选择项确认。
- WebSocket `onerror` 不应立即把初始连接阶段呈现为最终 `Session stream connection failed.`；应区分 connecting/recovering 与最终 error/disconnected。
- 验证阶段需要移动 viewport 浏览器截图，证明紧凑 header、输出区、quick keys 在输入框上方、输入区不遮挡输出和返回入口。

## 关键决策

- 以重组 `SessionDetailRoute.tsx` 为主，不新增依赖、不改 runtime 协议。
- 不提前引入 xterm.js 或复杂 terminal fit/resize；本 change 只解决现有 text stream 的移动布局和输入控制。
- Quick key 能力通过 `console-model.ts` 的默认集合扩展，而不是添加 provider capability API。
- 恢复体验优先用前端状态呈现改进，避免把后端 runtime 恢复语义扩大到本 change。

## 风险与权衡

- `SessionDetailRoute.tsx` 已集中 query/WebSocket/UI 逻辑，重组时要避免把连接逻辑和布局修改混在难以验证的抽象里；优先小组件提取。
- 非 fixed 输入区可能在桌面上显得不如固定输入方便；桌面可通过最大宽度和 flex 布局增强，但不为桌面另开路径。
- `onerror` 处理过度降噪可能掩盖真实连接失败；应保留最终错误/断开状态和 Reconnect 操作。

## 开放问题

- 无。

## 后续沉淀候选

- Session detail layout 不使用 fixed bottom input 的前端边界。
- Quick key model 支持 Agent 选择输入的默认集合。
- WebSocket 初始恢复状态和错误呈现的前端模式。
