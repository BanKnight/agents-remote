# UI/UX Design

## Change

- change-id：align-ui-shell-foundation

## 页面 / 界面范围

- 一级应用 shell：Home 以及未来 Sessions/Config/Help 的导航占位或结构位置。
- Project 直接二级 workspace：Agent、Files、Git、Terminal 的共享导航和工作区 chrome。
- 深层/contextual detail：Agent/Terminal instance detail、file preview、Git diff detail 进入时的 chrome 边界。
- Shared visual primitives：nav item、icon marker、list row、button、status pill、panel/card。

## 页面结构

- 一级页面桌面端采用左侧一级导航 + 右侧工作区；移动端采用底部一级导航 + 主工作区。
- Project 直接二级页面桌面端采用左侧二级导航 + Project workspace；移动端采用底部二级导航 + 主工作区。
- Project 二级导航项固定为 Back、Agent、Files、Git、Terminal 的移动端结构；桌面端不需要 Back 项，返回一级可在 Project context/header 或一级导航中表达。
- 深层/contextual detail 不显示 Project 二级底部导航；顶部保留返回来源上下文。
- Shell foundation 只提供 chrome 和通用 primitives，具体页面内容由后续 Home/Agent/resource/detail changes 填充。

## 交互模式

- 用户从 Home 进入 Project 后默认落在 Agent workspace。
- 用户切换 Agent/Files/Git/Terminal 时，active 状态必须清晰可见，并能在刷新或返回后恢复。
- 移动端直接二级页的 Back 位于底部二级导航第一项，避免顶部与底部重复返回。
- 移动端深层详情页的顶部返回回到来源上下文，底部区域留给当前详情内容或 runtime input。
- Shared icon marker 应辅助识别，不替代文字标签。

## 页面状态

- 默认态：显示当前层级、Project 上下文、active nav、主要 workspace 区域。
- 加载态：保留 shell chrome 和当前层级，不用全屏 loading 替换导航。
- 空态：在 workspace 内表达，不隐藏 shell 或导航。
- 错误态：在当前 workspace 内表达可恢复动作，保留返回/导航。
- 成功态：通过 active 状态、列表更新或 status pill 表达，不打断导航上下文。

## 可用性要求

- 移动端底部导航需要留出安全区域和内容底部 padding，避免遮挡 workspace。
- 状态表达必须包含文字，不只依赖颜色。
- 导航标签保持短文案；长路径和 Project 名称在 header/workspace 内截断或换行。
- 列表行比厚卡片优先；卡片只用于 shell panel 或空/错误状态容器。
- 低频操作不占据首屏主路径。

## 关键决策

- 以 `docs/design/frontend-ui-architecture.md` 为当前 change 的首要长期上下文。
- 将移动端直接二级页和深层详情页的返回模型作为 shell foundation 的核心验收点。
- 视觉基础先统一结构和识别语言，不追求最终像素级 polish。
- 现有真实状态和安全确认优先于 prototype 外观，不能为对齐删除。

## 风险与权衡

- 如果本 change 同时完成所有页面内容，会与后续 page-level changes 重叠；因此只做 shell/primitives。
- 如果 active workspace 仍只保留在 Jotai atom，刷新/返回会破坏页面层级；需要 route/search 或等价可恢复机制。
- 如果抽象 primitives 过多，会制造组件库 churn；首轮只抽取真实共享边界。

## 开放问题

- 一级 Sessions/Config/Help 是否展示为占位由实现成本决定，但不能干扰 Project 主路径。
- 图标 marker 的具体表现可由实现阶段按无新依赖原则选择。

## 后续沉淀候选

- 移动端直接二级页与深层详情页 chrome 规则。
- Shared nav/list/status primitives 的真实实现边界。
