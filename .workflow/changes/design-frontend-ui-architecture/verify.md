# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：design-frontend-ui-architecture
- Roadmap 对应项：v0.8-prototype-ui-alignment / design-frontend-ui-architecture
- 验证对象：workflow-local frontend UI architecture / prototype alignment 设计上下文 artifact
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-25
- 验证范围：检查 specs、design、plan、tasks 是否形成一致的设计上下文闭环，并确认下游 UI alignment changes 可以引用来源优先级、三层页面模型和前端边界。
- 使用 harness：文档一致性审查（Trace / Delta / Scenario / Evidence）
- 本轮结论：通过
- 后续动作：进入 `distill-change`；本 change 的长期沉淀应等整轮 prototype UI alignment 验证后再按需写入长期 docs。

## Harness 清单

- 名称：workflow artifact consistency review
  类型：手动文档审查
  覆盖承诺：spec requirements、design decisions、tasks 完成状态、下游 change 引用可用性
  执行方式：逐项对照 `specs/frontend-ui-architecture/spec.md`、`design/overview.md`、`design/ui-ux.md`、`design/frontend.md`、`plan.md`、`tasks.md` 和下游 change `intents.md`
  结果：通过
  证据：本文件 Trace / Delta / Scenario / Evidence 记录

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| spec | 明确 prototype alignment 来源优先级 | `design/ui-ux.md` 的“来源优先级”；`design/overview.md` 的“总体设计结论” | 已确认来源顺序覆盖 guidelines、HTML、screenshots、旧 docs、当前实现 | 通过 |
| spec | 指定桌面端/移动端导航层级 | `design/ui-ux.md` 的“三层页面模型”和“交互模式”；`design/overview.md` 的“总体设计结论” | 已确认一级 shell、Project 直接二级 workspace、深层/contextual detail 均有导航/返回规则 | 通过 |
| spec | 将 route hierarchy 映射到 product workspaces | `design/frontend.md` 的“路由 / 页面接入”和“模块划分” | 已确认 Home、Project 二级、session/resource detail 的 route/workspace 职责可供后续 changes 使用 | 通过 |
| spec | 定义页面布局和组件边界 | `design/ui-ux.md` 的“页面主职责”；`design/frontend.md` 的“组件边界” | 已确认 shell、workspace header、list row、status pill、preview/detail、input drawer 等边界明确 | 通过 |
| spec | 响应式规则包含移动端返回和密度要求 | `design/ui-ux.md` 的“交互模式”和“可用性要求” | 已确认直接二级页底部 Back、深层详情顶部返回、首屏密度和不遮挡要求明确 | 通过 |
| spec | 定义非 pixel-perfect 的视觉基线 | `design/ui-ux.md` 的“基础视觉语言”和“关键决策”；`design/overview.md` 的“不覆盖” | 已确认结构正确优先、深色 console、图标语言、列表密度、状态标签等基线明确 | 通过 |
| spec | 验证前保持 workflow-local distillation 边界 | `design/overview.md` 的“本次不覆盖”“关键决策”“后续沉淀候选”；`plan.md` 的“不做事项” | 已确认没有写入长期 docs，且后续沉淀需经 distill | 通过 |
| tasks | 1.1 artifact 覆盖范围检查完成 | `tasks.md` 1.1 已勾选 | 已复核 spec/design 对应关系 | 通过 |
| tasks | 2.1 下游引用可用性检查完成 | `tasks.md` 2.1 已勾选；下游 change intents 已读取 | 已确认后续 shell、page、resource、verify changes 可引用当前设计上下文 | 通过 |
| tasks | 3.1 实现状态收口完成 | `tasks.md` 3.1 已勾选；`progress.md` 当前阶段为待验证 | 已确认无未完成 tasks 和无阻塞项 | 通过 |

## Delta 验证

