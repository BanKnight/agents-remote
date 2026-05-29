# prototype 索引

本层保存导航结构 HTML 原型，用于对齐首页一级导航与 Project 二级导航的桌面/移动端布局。

## 使用方式

- Standalone HTML 是正式截图和详细评审入口，每个页面可直接在浏览器打开。
- [overview.html](./overview.html) 是总览评审入口，按页面分组展示每个 standalone 页面的 desktop/mobile iframe pair；它不作为正式截图来源。
- [guidelines.md](./guidelines.md) 是 prototype token、组件、viewport、响应式和公共 foundation 规范入口。
- [screenshots](./screenshots/) 保存按标准 viewport 从 standalone HTML 采集的正式截图基线。

## 子目录

- [screenshots](./screenshots/) — 保存 standalone prototype HTML 页面的浏览器渲染截图，用于评审和对齐布局；desktop 使用 `1440x1000`，mobile 使用 `390x844`。

## 文档

- [guidelines.md](./guidelines.md) — 说明 prototype HTML 页面的整体设计规范，包括 token、导航、布局、组件、配色、间距、viewport、响应式和截图来源。
- [prototype-foundation.css](./prototype-foundation.css) — prototype 页面的共享静态 CSS 基础，承载跨页面 token、shell/frame、navigation、surface、row、status、action、input、terminal/code 等 primitive。
- [overview.html](./overview.html) — 按页面分组汇总展示每个 standalone 页面的一组 desktop/mobile iframe，用于总览评审，不用于正式截图。
- [home.html](./home.html) — 展示一级首页在桌面端左侧导航 + 工作区、移动端底部一级导航 + 工作区的布局。
- [project-detail.html](./project-detail.html) — 展示进入 Project 后的 Agent 二级页：桌面端左侧二级导航，移动端底部二级导航含 Back 返回一级入口，工作区展示多个 Agent 实例、创建 Claude/Codex 入口和未来会话历史区域。
- [agent-session-detail.html](./agent-session-detail.html) — 展示从 Agent 实例列表进入后的 terminal-first Agent instance 详情页，包含可滚动/可输入终端、顶部 Files/Git 快捷入口、Meta 浮窗和移动端可收起输入抽屉。
- [terminal-instance-detail.html](./terminal-instance-detail.html) — 展示单个 Terminal instance 详情页，沿用 terminal-first 输出和输入结构，但顶部不提供 Files/Git/Terminal 快捷入口。
- [files.html](./files.html) — 展示 Project Files 的只读浏览/预览体验：桌面端文件列表 + preview 分栏，移动端区分直接二级 Files、contextual Files 和文件 preview detail。
- [git.html](./git.html) — 展示 Project Git 的只读 status/diff inspection 体验：桌面端变更列表 + unified diff，移动端直接 Git 列表保留带 Back 的底部二级导航，进入 diff 详情后使用顶部返回且隐藏二级导航。
- [terminal.html](./terminal.html) — 展示 Terminal 二级页的实例列表体验：支持进入、新建、关闭 Terminal instance，移动端直接二级页使用带 Back 的底部二级导航且不承载 runtime input。
