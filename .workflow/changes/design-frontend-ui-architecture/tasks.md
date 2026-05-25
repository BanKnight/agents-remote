# tasks

## 执行顺序

1. 基础/阻塞任务：检查 spec/design artifact 是否完整覆盖本 change 的 WHAT 和 HOW。
2. 核心实现任务：确认本 change 作为后续 changes 共享上下文的引用可用性，并按需修正 workflow artifact。
3. 集成与验证任务：标记任务完成，确保 progress 可以进入 verify。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 检查 frontend UI architecture artifact 覆盖范围
  - 验收标准：
    - `specs/frontend-ui-architecture/spec.md` 中每条 ADDED requirement 都能在 `design/overview.md`、`design/ui-ux.md` 或 `design/frontend.md` 找到对应设计结论。
    - design 覆盖来源优先级、三层页面模型、route/workspace 职责、组件边界、移动端返回模型、视觉基线和 distillation 边界。
    - 如发现缺口，直接补齐对应 workflow artifact。
  - 依据：`plan.md`、`specs/frontend-ui-architecture/spec.md`、`design/overview.md`、`design/ui-ux.md`、`design/frontend.md`
  - 必读上下文：本 change 目录默认产物；`docs/design/prototype/guidelines.md`
  - 修改范围：`.workflow/changes/design-frontend-ui-architecture/specs/`、`.workflow/changes/design-frontend-ui-architecture/design/`
  - 依赖：无
  - 并行：否（阻塞后续任务）

### 2. 核心实现任务

- [x] 2.1 检查后续 UI alignment changes 的引用可用性
  - 验收标准：
    - 下游 `align-ui-shell-foundation`、页面级 alignment changes 和最终 verify change 可以从本 change 产物判断 prototype 来源优先级。
    - 下游 changes 可以区分一级页面、Project 直接二级页面和深层/contextual detail。
    - 下游 changes 可以判断哪些内容属于共享 shell/frontend 边界，哪些属于页面局部实现。
    - 本 change 不要求后续 changes 读取未列出的临时上下文才能理解设计基线。
  - 依据：`plan.md`、`design/overview.md`、`design/ui-ux.md`、`design/frontend.md`
  - 必读上下文：`.workflow/roadmap.md` 中 `v0.8-prototype-ui-alignment` change 队列；各下游 change 的 `intents.md` 可按需读取
  - 修改范围：`.workflow/changes/design-frontend-ui-architecture/design/`、必要时 `.workflow/changes/design-frontend-ui-architecture/plan.md`
  - 依赖：1.1
  - 并行：否（依赖 1.1 对覆盖范围的结论）

### 3. 集成与验证任务

- [x] 3.1 收口本 change 的实现状态
  - 验收标准：
    - 1.1 和 2.1 均已完成。
    - `tasks.md` 中任务状态已更新。
    - `progress.md` 可从待实现推进到待验证，且没有未解决阻塞。
  - 依据：`plan.md`、本文件
  - 必读上下文：`.workflow/changes/design-frontend-ui-architecture/progress.md`
  - 修改范围：`.workflow/changes/design-frontend-ui-architecture/tasks.md`、`.workflow/changes/design-frontend-ui-architecture/progress.md`
  - 依赖：2.1
  - 并行：否（最终收口任务）

## 依赖图

- 1.1 → 2.1 → 3.1

## 可并行任务

- （无）

## 阻塞项

- （无）
