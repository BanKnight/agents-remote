# UI/UX Design

## Change

- change-id：design-frontend-ui-architecture

## 页面 / 界面范围

本设计覆盖后续 prototype alignment changes 共同遵循的 UI/UX 基线：

- Home / 一级应用 shell。
- Project 直接二级 workspace：Agent、Files、Git、Terminal。
- 深层/contextual detail：Agent instance detail、Terminal instance detail、file preview、Git file diff、从 Agent instance 派生进入的 resource context。
- 桌面端与移动端导航和返回模型。
- 基础视觉语言：深色 console 气质、图标识别、列表/卡片密度、按钮、状态标签、边框和间距节奏。

## 页面结构

### 来源优先级

后续 UI/UX alignment 判断目标结构时按以下顺序处理：

1. `docs/design/prototype/guidelines.md`。
2. `docs/design/prototype/*.html` 的页面结构和交互模型。
3. `docs/design/prototype/screenshots/` 的桌面端/移动端浏览器截图。
4. 已验证长期 docs，例如 `docs/design/console-shell.md`、`docs/design/mobile-session-interaction.md`、`docs/design/frontend-stack.md` 和相关 specs。
5. 当前实现外观。

当旧长期 docs 与新 prototype 冲突时，先判断旧 docs 是否仍表达长期安全/运行边界；如果只是旧视觉或旧布局，后续 change 应以新 prototype 为准。

### 三层页面模型

- **一级应用 shell**：Home、未来 Sessions、Config、Help。桌面端使用左侧一级导航 + 工作区；移动端使用底部一级导航 + 上方主工作区。
- **Project 直接二级 workspace**：Agent、Files、Git、Terminal。桌面端使用左侧二级导航 + Project 工作区；移动端底部切换为二级导航，并提供 Back 项回到一级。
- **深层/contextual detail**：Agent instance detail、Terminal instance detail、文件 preview、Git diff detail、从 Agent instance 打开的 Files/Git/Terminal context。移动端使用顶部返回，不显示底部二级导航。

### 页面主职责

- Home：帮助用户选择 Project；Create/adopt 是低频入口，不占据主工作区首屏。
- Project Agent workspace：默认 Project 工作区，展示 Agent instance 列表、`+ Claude` / `+ Codex` 和轻量 session history。
- Agent instance detail：terminal-first 工作区，顶部提供 Files/Git/+Terminal/Meta 等 contextual 工具入口，输入区服务当前 Agent runtime。
- Terminal 二级页：Terminal instance 列表、新建、进入和关闭。
- Terminal instance detail：focused shell，保留返回、状态、关闭、输出和输入，不显示 Files/Git/+Terminal 快捷入口。
- Files：只读 browse/preview，直接二级页与 contextual Files 在移动端使用不同返回模型。
- Git：只读 status/diff inspection，不提供 stage、commit、checkout、reset 或其他写操作。

## 交互模式

- 进入 Project 后默认落在 Agent 二级 workspace，因为远程 Agent 操作是产品主目标。
- 直接二级页面之间切换不重建一级 shell；用户应始终知道自己在同一个 Project scope 内。
- 移动端直接二级页不在顶部重复 Back；返回一级由底部二级导航 Back 项承担。
- 深层详情页顶部必须有明确返回入口，返回到来源上下文；底部区域优先服务当前详情内容，不显示二级导航。
- Files/Git 的列表项点击进入 preview/detail；进入 detail 后以内容本身为主，减少重复路径说明。
- Agent/Terminal detail 的输入区不得遮挡输出；底部输入抽屉可展开/收起，收起后保留可恢复入口。
- 关闭 Terminal/Agent session 仍是危险操作，需要明确确认。

## 页面状态

- 默认态：显示当前层级、Project/session/resource 上下文、主要内容和最短主操作路径。
- 加载态：保留页面骨架和层级上下文，不用全页空白替代当前 shell。
- 空态：解释当前 scope 下没有内容，并提供与该 scope 匹配的下一步，例如创建 Agent/Terminal 或选择文件。
- 错误态：说明失败对象和可恢复动作，例如 retry、返回 Project、重新选择资源；不能只显示底层异常文本。
- 成功态：页面保持在当前上下文中，用状态标签、列表更新或内容区更新表达结果；避免打断工作流。
- 禁用态：写操作未支持时不渲染可点击入口；Session 输入不可发送时明确显示原因。

## 可用性要求

- 移动端首屏优先显示主要内容，避免大段说明、重复 metadata 和厚卡片挤占工作区。
- 状态不只依赖颜色；状态 pill 或标签必须包含文字。
- 长路径、session id、diff 行和 terminal output 必须避免横向撑破页面；用局部滚动、截断或换行处理。
- 触控目标应足够明确，底部导航和输入按钮需要留出安全区域。
- 桌面端可以提高横向信息密度，但不能产生与移动端不同的产品路径。

## 关键决策

- 结构正确优先于像素级一致；本轮验证以导航层级、页面职责、移动端返回和信息密度为核心。
- 视觉基线锁定为深色 Server Agent Console，而不是通用 SaaS dashboard。
- 图标语言是基础识别能力：Project、Agent provider、Files、Git、Terminal、history、status 都应有一致但轻量的图标/标记位置。
- 列表优先于厚卡片：Project、Agent instance、history、changed files、file rows、terminal instances 都应保持可扫读。
- Files/Git inspection 和 Agent/Terminal runtime detail 都在 Project scope 内，但前者只读、后者可输入；UI 不应混淆两类能力。

## 风险与权衡

- 如果过早追求视觉精细度，会拖慢结构修正；因此本轮只约束视觉基线和明显层级问题。
- 如果直接在每个页面局部修 UI，容易产生多个不同导航模型；因此后续应先完成 shell foundation。
- 当前旧实现已有可运行 Files/Git/Session 能力，后续改 UI 时必须保护可用性和错误/空状态，不应为了 prototype 外观删除真实状态表达。
- Prototype 中部分全局一级入口可能还未有真实能力；后续实现可用占位或隐藏策略，但不能让用户误以为已有完整功能。

## 开放问题

- 一级 Sessions、Config、Help 在首轮真实 UI 中是占位、禁用还是暂不显示，需要在 shell foundation change 中结合实现范围定夺。
- 从 Agent detail 打开的 contextual Files/Git/Terminal 是否复用同一 resource route 加来源参数，还是使用独立 nested route，需要在后续设计中确定。
- Meta 浮窗的字段和交互深度由 instance detail change 决定，本 change 只固定它不应常驻占据主输出区。

## 后续沉淀候选

- Prototype alignment 来源优先级。
- 三层页面模型和移动端返回规则。
- 深色 console 视觉基线与列表/卡片密度原则。
- Files/Git 只读 inspection 与 Agent/Terminal runtime detail 的 UI 职责区分。
