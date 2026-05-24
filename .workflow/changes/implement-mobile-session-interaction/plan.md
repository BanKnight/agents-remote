# plan

## Change 目标

- 将 Agent/Terminal Session detail 打磨成手机竖屏可用的运行态交互页：终端输出可读，底部输入区默认展开且可收起，多行输入显式发送，快捷键按钮直接向当前 stream 发送控制序列。
- 完成后，移动端用户可以在同一详情页中观察输出、继续输入、发送常用控制键、重连或关闭 session，而不被全局底部导航挤占输入区域。

## 局部 big picture

- 本 change 承接已完成的 Session Runtime 和 PWA Console Shell：运行态 HTTP/WS、detail route、close/reconnect 已可用；本轮只补齐移动端交互可用性。
- 它是 `v0.3-session-runtime-quality` 中 E2E baseline 前的关键可用性工作：后续真实 Terminal/Agent E2E 应能验证手机视口下输入、快捷键和收起/展开路径。
- 下游 `setup-e2e-quality-baseline` 可以复用本 change 形成的 session detail 操作路径和 browser checks。

## 执行策略

- 先把可单测的 quick key/default input 行为抽成前端纯函数或常量，固定 Agent/Terminal 默认集合、排序、control sequence、文本发送规范化和发送可用性判断。
- 再重构 `SessionDetailRoute.tsx` 的页面结构：保留现有 query/mutation/WebSocket 逻辑，重排为移动端优先 header、terminal output、collapsible bottom input panel 和辅助 controls。
- 然后补充 web unit tests 与浏览器 E2E：unit tests 覆盖 view model/quick key，browser 覆盖手机竖屏打开详情、输入/发送、quick key、收起/展开、断连或 ended 状态可见。
- 本轮不新增依赖，不引入 xterm.js；如果发现现有 pre/text stream 无法满足 spec，暂停回到 design 重新评估依赖。

## 任务顺序依据

- quick key 和输入规范化是 UI 实现与测试的基础，先完成能降低后续回归风险。
- SessionDetail 布局会同时修改输入、输出、controls 和状态显示，必须在 view model 稳定后集中处理。
- 浏览器验证依赖代码实现与本地服务，因此放在 unit/quality gate 之后。
- workflow 更新必须最后执行，确保 tasks、verify 和 progress 与实际证据一致。

## 额外上下文

- `docs/specs/session-runtime/spec.md`：确认 detail reconnect、close、runtime ended、Agent/Terminal 分离和 stream 行为。
- `docs/specs/pwa-console-shell/spec.md`：确认移动端优先和 PWA shell 不承诺复杂 service worker 能力。
- `docs/design/session-runtime-boundaries.md`：确认 transport status、runtime lifecycle 和 close 确认规则。
- `docs/design/console-shell.md`：确认 Project console shell 移动端信息架构和底部输入区边界。
- `docs/design/frontend-stack.md`：确认 React/TanStack/Jotai/Tailwind 边界、本地 UI state 和不新增依赖原则。
- 代码入口：`web/src/routes/SessionDetailRoute.tsx`、`web/src/routes/console-model.ts`、`web/src/routes/console-model.test.ts`、`web/src/api/client.ts`、`web/src/api/client.test.ts`。

## 依赖与阻塞

### 阶段依赖

- specs 已完成，覆盖移动端输出、底部面板、多行输入、quick keys 和不可发送状态。
- design 已完成，明确不新增 xterm 依赖、复用现有 stream envelope、以前端本地 state 和 pure model 实现。
- 当前无阻塞，可进入实现。

### 任务依赖

- 1.1 quick key/input model 阻塞 2.1 UI 改造和 3.1 单元测试。
- 2.1 SessionDetail UI 改造依赖 1.1，并阻塞 browser E2E。
- 3.1 单元测试依赖 1.1 和 2.1；3.2 quality gate 依赖 3.1。
- 3.3 browser E2E 依赖 quality gate 与可运行 dev 服务。

### 外部依赖

- 不新增 npm 依赖。
- 浏览器验证需要本地 api/web dev 服务和可创建 Project/Terminal Session 的测试目录。
- 不要求真实 Claude/Codex CLI；移动交互可优先用 Terminal Session 验证，Agent UI 差异由 unit/model 和现有 API tests 覆盖。

## 并行机会

- 1.1 和 2.1 都会影响 `SessionDetailRoute.tsx`/model，建议顺序执行。
- 3.1 unit tests 与少量样式修正可以在 UI 改造后连续处理；不建议并行写同一文件。
- 浏览器 E2E 与最终 workflow 更新不可并行，必须以实际通过证据为准。

## 风险与验证重点

- 风险：fixed/sticky bottom panel 遮挡 terminal 输出最后一行；实现时需要给主内容留底部 padding，并在手机视口检查。
- 风险：quick key sequence 被误写入 textarea；unit/browser 验证点击 quick key 直接发送。
- 风险：断连或 ended 状态仍允许发送；unit test 覆盖 `canSendToSession`，浏览器验证 disabled 状态。
- 风险：不引入 xterm 导致 ANSI/TUI 不完整；本 change 只承诺 text stream 可读，不承诺完整 terminal emulator。
- 验证重点：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`，以及 tmux + browser 手机视口 smoke：打开 Terminal detail、输入多行并发送、点击 Ctrl+C/Esc/Tab 等 quick key、收起/展开底部 panel、重连/关闭路径可见。

## 不做事项

- 不新增 `xterm.js`、fit addon、ANSI parser 或 terminal emulator 设置面板。
- 不修改后端 API、WebSocket envelope、shared DTO 或 runtime metadata。
- 不实现快捷键配置界面、持久化偏好、用户自定义排序或 provider capability API。
- 不实现复杂横屏专用布局、手势恢复、软键盘高度检测、完整 fullscreen terminal mode。
- 不把 Project Console shell-level 底部提示改造成真实输入发送入口。
