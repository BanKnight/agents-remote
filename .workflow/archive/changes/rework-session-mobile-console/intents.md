# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：7
  原始意图：Terminal Session 详情页移动端不应溢出或出现页面滚动条，页头应更节省空间并提供返回入口。
- 编号：8
  原始意图：Terminal Session 输入区不应浮动遮挡终端输出，快捷键按钮应放在输入框上方，终端区域应随页面变化并保留合理最小尺寸，而不是固定死大小。
- 编号：9
  原始意图：重新进入 Terminal/Agent Session 时不应直接看到 “Session stream connection failed.” 这类失败提示，应改善重连或恢复体验。
- 编号：11
  原始意图：Agent Session 详情页存在与 Terminal Session 类似的移动端布局和输入问题，并且需要支持在 Agent 询问选择项时进行上下移动等选择输入。

## 规划来源

- 类型：其他
- 原因：本 change 直接承接用户人工 QA 后的 Terminal/Agent Session 详情页移动端控制体验反馈。
- 支撑目标：让 Terminal/Agent Session 详情页成为不遮挡输出、可返回、可重连恢复、可进行选择输入的移动端控制台。
- 前置关系：依赖 `align-mobile-app-shell`。

## 分配说明

- 所属 version：v0.5-mobile-ux-polish
- 分配原因：Session 控制是产品核心闭环，且 Terminal 与 Agent 详情页问题高度同源，应作为一个独立 change 统一处理。
