# Git diff viewer design

本文件记录经过验证后沉淀下来的 Project Git diff viewer 长期 design。它面向后续版本复用，不复制单次 change 的过程记录。

## 背景

- `web` 是移动端优先的 Project console，Git 是 Agent、Terminal、Files 之外的只读观察入口。
- Project 已被定义为 `PROJECTS_ROOT` 下一级真实目录，Git diff viewer 必须复用 Project-safe path 语义。
- 第一轮 Git 目标是查看 worktree/staged 变更文件列表和单文件 unified diff，而不是 Git 操作工作流或代码审阅系统。

## 适用范围

- Project console 内 Git section 的信息架构、状态和交互边界。
- `web` Git client/UI 与 `api` Git diff DTO 的协作方式。
- worktree/staged file list、basic status badge、non-repository/no-changes/error states 和 unified diff panel 的前端渲染规则。

## 设计结论

- Git section 保持在 Project console route 内，不新增独立 Git route；选中文件是单页本地 state。
- 变更列表和单文件 diff 由 TanStack Query 管理 server state，query key 包含 projectName、scope 和 path。
- Git UI 使用“repository state / summary + changed file list + 同页 diff panel”的移动端优先结构。
- worktree 与 staged 在同一列表中展示，通过文字 badge 区分 scope，避免第一轮引入 tab/filter。
- 文件条目展示 path、scope、status；renamed 条目展示 previousPath。
- 单文件 diff panel header 展示当前 path、scope 和 status，避免用户忘记正在查看哪个变更。
- Unified diff 使用 `<pre>` 纯文本方式展示，保留空白并允许滚动，不使用 `dangerouslySetInnerHTML` 或第三方 diff viewer。
- 非 Git 仓库和无变更是可理解状态，不作为 fatal route error 展示。

## 关键规则

- `web` 只通过同源 `/api` client 访问 Git diff API，不接收或传递任意 Git command args。
- 只影响 Git section 的 selected file state 保留为本地 state，不引入 Jotai atom。
- 页面不得出现 commit、stage、unstage、checkout、reset、merge、rebase、push、pull 等 Git 写操作 affordance。
- 状态表达必须有文字说明，不只依赖颜色；scope/status badge 应能在移动端读懂。
- 错误状态应提供可恢复路径，例如 Retry 或切换其他 Project console section。
- Unified diff 以移动端可读为基准；第一轮不提供双栏 diff、语法高亮、评论或搜索。

## 不适用场景

- 需要 stage/unstage/commit/reset/push 等 Git 写操作时，应新增 change 重新设计权限、确认、错误恢复和回滚边界。
- 需要 diff 深链、刷新恢复选中文件或跨页面保留 Git 状态时，应重新设计 route/search params。
- 需要分页、size limit、搜索、统计聚合、双栏 diff 或语法高亮时，应扩展 API 与 UI 契约。
- 需要 branch/remote/submodule 管理时，不应复用当前 diff viewer 直接扩展为通用 Git UI。

## 来源

- change：implement-git-diff-viewer
- verify 证据：`.workflow/changes/implement-git-diff-viewer/verify.md`
