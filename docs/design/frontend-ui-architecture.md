# Frontend UI architecture

本文件记录经过验证后沉淀下来的 frontend UI architecture / prototype alignment 设计基线。它面向后续 UI/UX 对齐 changes 复用，不复制单次 change 的过程记录。

## 背景

- `docs/design/prototype/` 已提供一组导航结构 HTML 原型、设计规范和桌面端/移动端截图，用于指导真实 Web UI 的结构对齐。
- 后续 Home、Project Agent workspace、Agent/Terminal instance detail、Files/Git/Terminal resource pages 会分别推进；如果没有统一 UI architecture，上述页面容易重复实现不一致的 navigation shell、返回模型、列表密度和状态表达。
- 本项目的 Web UI 是移动端优先的深色 Server Agent Console；结构正确优先于像素级一致。

## 适用范围

- Home / 一级应用 shell。
- Project 直接二级 workspace：Agent、Files、Git、Terminal。
- 深层/contextual detail：Agent instance detail、Terminal instance detail、file preview、Git file diff、从 Agent instance 派生进入的 resource context。
- 跨页面 navigation shell、route/workspace 层级、移动端返回模型、基础视觉语言和前端状态边界。

## 设计结论

- 本轮 UI/UX alignment 的来源优先级是：`docs/design/prototype/guidelines.md`、prototype HTML、prototype screenshots、已验证长期 docs、当前实现外观。
- 页面层级采用三层模型：一级应用 shell、Project 直接二级 workspace、深层/contextual detail。
- 桌面端一级/二级页面使用左侧导航 + 工作区；移动端一级页面使用底部一级导航，Project 直接二级页面使用带 Back 项的底部二级导航。
- 移动端直接二级页不在顶部重复 Back；深层/contextual detail 使用顶部返回，不显示底部二级导航。
- Project workspace 不承载 shell-level runtime input；真实输入归 Agent/Terminal instance detail。
- Files/Git 是 Project-scoped 只读 inspection；Agent/Terminal 是 runtime session。两类页面共享 Project scope，但不共享输入语义。
- 后续实现应先收敛 route/workspace 与共享 shell，再对齐具体页面，避免每个页面各自创建导航、状态、列表和操作结构。
- 已验证的 shell foundation 当前采用 `?workspace=agents|files|git|terminal` 承载 Project 直接二级 workspace active 状态；无效 workspace 值回退 Agent。
- Home / Projects 是一级应用 shell 的 Project entry；默认主任务是扫描并打开已有 Project，而不是展示通用 dashboard。
- Home 的 Create/adopt Project 是低频入口；默认不应挤占 Project 列表首屏，但在无 Project、提交中或错误状态下可以提升为可恢复主路径。
- Project Agent workspace 是 Project 默认运行态二级页；顶部提供 `+ Claude` / `+ Codex` provider 创建入口，主体优先展示当前 Agent instances。
- 当前 Agent instances 与 provider history / future restore 必须分区展示；provider history API 未完成前只能显示 staged/empty/future 说明，不提供恢复操作或伪造历史数据。
- Agent workspace 只展示真实 `AgentSession` DTO 支持的 provider、displayName、status、id 和进入/关闭行为；不要为了贴近 prototype 伪造 task summary、recent output 或 relative time。
- Agent/Terminal instance detail 是深层/contextual runtime detail：共享 terminal-first 主体、紧凑顶部返回、运行状态、主输出区和底部 input drawer；移动端不显示 Project 二级底部导航。
- Agent detail 可以提供 Files、Git、+Terminal、Meta contextual tools；这些是 Agent context 派生入口，不是 Project 二级导航，也不应替代 terminal output/input 主任务。
- Terminal detail 保持 focused shell：不显示 Agent-only Files/Git/+Terminal/Meta，不展示 provider metadata，只保留 shell 相关返回、状态、close/reconnect/resize 和输入控制。
- Agent-derived Terminal detail 应保留来源 Agent context 的返回路径；直接从 Project Terminal workspace 打开的 Terminal detail 默认回 Terminal workspace。
- Agent detail Meta 使用本地 overlay 展示真实 project/session/provider/status/stream 字段，不新增 API，不伪造 provider-native metadata。
- Project resource workspace 的已验证边界：Files、Git、Terminal 都是 Project 直接二级 workspace；Files/Git 保持只读 inspection，Terminal workspace 展示 live Terminal instances 并提供 create/open/close 入口。
- 移动端 Files preview 与 Git single-file diff 是同 route 内的深层 inspection detail：顶部返回当前 list，上层 Project 二级底部导航隐藏；Files/Git 的 selected file/diff state 仍是组件本地状态，不进入 route/search。
- 桌面端 Files/Git 可以保留同页 compact list + preview/diff 结构，以提高扫读效率；移动端 direct secondary 默认展示列表和当前 workspace context，进入内容 detail 后 content-first。
- Terminal workspace 不承载 shell input、quick keys 或 runtime output；这些属于 Terminal instance detail。Terminal direct secondary 在移动端仍显示 Project 二级底部导航。
- 已验证的共享 UI component 边界是 `web/src/components/shell/` 中的轻量 shell 组件库入口：`shell-layout.tsx` 承载连续桌面 shell、sidebar、workspace header 和 panel surface，`shell-navigation.tsx` 承载一级/二级 desktop 与 mobile bottom navigation，`shell-primitives.tsx` 承载 nav item、icon marker、status pill、action button、input 和 list row；它们只服务跨 Home、Project workspace、Session detail 复用，不构成泛化设计系统。
- Agent/Terminal runtime detail 已验证的共享 surface roles 包括 runtime header、runtime body、runtime composer 和 terminal titlebar；这些 role 属于 shell primitive 色阶，不应在 route 中为单页重新散写一套 header/body/input/output 深浅。
- Prototype alignment 的设计语言必须同时横向和纵向抽象：横向让 Home、Project、Agent、Files、Git、Terminal 共享同一套 shell 视觉语言，纵向用 shell/sidebar/workspace/header/bottom nav/runtime header/runtime body/runtime composer/terminal titlebar/raised/dashed/inset/code/danger/warning 等 surface roles 管理层级，不允许 route 为单页观感私自调另一套深浅。
- 可点击 affordance 是共享组件契约的一部分；导航、列表行和 action button 的 cursor、hover/selected surface、active 宽度、focus/disabled 状态与 safe-area 行为应由 shared shell components 管理，不能只抽 icon/label 内容。
- Prototype alignment 过程中发现的重复漂移必须回写到项目说明、version shared 或长期 design；不能只在当前页面代码里修完就结束。
- shadcn/ui 在本项目中是本地 source component 基础层，不是 route 直接消费层；当前已验证 wrapper 关系包括 `Button` -> action/navigation/list row，`Badge` -> status pill，`Card` -> shell surface，`Input` -> shell input。

