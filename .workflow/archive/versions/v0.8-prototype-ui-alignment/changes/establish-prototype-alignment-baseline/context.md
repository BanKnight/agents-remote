# context

本文件记录单个 change 的看板上下文：它为什么存在、承接了哪些来源、当前已知边界是什么，以及需要如何通过 version shared 与其他 changes 协作。

不要把本文件写成 spec、design、plan 或任务清单；本文件只提供后续阶段开始前必须知道的上下文。

## 来源上下文

### 用户原始意图

本 change 承接本轮 prototype UI alignment 的横切基线意图，并作为后续页面还原 changes 的共享前置。以下原始意图已从 `.workflow/intents.md` 移入本 version，不再保留在 intents 池中。

- 编号：1
  原始意图：在已有基础功能之上做一轮细节级 prototype UI alignment，覆盖 Home、Project Agent workspace、Agent detail、Files/Git/Terminal workspace、Terminal detail 的桌面端与移动端结构、密度、导航、返回模型和交互细节，让真实页面更贴近现有 HTML 原型。
- 编号：2
  原始意图：这轮 prototype UI alignment 不能盲目复制 HTML 原型，而要从最佳实践出发，有计划地识别导航、列表、状态、操作按钮、终端面板、输入抽屉等共有部分并抽象成可复用组件，保证实现清晰、结构化、可维护。
- 编号：3
  原始意图：`vercel-react-best-practices` skill 已通过 Vercel `npx skills` CLI 全局安装；后续 React 前端开发和 prototype alignment，尤其是执行 `implement-change` 时，必须先加载该 skill，并把 Vercel 维护的 React/Next.js 性能与实现实践作为组件编写、重构和代码评审约束。
- 编号：4
  原始意图：这轮 prototype UI alignment 不只抽象 React 组件，也必须从 HTML 原型中提炼薄设计系统基线，包括颜色语义、字体层级、间距密度、surface 层级、状态色、圆角/边框、终端面板气质、移动端导航规则和响应式节奏。
- 编号：5
  原始意图：这轮前端抽象要使用 `shadcn/ui` 作为交互语义、可访问性和基础组件能力来源，但视觉层由从原型提炼的 design tokens、variants 和 console primitives 接管，避免直接套用默认 shadcn dashboard 风格。
- 编号：6
  原始意图：prototype UI alignment 应先提炼一层很薄但明确的 design system 和共享 primitives 基线，再逐页还原 Home、Project、Agent detail、Files/Git/Terminal 等页面，并在落地过程中修正基线。
- 编号：7
  原始意图：这轮还原验收以 `docs/design/prototype/*.html` 为主参考，以 prototype screenshots 为辅助参考；重点对照结构、层级、交互状态、布局密度和浏览器真实渲染效果，而不是追求 pixel-perfect。
- 编号：8
  原始意图：这一版先完成原型还原；原型中缺失真实功能或 API 支撑的区域，结构和视觉可以按原型表达为空态、staged 或 future 状态，但不要伪造数据，缺失能力放到后续版本完善。
- 编号：9
  原始意图：这轮还原需要保留一份轻量的原型对照/验收清单，列出每个页面对应的 HTML 原型、桌面端与手机端各自必须对齐的结构点、可接受差异和缺失 API 的 future 状态；注意现有原型文件通常把桌面端和手机端放在同一个 HTML 中，验收时必须明确区分两种 viewport。
- 编号：10
  原始意图：这轮 prototype UI alignment 应尽可能小改动、少侵入地靠近原型，因为当前功能行为已经比较贴合原型；优先在现有页面和数据流上提炼 design tokens、共享 primitives 与局部布局调整，不重写 API/client/query/session 逻辑，不为了抽象而抽象。
- 编号：11
  原始意图：这轮 prototype UI alignment 的重点验收区域是 Home/Project shell 与列表密度、Agent/Terminal detail 的 terminal-first 输出区和输入抽屉、移动端二级导航与顶部返回规则；这些区域最影响真实页面是否像原型。
- 编号：12
  原始意图：这轮视觉气质优先抓 surface 层级、布局密度和状态表达，包括大 shell 面板、工作区背景、列表行/卡片边界、按钮层级、status pill、terminal 面板等；字体和配色也要跟进，但不能为了微调颜色先牺牲结构和密度。
- 编号：13
  原始意图：prototype HTML 与 React 实现不要求 DOM 结构完全一致；由于实现会使用 React 组件抽象和 shadcn/ui 包装结构，验收应优先判断视觉、布局、交互和状态语义是否与原型等价，结构断言只检查关键行为地标而不是 HTML 节点树或 class 名完全一致。
