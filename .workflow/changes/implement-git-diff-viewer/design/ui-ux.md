# UI/UX Design

## Change

- change-id：implement-git-diff-viewer

## 页面 / 界面范围

Git 位于 Project console 内，是与 Agent、Terminal、Files 并列的 Project-scoped 观察入口。用户任务是确认当前 Project 有哪些未提交变化，并阅读某一个文件的 unified diff。

## 页面结构

- Git section header 继续展示当前 section label、description 和只读状态。
- 内容区域从上到下组织：
  1. Repository state / summary。
  2. Changed file list。
  3. Selected file unified diff panel。
- 文件条目展示 path、status badge、scope badge；renamed 条目可展示 previousPath → path。

## 交互模式

- 打开 Git：加载当前 Project Git diff list。
- 点击文件：加载该文件在对应 scope 下的 unified diff。
- 点击其他文件：替换 diff panel 内容。
- Retry：重新加载列表或当前 diff。
- 非 Git 仓库：展示清晰提示，不展示系统异常样式。

## 页面状态

- 默认态：显示 changed files；未选择文件时提示选择文件查看 diff。
- 加载态：列表和 diff 区域分别展示 loading 文案。
- 空态：Git 仓库无变更时展示 “No changes” 类提示。
- 非 Git 仓库态：提示当前 Project 不是 Git 仓库。
- 错误态：Git 不可用、命令失败或 diff 文件不存在时展示可理解错误和 retry。
- 成功态：显示单文件 unified diff。

## 可用性要求

- 移动端为基准：文件条目可点击区域足够大，status/scope 不能只靠颜色区分。
- unified diff 使用等宽字体和保留空白，允许横向滚动以避免破坏 diff 对齐。
- diff panel header 显示文件 path、scope 和 status，避免用户忘记正在看哪个变更。
- 不展示任何 Git 写操作按钮或危险操作入口。

## 关键决策

- worktree/staged 混合列表用 badge 表达来源，避免第一轮引入复杂 tab/filter。
- 选择单个文件后同页显示 diff，保持列表上下文，适配移动端返回成本。
- 非 Git 仓库是普通状态卡片，不使用错误红色主视觉。

## 风险与权衡

- 很长 diff 会产生较大滚动区域；第一轮不分页，后续按真实使用反馈扩展。
- 不提供双栏 diff；移动端 unified diff 优先。
- 不显示复杂统计，避免小屏信息过载。

## 开放问题

- 无阻塞开放问题。

## 后续沉淀候选

- Git diff viewer 移动端列表/统一 diff 信息架构可在 verify 后沉淀到 `docs/design/git-diff-viewer.md`。
