# context

本文件记录单个 change 的看板上下文：它为什么存在、承接了哪些来源、当前已知边界是什么，以及需要如何通过 version shared 与其他 changes 协作。

不要把本文件写成 spec、design、plan 或任务清单；本文件只提供后续阶段开始前必须知道的上下文。

## 来源上下文

### 用户原始意图

本 change 承接 Home / Project shell 与列表密度相关的页面还原意图，并继承本 version 的全部横切基线。

- 编号：1
  原始意图：在已有基础功能之上做一轮细节级 prototype UI alignment，覆盖 Home、Project Agent workspace、Agent detail、Files/Git/Terminal workspace、Terminal detail 的桌面端与移动端结构、密度、导航、返回模型和交互细节，让真实页面更贴近现有 HTML 原型。
- 编号：6
  原始意图：prototype UI alignment 应先提炼一层很薄但明确的 design system 和共享 primitives 基线，再逐页还原 Home、Project、Agent detail、Files/Git/Terminal 等页面，并在落地过程中修正基线。
- 编号：10
  原始意图：这轮 prototype UI alignment 应尽可能小改动、少侵入地靠近原型，因为当前功能行为已经比较贴合原型；优先在现有页面和数据流上提炼 design tokens、共享 primitives 与局部布局调整，不重写 API/client/query/session 逻辑，不为了抽象而抽象。
- 编号：11
  原始意图：这轮 prototype UI alignment 的重点验收区域是 Home/Project shell 与列表密度、Agent/Terminal detail 的 terminal-first 输出区和输入抽屉、移动端二级导航与顶部返回规则；这些区域最影响真实页面是否像原型。
- 编号：27
  原始意图：Home/Project 入口必须保持原型强调的可扫读密度，明确避免厚卡片、大段说明和 dashboard 化布局；优先服务打开已有 Project 和进入工作区，创建/采用等低频入口应降级，列表行紧凑且少 metadata。
- 编号：29
  原始意图：这轮 prototype UI alignment 需要保留并统一 loading、empty、error、disabled、dangerous confirmation 等非 happy path 状态；不扩展业务语义，但要保证这些状态在新 design system 下视觉一致、密度不崩、移动端不挤占主内容，关闭 session/terminal 等危险动作继续保持确认或克制危险表达。
- 编号：30
  原始意图：这轮 UI 还原可以轻量调整 copy 文案以贴近原型的短句和 console 气质，主要删除过长说明、重复 metadata 和 dashboard 式解释，压短按钮与状态文案；但不做产品文案重写、不改变行为含义、不承诺原型里没有真实能力支撑的功能。
- 编号：31
  原始意图：这轮 prototype UI alignment 中许多约束是横切多个 change 的，包括 design system、alignment contract、可接受差异、shadcn 边界、viewport/artifacts、缺口留存、功能不伪造、小改动少侵入等；进入 roadmap 编排时必须显式识别这些横切基线，让后续多个 change 都继承，而不是只写进某一个页面 change。

### 主动规划上下文

- 背景：Home / Project shell 是用户进入控制台的第一印象，也是后续 Project 二级 workspace 导航和列表密度的基础。
- 需要解决的问题：真实页面需要对齐 `home.html` 与 `project-detail.html` 的 desktop/mobile shell、底部/侧边导航、Project/Agent 列表密度、创建入口降级和图标语言，同时避免为了视觉还原改动现有 project/session 行为。
- 支撑的后续目标：为 runtime detail 和 resource workspace changes 提供已验证的 shell/nav/primitives 使用方式。

## 当前已知边界

- 做：按共享 alignment contract/design system note 还原 Home、一级 shell、Project Agent workspace、desktop 左侧导航、mobile 底部一级/二级导航、Project/Agent 列表密度、`+ Claude` / `+ Codex` 创建入口和真实状态表达；保留 loading/empty/error/disabled/dangerous 状态；保存 prototype/app desktop/mobile 截图和浏览器检查日志。
- 不做：不新增 Agent history API；不伪造 task summary、recent output 或 provider-native metadata；不重写 Project/session API、Query 或 route state；不把低频创建/采用入口提升成主工作区厚表单；不做 light mode。
- 尚不确定：现有 Home/Project 组件拆分、shadcn/ui 是否已初始化、具体需要哪些最小 primitives，需要实现前读取当前 `web/` 代码确认。

## 协作与共享上下文

### 同 version 间共享

#### 需要写入 shared

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md
- 内容：如果发现原型要求但当前真实功能/API 不支持的 Home/Project/Agent workspace 能力，记录为后续版本缺口。
- 供谁使用：最终 verify change 和后续 roadmap 编排。

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md、.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md
- 内容：如果页面实现暴露出共享基线不准确或不够用，回写修正相关小节。
- 供谁使用：后续 runtime/resource changes。

#### 需要读取 shared

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md
- 用途：确认 Home/Project 对应 HTML 原型、desktop/mobile viewport、可接受/不可接受差异、截图要求和结构断言边界。

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md
- 用途：确认 tokens、surface、density、icons、shadcn/ui、console primitives、copy 和非 happy path 状态的实现口径。

### 跨 version 间共享

- 需要继承的 docs：docs/project.md；docs/design/prototype/home.html；docs/design/prototype/project-detail.html；docs/design/prototype/guidelines.md；docs/design/frontend-ui-architecture.md；docs/design/console-shell.md
- 需要追溯的 archive：无
- 用途：对齐 Home/Projects 一级入口、Project Agent workspace、桌面/移动导航层级和低频创建入口边界。

### 长期沉淀候选

- 候选 docs 路径：docs/design/frontend-ui-architecture.md
- 预计沉淀内容：经验证后可沉淀 Home/Project shell 与列表密度的稳定设计结论。

## 背景引用

- version shared：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md；design-system-note.md；follow-up-gaps.md
- docs：docs/project.md；docs/design/prototype/home.html；docs/design/prototype/project-detail.html；docs/design/prototype/guidelines.md；docs/design/frontend-ui-architecture.md
- archive：无
- 外部调研：vercel-react-best-practices skill（implement-change 阶段必须加载）
