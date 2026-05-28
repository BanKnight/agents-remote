# UI/UX Design

## Change

- change-id：align-runtime-detail-workspaces

## 页面 / 界面范围

- Agent detail：`/projects/:projectName/agent-sessions/:sessionId`。
- Terminal detail：`/projects/:projectName/terminal-sessions/:sessionId`。
- Desktop viewport：`1440x1000`；mobile viewport：`390x844`，同时保留响应式和 safe-area 规则。
- 页面状态：connected、connecting/recovering、disconnected/error、ended、close pending、input disabled、empty output、contextual Files/Git loading/error/empty。

## 页面结构

- 两类 detail 都采用深层 runtime detail chrome：外层深色 console background，内部为 compact header、terminal-first 主体、bottom input drawer 三段结构。
- Header 主信息：返回入口、session type marker、displayName、project/session context、runtime status、transport status。
- Agent detail header actions：Files、Git、+Terminal、Meta 作为 contextual tools；Reconnect/Resize/Close 作为 session controls。
- Terminal detail header actions：只保留 Reconnect/Resize/Close 或等价 shell 控制；不显示 Files、Git、+Terminal、Meta、provider pill。
- 主体优先是 terminal output panel：titlebar、scrollback/status chip、等宽输出、局部滚动和长行 wrap。
- Input drawer 在 terminal view 下显示：drawer head、quick keys、textarea/send 或 collapsed 恢复提示；它参与布局，不遮挡 output。
- Agent contextual Files/Git view 可以临时替代 terminal output，但必须提供清晰的 Back to stream，且仍保持只读/staged 边界。

## 交互模式

- 返回：Agent detail 默认回 Project Agent workspace；Terminal detail 默认回 Terminal workspace；Agent 派生 Terminal detail 回来源 Agent detail。移动端仍使用顶部返回，不显示 Project 二级底部导航。
- Meta：Agent detail 使用本地 overlay 或 popover 展示真实字段；打开/关闭不改变 route，不新增 API。
- +Terminal：仅 Agent detail 显示；成功后进入新 Terminal detail，并带来源 Agent context。
- Reconnect：增加 reconnect key，恢复当前 session stream；不创建新 session。
- Resize：保留当前真实 resize 行为，但视觉上作为次要 runtime control，不抢占主任务。
- Close：危险动作，必须有确认；确认中按钮 disabled 或表达 pending。
- Quick keys：点击立即发送 control sequence；disabled 时保持可见但不可点，状态不能只靠颜色。
- Drawer collapsed：只收起 textarea/部分内容，保留恢复入口和有限 quick keys；不清空输入、不关闭 stream。

## 页面状态

- 默认态：connected/running 时，terminal output 占据主要区域，drawer 展开，quick keys 和 Send 可用。
- 加载态：session detail query 或 stream connecting 时，header 可以显示 Loading/Recovering，主体保留 terminal frame 或紧凑 notice，不用大块空页面替代。
- 空态：output 暂无内容时显示真实等待输出文案，不伪造 terminal 内容。
- 错误态：detail query error 或 stream error 使用同一 danger surface，提供 Reconnect/Back 等恢复路径；错误文案不挤掉 output 布局。
- 成功态：connected/running/status pill 文案明确，runtime 与 stream 分开表达。
- 禁用态：runtime ended、stream disconnected、close pending 时，Send/quick keys/resize disabled；保留返回、Reconnect 或结束提示。
- 危险态：Close 使用 danger tone 并保留确认；不要求输入 session 名做二次确认。

## 可用性要求

- 移动端首屏必须优先看到 header context、terminal output 起始区域和 input drawer 状态；不要让 metadata 或说明文案挤占 output。
- Terminal output 和 input drawer 不得互相覆盖；safe-area padding 只服务底部输入区域，不造成页面背景缝隙。
- 长 session id、project path、terminal line 和 command output 必须 break/wrap 或局部滚动，不允许横向撑破页面。
- Header actions 在窄屏可换行或缩短标签，但 Terminal detail 不因空间不足引入 Agent-only actions。
- 状态表达必须有文字，不能只靠绿色/黄色/红色。
- 可点击项保留 pointer/focus/disabled affordance，延续 shared shell component 合同。

## 关键决策

- Agent/Terminal detail 共享 terminal-first detail grammar，差异只在 contextual tools 和 provider metadata 是否出现。
- Terminal detail 的“少”是产品边界：focused shell 不因为复用 Agent header 而泄漏 Files/Git/+Terminal/Meta。
- Input drawer 是布局区，不是 overlay；这保证移动端可读和 safe-area 可控。
- Contextual Files/Git 是 Agent detail 内的辅助视图，不在本 change 追求 Files/Git page-level prototype 完整度。

## 风险与权衡

- 原型展示了较丰富的 sample output 和 meta；真实实现不能伪造这些内容，只能以真实 stream/fields 填充，视觉丰满度可能低于原型。
- 当前 route-local contextual Files/Git 可能与后续 resource inspection change 重叠；本 change 只确保边界和密度，不做 full Files/Git detail polishing。
- Mobile actions 标签过长会挤压 header；实现应优先短标签与 wrap，而不是隐藏关键状态。

## 开放问题

- 如果真实 app 在验证环境无法创建 Agent runtime，Agent detail app screenshot 需要先准备可控 session fixture 或记录阻塞。
- 是否需要在本 change 中把 quick key model 追加单测，取决于现有 `console-model.test.ts` 覆盖是否足够。

## 后续沉淀候选

- Agent/Terminal runtime detail 的 mobile header/input drawer 规则。
- Focused Terminal detail 与 Agent contextual tools 的长期视觉/交互边界。
