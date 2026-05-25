# Frontend Design

## Change

- change-id：rework-project-mobile-workspace

## 前端范围

- 技术栈：沿用 React 19 + TypeScript + Vite + TanStack Router + TanStack Query + Jotai + Tailwind CSS，不新增依赖。
- 主要实现入口：`web/src/routes/ProjectConsoleRoute.tsx`。
- 可能涉及模型/helper：`web/src/routes/console-model.ts` 和对应测试，仅在需要调整 section 文案/排序/路径 helper 时修改。
- 不修改 `api/`、`packages/shared/`、session runtime API 或 Files/Git API。

## 模块划分

- `ProjectConsoleRoute` 保持 Project 数据加载和错误 frame 入口。
- Project workspace 组件负责移动/桌面布局组合、顶部 Project context 和工作区区块顺序。
- Agent 区、Terminal 区、Files/Git 功能区尽量从现有组件/逻辑中重组，不为了本 change 提前建立大型设计系统。
- Shell-level runtime input panel 从 Project workspace 移除；如保留说明，放在 Agent/Terminal 区域内部轻量文案。

## 组件边界

- 顶部 workspace header：负责返回 link、Project name/path 和必要状态，不负责 session 操作。
- Workspace action card：负责 Files/Git 入口展示和 section 切换/导航，不负责加载文件或 diff 详情。
- Agent workspace section：负责 Agent create buttons、Agent session list、Agent errors。
- Terminal workspace section：负责 Terminal create button、Terminal session list、Terminal errors。
- SessionCard 继续负责进入 detail 和 close confirmation。

## 状态管理

- Project、Agent sessions、Terminal sessions 仍由 TanStack Query 管理。
- 当前 Files/Git/section 选择如果仅影响 Project console route，可继续用已有 `activeConsoleSectionAtom` 或收敛为 route-local 状态；不要新增持久化配置。
- 移除 bottom input panel 后，应删除或停止使用 Project console 中不再需要的 `inputPanelOpenAtom` 调用，避免无效全局 UI 状态。
- 创建/关闭 session mutation 和 invalidateSessions 逻辑保持现状。

## 路由 / 页面接入

- 路由保持 `/projects/$projectName`，不新增 Project workspace 路由。
- Session detail 路由保持现有 `/projects/$projectName/agent-sessions/$sessionId` 与 `/terminal-sessions/$sessionId`。
- Files/Git 入口可以继续使用当前 Project console 内 section 切换；不在本 change 中新增独立 Files/Git route。

## 工程约束

- Tailwind 使用移动端默认单列布局，桌面 breakpoint 做增强。
- 根容器使用已建立的 `min-h-dvh` / `overflow-x-hidden` / `min-w-0` 基线。
- 长名称、路径、session id、branch 文案都需要 `min-w-0`、`truncate` 或 `break-all`。
- 不通过 CSS 隐藏真实操作来“移除”底部 input；应从 Project workspace 渲染树中移除常驻 bottom panel。
- 验证阶段需要移动 viewport 浏览器截图，证明顶部返回、功能区、Agent 区、Terminal 区和无底部 input。

## 关键决策

- 以重组 `ProjectConsoleRoute.tsx` 为主，不新增依赖、不改 API、不扩展 shared DTO。
- 复用现有 session 查询/mutation/SessionCard 行为，降低运行态回归风险。
- 移动工作区需要显式区域顺序，而不是只依赖已有 `consoleSections` 导航顺序。

## 风险与权衡

- `ProjectConsoleRoute.tsx` 当前较长，重组时容易扩大重构范围；实现应优先提取有边界的轻量组件，而不是全面拆目录。
- 停止使用 `inputPanelOpenAtom` 可能影响其他页面时需先搜索引用；如果只在 Project console 使用，应删除相关 import/usage。
- Files/Git section 当前包含较重面板，移动工作区功能区只做入口，避免把详情提前塞入首屏。

## 开放问题

- 无。

## 后续沉淀候选

- Project console route 的移动工作区组件边界。
- Project workspace 不使用 shell-level bottom input atom 的前端状态边界。
