# UI/UX Design

## Change

- change-id：rework-session-mobile-console

## 页面 / 界面范围

- Agent Session detail：`/projects/$projectName/agent-sessions/$sessionId`
- Terminal Session detail：`/projects/$projectName/terminal-sessions/$sessionId`
- 移动端默认视图、底部输入区展开/收起、重连/错误/结束状态。
- 不覆盖 Project 工作区、Files/Git detail、完整 terminal emulator 或桌面专属重设计。

## 页面结构

- 移动端 Session detail 使用全高控制台工作台结构：
  1. 顶部紧凑 header：返回 Project、session type/name、Project/session id 摘要、runtime status、transport status、Close/Reconnect/Resize 操作。
  2. 状态消息区：只在 detail load error、stream error、runtime ended、close error 时出现，避免常态占高。
  3. 终端输出区：占据主体剩余空间，区域内部滚动，保留最小可读高度。
  4. 输入控制区：位于页面底部但参与布局，不 fixed 覆盖输出；展开时顺序为 quick keys、textarea、Send/状态；收起时保留紧凑恢复条。
- 横屏/较宽视口只增强宽度和间距，不切换到完全不同的产品路径。

## 交互模式

- 返回 Project：顶部首要 link，文案明确，不依赖浏览器返回按钮。
- Close：保留确认提示，仍说明运行进程会被终止。
- Reconnect：用户可手动触发；重新连接期间显示 connecting/recovering 状态。
- Resize：保持现有手动 resize 语义；按钮在不可发送状态禁用。
- Quick keys：按钮点击直接发送控制序列，不写入 textarea；按钮区域位于 textarea 上方，可横向滚动。
- 文本输入：textarea 支持多行；Enter 换行；Send 显式发送；空白输入不发送。
- 收起输入区：只改变输入区可视高度，不关闭 WebSocket，不清空 textarea；收起后保留恢复按钮。

## 页面状态

- 默认态：detail 正在加载或 stream 正在连接时，显示紧凑 header、输出区占位和输入区禁用状态。
- 加载态：session detail query 或 stream 初始连接期间使用 `Loading` / `connecting` / `Recovering stream...` 等文字状态，不立即展示失败结论。
- 空态：输出尚无数据时输出区显示 `Waiting for session output...`。
- 错误态：detail query error、stream 最终错误或 close error 在状态消息区展示；用户仍可 Reconnect 或返回 Project。
- 成功态：connected 后输出区展示 stream 内容，textarea/Send/quick keys 在可发送状态下启用。
- 结束态：runtime ended/closed 时展示结束提示，输入与 quick keys 禁用，保留返回 Project 路径。

## 可用性要求

- 顶部 header 高度要克制，长 Project 名、session name、session id 使用 `min-w-0`、`truncate` 或 `break-all`，不得撑开 viewport。
- 状态表达必须有文字：runtime status、transport status、input disabled reason 不只依赖颜色。
- 终端输出区应在手机竖屏中保留合理最小高度；输入区展开时不得遮挡输出最后几行。
- Quick key 触控目标足够大，横向滚动时不影响 textarea 输入。
- Agent 的上/下方向键、Enter、Esc、Tab 应易于发现，支持选择项导航。
- 页面级容器避免横向溢出；长输出行通过输出区滚动/换行策略访问。

## 关键决策

- 输入区从 fixed bottom panel 改为页面布局的一部分，以解决遮挡输出和依赖大 bottom padding 的问题。
- Quick keys 置于 textarea 上方，因为选择题/CLI 控制通常先操作方向键或确认，再需要普通文本输入。
- 连接恢复采用中间状态，而不是初始 WebSocket error 立即显示 “Session stream connection failed.”。
- Agent/Terminal 共享控制台布局，差异集中在 session type 文案和 quick key 集合。

## 风险与权衡

- 非 fixed 输入区在内容很多时会压缩输出区；通过 flex 剩余空间、`min-h-0` 和输出区最小高度控制可读性。
- 横向 quick key bar 可能隐藏部分按键；保留常用键在默认排序靠前，并允许横向滚动访问全部按钮。
- 延迟失败文案可能让真实错误稍晚暴露；通过 `connecting/recovering` 状态和 Reconnect 按钮保持用户可理解。

## 开放问题

- 无。

## 后续沉淀候选

- Session detail 移动端工作台结构和输入区非遮挡规则。
- Quick keys 上置与 Agent 选择输入支持。
- Stream 恢复中状态优先于即时失败提示的 UX 规则。
