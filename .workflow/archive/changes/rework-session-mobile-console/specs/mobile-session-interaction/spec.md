# mobile-session-interaction spec

本文件记录 `rework-session-mobile-console` 对 `mobile-session-interaction` 的行为契约增量。

## Change 来源

- change-id：rework-session-mobile-console
- 来源意图：Terminal Session 详情页移动端不应溢出或出现页面滚动条，页头应更节省空间并提供返回入口；输入区不应浮动遮挡终端输出，快捷键按钮应放在输入框上方，终端区域应随页面变化并保留合理最小尺寸；重新进入 Terminal/Agent Session 时不应直接看到 “Session stream connection failed.”；Agent Session 详情页存在类似移动端布局和输入问题，并需要支持 Agent 询问选择项时进行上下移动等选择输入。
- 规划来源：在 `align-mobile-app-shell` 已完成移动端 App-like shell 与视口基线、`rework-project-mobile-workspace` 已明确 Project 工作区不承载真实输入后，收敛 Agent/Terminal Session detail 的移动控制台体验。

## ADDED Requirements

### Requirement: Session detail provides a compact returnable mobile console header

系统 SHALL 在手机视口中为 Agent/Terminal Session detail 提供节省高度的顶部上下文，并提供返回 Project 工作区的明确入口。

#### Scenario: User opens a session detail on mobile

- **WHEN** 用户在手机视口进入 Agent Session 或 Terminal Session detail
- **THEN** 顶部区域展示返回当前 Project 工作区的入口
- **AND** 顶部区域展示 session 类型、displayName、runtime status 和 transport status
- **AND** 顶部区域不以大页头或长说明挤占终端输出空间

#### Scenario: User needs to leave the session detail

- **WHEN** 用户想回到当前 Project 工作区
- **THEN** 页面提供不依赖浏览器系统返回按钮的明确返回入口
- **AND** 返回后 Project 工作区仍负责展示 Agent/Terminal 列表与入口

### Requirement: Session detail avoids page-level overflow on mobile

系统 SHALL 让 Agent/Terminal Session detail 在手机视口中以动态视口高度组织输出区和输入区，避免无意义页面级滚动或横向溢出。

#### Scenario: Session output and input fit normal mobile viewport

- **WHEN** 用户在手机竖屏查看 Session detail
- **THEN** 页面外壳撑满可视视口
- **AND** 终端输出区域占据主要剩余空间并在区域内部滚动
- **AND** 页面本身不因固定高度或浮动输入区产生无意义滚动条
- **AND** 长 session id、Project 名、输出长行或状态文案不撑开横向 viewport

#### Scenario: Mobile keyboard or input panel changes available height

- **WHEN** 底部输入区展开、收起或手机软键盘改变可用高度
- **THEN** 终端输出区域随可用空间变化
- **AND** 终端输出保留合理最小可读高度
- **AND** 输入区不遮挡输出区中最后可见内容

### Requirement: Quick keys are placed above the text input on mobile

系统 SHALL 在移动端 Session detail 中把快捷键按钮放在文本输入框上方，且快捷键仍直接向当前 session stream 发送控制序列。

#### Scenario: User views expanded input controls

- **WHEN** 底部输入区处于展开状态
- **THEN** 快捷键按钮位于多行文本输入框上方
- **AND** 常用方向键、Esc、Tab、Ctrl+C 等快捷键不需要用户水平寻找隐藏在输入框下方的区域
- **AND** 文本输入框和 Send 按钮仍可清楚访问

#### Scenario: User taps a selection/navigation quick key

- **WHEN** 用户点击上/下方向键、Enter、Esc 或 Tab 等快捷键
- **THEN** 系统向当前 Agent/Terminal Session stream 发送对应控制序列
- **AND** 不把快捷键标签写入文本框
- **AND** 该行为可用于 Agent CLI 提问选择项时的上下移动和确认

### Requirement: Re-entering a session attempts recovery before showing stream failure

系统 SHALL 在用户重新进入仍存在的 Agent/Terminal Session detail 时优先展示连接中或恢复中状态，并尝试恢复 stream，而不是立即显示 “Session stream connection failed.” 类失败结论。

#### Scenario: User reopens an existing session detail

- **WHEN** 用户从 Project 工作区或浏览器刷新重新进入仍存在的 Agent/Terminal Session detail
- **THEN** 页面先显示连接中、恢复中或等价可恢复状态
- **AND** 系统尝试连接到相同 internal session id 对应的 runtime stream
- **AND** 只有在恢复尝试失败后才展示失败状态和重连入口

#### Scenario: Recovery succeeds

- **WHEN** stream 恢复成功
- **THEN** 页面显示 connected transport 状态
- **AND** 用户可继续查看输出并发送输入或快捷键

#### Scenario: Recovery fails or runtime no longer exists

- **WHEN** stream 恢复失败或底层 runtime 已结束
- **THEN** 页面以文字解释当前不可用状态
- **AND** 提供重连或返回 Project 工作区的恢复路径
- **AND** 不把首次加载中的短暂连接失败误报为最终失败

## MODIFIED Requirements

### Requirement: Session detail prioritizes terminal content and input controls on mobile

修改长期 `mobile-session-interaction` 中移动端详情页布局要求：Agent/Terminal Session detail SHALL 使用紧凑顶部上下文、主输出区和非遮挡式底部输入区组合；底部输入区不能以浮动方式覆盖输出内容。

#### Scenario: User opens a session detail on a mobile viewport

- **WHEN** 用户在手机竖屏打开 Agent Session 或 Terminal Session detail
- **THEN** 页面显示紧凑 session 上下文和返回入口
- **AND** 终端输出区域使用移动端可读的等宽字体、字号和行高
- **AND** 底部输入区默认展开并参与页面布局，不遮挡输出内容
- **AND** 页面不在 Agent/Terminal 交互详情底部展示会挤占输入区域的全局 Tab 导航

### Requirement: Default quick keys are session-type aware without first-round configuration UI

修改长期 `mobile-session-interaction` 中默认快捷键要求：Agent Session 默认快捷键 SHALL 包含支持选择项导航所需的上/下方向键、Enter、Esc、Tab 等控制键；Terminal Session 仍保留普通 shell 常用控制键。

#### Scenario: Agent asks an interactive selection question

- **WHEN** Agent Session 输出需要用户通过方向键移动选择项并确认
- **THEN** 用户可以通过默认快捷键发送上/下方向键和 Enter
- **AND** 第一轮不要求新增 provider-specific 配置 UI

## REMOVED Requirements

- （无）
