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
- Git UI 使用“紧凑 repository state / summary + compact row changed-file list + 内容优先同页 diff panel”的结构；桌面端可保留 changed-file list + diff 同页扫读，手机窄屏选择文件后弹出全屏 sheet（从下往上滑入）覆盖变更文件列表与底部导航。
- 移动端 Git 直接二级页和单文件 diff 深层 detail 使用不同导航层级：changed-file list 页保留 Project 二级底部导航；diff detail 以全屏 sheet 呈现（header 右侧胶囊内 close 图标，非顶部返回），遮挡 Project 二级底部导航。
- worktree 与 staged 在同一列表中展示，通过文字 badge 区分 scope，避免第一轮引入 tab/filter。
- 文件条目展示 path、scope、status；renamed 条目展示 previousPath。
- 单文件 diff panel header 采用三段式：左侧 status marker + path（status 紧贴文件名，git 行业惯例），中间留空（git 无切换需求，中列 grid 占位但无内容），右侧胶囊操作区（close 图标，`justify-self-end` 第三列）。复用 file preview 同款 `capsule-actions` + `mobile-sheet-fullscreen` variant，与 Files 详情视觉一致。
- Unified diff 使用 `<pre>` 纯文本方式展示，保留空白并允许滚动，不使用 `dangerouslySetInnerHTML` 或第三方 diff viewer。
- 非 Git 仓库和无变更是可理解状态，不作为 fatal route error 展示。

## 关键规则

- `web` 只通过同源 `/api` client 访问 Git diff API，不接收或传递任意 Git command args。
- 只影响 Git section 的 selected file state 保留为本地 state，不引入 Jotai atom。
- Diff sheet 的关闭只清除本地 selected file state，不新增 route；如后续需要刷新恢复或分享链接，应重新设计 route/search。
- 页面不得出现 commit、stage、unstage、checkout、reset、merge、rebase、push、pull 等 Git 写操作 affordance。
- 状态表达必须有文字说明，不只依赖颜色；scope/status badge 应能在移动端读懂。
- Git compact row 中主信息是 project-relative path，scope/status 是短文字 badge；长 path 和 previousPath 使用 `min-w-0`、truncate、break-all/break-words 或局部滚动避免页面级横向溢出。
- Diff panel header 三段式：左 status marker + path（truncate），中列空（保持左中右结构一致，不因无中部导航就把操作区挪到中间），右 close 胶囊（移动 only，`justify-self-end`）；高度 `h-11`（44px）与一级页面 header 一致。只保留定位所需的 path、scope 和 status，避免把说明性文本置于 unified diff 之前。
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
- change：compact-inspection-mobile-views
- verify 证据：`.workflow/changes/compact-inspection-mobile-views/verify.md`
- change：align-resource-inspection-pages
- verify 证据：`.workflow/changes/align-resource-inspection-pages/verify.md`
- 运行态验证证据：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/git-direct-mobile.png`、`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/git-diff-mobile.png`
- change：align-resource-inspection-workspaces
- verify 证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/verify.md`
- 运行态验证证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts/browser-check.log`、`app-git-desktop.png`、`app-git-mobile.png`、`app-git-mobile-diff-detail.png`
