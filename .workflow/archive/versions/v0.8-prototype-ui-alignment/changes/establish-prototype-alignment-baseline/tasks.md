# tasks

## 执行顺序

1. 先写 `alignment-contract.md`，锁定原型对照、viewport、差异标准、artifacts 和 gap handling。
2. 在 contract 初稿基础上写 `design-system-note.md` 和 `follow-up-gaps.md`。
3. 最后做一致性检查，确认三份 shared 文件覆盖 spec/design 且可供后续页面 changes 使用。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 创建 alignment contract
  - 验收标准：`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md` 存在；包含 Purpose、References、Viewports、Prototype Map、Equivalence Rules、Acceptable Differences、Blocking Differences、Artifact Requirements、Follow-up Gap Rule；Prototype Map 至少覆盖 `home.html`、`project-detail.html`、`agent-session-detail.html`、`terminal-instance-detail.html`、`files.html`、`git.html`、`terminal.html`；明确 desktop `1440x1000` 与 mobile `390x844`。
  - 依据：`plan.md`；spec Requirement `Shared alignment contract`；`design/ui-ux.md`
  - 必读上下文：`docs/design/prototype/index.md`；`docs/design/prototype/guidelines.md`；`docs/design/frontend-ui-architecture.md`；`docs/design/console-shell.md`；`docs/design/mobile-session-interaction.md`
  - 修改范围：`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`
  - 依赖：无
  - 并行：否（阻塞后续 shared 文件和 downstream changes）

### 2. 核心实现任务

- [x] 2.1 创建设计系统说明
  - 验收标准：`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md` 存在；包含 Purpose、Source Priority、Technology Baseline、Tokens、Console Primitives、shadcn/ui Boundary、Icon Boundary、State and Route Boundary、Non-abstraction List、Verification Hooks；明确 `vercel-react-best-practices` 在 React/prototype `implement-change` 前必须加载；记录 shadcn/lucide 版本安全检查要求但不执行安装。
  - 依据：`plan.md`；spec Requirement `Shared design system note`；`design/frontend.md`
  - 必读上下文：`design/frontend.md`；`design/overview.md`；`web/package.json`；`web/vite.config.ts`；`web/src/styles/index.css`
  - 修改范围：`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`
  - 依赖：1.1
  - 并行：是，可与 2.2 并行（不同文件；都依赖 1.1）

- [x] 2.2 创建后续缺口登记表
  - 验收标准：`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md` 存在；包含使用规则、条目字段模板、分类建议和当前空列表；字段至少能记录来源 change、页面/原型、缺口类型、观察、为什么本 version 不解决、建议后续处理方式、状态。
  - 依据：`plan.md`；spec Requirement `Follow-up gaps registry`；`design/risks.md`
  - 必读上下文：`design/ui-ux.md`；`design/risks.md`
  - 修改范围：`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`
  - 依赖：1.1
  - 并行：是，可与 2.1 并行（不同文件；都依赖 1.1）

### 3. 集成与验证任务

- [x] 3.1 校验 shared 基线一致性
  - 验收标准：三份 shared 文件都存在；`alignment-contract.md` 覆盖 spec 中 contract/gap/downstream/scope requirements；`design-system-note.md` 覆盖 design 中 frontend/tokens/shadcn/lucide/state/non-abstraction requirements；`follow-up-gaps.md` 可被后续 changes 直接追加；三份文件不要求页面实现、不要求安装依赖、不写长期 docs 口吻；如发现遗漏，补齐对应 shared 文件。
  - 依据：`plan.md`；`specs/prototype-ui-alignment-baseline/spec.md`；`design/overview.md`；`design/ui-ux.md`；`design/frontend.md`；`design/risks.md`
  - 必读上下文：本 change 的 spec/design；`.workflow/versions/v0.8-prototype-ui-alignment/shared/` 下三份文件
  - 修改范围：`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`；`design-system-note.md`；`follow-up-gaps.md`
  - 依赖：2.1、2.2
  - 并行：否（最终一致性检查必须在三份 shared 文件完成后执行）

## 依赖图

- 1.1 → 2.1 → 3.1
- 1.1 → 2.2 → 3.1

## 可并行任务

- 2.1 与 2.2 可以并行：二者都只依赖 1.1，且修改不同 shared 文件。

## 阻塞项

- （无）
