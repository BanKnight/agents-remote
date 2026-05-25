# Frontend Design

## Change

- change-id：compact-inspection-mobile-views

## 前端范围

- 技术栈沿用当前 `web`：React 19、TypeScript、Vite、TanStack Router、TanStack Query、Jotai、Tailwind CSS。
- 修改范围集中在 Project workspace 已有 Files/Git panel 相关前端组件。
- 不修改 `api`、`packages/shared` DTO 或 Session Runtime。

## 模块划分

- `ProjectConsoleRoute.tsx` 继续负责 Project workspace 布局和 Files/Git section detail 容器。
- Files 相关 client/query/local state 保持在现有 Files panel 模块内；当前 path、selected file 等仍是局部 state。
- Git 相关 client/query/local state 保持在现有 Git diff panel 模块内；selected file/scope/path 仍是局部 state。
- 如果现有 Files/Git panel 已是独立文件，优先在对应文件内做密度调整；不要为了一次 UI polish 提前引入新的跨 feature 抽象。

## 组件边界

- Files compact list row：负责展示文件/目录名称、类型和最少必要 metadata，并触发进入目录或预览文件。
- Files compact preview header：负责展示当前 selected file/path 和返回/清除选择入口；不负责数据加载。
- Git compact changed-file row：负责展示 path、status、scope 和 selected 状态，并触发选择文件。
- Git compact diff header：负责展示当前 selected file 的 path/status/scope；diff 内容继续由纯文本 `<pre>` 区域承载。
- 组件拆分只在能降低 `FilesPanel` / `GitDiffPanel` 复杂度时进行；否则直接调整现有 JSX 和 className。

## 状态管理

- 服务端状态继续由 TanStack Query 管理，不新增 query 或改变 query key 语义。
- Files 当前目录、选中文件和 Git 当前选中文件继续使用组件本地 state。
- 不新增 Jotai atom；Files/Git inspection 状态不需要跨 route/global 共享。
- 不新增持久化、URL search params 或 deep link 状态。

## 路由 / 页面接入

- 不新增 route；Files/Git 仍在 `/projects/$projectName` 的 Project workspace 内展示。
- `SectionDetail` 只需承载更紧凑的 panel 容器或把密度职责下放给 Files/Git panel。
- Back to Projects / Back to Project 行为不变。

## 工程约束

- 使用 Tailwind utility 和现有 design tokens 风格；不新增 UI library、diff viewer、virtual list 或 syntax highlight 依赖。
- 保持只读边界：不新增任何触发 Files/Git 写操作的按钮、菜单、client 方法或 API 调用。
- 长文本必须通过 `min-w-0`、`truncate`、`break-all`、`break-words`、`overflow-auto` 等方式避免横向溢出。
- 代码变更后至少运行 format、lint、typecheck、test、build；UI change 需要 e2e 或 mobile smoke 截图 artifact。

## 关键决策

- 本 change 不采用第三方成熟组件；选择沿用现有轻量实现，借鉴成熟移动 inspection 的 compact row / content-first detail 模式。
- 不调整后端，因为所有需要展示的信息已经由现有 Files/Git API 提供。
- 不抽象通用 `InspectionPanel`，避免为了 Files/Git 两处相似布局提前扩大重构范围。

## 风险与权衡

- 同一 route 内 Files/Git/Agent/Terminal 共享空间，Project workspace 容器 padding 过大时会抵消 panel 内密度优化；实现时应同时检查 detail section wrapper。
- 如果现有 e2e 依赖特定按钮名称或 heading 文案，紧凑化时需保留可访问名称或同步测试。
- 只做 CSS/JSX 调整可能无法覆盖极长 diff 的全部体验，但足以满足本 change 的“减少空间浪费、避免横向溢出、内容优先”。

## 开放问题

- （无）

## 后续沉淀候选

- Files/Git panel 本地状态边界继续有效，可在 verify 后补充到长期 design。
- 移动端 inspection density 规则可在 verify 后沉淀到 Files/Git 长期 design 文档。
