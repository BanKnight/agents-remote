# plan

## Change 目标

- 将 Project Files、Git、Terminal 三个 resource workspace 对齐到本 version 原型基线：Files/Git 保持只读 list + preview/diff inspection，Terminal 保持 live instance list，移动端 direct secondary 和 deep detail 的导航互斥必须正确。
- 完成后解锁 `verify-prototype-alignment-release` 对全套 Home/Project、runtime detail 和 resource workspace 的最终汇总验证。

## 局部 big picture

- 本 change 是 `v0.8-prototype-ui-alignment` 的第三个页面级实现 change，继承 shared alignment contract、design system note，以及已完成 Home/Project shell 和 Agent/Terminal runtime detail 的 shared shell primitives。
- Resource workspace 与 runtime detail 的分层是本 change 的核心：Files/Git 是只读 inspection，Terminal workspace 是 direct secondary instance list；真实输入、quick keys 和 runtime output 只属于 Session detail。
- 本 change 的验证证据会成为最终 release verify 的 resource 页面依据；实现时必须同步考虑 artifacts，而不是最后才补截图。

## 执行策略

- 先审计当前 Project console resource workspace 与 prototypes/spec/design 的差异，明确哪些只是视觉密度/结构问题，哪些涉及能力边界或 follow-up gap。
- 再收敛可复用 UI 边界：优先复用或小幅扩展 shell primitives，让 Files/Git/Terminal 共享 surface、toolbar、list row、status、action、mobile return 和 split layout 语言。
- 随后分别对齐 Files、Git、Terminal workspace，但不拆开修改 API/query：Files/Git 保持本地 selected state 和 readonly query，Terminal 保持 existing session mutation/query。
- 最后执行本地检查、启动/复用 `ar-dev` browser validation，采集 prototype/app desktop/mobile screenshots 和 browser check log；如果发现原型-only 能力缺口，写入 `follow-up-gaps.md`。

## 任务顺序依据

- 任务 1.1 是实现前边界审计，阻塞后续任务，避免再次把 shared 基线当背景资料或漏掉 prototype 差异。
- 任务 2.1 先收敛 shared primitive/route helper，因为 Files/Git/Terminal 后续都依赖一致 surface、row、action 和 mobile detail grammar。
- 任务 2.2、2.3、2.4 分别处理 Files、Git、Terminal；三者都会修改 `ProjectConsoleRoute.tsx`，不并行执行，避免同文件冲突和视觉语言漂移。
- 任务 3.1 在实现后运行静态/单元检查，任务 3.2 再采集 browser artifacts；检查通过后任务 3.3 回写 follow-up gaps 和 progress，确保进入 verify 前证据和运行态记录一致。

## 上游承诺投影

- `alignment-contract.md` 的 Prototype Map、viewport、blocking differences 和 artifact requirements 落到任务 1.1、3.2；实现和 verify 必须覆盖 `files.html`、`git.html`、`terminal.html` 的 desktop/mobile。
- `design-system-note.md` 的 shell/navigation/surface/list row/status/action/input boundary 落到任务 2.1、2.2、2.3、2.4；route 中不得散写另一套颜色、按钮、导航或 row 语言。
- `follow-up-gaps.md` 规则落到任务 1.1、3.3；原型-only capability 不伪造，必要时登记 gap。
- `docs/project.md` 和长期 Files/Git/Session specs 的只读、Project-safe path、Terminal workspace/runtime detail 分工落到任务 1.1、2.2、2.3、2.4。
- 本 change spec 中 Files/Git mobile deep detail 隐藏 bottom nav、direct workspace 保留 bottom nav 的 requirements 落到任务 2.2、2.3 和 3.2。
- 本 change frontend design 中不新增 API/DTO/依赖、不新增 URL state、不用 Jotai 保存 selected file/diff 的约束落到任务 2.1、2.2、2.3、2.4。
- `vercel-react-best-practices` 和项目 CLAUDE.md 约束落到任务 1.1、2.1-2.4；实现前必须加载该 skill，并将 React/component separation/styling consistency 纳入承诺清单。