## 关键规则

- 旧长期 docs 与新 prototype 冲突时，先保留旧 docs 中的安全、运行和协议边界；若冲突只涉及旧视觉或旧布局，按新 prototype 对齐。
- 后续 page-level change 开始前，先判断目标页面属于一级应用 shell、Project 直接二级 workspace，还是深层/contextual detail。
- Navigation shell 只负责层级切换、active 状态和返回入口，不加载 Project resource 数据。
- Workspace header 只展示当前 scope 上下文和低频操作，不渲染大块说明或运行时输入。
- List row、status pill、icon marker、terminal panel、input drawer 等 shared UI primitive 只在真实跨页面复用时抽取；已跨页面复用的 shell primitives、shell layout 和 shell navigation 应进入 `web/src/components/shell/`，但不要提前扩展成泛化设计系统。
- 服务端状态继续使用 TanStack Query；route 层级状态优先进入 TanStack Router route/search；非 URL-critical 的 shell UI 状态才使用 Jotai；单页局部状态保留在组件内。
- Project 直接二级 workspace active 状态使用 URL-visible route/search 承载；Jotai 不应作为该状态的唯一来源。
- Home/一级 shell、Project 二级 shell 与 Session detail chrome 的底部导航互斥：同一移动端页面状态只显示当前层级的底部导航或 detail 输入区。
- 如果某个状态影响浏览器返回、刷新恢复或深链，不应长期只保留为 Jotai atom 或组件 state。
- Prototype alignment 实现中必须先读 prototype HTML，再按结构/样式批次持续对照 prototype 与 app 截图；最终 verify 不能替代实现过程中的对照回路。
- UI alignment 后必须保留现有加载、空、错误、禁用和危险确认行为。
- 涉及用户可见 UI 的实现必须用真实浏览器验证桌面端和移动端，不能只靠 typecheck。
- Prototype alignment 收口验证采用结构断言 + 可审查截图，而不是 pixel diff；至少覆盖 Home、Project Agent workspace、Agent/Terminal detail、Files/Git/Terminal resource workspaces 的 desktop/mobile 路径。
- 最终 alignment 证据必须保存 browser harness log、web log、mock/API log 和截图，并明确可接受差异、阻塞结构偏差和是否存在 CRITICAL。

