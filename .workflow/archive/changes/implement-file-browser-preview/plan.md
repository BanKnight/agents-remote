# plan

## Change 目标

- 在 Project console 内交付第一轮只读 Files 能力，让已认证用户可以浏览 Project 目录、查看大小上限内的文本文件和常见 Web 图片。
- 完成后，Project 观察能力不再只依赖 Agent/Terminal 输出，并为后续 Git diff viewer 复用 Project-safe path 与只读观察模式。

## 局部 big picture

- 本 change 属于 `v0.4-project-inspection-tools`，在已完成的 Project model/safe paths 与 responsive PWA Console Shell 之上补齐 Files 入口。
- Files 必须保持 Project-scoped，只访问 `PROJECTS_ROOT/<project>` 内路径；它不改变 Project identity，也不新增写操作。
- 该 change 与后续 `implement-git-diff-viewer` 并列，二者都应复用 Project boundary，但 Files preview DTO 不应成为 Git diff 的前置抽象。

## 执行策略

- 先补齐跨边界 shared DTO 和 error code，让 API、web client、UI 和测试使用同一契约。
- 在 `api` 中新增 Files service/route，所有 path 先通过现有 `resolveProjectRelativePath`，再执行目录列表或 bounded file preview。
- 用单独 service 文件承载文件系统读取、排序、文本/图片类型判断和错误映射，避免把 Files 细节塞进 ProjectService。
- 在 `web` 中扩展 API client，再把 Project console 的 Files placeholder 替换为本地 state + TanStack Query 驱动的 Files section。
- 最后补齐 unit/API/client/UI/E2E 检查，确保只读、越界拒绝、hidden entries、排序、文本/图片/unsupported/too-large 状态均可验证。

## 任务顺序依据

- Shared DTO 是 API route、client 和 UI 的共同类型基础，必须先做。
- API service/route 阻塞 web client 和 E2E，因为前端需要真实响应结构。
- Web API client 可以在 API route 后独立测试；UI 依赖 client 与 DTO。
- E2E 和质量门禁必须最后执行，因为它们依赖 API 与 UI 都完成。

## 额外上下文

- 长期 docs：
  - `docs/project.md`：Project/Console Shell/Session Runtime big picture。
  - `docs/specs/project-safe-paths/spec.md`：Files 必须复用 Project-safe relative path 语义。
  - `docs/architecture/project-boundary.md`：Project 模块、安全路径解析和下游 project-scoped 能力边界。
  - `docs/design/console-shell.md`：Files 是 Project console 内辅助入口，真实能力完成前为占位。
  - `docs/design/frontend-stack.md`：API 数据用 `/api` client 或 route/data layer；单页状态优先本地 state。
- 代码入口：
  - `packages/shared/src/index.ts`、`packages/shared/src/index.test.ts`
  - `api/src/project-paths.ts`、`api/src/projects.ts`、`api/src/index.ts`、`api/src/projects.test.ts`
  - `web/src/api/client.ts`、`web/src/api/client.test.ts`
  - `web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/console-model.ts`、`web/src/routes/console-model.test.ts`
  - `e2e/terminal-session.spec.ts` 与 `scripts/run-e2e.ts` 作为 E2E harness 参考。

## 依赖与阻塞

### 阶段依赖

- `specify-change` 已完成，Files WHAT 明确。
- `design-change` 已完成，API/frontend/architecture/error handling 已确定。
- 当前无阻塞，可进入实现。

### 任务依赖

- Shared DTO/error code → API service/route → web client → UI → E2E/质量门禁。
- API service tests 与 web client tests 可在对应实现后立即执行。
- UI E2E 依赖 `bun run e2e` runner 已存在，并需要在临时 Project 中准备可浏览文件 fixture。

### 外部依赖

- 不新增 npm 依赖。
- E2E 依赖现有 Playwright Chromium 与 tmux/runtime harness；如本机缺失浏览器，按现有 runbook 使用 `bun x playwright install chromium`。

## 并行机会

- Shared DTO 完成后，API tests 与 web client function/test 理论上可并行，因为修改文件不同。
- Project console UI 与 E2E fixture/spec 不建议并行：E2E selector 应基于最终 UI 文案和结构。
- API service 和 route integration 不并行，因为都涉及 `api/src/index.ts` 的 route matching 顺序。

## 风险与验证重点

- 路径安全：越界、绝对路径、parent traversal、symlink escape 不得读取 Project 外部文件。
- 只读边界：不得新增 write/edit/delete/rename/upload/download API 或 UI affordance。
- 读取边界：too-large 必须在 readFile 前通过 stat 拒绝，避免完整读取大文件。
- 安全渲染：文本以 React text node 渲染，SVG 不 inline，不使用 `dangerouslySetInnerHTML`。
- 移动体验：Files section 在窄屏可浏览目录、返回上级、查看文本和图片，错误状态有恢复入口。
- 质量门禁：至少运行相关 unit tests、typecheck/lint/build；UI 完成后用 E2E 浏览器路径验证 golden path。

## 不做事项

- 不做文件写入、编辑、删除、重命名、上传、下载。
- 不做语法高亮、行号、搜索、分页、streaming 或 range request。
- 不做复杂排序切换、mtime/size/type 排序 UI。
- 不做独立 Files route 深链或 Project 文件树全局状态。
- 不引入代码编辑器、图片查看器、MIME sniffing 或虚拟列表依赖。