## 额外上下文

- `docs/project.md`：项目 big picture、resource workspace 边界、tmux fixed port 验证约定。
- `docs/design/prototype/guidelines.md`、`docs/design/prototype/files.html`、`docs/design/prototype/git.html`、`docs/design/prototype/terminal.html`：目标页面结构、移动端层级和视觉密度。
- `docs/design/frontend-ui-architecture.md`：三层页面模型、shared shell primitives、surface role 和移动端返回规则。
- `docs/specs/file-browser-preview/spec.md`、`docs/specs/git-diff-viewer/spec.md`、`docs/specs/session-runtime/spec.md`：长期能力边界。
- `.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`、`design-system-note.md`、`follow-up-gaps.md`：本 version 横切验收与 shared UI 实现口径。
- `web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/console-model.ts`、`web/src/components/shell/`：主要实现入口。
- 长驻验证环境：tmux session `ar-dev`，API `43011`，Web `43012`，`PROJECTS_ROOT=/home/deploy/workspace`；验证时复用或重启同一 session，避免端口漂移。

## 依赖与阻塞

### 阶段依赖

- 已完成：`establish-prototype-alignment-baseline`、`align-home-project-shell`、`align-runtime-detail-workspaces`。
- 当前无阶段阻塞；plan/tasks 完成后可进入 `implement-change`。

### 任务依赖

- 1.1 阻塞所有实现任务。
- 2.1 依赖 1.1，并阻塞 2.2、2.3、2.4。
- 2.2、2.3、2.4 依次执行，避免同文件冲突。
- 3.1 依赖全部实现任务。
- 3.2 依赖 3.1。
- 3.3 依赖 3.2。

### 外部依赖

- 无第三方服务、数据迁移、权限或人工确认依赖。
- Browser validation 依赖本地 managed dev services 和真实 Project fixture；如真实 fixture 缺少 Git changes 或 Terminal session，优先准备真实本地 fixture/会话，不伪造 UI 数据。

## 并行机会

- 计划阶段不安排并行实现任务；核心实现集中修改 `ProjectConsoleRoute.tsx` 和 shell primitives，串行更安全。
- 3.2 中 prototype screenshots 和 app screenshots 可在同一 managed browser/dev server 会话中连续采集；不拆并行任务以避免环境漂移。

## 风险与验证重点

- 重点验证 mobile navigation 层级：Files/Git direct secondary 有 bottom nav；Files preview/Git diff detail 无 bottom nav 且顶部返回；Terminal workspace 有 bottom nav且无 deep return。
- 重点验证能力边界：Files/Git 无写操作；Terminal workspace 无 input drawer、quick keys、runtime output；Close Terminal 仍有确认。
- 重点验证 shared UI 一致性：按钮、list row、status pill、surface role、cursor/hover/focus/disabled、safe-area 行为不再三页漂移。
- 重点验证长内容：file path、diff、preview text、terminal session id 不横向撑破 mobile viewport。
- 重点验证 artifacts 完整性：prototype/app desktop/mobile screenshots 和 browser check log 必须保存到本 change artifacts。

## 不做事项

- 不新增 Files 写操作、Git 写操作、Terminal workspace input/output/quick keys。
- 不修改 Files/Git/Terminal API、shared DTO、runtime protocol、Project-safe path 或 query client 语义。
- 不新增 shadcn/ui 组件、lucide 版本升级或任何外部依赖。
- 不把 selected file/diff 写入 route/search 或 Jotai，除非实现发现 specs/design 明确无法满足；当前计划不需要。
- 不伪造 file content、Git diff、Terminal output/history、provider metadata 或 runtime state。
- 不更新长期 docs；长期沉淀由 verify 后的 `distill-change` 处理。
