# tasks

## 执行顺序

1. 先建立全局移动 viewport / overflow 基线，避免后续页面继承错误外壳。
2. 再重排首页信息层级，让 Project 列表成为主路径，Create/Adopt Project 降级为次级但可发现入口。
3. 再做 Project console shell 的最小对齐，确保本 change 的全局基线不会与已存在控制台冲突。
4. 最后执行质量门禁和浏览器移动视口验证，并为 verify 阶段保存截图 artifact。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 建立全局移动 shell 视口与横向不溢出基线
  - 验收标准：
    - `body`、`#root` 或等价 root 容器使用动态视口或兼容策略，移动浏览器地址栏变化下仍保持 App-like 全高基线。
    - 全局样式不产生页面级横向滚动；不使用会因 padding 撑宽的 root 宽度策略。
    - 保持现有深色主题和最小宽度约束。
  - 依据：`plan.md` 执行策略；`design/frontend.md` 工程约束；`specs/mobile-console-shell/spec.md` “Mobile pages avoid viewport-level overflow by default”。
  - 必读上下文：`web/src/styles/index.css`、`docs/design/frontend-stack.md`。
  - 修改范围：`web/src/styles/index.css`，必要时涉及 root layout class。
  - 依赖：无。
  - 并行：否（阻塞后续移动布局判断）。

### 2. 核心实现任务

- [x] 2.1 重排首页 Project 主路径和低频 Create/Adopt Project 入口
  - 验收标准：
    - 手机视口首页首屏优先展示 Project/工作上下文，而不是大页头和常驻大表单。
    - Create/Adopt Project 入口降级为次级但可发现；用户主动展开或进入后仍可输入、提交、看到提交中和错误状态。
    - 空 Project 状态下创建/采用入口仍足够明显。
    - 页面使用本项目术语，不直接搬运原型占位词。
    - 长 Project 名/path 不造成横向页面滚动。
  - 依据：`plan.md` 执行策略；`design/product.md`；`design/ui-ux.md`；`specs/mobile-console-shell/spec.md` 首页和原型术语要求。
  - 必读上下文：`web/src/routes/HomeRoute.tsx`、`docs/specs/project-console-navigation/spec.md`、`docs/design/console-shell.md`。
  - 修改范围：`web/src/routes/HomeRoute.tsx`。
  - 依赖：1.1。
  - 并行：否（核心视觉和交互集中在同一文件）。

- [x] 2.2 对齐 Project console shell 的移动 overflow / viewport 基线
  - 验收标准：
    - Project console route 使用与首页一致的移动端全高/横向不溢出策略。
    - 只做 shell 级和明显撑宽容器的 `min-w-0`、宽度、padding 或动态视口修正，不重排 Project 工作区内容。
    - Agent、Terminal、Files、Git 入口语义不变。
  - 依据：`plan.md` 范围与不做事项；`design/frontend.md` 工程约束；`docs/design/console-shell.md`。
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`。
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`。
  - 依赖：1.1。
  - 并行：否（应在首页重排后统一检查 shell 视觉基线）。

### 3. 集成与行为确认任务

- [x] 3.1 确认 Create/Adopt Project 表单降级后仍保留完整行为
  - 验收标准：
    - 空输入不会提交。
    - 提交中按钮状态仍可见。
    - 成功后仍 invalidate `projects` 并导航到 Project console。
    - API 错误仍显示在用户展开或进入创建/采用流程后可见的位置。
  - 依据：`plan.md` 风险与验证重点；`design/product.md` 低频路径；`design/frontend.md` 状态管理。
  - 必读上下文：`web/src/routes/HomeRoute.tsx`、`web/src/api/client.ts`。
  - 修改范围：`web/src/routes/HomeRoute.tsx`；如需要补测试，可涉及现有测试入口。
  - 依赖：2.1。
  - 并行：否（与 2.1 同文件且依赖最终 UI 状态）。

### 4. 验证准备与横切任务

- [x] 4.1 运行质量门禁并采集移动端 UI artifact
  - 验收标准：
    - 至少运行与前端相关的格式、lint、typecheck/test/build 中适用命令；若执行全量门禁成本可接受，优先运行项目长期门禁。
    - 启动或复用明确命名的 web/api 长驻进程进行浏览器验证。
    - 使用手机视口打开登录后首页，确认无横向页面滚动、Project 入口优先、Create/Adopt 入口次级可发现，并保存截图到 `.workflow/changes/align-mobile-app-shell/artifacts/`。
    - 记录任何无法执行的验证及原因，供 `verify-change` 使用。
  - 依据：`plan.md` 风险与验证重点；`docs/project.md` UI verify artifact 和长驻进程准则。
  - 必读上下文：`package.json`、`web/package.json`、`api/package.json`、`scripts/run-e2e.ts`（按需）。
  - 修改范围：实现阶段可创建 `.workflow/changes/align-mobile-app-shell/artifacts/` 下的验证 artifact；不修改长期 docs。
  - 依赖：2.1、2.2、3.1。
  - 并行：否（必须在实现后执行）。

## 依赖图

- 1.1 → 2.1 → 3.1 → 4.1
- 1.1 → 2.2 → 4.1
- 2.1 → 2.2（建议顺序，用于统一 shell 视觉基线判断）

## 可并行任务

- （无；本 change 的任务集中在全局 shell 与首页/控制台布局，文件和视觉判断高度耦合，串行更安全。）

## 阻塞项

- （无）