- 编号：14
  原始意图：这轮 prototype UI alignment 要提前写清楚可接受差异与不可接受差异，并在需要跨多个 change 时写入共享材料且同步进入各 change 上下文；可接受差异包括 React/shadcn DOM 包装不同、少量字体渲染差异、1-2px 间距/阴影差异、真实数据长度差异、缺失功能 empty/future 表达，不可接受差异包括导航层级错、移动端返回位置错、detail 页底部导航与输入区冲突、terminal-first 被挤掉、列表密度明显偏离、伪造不存在数据。
- 编号：15
  原始意图：如果 prototype UI alignment 拆成多个 change，必须先用第一个 change 产出很薄但明确的共享基线：`alignment contract` 负责验收口径，`design system note` 负责实现口径；后续页面还原 change 必须依赖并继承这两份共享材料，且允许在页面实现中发现问题后回写修正基线。
- 编号：16
  原始意图：prototype UI alignment 遇到原型与长期 docs 或现有功能边界冲突时，安全/能力边界优先于原型视觉，纯布局和视觉冲突时按原型；不为还原原型新增写操作、伪造功能、绕过 Project-safe path 或改变 session/runtime 语义，但冲突和缺失能力要记录下来，后续安排新版本解决。
- 编号：17
  原始意图：这轮 prototype UI alignment 中发现的原型缺口、长期 docs 冲突、缺失功能/API 和需要后续版本解决的问题，应留存在该 version 的 shared 材料中，便于用户后续查验和安排下一轮版本。
- 编号：18
  原始意图：`alignment contract` 中应包含一个轻量 Prototype Map 小节，用于记录每个 HTML 原型对应的真实 route/page、desktop/mobile 形态、页面还原 change 和截图要求；不要为此额外创建独立 inventory 文档。
- 编号：19
  原始意图：`shadcn/ui` 应通过标准 CLI 初始化和添加组件，接受本轮原型还原所需的必要依赖，但只引入实际需要的最小组件集；不要手写复制 shadcn 源码，也不要提前添加未使用组件。
- 编号：20
  原始意图：如果 shadcn 默认组件结构和本项目 console primitives 有冲突，优先保留 shadcn 的交互语义和可访问性结构，通过 variants、className、tokens 和 wrapper primitives 适配原型视觉；只有默认抽象确实阻碍原型交互时，才局部封装或不用该组件。
- 编号：21
  原始意图：design system baseline 必须明确“不抽象清单”：页面专属文案、一次性布局细节、只出现一次的组合、业务数据转换、API/query 逻辑、路由状态逻辑都不抽成通用组件；只抽真正跨页面复用并服务原型还原的视觉/交互 primitives。
- 编号：22
  原始意图：prototype UI alignment 原则上不主动调整现有路由/search state 或状态管理方式；只有当前状态承载阻碍原型要求的移动端返回、二级 workspace 或深层 detail 行为时，才做最小必要调整，其他情况保留现有 TanStack Router / Query / Jotai 分工。
- 编号：23
  原始意图：这轮 design system 与 UI 还原只面向暗色 Server Agent Console 主题，不顺手设计 light mode；tokens、surface 和组件变体都应服务深色原型气质。
- 编号：24
  原始意图：这轮 UI 还原应统一图标体系，优先使用 `lucide-react`；无论底层选型如何，都要通过统一 icon primitive、尺寸、颜色、容器和状态规则管理 Project、Agent provider、Files、Git、Terminal、History、Status 等入口，方便后续替换和优化，不手写零散 SVG。
- 编号：25
  原始意图：terminal 相关 UI 是这轮原型还原的高优先级细节，必须重点还原输出面板比例、字体/行高、prompt 与状态行、输入抽屉高度、quick keys、移动端收起/展开、不遮挡输出、Agent detail 的 contextual tools，以及 Terminal detail 不显示 Agent-only tools 的边界。
- 编号：26
  原始意图：这轮移动端 UI 还原只检查并保护 PWA/standalone 外壳相关的布局安全，包括底部导航、输入抽屉、滚动区和 safe-area padding 在手机 viewport 下不冲突；不新增 manifest、service worker、离线、通知等 PWA 能力。
- 编号：27
  原始意图：Home/Project 入口必须保持原型强调的可扫读密度，明确避免厚卡片、大段说明和 dashboard 化布局；优先服务打开已有 Project 和进入工作区，创建/采用等低频入口应降级，列表行紧凑且少 metadata。
- 编号：28
  原始意图：Files/Git inspection 页面重点还原列表 + 详情/预览结构和移动端层级，不新增能力；Files 保持只读浏览/预览，Git 保持只读 status/diff，桌面端使用列表 + preview/diff 分栏，移动端进入文件预览或 diff detail 后隐藏底部二级导航，只保留顶部返回。
