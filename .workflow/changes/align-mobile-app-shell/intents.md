# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：1
  原始意图：整体 UI/UX 需要从“网站感”调整为移动端优先、类似原生 App 的体验，同时保留未来适配平板和桌面的方向。
- 编号：2
  原始意图：基于移动端优先的前提，大部分页面内容不应撑大并超出页面本身，需要解决移动端页面溢出问题。
- 编号：3
  原始意图：UI/UX 调整应参考 `docs/design/prototype.png` 中的移动端设计原型，但原型中的页面元素和说法需要替换为本项目自己的概念与术语。
- 编号：4
  原始意图：首页的页头和 “Create or adopt a Project” 区域在移动端占用空间过大，尤其创建/采用 Project 是低频功能，应降低其常驻视觉占比。

## 规划来源

- 类型：其他
- 原因：本 change 直接承接用户人工 QA 后的移动端 UI/UX polish 意图，不是额外技术铺垫。
- 支撑目标：为后续 Project、Session、Files/Git 页面重排提供统一的移动端 App-like shell 和页面密度基线。
- 前置关系：无；被 `rework-project-mobile-workspace`、`rework-session-mobile-console`、`compact-inspection-mobile-views` 依赖。

## 分配说明

- 所属 version：v0.5-mobile-ux-polish
- 分配原因：这些意图定义本轮 UI/UX polish 的全局方向、原型参考和首页/低频入口收敛，应作为本 version 的第一步。
