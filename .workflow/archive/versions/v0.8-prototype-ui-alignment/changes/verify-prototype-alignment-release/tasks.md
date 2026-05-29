# tasks

## 执行顺序

1. 基础/阻塞任务：审计 shared contract、design system note、follow-up gaps 和前置 change evidence，建立 release 验证输入。
2. 核心实现任务：生成 release artifact manifest 与 release browser/check log，只在本 change artifacts 下落盘。
3. 集成与验证任务：根据 release artifacts 写入 verify.md，运行必要检查，并更新 tasks/progress。
4. 清理与横切任务：确保不修改业务 UI、不伪造能力、不遗漏 gaps 或 artifact 缺口。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 审计 Prototype Map、前置证据和 open gaps
  - 验收标准：
    - 已读取 `alignment-contract.md`、`design-system-note.md`、`follow-up-gaps.md`。
    - 已读取四个前置 changes 的 progress/verify 和页面 changes 的 browser-check logs。
    - 已列出 Prototype Map 每个条目的 responsible change、required artifacts、verify 结论和关键结构断言来源。
    - 已明确 open follow-up gaps 是否属于 release 阻塞候选。
  - 任务承诺清单：
    - 必须检查 Home、Project Agent workspace、Agent detail、Terminal detail、Files workspace、Git workspace、Terminal workspace。
    - 必须检查 `1440x1000` 与 `390x844` prototype/app screenshots 或等价 artifact presence。
    - 必须检查前置 verify 无 unresolved CRITICAL。
    - 必须不修改 app UI 或长期 docs。
  - 依据：`plan.md`；specs/prototype-alignment-release/spec.md；design/overview.md；design/frontend.md；design/ui-ux.md；design/risks.md；shared/alignment-contract.md；shared/design-system-note.md；shared/follow-up-gaps.md
  - 必读上下文：前置 changes 的 `progress.md`、`verify.md`、`artifacts/browser-check.log`；`docs/design/frontend-ui-architecture.md`
  - 修改范围：无代码修改；可在会话或 artifacts 脚本输入中整理审计结果。
  - 依赖：无
  - 并行：否（阻塞后续 manifest/log）

### 2. 核心实现任务

- [x] 2.1 生成 release artifact manifest 和 release check log
  - 验收标准：
    - 已在本 change `artifacts/` 下生成可重复的 release 汇总证据。
    - Manifest/log 记录 Prototype Map artifact presence、前置 browser-check 关键断言、open gaps、missing/failed 状态和 release-level conclusion inputs。
    - 如发现缺失 artifact 或 failed assertion，已在 log 中明确记录且不伪造通过。
    - 未复制前置 PNG；使用相对路径引用前置 screenshots/logs。
  - 任务承诺清单：
    - 必须只写本 change artifacts，不修改业务 UI。
    - 必须覆盖 cross-page navigation layer、shared design system consistency、real capability boundary 和 follow-up gaps。
    - 如新增脚本，必须可重复运行，优先 Bun/Node 标准库，不新增依赖。
    - 如需要补采浏览器证据，必须复用固定 `ar-dev` 或记录无法补采原因。
  - 依据：`plan.md`；design/frontend.md；design/risks.md；specs/prototype-alignment-release/spec.md
  - 必读上下文：任务 1.1 审计结果；前置 artifacts 路径；shared files
  - 修改范围：`.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/artifacts/`
  - 依赖：1.1
  - 并行：否（依赖审计结果并产生 verify 输入）

### 3. 集成与验证任务

- [x] 3.1 写入 release verify.md 并运行轻量检查
  - 验收标准：
    - 已创建 `.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/verify.md`。
    - verify.md 包含验证范围、harness、Trace/Delta/Scenario/Evidence、interactive artifacts、version shared 验证、三维评估、问题清单、follow-up gaps 汇总和最终结论。
    - 已运行 `git diff --check`。
    - 如 release log 有 CRITICAL/missing/failed，verify.md 明确不能进入 distill 并给出回流建议；如无 CRITICAL，结论允许进入 distill。
  - 任务承诺清单：
    - 必须引用本 change release artifacts 和前置 change evidence。
    - 必须明确 open gaps 是否阻塞。
    - 必须不把 future gap 当作当前 release failure，也不忽略 blocking difference。
    - 必须检查 shared contract/design-system note/follow-up gaps 的最终状态。
  - 依据：`plan.md`；`.workflow/templates/changes/verify.md`；design/risks.md；release artifacts
  - 必读上下文：`.workflow/templates/changes/verify.md`；本 change artifacts；前置 verify.md；shared files
  - 修改范围：`.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/verify.md`；必要时本 change artifacts
  - 依赖：2.1
  - 并行：否（依赖 release artifacts）

- [x] 3.2 更新 tasks/progress 并准备 distill
  - 验收标准：
    - `tasks.md` 中 1.1、2.1、3.1、3.2 均按实际完成情况更新。
    - `progress.md` 的 verify 产物检查、当前阶段和进展记录与 verify.md 结论一致。
    - 若 verify 通过，当前阶段推进到待沉淀；若不通过，记录阻塞和回流建议。
  - 任务承诺清单：
    - 必须保持 tasks/progress/用户汇报一致。
    - 必须不提前归档 version；归档由后续 completed/distill/archive 流程处理。
  - 依据：`plan.md`；tasks.md；progress.md；verify.md
  - 必读上下文：tasks.md；progress.md；verify.md
  - 修改范围：本 change `tasks.md`、`progress.md`
  - 依赖：3.1
  - 并行：否（最终收口任务）

## 依赖图

- 1.1 → 2.1 → 3.1 → 3.2

## 可并行任务

- （无；本 change 的证据审计、manifest/log、verify 和 progress 需要串行收口。）

## 阻塞项

- （无）
