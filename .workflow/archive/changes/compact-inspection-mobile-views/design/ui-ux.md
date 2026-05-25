# UI/UX Design

## Change

- change-id：compact-inspection-mobile-views

## 页面 / 界面范围

- Project workspace 内 Files detail panel 的移动端目录列表、当前路径上下文和文件预览。
- Project workspace 内 Git detail panel 的移动端 changed-file list、当前文件上下文和 unified diff。
- 不改变 Project workspace 顶部 header、Files/Git action card、Agent/Terminal section 的产品顺序。

## 页面结构

- Files panel：
  - 顶部使用紧凑当前路径/恢复操作区，减少长说明文案占位。
  - 主体优先展示目录条目列表；未选中文件时列表是主信息。
  - 选中文件后，预览区域应明显成为主信息；文件上下文压缩为短 header，列表保持可回退或可重新选择。
- Git panel：
  - 顶部使用紧凑 repository/summary 状态，不用大块解释性卡片挤占列表。
  - changed-file list 使用紧凑行，status/scope 作为文字 badge，path 作为主文本。
  - 选中文件后，diff panel 使用紧凑 header + 内容区，unified diff 是主信息。
- 移动端默认单列顺序：上下文 header → 列表 → 详情内容；宽屏可使用同页多列增强，但不能让移动端依赖侧栏才能发现列表或详情。

## 交互模式

- Files：目录行点击进入目录，文件行点击打开预览；Root/Up/Retry 保留为文字按钮或紧凑按钮。
- Git：changed-file 行点击打开 diff；用户可继续点其他文件切换 diff。
- 列表行触控目标应保持可点，不为了密度压缩到难以操作；密度优化优先减少重复说明、过大 padding 和多层卡片嵌套。
- 当前选中行需要有文字/边框/背景组合反馈，不只依赖颜色。
- 长路径和长文件名采用 `min-w-0`、truncate 或 break-all/break-words 的组合，避免页面级横向溢出。

## 页面状态

- 默认态：列表可见且首屏尽量展示多个条目；详情区展示选择提示或当前选中文件内容。
- 加载态：使用紧凑 loading 文案或 skeleton-like 占位，不撑开大面积空白。
- 空态：Files 空目录、Git 无变更都用短文案说明，并保留返回/切换路径。
- 错误态：保留 Retry、Root、Up one level 或切换其他 section 的可恢复入口。
- 成功态：列表和预览/diff 同页呈现，当前 path/file 上下文清晰。

## 可用性要求

- 手机竖屏下不得出现页面级横向滚动；长文本只能在内容区域换行或局部滚动。
- 文件/变更列表行需要保持足够触控面积和清晰 focus/active 样式。
- 状态、scope、status、文件类型不能只用颜色表达，必须有可读文字。
- 预览和 diff 内容应使用等宽字体、可读字号和行高；优先让内容占据空间，而不是让说明性 header 占据空间。
- Files/Git 只读边界必须在紧凑布局下仍然明显：不出现写操作按钮或隐藏菜单入口。

## 关键决策

- 不做“卡片墙”式视觉增强；本 change 的成熟感来自信息层级收敛、列表/详情节奏和内容优先。
- 列表行采用 compact row 而不是大块 card；必要 metadata 压缩为 badge 和单行辅助信息。
- 详情 header 只保留当前文件/path/status/scope 等定位信息，减少重复描述。

## 风险与权衡

- 过度压缩会降低触控可用性，因此不能只追求更小 padding；应优先删除重复说明和嵌套层级。
- Diff/text 内容如果强行单行 truncate 会损害阅读，因此内容区应允许 wrap 或局部滚动，列表 path 才使用截断。
- Files 与 Git 的 UI 模式要相似但不能完全同构；Git 需要保留 status/scope，Files 需要保留目录导航。

## 开放问题

- （无）

## 后续沉淀候选

- Files/Git 移动端 inspection panel 的“紧凑上下文 header + compact row list + content-first detail”模式。
