# Design Overview

本文件汇总 `implement-git-diff-viewer` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：implement-git-diff-viewer
- 所属 version：v0.4-project-inspection-tools

## 输入依据

- intents：用户希望第一轮 Git 功能只读查看已修改文件 diff；先展示变更文件列表，点击单文件查看 unified diff；覆盖 worktree 与 staged；非 Git 仓库明确提示；手机端优先 unified diff 文本；文件列表展示 path 与 modified/added/deleted/renamed 状态；不做 Git 写操作。
- specs：`specs/git-diff-viewer/spec.md`
- 相关长期 docs：
  - `docs/project.md`
  - `docs/specs/project-safe-paths/spec.md`
  - `docs/architecture/project-boundary.md`
  - `docs/architecture/file-browser-preview.md`
  - `docs/design/console-shell.md`
  - `docs/design/file-browser-preview.md`
  - `docs/design/frontend-stack.md`

## 设计范围

### 本次覆盖

- Project console Git 入口从占位变为只读 diff viewer。
- 非 Git 仓库状态检测和用户可见提示。
- worktree 与 staged 变更文件列表，展示 path、scope 和基本状态。
- 单文件 unified diff 查看，移动端可读。
- Project-scoped 路径安全与 Git 命令只读执行边界。

### 本次不覆盖

- commit、stage、unstage、checkout、reset、merge、rebase、push、pull 等 Git 写操作。
- 一次展示全部 diff、复杂筛选、搜索、排序切换或统计聚合。
- PC 双栏 diff、语法高亮、diff minimap、评论、代码审阅工作流。
- Git 仓库初始化、remote 管理、branch 切换或 submodule 管理。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 用户任务和边界已由 specs 明确。 |
| ui-ux | 是 | 需要移动端文件列表与 unified diff 阅读状态设计。 |
| frontend | 是 | 需要 Project console Git section、query state 和 preview panel 边界。 |
| architecture | 是 | 涉及 `web`、shared DTO、`api`、safe path、Git CLI 只读执行。 |
| api | 是 | 需要定义变更列表、单文件 diff、非 Git 仓库和错误语义。 |
| data | 否 | 不引入数据库或持久化模型。 |
| business-rules | 否 | 状态映射与只读规则在 API/UI/错误设计中覆盖。 |
| error-handling | 是 | 非 Git 仓库、Git 命令失败、路径越界和 diff 不存在需明确恢复方式。 |
| risks | 否 | 风险已在各子域收口，无单独跨域开放风险。 |

## 总体设计结论

- Git diff viewer 作为 Project console 内的只读观察入口实现，与 Files 共享 Project context 和前端列表+同页详情模式，但 API/DTO 独立。
- `api` 新增 Project-scoped Git diff service/routing，先通过 Project safe path resolver 获取 Project root，再执行只读 Git 查询。
- Git 状态列表同时覆盖 worktree 与 staged，服务端将 Git porcelain/diff 输出映射为稳定 DTO。
- 单文件 diff 使用 unified diff 文本，移动端用 `<pre>` 等宽、可横向滚动/换行策略展示。
- 非 Git 仓库是明确状态，不是 500 系统异常。

## 关键决策

- 使用 Git CLI 作为第一轮实现，不新增 npm git parser 依赖；通过 `git -C <projectPath>` 执行只读命令。
- 变更列表和单文件 diff 分成两个 GET 接口，避免一次返回所有 diff。
- 单文件 diff 请求必须带 scope（worktree 或 staged）与 path，路径必须来自或匹配当前 Project Git 变更列表。
- Renamed 文件列表显示 oldPath/newPath；单文件 diff 请求使用当前 path，并在 DTO 中保留 previousPath。

## 开放问题

- 无阻塞开放问题；实现阶段可根据 Git porcelain 输出细节微调 DTO 字段名，但不得改变只读、worktree/staged 和 unified diff 语义。

## 后续沉淀候选

- `docs/specs/git-diff-viewer/spec.md`：长期 Git diff 只读观察 WHAT。
- `docs/architecture/git-diff-viewer.md`：Project-scoped Git CLI 只读执行、DTO 和错误边界。
- `docs/design/git-diff-viewer.md`：移动端 Git diff UI/UX 与前端状态边界。
