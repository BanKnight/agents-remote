# UI/UX Design

## Change

- change-id：build-responsive-pwa-console-shell

## 页面 / 界面范围

- 根入口：Project 列表、创建 Project、服务状态反馈。
- Project console：Project 上下文、Agent 默认主区、Terminal/Git/Files 辅助入口、底部输入/快速操作 affordance。
- PWA shell：移动端 standalone 显示时的视口、主题色和深色背景一致性。

## 页面结构

- 移动端采用单列纵向结构：顶部应用/Project 上下文 → Agent 状态摘要 → Agent session/空状态卡片 → Terminal/Git/Files 入口 → 底部操作 affordance。
- 桌面端采用同一信息架构的扩展布局：左侧或顶部导航展示 Project/section，主区域展示 Agent，右侧或下方展示辅助入口和状态。
- 顶部上下文必须让用户知道当前位于哪个 Project；根入口则明确处于 Project 列表层。
- 原型优先参考 `docs/design/prototype.png` 的暗色控制台气质、状态标签、卡片层级和底部输入区域，但不复制未确认的真实会话数据。

## 交互模式

- Project 选择：从 Project 列表点击进入 Project console；Project 名称中 URL-sensitive 字符仍可进入。
- Section 导航：Agent、Terminal、Git、Files 可作为 tab、segment 或侧边导航；Agent 默认选中。
- 占位能力：用户点击未实现 section 时展示空状态或说明，不触发真实 runtime、文件或 Git 操作。
- 底部 affordance：可展示输入框形态或快速操作栏，但未接入时禁用或显示说明。
- PWA：从手机桌面启动时保留深色背景、standalone 视觉和合适主题色。

## 页面状态

- 默认态：已有 Project 时显示 Project 列表；进入 Project 后默认显示 Agent 主区。
- 加载态：Project 列表或 Project 详情加载中展示深色骨架/状态文本，避免白屏。
- 空态：无 Project 时提示创建或使用 `PROJECTS_ROOT` 下一级目录；无 session 时展示空 Agent Sessions 状态。
- 错误态：Project API 失败时展示可理解错误和重试入口，不泄露服务器内部路径或堆栈。
- 成功态：Project 创建成功后可进入或展示新 Project；Project console 显示当前 Project 上下文。

## 可用性要求

- 移动端触控目标应足够大，主要按钮和 section 入口不小于常见移动端可点区域。
- 状态不只依赖颜色表达，需结合文字标签如 Running、Waiting、Idle、Coming soon。
- 深色主题对比度优先保证可读性，避免过低透明度的灰字承载关键状态。
- 桌面端不应出现大面积空白；可使用侧栏、双栏或更宽卡片提高信息密度。
- 安装到桌面后首屏背景应与 manifest `theme_color` / `background_color` 保持一致。

## 关键决策

- 不展示难以区分真假的 mock 会话列表；优先使用空状态和结构占位。
- 移动端底部输入区域作为视觉 affordance 保留，但 runtime 未接入时不可发送。
- 宽屏适配只改变布局密度，不改变导航语义。

## 风险与权衡

- 原型中的高密度终端信息如果直接照搬，会让用户误以为 runtime 已可用。
- 只支持深色主题降低了首轮复杂度，但必须确保 PWA 启动画面和浏览器 chrome 颜色协调。
- 底部输入 affordance 可能引导用户尝试不可用能力，需要明确禁用或 coming soon。

## 开放问题

- 真实 session 状态颜色与状态文案需等 runtime 语义确定后再冻结。

## 后续沉淀候选

- 移动端优先深色 Project console 结构、状态标签和占位规范可沉淀为长期 UI/UX 设计文档。