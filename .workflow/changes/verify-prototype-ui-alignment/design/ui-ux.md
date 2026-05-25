# UI/UX Design

## Change

- change-id：verify-prototype-ui-alignment

## 页面 / 界面范围

- Home / Projects entry：桌面端一级侧栏 + Project list；移动端底部一级导航 + Project list。
- Project Agent workspace：桌面端二级侧栏 + Agent instances；移动端 Project 二级底部导航 + Agent instances。
- Agent detail：terminal-first deep detail，Agent-only Files/Git/+Terminal/Meta tools，移动端无 Project 二级底部导航。
- Terminal detail：focused shell deep detail，移动端无 Project 二级底部导航，无 Agent-only tools。
- Files workspace：直接二级页与 mobile file preview deep detail。
- Git workspace：直接二级页与 mobile single-file diff deep detail。
- Terminal workspace：直接二级 Terminal instances list，不出现 runtime input。

## 页面结构

- 验证应按三层页面模型检查：一级应用 shell、Project 直接二级 workspace、深层/contextual detail。
- 直接二级页在移动端应显示 Project 二级底部导航。
- 深层/detail state 在移动端应显示顶部返回并隐藏 Project 二级底部导航。
- Desktop 应优先检查左侧 navigation + 可扫读工作区；mobile 应优先检查主内容不过度下沉、底部导航不遮挡关键内容。

## 交互模式

- Home 进入 Project 默认 Agent workspace。
- Project 二级导航切换 Agent / Files / Git / Terminal。
- Agent detail 的 Files/Git 是 contextual tools，不是 Project 二级导航。
- Files/Git 选择内容后，移动端进入 deep detail 并提供顶部返回列表。
- Terminal workspace 的 Open detail 进入 Terminal focused shell；New/Close 留在直接二级 workspace，Close 保留危险确认。

## 页面状态

- 默认态：Project list、Agent instances、Files list/preview、Git changed files/diff、Terminal instances 应可见。
- 加载态：由已有 page-level changes 和 web gates 间接覆盖；本 change 主要验证最终结构。
- 空态：Home/Agent/Terminal 可通过 mock 数据或已有 artifacts 覆盖关键空/列表路径；如 harness 不覆盖某空态，`verify.md` 记录范围。
- 错误态：本 change 不主动制造所有错误态；保留 page-level verify 证据链接。
- 成功态：创建 Terminal、关闭 Terminal、打开 detail、返回 deep detail list 应被 browser harness 覆盖。

## 可用性要求

- 关键页面不应出现页面级横向溢出。
- Files/Git 页面不出现写操作 affordance。
- Terminal workspace 不出现 runtime input、quick keys 或 terminal output。
- Agent detail 不污染 Terminal detail；Terminal detail 不显示 Agent-only tools。
- 截图 artifact 命名必须能看出页面和 viewport。

## 关键决策

- 结构验证优先：导航层级、职责边界、内容优先级比像素 diff 更重要。
- 页面级截图与断言共同作为证据，截图用于人工评审，断言用于自动化防漏。

## 风险与权衡

- Mock API 不能证明真实数据所有组合，但可稳定覆盖 UI 结构与导航规则。
- 不做 pixel diff 会放过细小视觉偏差；这是本 version 明确接受的边界。

## 开放问题

- （无）

## 后续沉淀候选

- v0.8 prototype alignment 的最终验收矩阵和 artifact 组织方式。
