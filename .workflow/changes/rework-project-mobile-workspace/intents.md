# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：5
  原始意图：Project 详情页移动端布局需要参考原型中的工作区主界面，左上角提供返回，并从上到下组织为功能区（Git/Files）、Agent 区、Terminal 区。
- 编号：6
  原始意图：Project 详情页移动端不应有过多常驻内容，尤其不应常驻底部 runtime input；该页面应自动撑满视口并避免出现页面滚动条。

## 规划来源

- 类型：其他
- 原因：本 change 直接承接用户人工 QA 后的 Project 主界面移动端布局反馈。
- 支撑目标：让 Project 详情页成为移动端工作区主界面，承载功能区、Agent 区和 Terminal 区，而不是网站式长页面。
- 前置关系：依赖 `align-mobile-app-shell`。

## 分配说明

- 所属 version：v0.5-mobile-ux-polish
- 分配原因：Project 详情页是进入 Files/Git/Agent/Terminal 的工作区入口，应在全局移动端 shell 基线明确后单独设计和验证。
