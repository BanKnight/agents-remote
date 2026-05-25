# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：1
  原始意图：需要先建立一个前置的 frontend UI architecture / prototype alignment change，其 design 产物作为后续 UI/UX 对齐 changes 的共享上下文；该产物应把 `docs/design/prototype/` 的原型转译为真实 Web UI 的长期导航层级、路由结构、页面布局、组件边界、响应式规则和视觉基线；prototype guidelines / HTML / screenshots 是最高优先级来源，旧设计文档作为背景和约束；该产物先保存在 workflow change 中，待整轮对齐验证后再沉淀到长期 `docs/design/`。

## 规划来源

- 类型：不适用
- 原因：本 change 直接承接用户原始意图。
- 支撑目标：为后续 UI/UX prototype alignment changes 提供共享设计上下文。
- 前置关系：无；被本 version 后续 UI/UX 对齐 changes 依赖。

## 分配说明

- 所属 version：v0.8-prototype-ui-alignment
- 分配原因：这是整轮 prototype UI alignment 的先导 change，需要先统一导航、路由、布局、组件和视觉基线的设计上下文，避免后续页面局部对齐造成结构重复或冲突。
