# UI/UX Design

## Change

- change-id：align-instance-detail-workspaces

## 页面 / 界面范围

- Agent Session detail：`/projects/:projectName/agent-sessions/:sessionId`。
- Terminal Session detail：`/projects/:projectName/terminal-sessions/:sessionId`。
- Agent detail 派生的 Files、Git、+Terminal、Meta contextual entry。
- 桌面端：宽工作台中的 terminal-first detail。
- 移动端：顶部返回 + terminal output + 可展开/收起 input drawer；不显示 Project 二级底部导航。

## 页面结构

- Detail 外壳使用深层 detail chrome：顶部紧凑 header、主体 terminal output、底部 input drawer / quick key area。
- Header 左侧：返回入口、Agent provider marker 或 Terminal marker、displayName、Project/session 简短上下文。
- Header 右侧：
  - Agent detail：status、Files、Git、+Terminal、Meta、Close 等辅助操作；窄屏使用短标签或 icon-like 文案。
  - Terminal detail：status、Close/Reconnect/Resize 等 shell 操作；不展示 Files/Git/+Terminal/Meta。
- Terminal output 是主区域，使用等宽字体、可滚动、支持长行不横向撑破页面。
- Input drawer 位于底部并参与布局；展开时显示 quick keys、textarea/输入行、Send/connected 状态；收起时保留恢复入口和可识别 compact 状态。
- Meta 以浮窗/弹层呈现，不作为常驻侧栏，不挤占 terminal output。

## 交互模式

- 主路径：从 Agent/Terminal workspace 打开 detail → 查看 runtime output → 使用 quick keys 或文本输入继续当前 session → 必要时 close/reconnect。
- Agent tools：
  - Files：进入当前 Project/Agent context 的只读 Files view。
  - Git：进入当前 Project/Agent context 的只读 Git inspection view。
  - +Terminal：创建 Project-scoped Terminal Session 并进入 Terminal detail。
  - Meta：打开轻量 metadata 浮窗，关闭后留在当前 Agent detail。
- Terminal detail：只服务当前 shell，用户通过输入、quick keys、close/reconnect/resize 操作当前 Terminal。
- 移动返回：detail 使用顶部返回回来源上下文；底部不出现 Back/Agent/Files/Git/Terminal 二级导航。
- Quick keys：点击即发送真实控制序列，不写入文本输入；普通文本通过明确 Send 发送。

## 页面状态

- 默认态：header 显示 session context/status，terminal output 占主区域，input drawer 展开，quick keys 可见。
- 加载态：session detail/query 加载时保留 detail shell，stream 显示 recovering/connecting 状态。
- 空态：output 尚无内容时显示等待输出，不展示假输出。
- 错误态：session detail 加载失败、stream error、close failure 或 create Terminal failure 使用可读错误文案，并保留返回/reconnect 路径。
- 成功态：stream connected 时输入、Send 和 quick keys 可用；+Terminal 成功后进入新 Terminal detail。
- 禁用态：stream 未 connected、runtime ended、close pending 时输入、Send、quick keys 或危险操作禁用或显示不可用状态。
- Meta open：Meta 浮窗叠加在 detail 上，展示真实 metadata；关闭后恢复 terminal-first 页面。
- Drawer collapsed：输出区获得更多空间，输入内容和 WebSocket 不被清空或关闭，保留 Show/展开入口。

## 可用性要求

- 状态表达必须包含文字，不只依赖颜色。
- Agent detail tools 在移动端必须短且可扫读，不能撑破 header；必要时使用 Files/Git/+T/Meta 短标签。
- Terminal output、session id、Project 名、provider metadata 和长命令不得造成横向 viewport 溢出。
- Close 保持危险确认，且文案说明会终止运行进程。
- Meta 浮窗必须可关闭，且不应阻断返回/reconnect/close 以外的基本恢复路径。
- 移动端触控目标足够大；quick keys 不应只能通过精细横向滚动访问核心按键。
- Agent detail 的 Files/Git/+Terminal 是辅助工具，不应比 terminal output 和 input 更重。

## 关键决策

- 采用 terminal-first，而不是 metadata-first：当前 runtime 控制的核心价值是观察输出与输入控制。
- Agent detail 和 Terminal detail 共享主工作台结构，但 header actions 分化，避免 Terminal detail 混入 Agent-only 能力。
- Meta 使用 overlay，而不是常驻 panel；原因是 metadata 辅助判断但不是主要任务。
- 移动端不显示 Project 二级底部导航；detail 底部空间优先给 input drawer 和 quick keys。
- 不照搬 prototype 中任何缺少真实数据支撑的 recent output/time/branch/provider-native 字段；只展示现有 detail/session/stream 可得到的真实字段。

## 风险与权衡

- Agent tools 过多会挤压 header，移动端需要短标签和可换行/横向安全布局。
- Files/Git contextual pages 与后续 `align-resource-inspection-pages` 有交集；本 change 应优先保证入口、返回模型和不显示 Project 二级导航，资源页细节可由后续 change 补齐。
- 当前 text stream 不是完整 terminal emulator；设计保留 terminal-first 外观和输入能力，但不承诺 ANSI/alternate screen 等完整 TUI 行为。
- +Terminal 从 Agent context 创建后如何返回 Agent detail需要前端 source context 设计；如果无法可靠表达，应退回 Project Terminal workspace 并清楚保留 Project scope。

## 开放问题

- Files/Git contextual view 的完整移动端内容密度是否本 change 完成，还是仅建立入口和深层 navigation shell 后交给 resource inspection change 继续，需要 plan 阶段拆分。

## 后续沉淀候选

- Agent detail 和 Terminal detail 的长期 chrome 差异。
- Deep detail 移动端底部区域归 runtime input，不显示 Project 二级导航。
- Agent detail Meta 浮窗和 contextual tool entry 的长期 UX 边界。
