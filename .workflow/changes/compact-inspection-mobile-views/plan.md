# plan

## Change 目标

- 优化 Project workspace 内 Files 与 Git 只读 inspection 在手机窄屏下的信息密度，让目录列表、changed-file list、文件预览和 unified diff 更紧凑、更可读。
- 完成后 Files/Git 仍保持只读、同页 inspection，不引入新 route、API 或写操作。

## 局部 big picture

- 本 change 是 v0.5-mobile-ux-polish 的最后一个移动端 polish change，承接前面已完成的 App-like shell、Project workspace 和 Session detail 移动端控制台。
- Project workspace 已把 Files/Git 放在顶部功能区，本 change 聚焦进入 Files/Git 后的只读查看密度，避免移动端首屏被说明文案、过厚卡片和重复 metadata 占用。
- Files/Git 与 Agent/Terminal 的职责边界不变：Files/Git 是观察入口，真实 runtime 输入仍只在 Session detail 出现。

## 执行策略

- 只在前端现有 Files/Git panel 上做最小 UI/JSX/Tailwind 调整，不改 API、shared DTO 或后端。
- 先收敛 Project workspace 的 Files/Git detail wrapper，减少通用 section header 的空间占用。
- 再分别优化 Git 与 Files：列表行改为 compact row，详情 header 压缩为定位信息，内容区域获得更多空间并处理长文本/横向溢出。
- 保留所有现有查询、错误、空态和只读边界；必要时同步测试中依赖的可访问文本。

## 任务顺序依据

- 先调整共享 detail wrapper，因为它会影响 Files/Git 两个 panel 的首屏密度，并决定后续 panel 的视觉节奏。
- Files 与 Git panel 修改互相独立但位于同一文件，为避免编辑冲突按 Git、Files 顺序串行执行。
- 最后统一运行格式、静态检查、测试、构建和移动端截图验证，确保两个 inspection 入口在同一 Project workspace 中一起验收。

## 额外上下文

- `docs/project.md`：Project workspace、移动端视口、只读边界和 verify artifact 约束。
- `docs/design/console-shell.md`：Project workspace 中 Files/Git 功能区和 shell-level input 边界。
- `docs/design/file-browser-preview.md`：Files 只读浏览/预览的长期设计边界。
- `docs/design/git-diff-viewer.md`：Git diff viewer 只读列表/同页 diff 的长期设计边界。
- `web/src/routes/ProjectConsoleRoute.tsx`：本 change 的主要前端实现入口。
- `e2e/file-browser.spec.ts`、`e2e/git-diff.spec.ts`：Files/Git 用户路径验证入口。

## 依赖与阻塞

### 阶段依赖

- `align-mobile-app-shell` 已完成，提供移动端 App-like shell 和视口基线。
- `rework-project-mobile-workspace` 已完成，提供 Project workspace 的 Files/Git 顶部入口布局。

### 任务依赖

- 1.1 共享 detail wrapper 是 2.1/2.2 的视觉基础。
- 2.1 Git 与 2.2 Files 都依赖 1.1，但由于同文件编辑串行执行。
- 3.1 验证依赖 1.1、2.1、2.2 全部完成。

### 外部依赖

- 无第三方服务、数据迁移、配置或人工确认。
- UI 验证需要复用或启动受管理的 web/api/e2e 服务，并保存移动端截图或 Playwright artifact。

## 并行机会

- Git 与 Files 的设计目标可独立验证，但实现都修改 `ProjectConsoleRoute.tsx`，不建议并行编辑。
- 格式、lint、typecheck、test、build 可在实现完成后按项目命令顺序执行；e2e 与截图验证在 build/test 通过后进行。

## 风险与验证重点

- 风险：过度压缩导致触控目标过小；验证时需观察移动截图中列表行仍可点击、文字仍可读。
- 风险：长文件名、长路径或 diff 行导致页面级横向溢出；实现需使用 `min-w-0`、`break-*`、`overflow-auto` 等约束。
- 风险：紧凑布局误删空态、错误态或恢复入口；验证需覆盖 Files/Git 的基本 e2e 路径。
- 风险：不小心引入 Files/Git 写操作 affordance；实现和 verify 必须确认只读边界。

## 不做事项

- 不新增 Files/Git 写操作、下载/上传、stage/commit/reset/push/pull 等入口。
- 不新增或修改 API、shared DTO、后端 Git/Files 服务。
- 不引入第三方 UI 组件库、diff viewer、语法高亮、虚拟列表或文件管理器。
- 不新增独立 Files/Git route、URL search params 或深链。
