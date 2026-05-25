# tasks

## 执行顺序

1. 先确认前置 alignment changes 均已完成，并解除本 change 的局部阻塞。
2. 再建立最终 prototype alignment browser harness，生成 desktop/mobile 截图和日志 artifacts。
3. 再运行 web 门禁和 browser harness，创建 `verify.md` 记录最终收口结论。
4. 最后按需 distill 长期验证规则，并更新 progress/roadmap。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 确认依赖完成并解除阻塞
  - 验收标准：`align-home-project-entry`、`align-project-agent-workspace`、`align-instance-detail-workspaces`、`align-resource-inspection-pages` 的 `progress.md` 均为已完成；本 change `progress.md` 阻塞项清空；specs/design/plan/tasks 已补齐并进入待实现。
  - 依据：`plan.md`；`specs/prototype-ui-alignment/spec.md`
  - 必读上下文：`.workflow/roadmap.md`；四个依赖 change 的 `progress.md`；`docs/design/frontend-ui-architecture.md`
  - 修改范围：`.workflow/changes/verify-prototype-ui-alignment/progress.md`；本 change specs/design/plan/tasks
  - 依赖：无
  - 并行：否（阻塞后续验证）

### 2. 核心实现任务

- [x] 2.1 建立 prototype alignment browser harness
  - 验收标准：新增本 change 专用 browser harness；使用 mock API 和临时 web dev server；覆盖 Home、Project Agent workspace、Agent detail、Terminal detail、Files direct/preview、Git direct/diff、Terminal workspace 的 desktop/mobile 结构断言；保存截图、web log、mock API log 和 harness log；不读取现有 secrets/tmux 环境。
  - 依据：`plan.md`；`design/frontend.md`；`design/ui-ux.md`
  - 必读上下文：`docs/design/prototype/index.md`；`docs/design/prototype/guidelines.md`；`docs/design/frontend-ui-architecture.md`；已有 page-level browser harness artifacts
  - 修改范围：`.workflow/changes/verify-prototype-ui-alignment/artifacts/`
  - 依赖：1.1
  - 并行：否（验证脚本和 artifacts 需保持一致）

### 3. 集成与验证任务

- [x] 3.1 运行最终 web 门禁与 prototype alignment verification
  - 验收标准：`bun run format:check`、`bun run lint`、`bun --filter @agents-remote/web typecheck`、`bun --filter @agents-remote/web test`、`bun --filter @agents-remote/web build` 通过；prototype alignment browser harness 通过；`verify.md` 记录 trace/delta/scenario/evidence、artifacts、可接受差异和最终结论；无未解决 CRITICAL。
  - 依据：`plan.md`；`specs/prototype-ui-alignment/spec.md`；`design/overview.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`.workflow/templates/changes/verify.md`；browser harness 输出；各 page-level verify/artifacts
  - 修改范围：`.workflow/changes/verify-prototype-ui-alignment/verify.md`；`.workflow/changes/verify-prototype-ui-alignment/progress.md`
  - 依赖：2.1
  - 并行：否（必须在 artifacts 生成后执行）

### 4. 清理与横切任务

- [x] 4.1 沉淀 prototype alignment verification 规则并收口 change
  - 验收标准：按需更新长期 docs 或明确无需新增长期 docs；更新 docs index（如有 docs 修改）；`progress.md` 标记 distill 完成并进入已完成；如本 version 所有 changes 已完成，准备 archive-version。
  - 依据：`plan.md`；`verify.md`
  - 必读上下文：`docs/project.md`；`docs/design/frontend-ui-architecture.md`；`docs/design/prototype/index.md`；`docs/design/prototype/screenshots/index.md`
  - 修改范围：必要的 `docs/` 文件与 index；`.workflow/changes/verify-prototype-ui-alignment/progress.md`
  - 依赖：3.1
  - 并行：否（依赖 verify 结论）

## 依赖图

- 1.1 → 2.1 → 3.1 → 4.1

## 可并行任务

- （无；本 change 是最终收口验证，证据、verify 和 distill 必须顺序一致）

## 阻塞项

- （无；前置 alignment changes 已完成）
