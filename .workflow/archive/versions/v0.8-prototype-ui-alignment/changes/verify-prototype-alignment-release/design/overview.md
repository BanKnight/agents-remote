# Design Overview

本文件汇总本 change 的设计范围、子域选择和整体设计结论。

## Change

- change-id：verify-prototype-alignment-release
- 所属 version：v0.8-prototype-ui-alignment

## 输入依据

- context：.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/context.md
- specs：.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/specs/prototype-alignment-release/spec.md
- version shared：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md；design-system-note.md；follow-up-gaps.md
- 相关长期 docs：docs/project.md；docs/design/prototype/index.md；docs/design/prototype/guidelines.md；docs/design/frontend-ui-architecture.md
- 前置 change 证据：establish-prototype-alignment-baseline、align-home-project-shell、align-runtime-detail-workspaces、align-resource-inspection-workspaces 的 progress/verify/artifacts

## 设计范围

### 本次覆盖

- 汇总检查本 version Prototype Map 中所有页面的 artifacts 是否存在并可审查。
- 设计 release 级结构验证口径：三层导航、mobile direct/deep 互斥、runtime input/detail 边界、Files/Git 只读边界、shared primitive 视觉一致性。
- 设计最终 artifacts/log/verify.md 的组织方式，确保可以追溯到前置 change 的截图和 browser logs。
- 汇总 `follow-up-gaps.md`，判断 open gap 是否阻塞本 version。

### 本次不覆盖

- 不新增或修改业务 UI 实现。
- 不重新采集每个前置页面的全套 screenshots，除非已有 artifact 缺失或证据不足。
- 不做 pixel diff、DOM/class 完全一致检查或设计稿级视觉标注。
- 不直接沉淀长期 docs；长期沉淀由本 change 后续 distill 阶段判断。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 本 change 是 release 验证收口，不改变产品行为。 |
| ui-ux | 是 | 需要定义跨页面导航层级、视觉/密度等价和人工截图审查口径。 |
| frontend | 是 | 需要定义 browser/check harness、artifact 汇总脚本、日志结构和证据读取边界。 |
| architecture | 否 | 不改变系统架构或模块边界。 |
| api | 否 | 不新增 API 或协议。 |
| data | 否 | 不涉及数据模型或迁移。 |
| business-rules | 否 | 不改变业务规则。 |
| error-handling | 否 | 验证失败处理写入 risks 与 verify 回流建议即可，不单独设计错误体系。 |
| risks | 是 | 需要收口 artifact 缺失、截图过期、false positive/negative 和 gap 分类风险。 |

## 总体设计结论

- Release verification 采用“前置证据复核 + release 汇总 log + 必要时补充浏览器断言”的方式，不重新实现页面，也不把最终验证变成新一轮 UI change。
- 验证对象以 `alignment-contract.md` Prototype Map 为主轴，逐项映射 prototype page、real route/page、responsible change、required artifacts 和 blocking differences。
- UI/UX 判断以结构等价为准：三层页面模型、desktop sidebar/workspace、mobile bottom nav/top return 互斥、terminal-first detail、resource list/detail 和真实能力边界。
- Frontend harness 应优先读取前置 change 的 `browser-check.log` 与 screenshots，再生成本 change 自己的 release summary log；只有证据缺口或跨页面断言无法由前置 log 支撑时才重新打开 app/prototype 页面补充检查。
- Follow-up gaps 不自动阻塞 release；只有 shared baseline 错误、当前验收缺失、伪造能力或 blocking difference 才阻塞。

## 关键决策

- 最终 release 验证不使用 pixel diff；截图用于人工审查和结构证据，browser log 用于可重复断言。
- 最终 artifacts 采用汇总而不是复制所有 PNG，避免重复存储；`verify.md` 引用前置 change artifacts 的相对路径。
- 如果前置 artifact 缺失，优先回流到对应页面 change 或补采该路径，不用空结论通过。
- Open future gap 需要在 verify 中列出，但不应把真实未实现能力伪装成 release failure。

## 开放问题

- 无阻塞开放问题。
- 最终是否需要额外补采 overview.html 或综合页面截图，留到 plan/verify 按证据缺口决定。

## 后续沉淀候选

- 经最终 release 验证后的 prototype alignment 结构断言方法。
- 设计系统基线是否从 version shared 提炼为长期 design system 文档。
