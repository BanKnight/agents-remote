# Product Design

## Change

- change-id：build-responsive-pwa-console-shell

## 用户目标 / 产品目标

- 目标用户是远程调度与观察服务器 Agent 的个人开发者或小团队操作者。
- 用户希望从浏览器或手机桌面打开控制台，快速知道当前 Project 里哪些 Agent 相关工作正在进行、哪些需要关注。
- 本 change 的产品目标是先建立可进入、可安装、可观察的控制台外壳，而不是实现真实 Agent Runtime。

## 功能边界

### 做什么

- 展示登录后的 Project 列表入口，并允许进入某个 Project 的控制台作用域。
- 在 Project 控制台中默认聚焦 Agent Sessions 区域。
- 提供 Agent、Terminal、Git、Files 四类一级入口的信息架构。
- 提供会话卡片或空状态结构，预留运行状态、等待输入和最近输出摘要位置。
- 提供移动端 PWA installable shell，支持 standalone 打开。

### 不做什么

- 不启动、继续、恢复或控制真实 Agent/Codex/Claude 会话。
- 不创建真实 Terminal Session，不发送 terminal input。
- 不读取 Files/Git 真实详情，不执行文件写操作或 Git 写操作。
- 不提供通知、离线、service worker 缓存或后台同步。
- 不提供多 server/hub 管理。

## 用户流程

1. 用户打开 Web/PWA 控制台。
2. 系统展示 Project 列表、Project 创建入口和服务状态反馈。
3. 用户选择一个 Project。
4. 系统进入该 Project 的控制台 shell，并在顶部展示 Project 上下文。
5. 系统默认展示 Agent Sessions 区域；如果无真实 session 数据，展示清晰空状态。
6. 用户可以看到 Terminal/Git/Files 辅助入口；未实现能力进入占位或禁用说明。
7. 移动端底部展示输入/快速操作 affordance，但在 runtime 未接入前不发送真实输入。

## 信息架构

- 全局层：应用名称、Project 列表、Project 创建入口、API 连接状态。
- Project 层：Project 名称、当前工作区上下文、Agent/Terminal/Git/Files 导航。
- Agent 主区：状态摘要、Agent Sessions 列表/空状态、等待输入提示空间、最近输出摘要空间。
- 辅助区：Terminal、Git、Files 的入口卡片或 tab，占位说明后续能力。
- 操作层：底部输入或快速操作区域；第一轮仅作为 shell affordance。

## 体验路径

- 手机端路径强调快速打开和一眼观察：Project 上下文在顶部，Agent 主区在首屏，辅助入口不抢占主区。
- 桌面端路径强调更高信息密度：可展示侧边栏或双栏，但用户路径与移动端一致。
- 未接入能力必须明确表达“尚未接入”，避免用户误以为真实会话正在运行。

## 关键决策

- Agent Sessions 是默认焦点，因为产品核心价值是远程控制和观察 AI Agent。
- Terminal/Git/Files 是辅助入口，先建立位置和语义，不提前实现真实能力。
- PWA 第一轮目标是安装和 standalone 打开，不以离线能力衡量完成。

## 风险与权衡

- 只做外壳可能被误解为已有 runtime 能力，因此所有占位都必须清楚标识。
- 原型中的 terminal 输出和 session 卡片容易看起来像真实数据，实现时应避免不可区分的假数据。
- Project 列表和 Project console 同属首轮入口，过度打磨视觉会挤占后续 runtime 设计时间。

## 开放问题

- 后续真实 Agent 状态枚举、等待输入语义和最近输出摘要长度由 runtime change 决定。

## 后续沉淀候选

- Project console 的长期产品信息架构可在验证后沉淀为 `docs/design/console-shell.md`。