- 编号：29
  原始意图：这轮 prototype UI alignment 需要保留并统一 loading、empty、error、disabled、dangerous confirmation 等非 happy path 状态；不扩展业务语义，但要保证这些状态在新 design system 下视觉一致、密度不崩、移动端不挤占主内容，关闭 session/terminal 等危险动作继续保持确认或克制危险表达。
- 编号：30
  原始意图：这轮 UI 还原可以轻量调整 copy 文案以贴近原型的短句和 console 气质，主要删除过长说明、重复 metadata 和 dashboard 式解释，压短按钮与状态文案；但不做产品文案重写、不改变行为含义、不承诺原型里没有真实能力支撑的功能。
- 编号：31
  原始意图：这轮 prototype UI alignment 中许多约束是横切多个 change 的，包括 design system、alignment contract、可接受差异、shadcn 边界、viewport/artifacts、缺口留存、功能不伪造、小改动少侵入等；进入 roadmap 编排时必须显式识别这些横切基线，让后续多个 change 都继承，而不是只写进某一个页面 change。

### 主动规划上下文

- 背景：本轮 UI 目标不是增加功能，而是在现有基础功能已比较贴合原型的前提下，系统性建立“怎么还原原型”的共享判断标准和实现基础。
- 需要解决的问题：如果直接逐页实现，横切约束会散落在页面 change 中，导致 shadcn 使用边界、可接受差异、viewport、artifacts、follow-up gaps、设计 token 和组件抽象规则不一致。
- 支撑的后续目标：供 `align-home-project-shell`、`align-runtime-detail-workspaces`、`align-resource-inspection-workspaces` 和最终 release verify 读取，确保后续多个 changes 继承同一套 prototype fidelity 标准。

## 当前已知边界

- 做：产出 `.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`、`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md` 和 `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md` 的初版；明确 Prototype Map、desktop/mobile viewport、可接受/不可接受差异、artifacts 要求、缺口留存规则、shadcn/ui 使用边界、lucide-react 图标体系、暗色 tokens、console primitives、不抽象清单、非 happy path 状态和 `vercel-react-best-practices` 加载约定。
- 不做：不直接逐页还原业务页面；不新增真实 API 或伪造数据；不把 shared 材料直接沉淀进 `docs/`；不做完整设计系统或 light mode；不进行大规模重写。
- 尚不确定：shadcn/ui 当前项目是否已初始化、需要的最小组件集、现有页面与原型的具体差距，需要后续设计/实现阶段核对当前代码和原型。

## 协作与共享上下文

### 同 version 间共享

#### 需要写入 shared

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md
- 内容：原型对齐验收口径、Prototype Map、viewport、可接受/不可接受差异、页面 artifacts 要求、结构断言边界、缺失 API/future 状态表达、follow-up gaps 记录规则。
- 供谁使用：本 version 下所有后续页面还原 changes 与最终 verify change。

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md
- 内容：从 HTML 原型提炼的薄 design system 实现口径，包括 shadcn/ui、lucide-react、tokens、surface、density、status、terminal、input drawer、mobile navigation、console primitives、组件抽象规则和不抽象清单。
- 供谁使用：所有后续实现与 review 阶段，尤其是 React/shadcn 组件编写、重构和代码评审。

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md
- 内容：本轮还原中发现但不在本 version 解决的原型缺口、长期 docs 冲突、缺失功能/API、真实能力不足、后续版本候选问题。
- 供谁使用：页面还原 changes、最终 verify change 和后续 `plan-versions`。

#### 需要读取 shared

- 路径：无
- 用途：本 change 是共享基线生产者。

### 跨 version 间共享

- 需要继承的 docs：docs/project.md；docs/design/prototype/index.md；docs/design/prototype/guidelines.md；docs/design/frontend-ui-architecture.md；docs/design/console-shell.md；docs/design/mobile-session-interaction.md
- 需要追溯的 archive：无
- 用途：保证本轮共享基线继承已验证的项目定位、原型设计规范、前端 UI 架构、移动端导航和 session detail 边界。

### 长期沉淀候选

- 候选 docs 路径：docs/design/frontend-ui-architecture.md 或后续新增 design system 长期文档
- 预计沉淀内容：如果本轮 alignment contract/design system note 经 verify 后具备长期复用价值，可由 distill-change 提炼到长期 docs；运行态 artifacts 和 follow-up gaps 不直接复制进 docs。

## 背景引用

- version shared：将写入 .workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md、design-system-note.md、follow-up-gaps.md
- docs：docs/project.md；docs/design/prototype/index.md；docs/design/prototype/guidelines.md；docs/design/frontend-ui-architecture.md
- archive：无
- 外部调研：www.skills.sh / vercel-labs `vercel-react-best-practices` skill 已通过 `npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices -g -y --agent claude-code` 全局安装
