# UI/UX Design

## Change

- change-id：rework-project-mobile-workspace

## 页面 / 界面范围

- Project console route 的移动端默认视图。
- Project 加载/错误 frame 的返回路径。
- Files/Git 功能入口、Agent Sessions 区、Terminal Sessions 区的入口级视觉与状态。
- 不覆盖 Session detail、Files detail、Git diff detail 的深层移动信息密度。

## 页面结构

- 移动端根结构为全高 Project workspace：
  1. 顶部栏：返回 Projects、Project 名称、必要路径/状态摘要。
  2. 功能区：Files、Git 两个紧凑 action card 或 button card。
  3. Agent 区：标题、创建 Claude/Codex、session 列表或空态。
  4. Terminal 区：标题、创建 Terminal、session 列表或空态。
- Project 工作区不显示固定底部 runtime input panel。
- 常见内容量下页面外壳撑满视口；如果列表较长，滚动应发生在列表/主体区域内。
- 桌面端可以保留更宽布局，如侧栏/双栏，但移动端区域顺序必须稳定。

## 交互模式

- 返回 Projects：顶部左侧或主导航第一项，触控目标明确，文案可读。
- Files/Git：作为功能区入口，点击后切换到现有 Files/Git 内容区域或打开对应 Project console section。
- Agent/Terminal 创建：保留现有按钮语义，创建中禁用并显示反馈；错误显示在对应区域。
- Session item：点击进入对应 Session detail，关闭操作保留确认提示。
- Project 工作区本身不接收 runtime input，不提供伪输入框。

## 页面状态

- 默认态：Project 数据加载完成，有紧凑顶部上下文、功能区、Agent 区、Terminal 区。
- 加载态：保留 app-like frame，显示 Project context loading，不出现大面积营销式空白。
- 空态：Agent/Terminal 区分别展示无 session 的空态和创建入口。
- 错误态：Project 加载失败时展示错误和返回 Projects；区域级创建/关闭失败时在区域内展示错误。
- 成功态：创建 session 成功后列表刷新，用户可看到新 session 并进入 detail。

## 可用性要求

- 移动端顶部返回入口不依赖浏览器返回按钮。
- 状态表达必须有文字，不只依赖颜色或图标。
- Agent Session 与 Terminal Session 文案清楚区分。
- 长 Project 名、路径和 session id 不撑开横向 viewport；使用截断、换行、`min-w-0` 或局部滚动。
- Files/Git 功能区入口要有足够触控面积，不要成为小图标。
- 底部无常驻 runtime input 后，页面最后内容不能被固定 chrome 遮挡。

## 关键决策

- 移动端采用单列分区，而不是复制桌面侧栏 + 右侧面板。
- Files/Git 功能区置顶，Agent/Terminal 运行态区域在其下，符合用户进入 Project 后先选工作类型的路径。
- 不使用全局 Tab 或底部输入条作为 Project 工作区的主要导航，避免与 Session detail 交互职责冲突。

## 风险与权衡

- 单列分区在 session 多时可能变长；实现应优先控制每区高度或列表密度，必要滚动留在区域内。
- Files/Git 作为入口而非完整详情可能让用户多一步操作；本 change 只承担工作区入口，详细密度由后续 `compact-inspection-mobile-views` 处理。
- 保留桌面结构时要避免移动和桌面语义分叉。

## 开放问题

- 无。

## 后续沉淀候选

- Project workspace mobile layout pattern。
- 移动 Project console 不常驻 runtime input 的 UI/UX 规则。
