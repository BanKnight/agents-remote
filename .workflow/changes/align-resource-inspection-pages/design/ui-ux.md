# UI/UX Design

## Change

- change-id：align-resource-inspection-pages

## 页面 / 界面范围

- Files workspace：`/projects/:projectName?workspace=files`。
- Git workspace：`/projects/:projectName?workspace=git`。
- Terminal workspace：`/projects/:projectName?workspace=terminal`。
- Files mobile preview deep state 与 Git mobile diff deep state。
- Terminal instance detail 只作为跳转目标，不在本 change 重做 detail chrome。

## 页面结构

- Project 直接二级 workspace：复用当前 Project shell header、workspace body 和 Project 二级导航。
- Files workspace：紧凑 path 操作区、文件/目录 compact row list、预览 panel。
- Git workspace：紧凑 status/retry 区、changed-file compact row list、unified diff panel。
- Terminal workspace：紧凑 workspace header、New Terminal、Terminal instance compact list、空/加载/错误状态。
- 移动端 Files/Git 直接二级页默认展示列表与当前 workspace context；选中文件预览或 diff 后切换成 deep inspection detail：顶部返回到列表，主体展示内容，隐藏底部二级导航。

## 交互模式

- Files：Root/Up/Retry 操作当前目录；点击目录进入下级；点击文件打开预览；移动 preview 使用顶部 Back 返回列表。
- Git：Retry 刷新 status；点击 changed file 打开 unified diff；移动 diff 使用顶部 Back 返回 changed-file list。
- Terminal：New Terminal 创建 Project-scoped shell；Open 进入 Terminal detail；Close 保留危险确认；创建/关闭错误留在 Terminal workspace。
- 直接二级页移动端仍通过底部 Back/Agent/Files/Git/Terminal 导航在 Project workspace 层级切换。
- Deep inspection detail 不显示 Project 二级底部导航，避免与内容返回或 runtime/detail 输入区冲突。

## 页面状态

- Files：loading、empty directory、error、unsupported、too_large、text preview、image preview。
- Git：loading、not repository、no changes、error、select file empty state、diff loading/error/content。
- Terminal：loading、empty sessions、create pending/error、close pending/error、running/idle/error/closed status。
- 移动 deep detail：Back to files / Back to changes 明确可见；长路径、文件名、diff 行和预览内容不得导致页面级横向溢出。

## 可用性要求

- 主要内容优先：文件列表、changed-file list、diff/preview、terminal instance list 不能被大块说明文案挤到首屏以下。
- 只读边界必须可见：Files/Git 不出现写操作按钮，也不通过菜单隐藏写操作。
- 状态必须包含文字，不只靠颜色。
- 移动端 bottom nav 只在直接二级页可见；preview/diff deep state 隐藏 bottom nav。
- Touch target 仍需可点，不能为了紧凑把行高压到不可用。

## 关键决策

- 桌面端保留同页 list + detail，提高扫描效率；移动端进入内容 detail，提高预览/diff 可读面积。
- 不新增 Files/Git 独立 route，避免和当前 route/search 工作区模型产生新复杂度。
- Terminal workspace 不承载 shell input，避免和 Terminal detail runtime input 职责重叠。

## 风险与权衡

- 局部 state 的 mobile deep detail 无法刷新恢复；这是本轮接受的范围，后续需要深链再扩展 route/search。
- Files/Git panels 已有 read-only 实现，本 change 应避免大规模重构，只收敛移动 deep detail、密度和导航互斥。
- Terminal workspace 与 Agent workspace 列表模式相似，但不能误导为 Agent/provider 会话。

## 开放问题

- 后续是否需要 Files/Git selected path/diff file 进入 URL-visible search，取决于用户是否需要刷新恢复或分享链接。

## 后续沉淀候选

- Files/Git mobile direct-secondary vs deep-inspection detail 的长期交互规则。
- Terminal workspace 只列实例、不承载 runtime input 的长期规则。
