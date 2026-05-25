# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：2
  原始意图：UI/UX prototype alignment 需要先处理跨页面共享的结构基础：一级/二级 navigation shell、路由层级、直接页/详情页归属、移动端返回模型、shared icon system，以及基础视觉组件语言（card/list/button/status pill 等）；这些内容应放在同一组横切结构对齐工作中，避免各页面重复实现导航、图标和基础视觉规则。

## 规划来源

- 类型：不适用
- 原因：本 change 直接承接用户原始意图。
- 支撑目标：为 Home、Project Agent、instance detail 和 resource inspection pages 提供共享 shell、路由、导航、图标和视觉组件基础。
- 前置关系：依赖 design-frontend-ui-architecture；被后续页面/能力对齐 changes 依赖。

## 分配说明

- 所属 version：v0.8-prototype-ui-alignment
- 分配原因：跨页面结构基础必须先于页面局部对齐完成，避免每个页面重复实现 navigation shell、返回模型、图标体系和基础视觉规则。
