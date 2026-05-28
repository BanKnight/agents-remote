# context

本文件记录单个 change 的看板上下文：它为什么存在、承接了哪些来源、当前已知边界是什么，以及需要如何通过 version shared 与其他 changes 协作。

不要把本文件写成 spec、design、plan 或任务清单；本文件只提供后续阶段开始前必须知道的上下文。

## 来源上下文

### 用户原始意图

本 change 承接 Files/Git/Terminal workspace 的 resource inspection 还原，并继承本 version 的全部横切基线。

- 编号：1
  原始意图：在已有基础功能之上做一轮细节级 prototype UI alignment，覆盖 Home、Project Agent workspace、Agent detail、Files/Git/Terminal workspace、Terminal detail 的桌面端与移动端结构、密度、导航、返回模型和交互细节，让真实页面更贴近现有 HTML 原型。
- 编号：28
  原始意图：Files/Git inspection 页面重点还原列表 + 详情/预览结构和移动端层级，不新增能力；Files 保持只读浏览/预览，Git 保持只读 status/diff，桌面端使用列表 + preview/diff 分栏，移动端进入文件预览或 diff detail 后隐藏底部二级导航，只保留顶部返回。
- 编号：29
  原始意图：这轮 prototype UI alignment 需要保留并统一 loading、empty、error、disabled、dangerous confirmation 等非 happy path 状态；不扩展业务语义，但要保证这些状态在新 design system 下视觉一致、密度不崩、移动端不挤占主内容，关闭 session/terminal 等危险动作继续保持确认或克制危险表达。
- 编号：31
  原始意图：这轮 prototype UI alignment 中许多约束是横切多个 change 的，包括 design system、alignment contract、可接受差异、shadcn 边界、viewport/artifacts、缺口留存、功能不伪造、小改动少侵入等；进入 roadmap 编排时必须显式识别这些横切基线，让后续多个 change 都继承，而不是只写进某一个页面 change。

### 主动规划上下文

- 背景：Files、Git、Terminal workspace 是 Project 直接二级资源工作区，必须和 shell/detail 层级区分清楚。
- 需要解决的问题：真实页面需要对齐 `files.html`、`git.html`、`terminal.html` 的列表/详情、只读 inspection、桌面分栏、移动端直接二级页与深层 detail 的导航互斥，同时不引入写操作或 runtime input 到 direct secondary workspace。
- 支撑的后续目标：补齐本轮所有核心页面的原型还原覆盖，供最终 release verify 汇总截图和缺口。

## 当前已知边界

- 做：按共享基线还原 Files/Git/Terminal workspace 的 desktop/mobile layout；Files/Git 保持只读列表 + preview/diff，移动端 preview/diff detail 隐藏二级底部导航并使用顶部返回；Terminal workspace 展示 live terminal instances 和 create/open/close 入口但不承载 runtime input；保存原型/app desktop/mobile 截图和浏览器检查日志。
- 不做：不新增 Files 写操作、Git stage/commit/checkout/reset 等写操作；不把 shell input 或 quick keys 放进 Terminal direct secondary workspace；不重写 Files/Git/Terminal API；不伪造缺失数据。
- 尚不确定：当前 Files/Git/Terminal workspace 的页面结构、移动端 detail state 和可复用 primitives，需要实现前读取当前代码与 specs。

## 协作与共享上下文

### 同 version 间共享

#### 需要写入 shared

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md
- 内容：记录 Files/Git/Terminal 原型中当前能力/API 不支持或与长期边界冲突的后续缺口。
- 供谁使用：最终 verify change 和后续 roadmap 编排。

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md、.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md
- 内容：如果 resource workspace 实现暴露出共享基线需修正，回写相关小节。
- 供谁使用：最终 verify 和后续沉淀。

#### 需要读取 shared

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md
- 用途：确认 Files/Git/Terminal 对应 HTML 原型、desktop/mobile viewport、截图要求、可接受/不可接受差异和结构断言边界。

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md
- 用途：确认 list/detail、preview/diff、terminal instance list、icons、status、surface、copy 和 non-happy-path 状态的实现口径。

### 跨 version 间共享

- 需要继承的 docs：docs/project.md；docs/design/prototype/files.html；docs/design/prototype/git.html；docs/design/prototype/terminal.html；docs/design/prototype/guidelines.md；docs/design/frontend-ui-architecture.md；docs/specs/file-browser-preview/spec.md；docs/specs/git-diff-viewer/spec.md；docs/specs/session-runtime/spec.md
- 需要追溯的 archive：无
- 用途：保持 Files/Git 只读 inspection、Terminal workspace/direct detail 分工和移动端层级规则一致。

### 长期沉淀候选

- 候选 docs 路径：docs/design/frontend-ui-architecture.md；docs/design/console-shell.md
- 预计沉淀内容：经验证后可沉淀 resource workspace 的 list/detail、mobile detail 和 direct secondary 边界。

## 背景引用

- version shared：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md；design-system-note.md；follow-up-gaps.md
- docs：docs/design/prototype/files.html；docs/design/prototype/git.html；docs/design/prototype/terminal.html；docs/specs/file-browser-preview/spec.md；docs/specs/git-diff-viewer/spec.md；docs/specs/session-runtime/spec.md
- archive：无
- 外部调研：vercel-react-best-practices skill（implement-change 阶段必须加载）
