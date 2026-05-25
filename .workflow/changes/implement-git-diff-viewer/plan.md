# plan

## Change 目标

- 在 Project console 内交付第一轮只读 Git diff viewer，让用户查看当前 Project 的 worktree/staged 变更文件列表，并点击单文件查看 unified diff。
- 完成后，v0.4 的 Project 观察能力覆盖 Files 与 Git 两类只读入口，用户可以在移动端远程理解项目文件内容和未提交变化。

## 局部 big picture

- 本 change 属于 `v0.4-project-inspection-tools`，在 Project safe path、responsive console shell 和 Files 只读观察模式之后补齐 Git 观察能力。
- Git diff viewer 与 Files 并列，均为 Project-scoped 只读观察工具；它复用 Project boundary 和前端 section 模式，但保持 Git API/DTO 独立。
- 本 change 不改变 Session Runtime、不引入 Git 写操作，也不改变 Project identity。

## 执行策略

- 先新增 shared Git diff DTO/error codes，稳定 API 与 web 的跨边界契约。
- 在 `api` 新增 Git diff service/route，先用 Project safe resolver 解析 Project root，再通过 argv 数组执行只读 `git -C <path>` 命令。
- 变更列表使用 `git status --porcelain=v1 -z --untracked-files=all` 解析 worktree/staged 状态；单文件 diff 使用 `git diff -- <path>` 或 `git diff --cached -- <path>`。
- 在 `web` 扩展 `/api` client，再把 Project console Git placeholder 替换为列表 + 同页 unified diff panel。
- 最后补充 E2E fixture：临时 Project 初始化 Git 仓库并准备 staged/worktree 变更，浏览器验证 Git section、变更列表和 diff panel。

## 任务顺序依据

- Shared DTO/error codes 阻塞 API、client 和 UI。
- API service/route 阻塞 client/UI/E2E，因为前端必须依赖真实 response shape。
- Web client 完成后才能接 UI；UI 文案和结构稳定后再写 E2E selectors。
- E2E 和质量门禁最后执行，作为实现阶段收口证据。

## 额外上下文

- 长期 docs：
  - `docs/project.md`：Project/Console Shell big picture。
  - `docs/specs/project-safe-paths/spec.md`：Git diff 必须复用 Project-safe path 语义。
  - `docs/architecture/project-boundary.md`：下游 Git 能力必须复用 safe path resolver。
  - `docs/architecture/file-browser-preview.md`：Project-scoped 只读观察 API 模式。
  - `docs/design/file-browser-preview.md`：Project console 内列表 + 同页预览状态模式。
  - `docs/design/frontend-stack.md`：单页状态本地化、API 数据通过 `/api` client / TanStack Query。
- 代码入口：
  - `packages/shared/src/index.ts`、`packages/shared/src/index.test.ts`
  - `api/src/index.ts`、`api/src/project-paths.ts`、`api/src/project-files.ts`、`api/src/index.test.ts`
  - `web/src/api/client.ts`、`web/src/api/client.test.ts`
  - `web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/console-model.ts`、`web/src/routes/console-model.test.ts`
  - `scripts/run-e2e.ts`、`e2e/file-browser.spec.ts`、`e2e/terminal-session.spec.ts`

## 依赖与阻塞

### 阶段依赖

- `specify-change` 已完成，Git diff WHAT 明确。
- `design-change` 已完成，API/frontend/architecture/error handling 已确定。
- 当前无阻塞，可进入实现。

### 任务依赖

- Shared DTO/error code → API Git diff service/route → web client → Project console Git UI → E2E/质量门禁 → workflow progress。
- API service tests 与 web client tests 可在对应实现后立即执行。

### 外部依赖

- 不新增 npm 依赖。
- 运行和 E2E 依赖系统 `git` CLI；当前仓库开发环境已有 git。若部署环境缺失，API 返回 Git unavailable 状态/错误。

## 并行机会

- 2.2 web client 可在 2.1 route 契约固定后与部分 UI skeleton 并行，但本 change 修改同一 ProjectConsoleRoute，建议顺序执行。
- API service tests 和 HTTP route tests 修改不同文件，但都依赖 service DTO，建议同一任务内完成。

## 风险与验证重点

- 只读边界：不得新增 stage/unstage/commit/reset/push 等 API 或 UI 操作。
- 命令安全：不得通过 shell 拼接用户输入；Git args 必须用数组传递。
- Project 安全：Git 命令 cwd/path 必须来自 safe resolver，file diff path 必须来自当前变更列表。
- 状态正确：worktree/staged、modified/added/deleted/renamed/untracked 映射要有测试。
- 非 Git 仓库：必须显示普通状态而不是系统异常。
- 移动体验：unified diff 用等宽文本展示，列表和 diff panel 在窄屏可读。

## 不做事项

- 不做任何 Git 写操作。
- 不做一次展示全部 diff、复杂筛选、搜索、排序切换或统计聚合。
- 不做 PC 双栏 diff、语法高亮、评论或代码审阅工作流。
- 不做 branch/remote/submodule 管理。
- 不新增 Git parser/diff viewer npm 依赖。
