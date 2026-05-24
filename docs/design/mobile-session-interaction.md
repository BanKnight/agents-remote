# Mobile session interaction design

本文件记录经过验证后沉淀下来的 Agent/Terminal Session detail 移动端交互长期 design。它面向后续版本复用，不复制单次 change 的过程记录。

## 背景

- Agent/Terminal Session detail 是远程控制服务器 runtime 的主要操作面，手机用户需要在小屏上同时观察输出、输入文本并发送控制键。
- Project Console Shell 可以有全局导航或占位入口，但 Agent/Terminal 详情页底部区域必须优先服务当前会话交互，避免挤占输入和快捷键。
- 第一轮 Session Runtime 已提供 HTTP/WebSocket stream、reconnect、close 和 terminal-like text output；本设计在不新增 terminal emulator 依赖的前提下建立移动端可用基线。

## 适用范围

- Agent Session detail route：`/projects/:projectName/agent-sessions/:sessionId`。
- Terminal Session detail route：`/projects/:projectName/terminal-sessions/:sessionId`。
- Session detail 的 mobile-first header/status、terminal output、bottom input panel、quick key bar、普通文本发送和不可发送状态。
- 不适用于 Project Console shell-level 底部 hint、Files/Git detail、完整 terminal emulator 或快捷键配置界面。

## 设计结论

- Session detail 应采用移动端优先的运行态工作台结构：顶部显示 Project/session/status 上下文，中间终端输出占据主要可视空间，底部固定输入面板承载文本输入和快捷键。
- 底部 input panel 默认展开；用户需要查看更多输出时可以一键收起，收起后必须保留明显的恢复入口，不依赖手势作为唯一恢复方式。
- 普通文本输入使用多行 textarea；Enter 保持换行，只有显式 Send 才把内容写入当前 stream。非空输入按 CLI/shell 直觉保留内容并按需补末尾换行，全空白输入不发送。
- Quick keys 是即时控制动作：按钮点击直接向 stream 发送对应 control sequence，不写入 textarea，也不等待用户再点 Send。
- Agent Session 与 Terminal Session 使用不同默认 quick key 集合和排序，但共享渲染与发送模式；第一轮不提供用户配置、排序持久化或 provider capability API。
- 发送入口由 transport/runtime 可交互状态控制：stream 未 connected、runtime ended 或 close pending 时，textarea/Send/quick keys 应禁用或表达不可发送状态，同时保留 reconnect/back 等恢复路径。
- 第一轮继续使用现有 terminal-like text stream 容器，通过等宽字体、可读字号/行高、滚动和 viewport 高度约束保障手机可读性；完整 xterm/ANSI/TUI 支持留给后续技术设计。

## 关键规则

- 不在 Agent/Terminal Session detail 底部放全局 Tab；该区域属于当前会话输入、快捷键和展开/收起。
- 页面必须同时显示 runtime status 与 transport status，状态表达不能只依赖颜色。
- Bottom panel collapsed 状态不得关闭 WebSocket、不得清空 textarea；它只改变可视区域。
- Quick key sequence 应写在可单测的前端 model/helper 中，并通过测试固定集合、排序和控制序列。
- Detail 页面本地 UI 状态优先使用组件本地 state；不要为了单页展开/收起引入全局状态。
- Close 仍是危险终止动作，应保留确认提示并说明运行进程会被终止。
- 不为了第一轮手机可读性引入 `xterm.js`、fit addon、ANSI parser、字体/主题设置面板或快捷键配置 UI。

## 不适用场景

- 需要完整 terminal emulator、ANSI parsing、alternate screen、cursor、selection/copy、IME 深度适配或 terminal fit/resize observer 时，应单独做技术设计。
- 需要用户自定义快捷键、provider-specific key profile、持久化排序或跨设备同步时，应单独设计配置模型和安全边界。
- 需要离线使用、推送通知、后台同步或 service worker lifecycle 时，应回到 PWA/运行态设计，而不是扩展本页面交互设计。
- Files/Git 等非 runtime detail 页面如果需要底部操作区，应基于其自身任务重新设计，不直接复用会话输入语义。

## 来源

- change：implement-mobile-session-interaction
- verify 证据：`.workflow/changes/implement-mobile-session-interaction/verify.md`
- 运行态验证证据：`.workflow/changes/implement-mobile-session-interaction/artifacts/mobile-session-detail.png`、`.workflow/changes/implement-mobile-session-interaction/artifacts/mobile-smoke-api.log`、`.workflow/changes/implement-mobile-session-interaction/artifacts/mobile-smoke-web.log`
