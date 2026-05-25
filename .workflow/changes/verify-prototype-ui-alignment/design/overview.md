# Design Overview

本文件汇总本 change 的设计范围、子域选择和整体设计结论。

## Change

- change-id：verify-prototype-ui-alignment
- 所属 version：v0.8-prototype-ui-alignment

## 输入依据

- intents：`.workflow/changes/verify-prototype-ui-alignment/intents.md`
- specs：`.workflow/changes/verify-prototype-ui-alignment/specs/prototype-ui-alignment/spec.md`
- 相关长期 docs：`docs/design/prototype/index.md`、`docs/design/prototype/guidelines.md`、`docs/design/prototype/screenshots/index.md`、`docs/design/frontend-ui-architecture.md`、`docs/project.md`

## 设计范围

### 本次覆盖

- v0.8 已实现页面的最终结构验证：Home、Project Agent workspace、Agent detail、Terminal detail、Files、Git、Terminal workspace。
- 桌面端和移动端真实浏览器截图/日志 artifacts。
- 与 prototype alignment 相关的结构判断：导航层级、移动端返回、内容密度、只读边界、runtime input 边界、长文本 overflow。
- `verify.md` 中记录通过/偏差/回流建议。

### 本次不覆盖

- 不追求 pixel-perfect。
- 不新增产品 UI 行为。
- 不新增 Files/Git 写操作或 runtime protocol。
- 不重做已完成页面的实现；如发现阻塞问题，记录并回流。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 本 change 是验证收口，不改变产品目标。 |
| ui-ux | 是 | 需要明确要验证的页面结构、交互模型和可接受差异。 |
| frontend | 是 | 需要明确 browser harness、mock API、artifact 和工程边界。 |
| architecture | 否 | 不改变系统架构。 |
| api | 否 | 只使用 mock API 或既有 API client，不扩展 API。 |
| data | 否 | 不涉及数据模型。 |
| business-rules | 否 | 不新增业务规则。 |
| error-handling | 否 | 验证脚本记录失败和回流即可，不新增错误处理设计。 |
| risks | 否 | 风险在 ui-ux/frontend 中收口即可。 |

## 总体设计结论

- 本 change 应以真实浏览器 automation 作为主要验证信号，结合已有各 page-level change artifacts 形成最终收口证据。
- Browser harness 使用临时 mock API 和 dev server，避免读取现有环境 secrets 或依赖真实用户 Project。
- 验证目标是结构正确：一级/二级导航、deep detail 返回模型、Agent/Terminal/Files/Git/Terminal resource workspace 职责边界和移动端可用性。
- 可接受细小视觉差异，但不可接受导航层级错误、写操作越界、runtime input 错位或页面级横向溢出。

## 关键决策

- 最终 verification 不直接复用 prototype HTML 截图做像素 diff；改用结构断言 + 当前 Web 截图 artifact，避免把非像素级要求过度收紧。
- 验证脚本集中在本 change artifacts 下，便于 archive 后保留证据。
- 如果发现 CRITICAL，不在本 change 中偷偷修 UI；记录问题并回流到对应 implementation/design。

## 开放问题

- （无）

## 后续沉淀候选

- Prototype alignment 的最终验证方式、artifact 组织方式和“结构正确优先于 pixel-perfect”的长期规则。
