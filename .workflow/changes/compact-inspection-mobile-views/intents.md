# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：10
  原始意图：Files 页面和 Git 页面在移动端的信息展示占用空间过多，需要更紧凑、更成熟的列表/查看表现方式，可以考虑借鉴成熟组件。

## 规划来源

- 类型：其他
- 原因：本 change 直接承接用户人工 QA 后的 Files/Git 移动端信息密度反馈。
- 支撑目标：让只读 Files 和 Git diff 查看在移动端更紧凑、可读，并减少列表/详情展示的空间浪费。
- 前置关系：依赖 `align-mobile-app-shell`；建议在 `rework-project-mobile-workspace` 之后推进，以继承 Project 主界面入口布局。

## 分配说明

- 所属 version：v0.5-mobile-ux-polish
- 分配原因：Files 与 Git 都属于 Project inspection 能力，问题同源且验证方式相似，适合合并为一个移动端密度优化 change。