## 视觉与密度基线

- 视觉气质是深色 Server Agent Console，不是通用 SaaS dashboard。
- 图标语言是基础识别能力：Project、Agent provider、Files、Git、Terminal、history、status 都应有一致但轻量的图标或标记位置。
- 列表优先于厚卡片：Project、Agent instance、history、changed files、file rows、terminal instances 都应保持可扫读。
- 状态不能只依赖颜色；status pill 或标签必须包含文字。
- 移动端首屏优先显示主要内容，避免大段说明、重复 metadata 和低频操作挤占工作区。
- 长路径、session id、diff 行和 terminal output 必须避免横向撑破页面；使用局部滚动、截断或换行处理。

## 不适用场景

- 不定义 Files/Git 写操作，也不新增 Git stage、commit、checkout、reset 等行为。
- 不改变 provider runtime、session protocol、后端 API 或 shared DTO。
- 不要求 pixel-perfect；若信息架构、返回模型和密度正确，细小视觉差异不阻塞结构对齐。
- 不替代具体页面 change 的 spec/design；页面级细节仍在对应 workflow change 中设计、实现和验证。

## 来源

- change：design-frontend-ui-architecture
- verify 证据：`.workflow/changes/design-frontend-ui-architecture/verify.md`
- 运行态设计材料：`.workflow/changes/design-frontend-ui-architecture/design/overview.md`、`.workflow/changes/design-frontend-ui-architecture/design/ui-ux.md`、`.workflow/changes/design-frontend-ui-architecture/design/frontend.md`
- change：align-ui-shell-foundation
- verify 证据：`.workflow/changes/align-ui-shell-foundation/verify.md`
- 运行态验证证据：`.workflow/changes/align-ui-shell-foundation/artifacts/browser-structure/structure-check.log` 与同目录 desktop/mobile 截图
- change：align-home-project-entry
- verify 证据：`.workflow/changes/align-home-project-entry/verify.md`
- 运行态验证证据：`.workflow/changes/align-home-project-entry/artifacts/browser-home-entry/home-entry-check.log` 与同目录 desktop/mobile Home entry 截图
- change：align-home-project-shell
- verify 证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/verify.md`
- 运行态验证证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/browser-check.log` 与同目录 Home/Project Agent workspace prototype/app desktop/mobile 截图
- change：align-runtime-detail-workspaces
- verify 证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/verify.md`
- 运行态验证证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/browser-check.log` 与同目录 Agent/Terminal detail prototype/app desktop/mobile 截图
- change：align-resource-inspection-workspaces
- verify 证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/verify.md`
- 运行态验证证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts/browser-check.log` 与同目录 Files/Git/Terminal prototype/app desktop/mobile 截图、Files preview/Git diff mobile deep detail 截图
- change：align-instance-detail-workspaces
- verify 证据：`.workflow/changes/align-instance-detail-workspaces/verify.md`
- 运行态验证证据：`.workflow/changes/align-instance-detail-workspaces/artifacts/browser-instance-detail/instance-detail-check.log` 与同目录 Agent/Terminal detail desktop/mobile 截图
- change：align-resource-inspection-pages
- verify 证据：`.workflow/changes/align-resource-inspection-pages/verify.md`
- 运行态验证证据：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/resource-inspection-check.log` 与同目录 Files/Git/Terminal desktop/mobile 截图
- change：verify-prototype-ui-alignment
- verify 证据：`.workflow/changes/verify-prototype-ui-alignment/verify.md`
- 运行态验证证据：`.workflow/changes/verify-prototype-ui-alignment/artifacts/prototype-ui-alignment/prototype-ui-alignment-check.log` 与同目录最终 desktop/mobile alignment 截图、web log、mock API log
