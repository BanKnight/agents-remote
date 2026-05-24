# mobile-session-interaction spec

本文件记录 Agent/Terminal Session detail 移动端交互的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 让用户在手机竖屏中真实使用 Agent/Terminal Session detail：观察终端输出、编辑并发送输入、触发常用控制键、收起或恢复底部操作区。
- 保护 Agent/Terminal 详情页的底部区域，使其优先服务当前会话输入和快捷键，而不是全局导航。

## Requirements

### Requirement: Session detail prioritizes terminal content and input controls on mobile

系统 SHALL 让 Agent/Terminal Session 详情页在手机竖屏中优先展示可读终端内容，并把底部区域用于当前会话输入、快捷键和展开/收起控制，而不是全局导航。

#### Scenario: User opens a session detail on a mobile viewport

- **WHEN** 用户在手机竖屏打开 Agent Session 或 Terminal Session 详情页
- **THEN** 页面显示当前 session 的 provider/type、displayName、runtime status 和 transport status
- **AND** 终端输出区域使用移动端可读的等宽字体、字号和行高
- **AND** 底部区域默认展开，用于当前会话输入和快捷键
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

### Requirement: Default quick keys are session-type aware without first-round configuration UI

系统 SHALL 为 Agent Session 和 Terminal Session 分别提供代码内默认快捷键集合与排序；第一轮不提供快捷键配置界面。

#### Scenario: Agent Session quick keys are rendered

- **WHEN** 用户打开 Agent Session 详情页
- **THEN** 页面展示适合 Agent CLI 交互的默认快捷键集合
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

## Notes

- 当前长期契约只承诺第一轮 text stream 可读和移动输入辅助可用，不承诺完整 terminal emulator、ANSI parsing、alternate screen、selection/copy 或 IME 深度适配。
- 快捷键集合第一轮由代码默认配置决定；用户自定义、持久化排序和 provider capability driven key profile 需要后续 change 单独设计。

## 来源

- change：implement-mobile-session-interaction
- verify 证据：`.workflow/changes/implement-mobile-session-interaction/verify.md`
