# Follow-up Gaps

本文件记录 `v0.8-prototype-ui-alignment` 中发现但不在本 version 解决的原型缺口、长期 docs 冲突、缺失功能/API、真实能力不足和后续版本候选问题。

## Usage Rules

- 页面 change 发现缺口时，应追加到本文件，而不是把缺失能力塞进当前页面实现。
- 只有能力、API、安全边界、长期 docs 冲突或版本范围之外的问题进入本表；本轮可以完成的视觉、布局、密度、状态和导航对齐不应登记为 follow-up。
- 缺口登记不允许作为伪造数据、伪造功能或扩大本 version 范围的理由。
- 如果缺口影响当前页面验收，应在对应 change 的 browser check log 中引用本文件条目。
- 最终 `verify-prototype-alignment-release` 应汇总本文件的 unresolved 条目，并给出是否需要后续 version 承接的建议。

## Entry Fields Template

追加条目时使用以下字段：

```md
### GAP-YYYYMMDD-<short-id>

- 来源 change：<change-id>
- 页面 / 原型：<route/page>；<prototype html>
- 缺口类型：<prototype-gap | docs-conflict | missing-api | capability-boundary | future-enhancement | shared-baseline-gap>
- 观察：<看到的原型/真实实现/长期 docs 差异>
- 为什么本 version 不解决：<能力边界、安全约束、API 缺失、范围外、需要独立设计等>
- 当前表达方式：<empty | staged | disabled | future | documented-only | not-rendered>
- 建议后续处理方式：<后续 change/version 建议>
- 状态：<open | planned | superseded | resolved>
```

## Category Suggestions

- `prototype-gap`：HTML 原型表达了当前真实产品尚未具备或尚未设计完整的区域。
- `docs-conflict`：原型与已验证长期 docs 或能力边界冲突。
- `missing-api`：UI 需要的真实 API/DTO/stream 字段不存在。
- `capability-boundary`：涉及安全、Project-safe path、session/runtime、Files/Git 只读或真实数据边界。
- `future-enhancement`：适合后续版本规划，但不阻塞本轮原型还原。
- `shared-baseline-gap`：本 version shared 的 contract/note 不准确、不完整或需要后续修正。

## Current Gaps

### GAP-20260529-runtime-shift-tab-mode

- 来源 change：align-runtime-detail-workspaces
- 页面 / 原型：Agent/Terminal runtime detail；`agent-session-detail.html`、`terminal-instance-detail.html`
- 缺口类型：future-enhancement
- 观察：原型 quick keys 包含 `Shift+Tab` mode/selection 切换语义；当前真实 `sessionQuickKeys` 只提供 Ctrl+C、Ctrl+D、Esc、Tab、Enter 和方向键等已支持 control sequence，没有 mode/selection 状态或 provider capability discovery。
- 为什么本 version 不解决：需要独立设计 terminal selection/mode 语义、stream control sequence 和可能的 provider/terminal capability 边界；本 change 不修改 runtime 协议或新增 quick key 配置模型。
- 当前表达方式：not-rendered
- 建议后续处理方式：后续 terminal interaction change 设计 Shift+Tab mode/selection 能力，再更新 `console-model.ts` 与对应测试。
- 状态：open
