# UI/UX Design

## Change

- change-id：implement-mobile-session-interaction

## 页面 / 界面范围

- Agent Session detail route：`/projects/:projectName/agent-sessions/:sessionId`
- Terminal Session detail route：`/projects/:projectName/terminal-sessions/:sessionId`
- 范围只包含会话详情页的移动端交互和响应式布局，不改变 Project Console 首页、Project list 或 Files/Git 占位。

## 页面结构

- 顶部上下文区：保留返回 Project、Project name、session type/provider、displayName、internal session id、runtime status、stream status。移动端应压缩为信息层级清楚的 header，不占用过多高度。
- 主内容区：terminal output 是页面核心，应在手机竖屏中占用剩余主要高度；输出容器使用深色、等宽字体、可滚动、可横向访问长行。
- 底部操作区：sticky/fixed bottom panel，默认展开，包含多行输入、Send 按钮和 quick key 列表；收起时只保留明显的展开按钮。
- 辅助 controls：Reconnect、Close session、Back to Project console、Resize 等操作不应挤占底部输入主路径；可放在 header 下方或折叠的 controls 区。
- 桌面/宽屏：可以恢复为更宽的内容区和旁侧信息区，但同一套输入/快捷键语义不变。

## 交互模式

- 进入详情页：底部输入区默认展开，textarea 获得明确 label 和 placeholder，用户可以立即输入。
- 收起输入区：用户点击 Hide/Collapse 后，textarea 和快捷键区域隐藏，终端输出可获得更多高度；页面底部保留 “Show input” 或等价明显按钮。
- 多行输入：Enter 插入换行；Send 按钮发送。发送前 trim 检查只用于判断是否全空白，但发送内容应保留用户输入的换行和非空白格式。
- 快捷键：按钮标签显示 `Ctrl+C`、`Esc`、`Tab`、`↑` 等用户可理解名称；点击后立即向 stream 发送对应 sequence，不写入 textarea。
- 不可发送状态：stream 未 connected、runtime ended、close pending 时 Send 和 quick key disabled；断连时显示 Reconnect；ended 时提示返回 Project console。
- Close：继续使用确认弹窗，文案说明会终止运行进程。

## 页面状态

- 默认态：header 显示 session context 和 status；terminal output 展示 snapshot/output 或等待输出；底部输入区展开。
- 加载态：detail 或 stream 正在加载时，显示 Loading/connecting 状态；输入和快捷键禁用直到 stream connected。
- 空态：没有 output 时显示 “Waiting for session output...” 或等价占位，不隐藏输入区。
- 错误态：detail error 或 stream error 显示可读错误；输入保持但不可发送或由 connected 状态控制；提供 Reconnect/Back。
- 成功态：发送普通输入或快捷键后无需 toast；清空普通输入并保持焦点/输入区可继续操作。
- Ended 态：显示 runtime ended notice，禁用输入与快捷键，保留 Back to Project console。

## 可用性要求

- 触控目标不小于常见手机可点击尺寸；quick key 可以横向滚动或换行，但不能过密到误触。
- 状态不只依赖颜色，必须有 Runtime/Stream 文本标签。
- 输出字体第一轮使用项目现有等宽字体栈，移动端字号不低于当前可读范围，行高保持命令输出可扫读。
- 底部 panel 应避免覆盖 terminal 最后一行；主内容区需要足够底部 padding 或布局预留。
- 横屏不需要新产品路径，但不能出现输入区完全不可见、关闭/重连不可访问或输出宽度固定过窄。
- 键盘用户仍可 tab 到 textarea、Send、quick keys、Reconnect 和 Close。

## 关键决策

- 不在 Session Detail 底部放全局 Tab：该区域必须服务输入、快捷键和展开/收起，避免误触并减少软键盘场景下的空间竞争。
- 默认展开底部输入区：用户进入详情页的主要任务是观察并继续当前会话，默认展示输入比默认沉浸查看更符合第一轮可用性。
- 快捷键直接发送：control keys 是操作会话的即时动作，不应混入普通文本编辑区。
- 不引入复杂主题/字体设置：第一轮只提供可读默认值，避免把移动端可用性变成设置面板问题。

## 风险与权衡

- 继续使用 text/pre 而非 terminal emulator 无法完整表达 ANSI、光标、交互式 TUI；但不新增依赖能更快完成第一轮移动输入体验，并保持 scope 可验证。
- fixed/sticky bottom panel 在移动端软键盘下可能受浏览器 viewport 行为影响；实现需通过浏览器 E2E 至少覆盖竖屏打开、输入、收起/展开。
- 快捷键 sequence 在不同 provider/terminal 中可能表现不同；第一轮只承诺发送对应 sequence，不承诺每个 CLI 对每个按键都有相同行为。

## 开放问题

- 是否需要在后续引入真正 terminal emulator 以支持 ANSI、cursor、alternate screen 和 fit resize。
- 是否需要根据 provider 状态动态调整 quick key 集合，例如 approval、interrupt、newline 等。
- 是否需要保存用户上次展开/收起偏好，第一轮不持久化。

## 后续沉淀候选

- Session Detail 移动端页面结构、底部输入区交互、quick key 可用性规则可在 verify 后沉淀到长期 mobile session interaction design。
