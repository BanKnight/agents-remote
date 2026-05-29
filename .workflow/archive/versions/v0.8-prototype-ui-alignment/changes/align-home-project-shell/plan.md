# plan

## Change 目标

- 本 change 要把 Home / Projects 与 Project Agent workspace 按 `home.html`、`project-detail.html` 和 version shared 基线做一轮细节级 UI 对齐。
- 完成后，Home/Project shell 应成为后续 runtime detail 和 resource workspace changes 的已验证导航、密度和 primitive 使用基础。

## 局部 big picture

- `establish-prototype-alignment-baseline` 已提供 shared contract 和 design system note；本 change 是第一个消费并检验这些 shared 材料的页面 change。
- Home/Project shell 是用户进入控制台和 Project 二级 workspace 的入口，后续 Agent/Terminal detail、Files/Git/Terminal workspace 都依赖它的导航层级、列表密度和 primitive 口径稳定。
- 当前实现已经具备基础 route/query/session 行为，本 change 的风险不是功能缺失，而是为了视觉还原过度重排数据流或伪造不存在的 provider/history 信息。

## 执行策略

- 先加载 `vercel-react-best-practices` skill，再改 React UI，以符合项目 CLAUDE.md 和 shared design system note。
- 优先使用现有 `HomeRoute.tsx`、`ProjectConsoleRoute.tsx`、`web/src/components/shell/` 和 `console-model.ts` 做小步 UI 对齐，不新增 route、不重写 API client、不改 shared DTO。
- 先调整可复用 shell primitives、layout/navigation 和 console model 的轻量视觉/标签基础，再分别对齐 Home 与 Project Agent workspace，最后运行 tests 并采集 desktop/mobile 浏览器 artifacts。
- 不默认安装 lucide-react 或 shadcn/ui；本轮因复用边界复盘决定引入时，已按 shared 规则重新检查并采用安全窗口外版本，生成最小 shadcn `Button`、`Badge`、`Card`、`Input` source components，并通过 shell wrappers 消费。
- 发现原型要求但真实能力不支持时，更新 `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`，不在页面内伪造数据。

## 任务顺序依据

- 基础 shell components/model 先做，因为 Home 和 Project 页面都会消费 `ShellLayout`、`ShellSidebar`、`ShellPanel`、`ShellHeaderSurface`、primary/project navigation、`IconMarker`、`NavItemContent`、`StatusPill`、`ActionButton`、`ShellInput`、`ListRow` 和 navigation label。
- Home 和 Project Agent workspace 可以在基础调整后分别实现，但它们都可能修改 shared primitives；为降低冲突，建议连续执行而非并行写同一文件。
- Browser artifacts 必须最后执行，因为它需要最终 UI、dev server、prototype/app 页面和稳定截图路径。

## 额外上下文

- version shared：`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`
- 长期 docs：`docs/project.md`；`docs/design/prototype/home.html`；`docs/design/prototype/project-detail.html`；`docs/design/prototype/guidelines.md`；`docs/design/frontend-ui-architecture.md`；`docs/design/console-shell.md`
- 代码入口：`web/src/routes/HomeRoute.tsx`；`web/src/routes/ProjectConsoleRoute.tsx`；`web/src/components/shell/shell-primitives.tsx`；`web/src/components/shell/shell-layout.tsx`；`web/src/components/shell/shell-navigation.tsx`；`web/src/components/ui/button.tsx`；`web/src/components/ui/badge.tsx`；`web/src/components/ui/card.tsx`；`web/src/components/ui/input.tsx`；`web/src/routes/console-model.ts`；`web/src/routes/console-model.test.ts`；`web/src/routes/router.tsx`；`web/src/styles/index.css`
- 验证入口：`web` route/model tests；真实浏览器 desktop/mobile screenshot；change artifacts 目录。

## 依赖与阻塞

### 阶段依赖

- `establish-prototype-alignment-baseline` 已完成，shared baseline 可读。
- specs 和 design 已完成，本 change 可进入 implementation。
- 后续 `align-runtime-detail-workspaces` 依赖本 change 完成。

### 任务依赖

- 1.1 读取 `vercel-react-best-practices` 并确认依赖策略，阻塞所有 React UI 编辑。
- 1.2 primitive/model 轻量调整阻塞 Home/Project 页面最终对齐，因为两者复用这些边界。
- 2.1 Home 对齐依赖 1.1、1.2。
- 2.2 Project Agent workspace 对齐依赖 1.1、1.2；如 2.1 修改了 shared primitives，需要基于最新状态继续。
- 3.1 tests 依赖 2.1、2.2。
- 3.2 browser artifacts 依赖 3.1 和可运行 web app。
- 3.3 shared gap check 依赖 2.1、2.2、3.2 的实际发现。

### 外部依赖

- 需要本地 web app 可运行；优先复用或启动可追踪 dev server。
- 需要浏览器截图能力；若无法采集，verify 必须记录阻塞或跳过原因。
- 无数据库、迁移、外部服务或人工确认依赖。

## 并行机会

- 2.1 Home 与 2.2 Project 理论上关注不同页面组件，但都会接触 `shell-primitives.tsx` 和视觉基线，建议不并行执行。
- 3.1 tests 与 3.2 screenshots 不应并行，先确保基本 tests 通过再采集 artifacts。
- 如果 implementation 明确 2.1 不再修改 shared primitives，2.2 可由另一个 agent 并行处理 `ProjectConsoleRoute.tsx`，但本轮默认单线执行以减少视觉冲突。

## 风险与验证重点

- 验证 Home mobile 首屏是否仍优先展示 Projects 列表，低频 create/adopt 不遮挡底部一级导航。
- 验证 Project mobile 直接二级页是否只显示底部二级导航，不在顶部重复 Back。
- 验证 Agent workspace 是否展示真实 Agent instances、Claude/Codex 创建入口和 staged history，不伪造 recent output 或 provider history。
- 验证长 Project path、Project name、Agent displayName、session id 不造成横向溢出。
- 验证 Files/Git/Terminal 二级入口仍可见，且未新增 Files/Git 写操作或 Terminal shell-level input。
- 验证 shared baseline 如需修正则回写；如发现未来能力缺口，写入 `follow-up-gaps.md`。

## 不做事项

- 不新增 Agent history API、provider resume、recent output、task summary 或 provider-native metadata。
- 不改 `api/`、`packages/shared/`、session runtime、Project safe path 或 provider adapter。
- 不新增 light mode、PWA offline/notification/service worker。
- 不重写 TanStack Router/Query/Jotai 分工。
- 不批量安装 shadcn/ui、lucide-react 或生成未使用组件；本轮只保留已验证的 shadcn `Button`、`Badge`、`Card`、`Input` source setup 和安全版本 pins。
- 不改 Files/Git/Terminal workspace 内部能力；只保护其二级导航入口。
