# plan

## Change 目标

- 将 Agent/Terminal Session detail 移动端重组为不溢出、不遮挡输出、可返回且更易恢复的控制台工作台。
- 调整底部输入区为页面布局的一部分，把 quick keys 放在 textarea 上方，并扩展 Agent 默认快捷键支持选择项导航。
- 保持现有 session runtime API、WebSocket envelope、close/reconnect/send 行为不变，只改善前端布局、状态呈现和测试。

## 局部 big picture

- `align-mobile-app-shell` 已建立移动端 App-like shell 和视口基线；`rework-project-mobile-workspace` 已把 Project 工作区与真实输入职责分离。
- 本 change 负责补齐核心控制闭环：用户从 Project 工作区进入具体 Agent/Terminal detail 后，能在手机上可靠查看输出、发送文本/快捷键、返回和恢复连接。
- 后续 Files/Git 移动端 polish 不应复用 session 输入语义；本 change 只沉淀 runtime detail 的控制台布局模式。

## 执行策略

- 以 `web/src/routes/SessionDetailRoute.tsx` 为主要实现入口，保留现有 TanStack Query detail loading、WebSocket connection、sendMessage、close mutation 和 reconnectKey 逻辑。
- 先改根布局为 `min-h-dvh` flex column：紧凑 header、状态消息、输出区、inline input controls；移除 fixed input panel 和为 fixed panel 预留的 page padding。
- 再调整输入控件内部顺序：collapsed 恢复条、quick key bar、textarea、Send/status；quick keys 直接发送控制序列。
- 更新 `console-model.ts` 的 Agent quick keys，确保包含 Enter 并保持测试覆盖。
- 改善初始/reconnect 错误呈现：连接中和手动 reconnect 期间清空旧错误并显示连接/恢复状态，WebSocket error 使用更可恢复的文案，不让重新进入页面立即显示最终失败结论。
- 通过 format/lint/typecheck/test/build/e2e 和移动截图 smoke 验证布局、输入区顺序、quick keys、重连状态和不遮挡输出。

## 任务顺序依据

- 先重组页面外壳和非 fixed 输入布局，因为它影响输出区高度、状态消息位置和后续输入控件结构。
- Quick keys 上置和 Agent Enter 支持依赖输入区组件稳定后处理。
- 恢复状态呈现依赖 WebSocket 生命周期仍在同一组件内，适合在布局稳定后最小修改。
- 最后运行质量门禁、更新 progress，并在 verify 阶段保存移动截图 artifact。

## 额外上下文

- `docs/project.md`：确认移动端动态视口、局部滚动、`min-w-0`、长驻服务/e2e artifact 和 Session detail 输入职责边界。
- `docs/specs/mobile-session-interaction/spec.md`：确认长期移动 Session detail WHAT 基线。
- `docs/specs/session-runtime/spec.md`：确认 reconnect、close、session identity 和 runtime/transport 状态边界。
- `docs/design/mobile-session-interaction.md`：确认长期移动输入、quick keys、bottom panel、不可发送状态和不引入 terminal emulator 的设计。
- `web/src/routes/SessionDetailRoute.tsx`：主要实现入口。
- `web/src/routes/console-model.ts`、`web/src/routes/console-model.test.ts`：quick key model 与测试。
- `e2e/terminal-session.spec.ts`：Terminal detail e2e 路径；可按需新增/调整移动 smoke 脚本产出 artifacts。

## 依赖与阻塞

### 阶段依赖

- 依赖 `align-mobile-app-shell` 已完成；本地阻塞已解除。
- specs/design 已完成，无开放问题。
- 完成实现后必须进入 verify，并保存移动 viewport 浏览器截图或等价 artifact。

### 任务依赖

- 1.1 Session detail 外壳重组阻塞所有 UI 任务。
- 2.1 输入控件顺序依赖 1.1 的非 fixed 布局。
- 2.2 Agent quick key Enter 支持依赖 2.1 的 quick key bar 结构。
- 2.3 恢复状态文案依赖 1.1/2.1 后状态呈现位置稳定。
- 3.1 质量门禁依赖所有实现任务。

### 外部依赖

- 无新增第三方服务、数据迁移、配置、权限或人工确认。
- 浏览器验证需要临时 web/api 服务；应复用项目 e2e harness 或可追踪脚本，artifact 写入 `.workflow/changes/rework-session-mobile-console/artifacts/`。

## 并行机会

- 主要代码修改集中在 `SessionDetailRoute.tsx` 和 `console-model.ts`，不建议并行。
- Quick key model 修改可在布局完成后连续处理，但仍需与 tests 一起更新。
- 质量门禁和截图验证必须在实现后执行。

## 风险与验证重点

- 风险：移除 fixed input panel 后输出区高度计算错误；验证必须确认 mobile viewport 中 header、output、quick keys、textarea 都可见且输入区不遮挡输出。
- 风险：WebSocket error 降噪过度导致真实错误不可见；验证必须保留最终错误/断开提示和 Reconnect。
- 风险：Agent quick key 集合变化影响现有测试；必须更新 `console-model.test.ts` 固定集合和控制序列。
- 风险：Terminal e2e 受按钮文案/布局影响；必须跑 e2e 确认创建、进入 detail、发送输入仍可用。

## 不做事项

- 不修改 `api/`、`packages/shared/`、session runtime API 或 WebSocket envelope。
- 不新增 xterm.js、ANSI parser、terminal fit/resize observer、IME 深度适配或字体/主题配置。
- 不新增快捷键配置 UI、provider capability API 或持久化快捷键排序。
- 不处理 provider history/resume 或跨服务器重启恢复。
- 不把 Project 工作区重新改回可输入页面。
