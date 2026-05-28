# tasks

## 执行顺序

1. 先加载 React/prototype implementation 必需上下文并确认依赖策略，避免未检查就安装 shadcn/lucide。
2. 再调整共享 shell primitives、layout、navigation / console labels 的轻量基础，为 Home 和 Project 页面提供一致密度。
3. 分别对齐 Home / Projects 与 Project Agent workspace。
4. 最后运行 tests、采集 desktop/mobile browser artifacts，并按实际发现更新 shared gap 或说明无需更新。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 加载 React implementation 约束并确认依赖策略
  - 验收标准：实现前已加载 `vercel-react-best-practices` skill；本 change 不默认安装 shadcn/ui 或 lucide-react；如决定安装，必须先重新检查 npm metadata 和 7 天安全规则，并在本 change 中记录原因和最终 pins。
  - 依据：`plan.md`；`design/frontend.md`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`
  - 必读上下文：`CLAUDE.md`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`；本 change `design/frontend.md`
  - 修改范围：无代码修改，除非记录必要依赖决策到本 change 运行态材料
  - 依赖：无
  - 并行：否（阻塞所有 React UI 实现）

- [x] 1.2 调整 shared shell primitives 和 console labels
  - 验收标准：`IconMarker`、`NavItemContent`、`StatusPill`、`ActionButton`、`ShellInput`、`ListRow`、shell layout 和 shell navigation 如需调整，则尺寸、padding、truncate、active/disabled 状态更符合 shared design system note；shell wrappers 如包装 shadcn `Button`、`Badge`、`Card`、`Input`，必须保留 project visual tone；`console-model.ts` 中 Agent/Files/Git/Terminal labels/status 保持 Project 二级导航语义；相关 tests 仍可更新并通过。
  - 依据：`plan.md`；spec Requirement `Copy and visual density follow console prototype without changing behavior`；`design/frontend.md`
  - 必读上下文：`web/src/components/shell/shell-primitives.tsx`；`web/src/components/shell/shell-layout.tsx`；`web/src/components/shell/shell-navigation.tsx`；`web/src/components/ui/button.tsx`；`web/src/components/ui/badge.tsx`；`web/src/components/ui/card.tsx`；`web/src/components/ui/input.tsx`；`web/src/routes/console-model.ts`；`web/src/routes/console-model.test.ts`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`
  - 修改范围：`web/src/components/shell/`；`web/src/components/ui/button.tsx`；`web/src/components/ui/badge.tsx`；`web/src/components/ui/card.tsx`；`web/src/components/ui/input.tsx`；`web/src/routes/console-model.ts`；`web/src/routes/console-model.test.ts`；必要时 `web/package.json`、`bun.lock`、`web/components.json`、`web/src/styles/index.css`
  - 依赖：1.1
  - 并行：否（基础视觉边界会影响后续页面任务）

### 2. 核心实现任务

- [x] 2.1 对齐 Home / Projects shell 与列表密度
  - 验收标准：Home desktop 显示一级左侧导航 + Projects 工作区；mobile 显示底部一级导航 + Projects 工作区；Project list 是主内容；create/adopt 在有 Projects 时为低频入口，在空态/错误/提交中可提升；Project row 使用真实字段、保持可扫读、不伪造 metadata、不横向溢出。
  - 依据：`plan.md`；spec Requirements `Home shell aligns with prototype as the level-one Project entry`、`Home Project rows remain scannable and real-data bounded`、`Home and Project non-happy states keep density and recovery`；`design/ui-ux.md`
  - 必读上下文：`web/src/routes/HomeRoute.tsx`；`docs/design/prototype/home.html`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`
  - 修改范围：`web/src/routes/HomeRoute.tsx`；必要时 `web/src/components/shell/`
  - 依赖：1.1、1.2
  - 并行：否（可能共享 primitives，且需要和 Project 视觉节奏统一）

- [x] 2.2 对齐 Project Agent workspace shell、导航与 Agent 列表密度
  - 验收标准：Project desktop 显示二级左侧导航 + Agent workspace；mobile 显示包含 Back/Agent/Files/Git/Terminal 的底部二级导航且顶部不重复 Back；Agent instances 是主内容；Claude/Codex 创建入口清晰；staged history/future restore 不伪造真实历史；关闭 Agent 保留确认；Files/Git/Terminal 二级入口可见但不挤占 Agent 主内容。
  - 依据：`plan.md`；spec Requirements `Project Agent workspace aligns with project-detail prototype`、`Agent instances list preserves current runtime truth`、`Copy and visual density follow console prototype without changing behavior`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`；`web/src/routes/console-model.ts`；`docs/design/prototype/project-detail.html`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx`；必要时 `web/src/components/shell/`、`web/src/routes/console-model.ts`
  - 依赖：1.1、1.2、2.1
  - 并行：否（同一视觉基线与 possible shared primitives）

### 3. 集成与验证任务

- [x] 3.1 运行相关前端检查
  - 验收标准：与改动相关的 route/model tests 通过；如果改动触及 TypeScript 类型或 route/search，执行对应 typecheck 或记录无法执行原因；失败时回到实现任务修正，不勾选本任务。
  - 依据：`plan.md`；`design/frontend.md`；spec Requirement `Page change artifacts follow shared alignment contract`
  - 必读上下文：`web/package.json`；`web/src/routes/console-model.test.ts`；相关改动文件
  - 修改范围：测试文件只在需要更新期望时修改
  - 依赖：2.1、2.2
  - 并行：否（必须在 UI 实现后执行）

- [x] 3.2 采集 Home / Project prototype 与 app browser artifacts
  - 验收标准：artifacts 中保存 `home.html` prototype desktop/mobile 截图、Home app desktop/mobile 截图、`project-detail.html` prototype desktop/mobile 截图、Project Agent workspace app desktop/mobile 截图，以及 browser check log；viewport 明确为 desktop `1440x1000` 和 mobile `390x844`；log 记录关键结构检查、可接受差异和 blocking difference 状态。
  - 依据：`plan.md`；spec Requirement `Page change artifacts follow shared alignment contract`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`；`design/risks.md`
  - 必读上下文：`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`；`docs/design/prototype/home.html`；`docs/design/prototype/project-detail.html`；browser/dev server 运行方式
  - 修改范围：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/`
  - 依赖：3.1
  - 并行：否（需要最终 UI 和可运行 app）

- [x] 3.3 检查并按需更新 shared gaps 或 shared baseline
  - 验收标准：如实现/验证发现缺失 API、原型冲突、真实能力不足或 shared baseline 不准确，已更新 `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md` 或对应 shared 文件；如未发现，tasks/progress/verify 中说明无需更新 shared。
  - 依据：`plan.md`；spec Requirements `Agent instances list preserves current runtime truth`、`Page change artifacts follow shared alignment contract`；`design/risks.md`
  - 必读上下文：`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`；`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`；browser check log
  - 修改范围：`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`；必要时 `alignment-contract.md` 或 `design-system-note.md`
  - 依赖：3.2
  - 并行：否（必须基于验证发现）

## 依赖图

- 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2 → 3.3

## 可并行任务

- （无；本 change 文件重叠较多，且视觉节奏需要连续校准）

## 阻塞项

- （无）
