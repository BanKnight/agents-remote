# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：5
  原始意图：Agent / Terminal instance detail 需要与 prototype 对齐：详情页采用 terminal-first 工作区；Agent instance 顶部提供 Files/Git/+Terminal/Meta 等快捷入口，Meta 以浮窗呈现；移动端终端面板支持滚动和输入，底部输入抽屉可展开/收起并提供真实终端快捷键；Terminal instance detail 保持 focused shell，不显示 Files/Git/+Terminal 快捷入口。

## 规划来源

- 类型：不适用
- 原因：本 change 直接承接用户原始意图。
- 支撑目标：完成 Agent/Terminal runtime 详情页的 terminal-first 工作区、快捷入口和移动端输入体验对齐。
- 前置关系：依赖 align-ui-shell-foundation 和 align-project-agent-workspace。

## 分配说明

- 所属 version：v0.8-prototype-ui-alignment
- 分配原因：Instance detail 是真实 Agent/Terminal 控制的核心路径，且与 Agent workspace 入口和移动端深层返回规则相关，需要独立设计、实现和验证。
