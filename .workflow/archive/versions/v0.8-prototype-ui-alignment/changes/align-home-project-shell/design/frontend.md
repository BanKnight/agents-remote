# Frontend Design

## Change

- change-id：align-home-project-shell

## 前端范围

- 修改范围预计集中在 `web/src/routes/HomeRoute.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/components/shell/`、`web/src/components/ui/button.tsx`、`web/src/components/ui/badge.tsx`、`web/src/components/ui/card.tsx`、`web/src/components/ui/input.tsx`、`web/src/routes/console-model.ts`、`web/src/styles/index.css` 及相关 route tests。
- 不修改 `api/`、`packages/shared/`、Project/session DTO 或 runtime API。
- 不新增状态库，不改 TanStack Router/Query/Jotai 分工。
- design 阶段不预装依赖；implementation 若引入 shadcn/lucide，必须按 shared 规则选择安全窗口外兼容版本，并只接入当前 shell wrappers 实际消费的最小 source component 集。

## 模块划分

- `HomeRoute.tsx`
  - 保留 Project list/query/create/adopt 入口。
  - 收紧 header、ProjectListCard、ProjectEntryRow、ProjectSetupPanel 和 StatusPanel 的信息密度。
  - Project row 只使用真实 `Project` 字段：name、path、agentSessionCount、terminalSessionCount、gitBranch 如果存在。
- `ProjectConsoleRoute.tsx`
  - 保留 `ProjectConsole` 的 route/search workspace 模型。
  - 收紧 `WorkspaceHeader`、`ProjectSecondaryNav`、`ProjectSecondaryBottomNav`、`AgentPanel`、`AgentInstanceList`、`AgentInstanceRow`、`AgentHistoryPanel`。
  - 不改变 Files/Git/Terminal 面板内部能力，仅确保它们作为二级导航入口继续可见。
- `web/src/components/shell/`
  - 作为跨 Home、Project workspace 和 Session detail 复用的轻量组件库入口，承载 shell primitives、shell layout 和 shell navigation。
  - `shell-primitives.tsx` 承载 `IconMarker`、`NavItemContent`、`StatusPill`、`ActionButton`、`ShellInput`、`ListRow`；这些 wrapper 可以消费 shadcn `Button`、`Badge`、`Input`，但保留 project visual tone。
  - `shell-layout.tsx` 承载一级/二级 shell 的外层 layout、sidebar、header surface、workspace panel surface 和桌面 docked shell；`shell-navigation.tsx` 承载 desktop nav list/button/static item 与 mobile bottom navigation。
  - 不把页面专属布局、copy、API 数据转换或 route/search 行为抽进 primitive。
- `console-model.ts`
  - 保留 `defaultConsoleSection = "agents"` 和 `consoleSectionFromSearch`。
  - 如需要压短移动端标签或状态文案，可在现有 section model 附近调整，保持测试覆盖。

## 组件边界

- 可复用 shell components 只负责视觉与交互壳：layout、sidebar、workspace header、workspace panel surface、desktop/mobile navigation、marker、nav item、status pill、button、input、list row。
- Home 专属 Project setup、Project list 文案、empty/error copy 留在 `HomeRoute.tsx`。
- Project Agent workspace 专属 Agent creation、history/future copy、Agent row 行为留在 `ProjectConsoleRoute.tsx`。
- 不把 Agent Session API 调用、Project creation mutation、query invalidation 或 route/search 逻辑抽进 UI primitive。
- 如果需要进一步抽取 row 结构，优先抽视觉一致性，而不是抽业务数据转换。

## 状态管理

- Projects 和 Project/Agent Sessions 仍由 TanStack Query 管理。
- Project workspace active state 仍由 TanStack Router search `workspace` 管理。
- `setupOpen` 继续作为 Home 本地 UI 状态；只影响低频 setup panel 展开。
- Resource deep detail 状态继续保留在 Project route 本地，用于隐藏 mobile 二级底部导航；本 change 不改其语义。
- Agent creation/close pending/error 继续使用 TanStack Query mutation 状态，不新增全局状态。

## 路由 / 页面接入

- Home 路由保持 `/`。
- Project route 保持 `/projects/$projectName`。
- 从 Home 进入 Project 时继续写入 `search: { workspace: defaultConsoleSection }`。
- Project direct secondary mobile navigation 继续通过 `onSelectSection` 更新 search。
- 本 change 不新增 route，不改变 Agent/Terminal detail route。

## 工程约束

- 后续 `implement-change` 进行 React/prototype UI alignment 前必须加载 `vercel-react-best-practices` skill。
- implementation 已确认最小引入 shadcn/lucide：`shadcn@4.7.0` 与 `lucide-react@1.16.0` 精确固定，当前生成并使用 shadcn `Button`、`Badge`、`Card`、`Input` source components；后续新增组件或图标仍需重新检查 npm metadata 和 7 天安全规则。
- UI change 完成后必须用真实浏览器保存 Home 和 Project Agent workspace 的 prototype/app desktop/mobile screenshots 与 browser check log。
- 至少运行相关 web route/model tests；如果调整 route/search 或 console model，更新 `web/src/routes/console-model.test.ts`。
- Typecheck/test 不能替代浏览器截图验证。

## 关键决策

- 将已跨多页面复用的 shell primitives、layout 和 navigation 放入 `web/src/components/shell/`，形成明确组件库边界；route 文件只负责页面组合、数据和行为。
- 保留现有 query/mutation 行为，避免为了视觉还原改动 Project/session runtime 语义。
- 对 Home/Project 的 copy 和 density 做局部调整，优先修复首屏扫读和 mobile bottom nav 互斥。
- shadcn/lucide 引入已由 implementation 按最小必要原则完成：生成本地 shadcn `Button`、`Badge`、`Card`、`Input` source components，shell wrappers 作为语义层消费它们；lucide 版本已固定但图标使用仍留给后续统一 icon primitive。

## 风险与权衡

- 当前仍继续使用 text markers，虽然 `lucide-react` 已固定为安全版本；后续若接入图标，必须通过统一 icon primitive，避免 route 内散用。
- 调整 shared primitives 会影响 Home、Project、Files/Git/Terminal 和 detail 页面视觉，需要浏览器回归查看主要路径。
- 压缩 metadata 可能隐藏有用信息；保留真实 counts/status/path 的最低识别信息即可。

## 开放问题

- 是否将 Project row 和 Agent row 改用 `ListRow` 需要实现阶段根据 JSX 简洁度和视觉一致性判断。
- 是否需要新增 lightweight icon primitive 或直接调整 `IconMarker`，由后续实际使用 lucide 图标的 change 决定。
- 现有 tests 是否足以覆盖 navigation/search，需要 plan 阶段确认。

## 后续沉淀候选

- 如果实现验证证明现有 primitive 边界足够支撑原型对齐，可沉淀为长期 shell primitive 指南。
- 如果本 change 引入 lucide/shadcn，验证后的依赖边界可沉淀到长期 frontend UI architecture。
