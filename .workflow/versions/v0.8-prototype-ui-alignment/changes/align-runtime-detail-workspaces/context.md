# context

本文件记录单个 change 的看板上下文：它为什么存在、承接了哪些来源、当前已知边界是什么，以及需要如何通过 version shared 与其他 changes 协作。

不要把本文件写成 spec、design、plan 或任务清单；本文件只提供后续阶段开始前必须知道的上下文。

## 来源上下文

### 用户原始意图

本 change 承接 Agent detail 与 Terminal detail 的 terminal-first 工作台还原，并继承本 version 的全部横切基线。

- 编号：1
  原始意图：在已有基础功能之上做一轮细节级 prototype UI alignment，覆盖 Home、Project Agent workspace、Agent detail、Files/Git/Terminal workspace、Terminal detail 的桌面端与移动端结构、密度、导航、返回模型和交互细节，让真实页面更贴近现有 HTML 原型。
- 编号：11
  原始意图：这轮 prototype UI alignment 的重点验收区域是 Home/Project shell 与列表密度、Agent/Terminal detail 的 terminal-first 输出区和输入抽屉、移动端二级导航与顶部返回规则；这些区域最影响真实页面是否像原型。
- 编号：25
  原始意图：terminal 相关 UI 是这轮原型还原的高优先级细节，必须重点还原输出面板比例、字体/行高、prompt 与状态行、输入抽屉高度、quick keys、移动端收起/展开、不遮挡输出、Agent detail 的 contextual tools，以及 Terminal detail 不显示 Agent-only tools 的边界。
- 编号：26
  原始意图：这轮移动端 UI 还原只检查并保护 PWA/standalone 外壳相关的布局安全，包括底部导航、输入抽屉、滚动区和 safe-area padding 在手机 viewport 下不冲突；不新增 manifest、service worker、离线、通知等 PWA 能力。
- 编号：29
  原始意图：这轮 prototype UI alignment 需要保留并统一 loading、empty、error、disabled、dangerous confirmation 等非 happy path 状态；不扩展业务语义，但要保证这些状态在新 design system 下视觉一致、密度不崩、移动端不挤占主内容，关闭 session/terminal 等危险动作继续保持确认或克制危险表达。
- 编号：31
  原始意图：这轮 prototype UI alignment 中许多约束是横切多个 change 的，包括 design system、alignment contract、可接受差异、shadcn 边界、viewport/artifacts、缺口留存、功能不伪造、小改动少侵入等；进入 roadmap 编排时必须显式识别这些横切基线，让后续多个 change 都继承，而不是只写进某一个页面 change。

### 主动规划上下文

- 背景：Agent/Terminal detail 是真实运行态控制面的核心，terminal-first 输出与输入抽屉决定产品气质和移动端可用性。
- 需要解决的问题：需要让 Agent detail 与 Terminal detail 同时贴近原型，并保持二者边界：Agent detail 有 Files/Git/+Terminal/Meta contextual tools，Terminal detail 不显示 Agent-only tools；移动端 detail 使用顶部返回并隐藏 Project 二级底部导航。
- 支撑的后续目标：验证 terminal primitives、input drawer、quick keys、safe-area 与 detail chrome，为 resource workspace 和最终整体验收提供运行态页面基准。

## 当前已知边界

- 做：按共享基线还原 Agent detail 与 Terminal detail 的 desktop/mobile layout、terminal panel、input drawer、quick keys、状态/关闭动作、移动端返回、滚动区与 safe-area；保存原型/app desktop/mobile 截图和浏览器检查日志。
- 不做：不改变 session/runtime 协议；不新增 provider-native metadata；不伪造 output/history；不把 Agent-only tools 带入 Terminal detail；不新增 PWA 能力；不重写 WebSocket/session 数据流。
- 尚不确定：现有 detail 页组件结构、输入抽屉行为和 quick key 支持程度，需要实现前读取 `web/` 当前代码和相关 specs。

## 协作与共享上下文

### 同 version 间共享

#### 需要写入 shared

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md
- 内容：记录 runtime detail 原型中当前能力/API 不支持或与长期边界冲突的后续缺口。
- 供谁使用：最终 verify change 和后续 roadmap 编排。

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md、.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md
- 内容：如果 terminal/input drawer/mobile detail 实现暴露出共享基线需修正，回写相关小节。
- 供谁使用：后续 resource inspection 和最终 verify。

#### 需要读取 shared

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md
- 用途：确认 Agent/Terminal detail 对应 HTML 原型、desktop/mobile viewport、截图要求、可接受差异与不可接受差异。

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md
- 用途：确认 terminal panel、input drawer、quick keys、status、surface、icons、shadcn/lucide 和 copy 的实现口径。

### 跨 version 间共享

- 需要继承的 docs：docs/project.md；docs/design/prototype/agent-session-detail.html；docs/design/prototype/terminal-instance-detail.html；docs/design/prototype/guidelines.md；docs/design/mobile-session-interaction.md；docs/design/frontend-ui-architecture.md；docs/architecture/session-runtime.md；docs/architecture/agent-runtime.md
- 需要追溯的 archive：无
- 用途：保持 session/runtime 能力边界、Agent/Terminal detail 差异和移动端工作台规则一致。

### 长期沉淀候选

- 候选 docs 路径：docs/design/mobile-session-interaction.md；docs/design/frontend-ui-architecture.md
- 预计沉淀内容：经验证后可沉淀 terminal-first detail、输入抽屉和 mobile detail chrome 的稳定结论。

## 背景引用

- version shared：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md；design-system-note.md；follow-up-gaps.md
- docs：docs/design/prototype/agent-session-detail.html；docs/design/prototype/terminal-instance-detail.html；docs/design/mobile-session-interaction.md；docs/architecture/session-runtime.md；docs/architecture/agent-runtime.md
- archive：无
- 外部调研：vercel-react-best-practices skill（implement-change 阶段必须加载）