- Scope 内变更：创建并收口 workflow-local spec、design、plan、tasks，并将 progress 推进到待验证。
- Scope 外变更：无；未修改 `web/`、`api/`、`packages/shared/` 或长期 `docs/`。
- 未被 spec/design 支撑的新行为：无；本 change 不引入运行时代码或用户可见行为。
- 风险：后续 changes 仍需把设计转化为真实 UI；这属于后续 roadmap 范围，不阻塞本 change。
- 结论：通过

## Scenario 验证

- 场景：后续 `align-ui-shell-foundation` 开始设计/实现时查找 prototype 来源优先级
  路径类型：正常
  验证方式：检查当前 design 是否显式列出来源顺序和旧 docs 冲突处理规则
  证据：`design/ui-ux.md` 的“来源优先级”；`design/overview.md` 的“总体设计结论”
  结果：通过

- 场景：后续页面级 change 判断某页面属于直接二级页还是深层 detail
  路径类型：正常
  验证方式：检查三层页面模型是否覆盖 Home、Project Agent workspace、Files/Git/Terminal、Agent/Terminal detail
  证据：`design/ui-ux.md` 的“三层页面模型”和“页面主职责”
  结果：通过

- 场景：后续实现需要判断 UI 状态应放在 URL、Jotai 还是组件本地
  路径类型：边界
  验证方式：检查 frontend design 是否提供 route state、shell state 和 local state 的划分规则
  证据：`design/frontend.md` 的“状态管理”和“路由 / 页面接入”
  结果：通过

- 场景：本 change 是否误把未验证设计沉淀到长期 docs
  路径类型：边界
  验证方式：检查 diff 范围和 artifact 位置
  证据：本轮仅写入 `.workflow/changes/design-frontend-ui-architecture/` 下 artifact
  结果：通过

## Evidence 清单

- 类型：手动验证
  路径或命令：审查 `.workflow/changes/design-frontend-ui-architecture/specs/frontend-ui-architecture/spec.md`
  结果：通过
  说明：spec 中 7 条 ADDED requirements 均有 design 对应证据。

- 类型：手动验证
  路径或命令：审查 `.workflow/changes/design-frontend-ui-architecture/design/overview.md`、`design/ui-ux.md`、`design/frontend.md`
  结果：通过
  说明：design 覆盖来源优先级、三层页面模型、route/workspace 职责、组件边界、移动端返回、视觉基线和 distillation 边界。

- 类型：手动验证
  路径或命令：审查 `.workflow/changes/design-frontend-ui-architecture/tasks.md`
  结果：通过
  说明：1.1、2.1、3.1 均已完成，无阻塞项。

- 类型：手动验证
  路径或命令：审查下游 change intents：`align-ui-shell-foundation`、`align-home-project-entry`、`align-project-agent-workspace`、`align-instance-detail-workspaces`、`align-resource-inspection-pages`、`verify-prototype-ui-alignment`
  结果：通过
  说明：下游 change 均能映射到本 design 的来源优先级、三层页面模型和前端边界。

## 交互式 Artifact 清单

- 类型：其他
  路径或命令：不适用
  结果：已说明跳过原因
  说明：本 change 未修改用户可见 UI、浏览器交互、CLI/TUI、实时流或可视化报表；验证对象是 workflow-local 设计上下文 artifact，因此不采集截图、trace 或录屏。后续实际 UI alignment changes 必须采集浏览器截图或等价 artifact。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | spec、design、plan、tasks 均已补齐，且 tasks 全部完成。 |
| Correctness | 通过 | design 内容满足 spec requirements，未引入代码行为或长期 docs 越界。 |
| Coherence | 通过 | 设计与 prototype 入口、既有长期 docs、当前前端结构和 roadmap 下游依赖保持一致。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- 后续实际 UI changes 验证时应采集真实浏览器桌面端/移动端截图，并与 prototype screenshots 对照。

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无；长期沉淀仍应遵循 workflow，在验证后的 distill 阶段按需处理。
