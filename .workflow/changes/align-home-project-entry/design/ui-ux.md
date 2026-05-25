# UI/UX Design

## Change

- change-id：align-home-project-entry

## 页面 / 界面范围

- Home / Projects 一级页面。
- 桌面端：左侧一级导航 + 右侧 Projects 工作区。
- 移动端：顶部 Projects 上下文 + Project 列表主工作区 + 底部一级导航。
- Create/adopt Project 低频入口及其展开后的表单状态。

## 页面结构

- 页面外层保持深色 Server Agent Console shell，继续沿用已建立的一级导航结构。
- 桌面端左侧一级导航保留 Projects active，Sessions / Config / Help 作为未来入口弱化展示，不参与主任务路径。
- 主工作区顶部只保留：产品/页面上下文、`Projects` 标题、一句简短说明和必要的低频创建入口。
- Project 列表是主内容区，应在视觉权重上高于创建/采用说明区。
- Project 条目使用横向可扫读结构：Project 图标、Project 名称、路径或状态摘要、Open 行为、少量状态 pill。
- 移动端首屏优先展示 Projects 标题、轻量创建入口和 Project 列表；不要让 status badge、说明卡片或侧栏文案把列表推到首屏之外。
- 无 Project 时，空状态可以把 Create/adopt 作为主要行动，因为此时创建是进入 Project Console 的最短路径。

## 交互模式

- 用户主要路径：登录后进入 Home → 扫描 Project 列表 → 打开 Project → 默认进入 Agent workspace。
- 创建/采用路径：用户点击低频入口 → 展开表单 → 输入 Project folder → 提交 → 成功后进入新 Project 的 Agent workspace。
- 移动端一级导航只表达全局入口；当前 change 不让未实现的 Sessions / Config / Help 变成可误解的主流程。
- Project 条目整体应可点击进入 Project；Open 状态可作为视觉提示，但不需要额外制造嵌套点击目标。
- Create/adopt 的展开状态属于 Home 局部交互状态；提交中和错误状态由 mutation 结果驱动。

## 页面状态

- 默认态：显示 Projects header、Project 列表、低频 Create/adopt 入口和一级导航。
- 加载态：Project 列表区域显示加载状态，不阻塞一级 shell 呈现。
- 空态：显示无 Project 提示，并把 Create/adopt 入口提升为完成首个 Project 的主行动。
- 错误态：Project 列表加载失败或创建失败时显示可读错误信息；创建失败保留用户输入和入口上下文。
- 成功态：创建/采用成功后导航进入对应 Project，并默认进入 Agent workspace。
- 禁用 / 提交中：输入为空或创建中时提交按钮禁用；提交中按钮文案表达正在创建。

## 可用性要求

- Project 名称、路径和状态摘要不能导致横向溢出；长路径应截断或在局部区域处理。
- 状态表达包含文字，不只依赖颜色。
- 移动端底部一级导航预留安全区，主内容底部 padding 避免被遮挡。
- 交互元素保持可触控尺寸，尤其是移动端 Create/adopt 和 Project 条目。
- 视觉密度以快速进入 Project 为准，不用厚卡片堆叠重复 metadata。
- 桌面端可以显示更多辅助状态；移动端减少重复说明和非关键 pill。

## 关键决策

- Home 不是 Project dashboard，而是 Project entry；列表和进入行为优先。
- Create/adopt 不是主工作区常驻表单，除非用户主动展开、正在提交、出错或当前没有 Project。
- 保留现有错误/加载/禁用/空状态，避免为了贴近 prototype 删除真实反馈。
- 图标使用轻量字母 marker 即可满足当前识别目标，不引入图标依赖。

## 风险与权衡

- 如果过度追求 prototype 的单列卡片形态，桌面端会损失现有多项目扫读效率；实现时允许桌面保留适度网格，但要保持条目结构和密度。
- 如果把创建入口降级过度，空 Project 用户会找不到首个入口；空态应提升创建行动。
- 如果 mobile 保留过多 header/status 文案，Project 列表会被推到首屏以下；实现和验证必须检查移动首屏。

## 开放问题

- 无阻塞开放问题。

## 后续沉淀候选

- Home / Projects 的长期 UI/UX 规则：Project entry 列表优先，创建/采用为低频入口，空状态例外。
