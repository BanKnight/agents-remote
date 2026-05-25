# Frontend Design

## Change

- change-id：implement-git-diff-viewer

## 前端范围

- 修改 Project console 中 Git section，从占位态变为只读 diff viewer。
- 新增或扩展 `/api` client 方法，用于 Git diff 文件列表和单文件 diff。
- 新增 Git UI 组件：changed file list、repository/empty/error states、unified diff panel。
- 不引入代码编辑器、diff viewer 库、复杂筛选或全局状态。

## 模块划分

- `GitDiffPanel`：组合 Git diff list query、selected file state 和 file diff query。
- `GitChangedFileList`：展示 path、status、scope，点击选择文件。
- `GitFileDiffPanel`：展示 unified diff、loading、error、empty selection。
- API client：封装 `listProjectGitDiff(projectName)` 和 `getProjectGitFileDiff(projectName, scope, path)`。

## 组件边界

- 展示组件不解析 raw Git diff，也不执行 status 映射。
- `GitDiffPanel` 保留 selected file 为本地 state，不使用 Jotai。
- 单文件 diff panel 只接收 DTO 或 Query error，负责渲染文本与恢复提示。

## 状态管理

- 服务端状态：变更列表和单文件 diff 由 TanStack Query 管理。
- 页面状态：selected file summary 保留在 Git section 本地 state。
- 非 Git 仓库和 no changes 是 list response 状态，不作为 fatal route error。

## 路由 / 页面接入

- 沿用现有 Project console route 和 Project context。
- 用户点击 Git section 后加载 diff list。
- 点击文件条目后加载该文件对应 scope 的 unified diff。
- 切换到其他 section 不需要重新选择 Project；selected file 是否保留不作为第一轮契约。

## 工程约束

- 前端只通过同域 `/api` client 访问 Git diff API。
- unified diff 以 `<pre>` 纯文本显示，不使用 `dangerouslySetInnerHTML`。
- 移动端优先：文件列表纵向展示，diff 文本等宽，允许横向滚动以保持 diff 对齐。
- 不新增 npm 依赖。

## 关键决策

- 使用与 Files 类似的列表 + 同页详情结构，降低 Project console 内观察工具的认知成本。
- 不把 selected file 写入 URL；第一轮不要求 diff 深链。
- worktree 与 staged 可以在同一列表中用 badge 区分，而不是分成复杂 tab/filter。

## 风险与权衡

- 单页本地 state 不支持刷新恢复选中文件；第一轮可接受。
- Unified diff 在窄屏上可能横向滚动；相比双栏 diff 更适合移动端第一轮。
- 不引入 diff 库意味着没有语法高亮；符合第一轮只读文本展示边界。

## 开放问题

- 无阻塞开放问题。

## 后续沉淀候选

- Git diff viewer 的 Project console UI 状态、移动端 unified diff 阅读模式和只读交互规则可在 verify 后沉淀到长期 design。
