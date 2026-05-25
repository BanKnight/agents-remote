# mobile-session-interaction spec

本文件记录 Agent/Terminal Session detail 移动端交互的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 让用户在手机竖屏中真实使用 Agent/Terminal Session detail：观察终端输出、编辑并发送输入、触发常用控制键、收起或恢复底部操作区。
- 保护 Agent/Terminal 详情页的底部区域，使其优先服务当前会话输入和快捷键，而不是全局导航。

## Requirements

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

### Requirement: Session detail prioritizes terminal content and input controls on mobile

系统 SHALL 让 Agent/Terminal Session 详情页在手机竖屏中优先展示可读终端内容，并把底部区域用于当前会话输入、快捷键和展开/收起控制，而不是全局导航。

#### Scenario: User opens a session detail on a mobile viewport

- **WHEN** 用户在手机竖屏打开 Agent Session 或 Terminal Session 详情页
- **THEN** 页面显示当前 session 的 provider/type、displayName、runtime status 和 transport status
- **AND** 终端输出区域使用移动端可读的等宽字体、字号和行高
- **AND** 底部输入区默认展开并参与页面布局，用于当前会话输入和快捷键
- **AND** 底部输入区不以 fixed/floating 方式遮挡终端输出
- **AND** 页面不在 Agent/Terminal 交互详情底部展示会挤占输入区域的全局 Tab 导航

#### Scenario: User rotates to landscape

- **WHEN** 用户在手机横屏或较宽视口打开同一详情页
- **THEN** 终端区域利用更宽屏幕自然扩展内容宽度
- **AND** 输入、快捷键、关闭、重连等核心操作仍可访问
- **AND** 不要求提供一套独立于竖屏的复杂横屏布局

### Requirement: Bottom input panel can collapse and recover visibly

系统 SHALL 让 Session 详情页底部输入区默认展开，并允许用户一键收起以查看更多终端内容，再通过明显入口恢复展开。

#### Scenario: Bottom input is expanded by default

- **WHEN** 用户进入仍可交互的 Agent/Terminal Session 详情页
- **THEN** 底部输入区默认展开
- **AND** 用户可以立即看到文本输入、发送按钮和快捷键入口

#### Scenario: User collapses the bottom input panel

- **WHEN** 用户点击收起控制
- **THEN** 页面隐藏大块输入区域，为终端输出释放更多可视高度
- **AND** 页面保留明显的小按钮或浮动入口用于重新展开
- **AND** 第一轮不依赖手势作为唯一恢复方式

### Requirement: Mobile text input is multiline and sends explicitly

系统 SHALL 提供手机友好的多行辅助输入层；普通文本由用户编辑后通过发送按钮一次性写入当前 session stream，Enter 默认换行而不是提交。

#### Scenario: User edits multiline input

- **WHEN** 用户在底部输入框中输入多行文本
- **THEN** 输入框允许换行和编辑
- **AND** 按 Enter 默认插入换行
- **AND** 不因手机软键盘 Enter 误触而发送内容

#### Scenario: User sends input explicitly

- **WHEN** 用户点击发送按钮
- **THEN** 系统把当前输入框内容发送到当前 Agent/Terminal Session stream
- **AND** 发送成功后清空输入框
- **AND** 空白输入不会发送无意义内容

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

### Requirement: Default quick keys are session-type aware without first-round configuration UI

系统 SHALL 为 Agent Session 和 Terminal Session 分别提供代码内默认快捷键集合与排序；第一轮不提供快捷键配置界面。

#### Scenario: Agent Session quick keys are rendered

- **WHEN** 用户打开 Agent Session 详情页
- **THEN** 页面展示适合 Agent CLI 交互的默认快捷键集合
- **AND** 默认集合包含上/下方向键和 Enter，以支持 Agent 选择项导航
- **AND** 快捷键排序由代码内默认配置决定
- **AND** 不要求用户先配置快捷键才能使用

#### Scenario: Terminal Session quick keys are rendered

- **WHEN** 用户打开 Terminal Session 详情页
- **THEN** 页面展示适合普通 shell/terminal 的默认快捷键集合
- **AND** 该集合可以与 Agent Session 默认集合不同
- **AND** 第一轮不提供用户自定义或排序界面

### Requirement: Quick keys send control sequences directly to the session

系统 SHALL 让快捷键按钮直接向当前 session stream 发送对应按键序列；普通文本仍通过多行输入框发送。

#### Scenario: User taps a control quick key

- **WHEN** 用户点击 Ctrl+C、Esc、Tab、方向键等快捷键按钮
- **THEN** 系统向当前 Agent/Terminal Session stream 发送该快捷键对应的控制序列
- **AND** 不把快捷键文本插入多行输入框等待手动发送

#### Scenario: Transport is disconnected or runtime ended

- **WHEN** 当前 stream 未连接、正在重连或 runtime 已结束
- **THEN** 发送按钮和快捷键应禁用或给出不可发送状态
- **AND** 用户仍能看到重连或返回列表等恢复路径

### Requirement: Terminal display remains readable without full terminal customization

系统 SHALL 在第一轮为 Agent/Terminal 输出区域设置手机可读的等宽字体、字号、行高和宽度适配，而不要求提供复杂字体、主题或 terminal emulator 设置。

#### Scenario: Output contains terminal text on mobile

- **WHEN** Session detail 输出区域展示 CLI 或 shell 内容
- **THEN** 文本在手机竖屏中可读
- **AND** 长行可以通过合适的横向滚动、换行或容器宽度策略访问
- **AND** 不要求第一轮提供字体大小、主题、光标样式或完整 xterm 设置面板

### Requirement: Re-entering a session attempts recovery before showing stream failure

系统 SHALL 在用户重新进入仍存在的 Agent/Terminal Session detail 时优先展示连接中或恢复中状态，并尝试恢复 stream，而不是立即显示失败结论。

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

## Notes

- 当前长期契约只承诺第一轮 text stream 可读和移动输入辅助可用，不承诺完整 terminal emulator、ANSI parsing、alternate screen、selection/copy 或 IME 深度适配。
- Session detail 移动端输入区参与页面布局，不应通过 fixed/floating 面板遮挡终端输出。
- 快捷键集合第一轮由代码默认配置决定；Agent 默认集合包含方向键和 Enter，用于 CLI 选择项导航。用户自定义、持久化排序和 provider capability driven key profile 需要后续 change 单独设计。

## 来源

- change：implement-mobile-session-interaction
- verify 证据：`.workflow/changes/implement-mobile-session-interaction/verify.md`
- change：rework-session-mobile-console
- verify 证据：`.workflow/changes/rework-session-mobile-console/verify.md`
- 运行态验证证据：`.workflow/changes/rework-session-mobile-console/artifacts/mobile-session-detail.png`
