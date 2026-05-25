# Design Overview

本文件汇总本 change 的设计范围、子域选择和整体设计结论。

## Change

- change-id：compact-inspection-mobile-views
- 所属 version：v0.5-mobile-ux-polish

## 输入依据

- intents：Files 页面和 Git 页面在移动端的信息展示占用空间过多，需要更紧凑、更成熟的列表/查看表现方式。
- specs：`specs/file-browser-preview/spec.md`、`specs/git-diff-viewer/spec.md`
- 相关长期 docs：`docs/project.md`、`docs/design/console-shell.md`、`docs/design/file-browser-preview.md`、`docs/design/git-diff-viewer.md`

## 设计范围

### 本次覆盖

- Files 移动端目录列表与文件预览的空间密度优化。
- Git 移动端 changed-file list 与单文件 unified diff 的空间密度优化。
- Project workspace 内 Files/Git 详情 panel 的紧凑信息层级、局部滚动和长文本处理。
- 只读 inspection 边界在紧凑布局下的保持。

### 本次不覆盖

- 不新增 Files/Git 独立 route 或深链。
- 不新增 Files/Git API、DTO 或后端行为。
- 不引入文件写操作、Git 写操作、下载、上传、stage、commit、reset、push/pull 等能力。
- 不引入第三方文件管理器、diff viewer、虚拟列表、语法高亮或完整代码审阅组件。
- 不重做桌面端专属信息架构。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 用户目标清晰：只读 inspection 在移动端更紧凑、更可读；不涉及新产品路径。 |
| ui-ux | 是 | 本 change 主要是移动端页面结构、信息层级、列表/详情密度和可用性调整。 |
| frontend | 是 | 需要明确现有 React/TanStack Query/local state/Tailwind 约束下的组件边界和实现接入。 |
| architecture | 否 | 不改变系统分层、API、数据模型或跨模块架构。 |
| api | 否 | 不新增或修改 Files/Git API 契约。 |
| data | 否 | 不涉及持久化数据模型或迁移。 |
| business-rules | 否 | 只读边界沿用长期 specs/design，不新增业务规则。 |
| error-handling | 否 | 错误/空状态沿用现有 Files/Git 行为，仅在 UI 密度中保留可恢复入口。 |
| risks | 否 | 风险集中在 UI/UX 与 frontend 两个子域中即可表达。 |

## 总体设计结论

- Files 与 Git 在 Project workspace 中继续作为同页只读 inspection panel，不改变入口层级。
- 移动端 panel 应减少大块说明文案、过厚 padding 和重复 metadata，把首屏空间让给列表或预览/diff 内容。
- Files/Git 都采用“紧凑上下文 header + 紧凑可扫读列表 + 内容优先详情区域”的结构；移动端可以纵向堆叠，较宽屏再增强为列表/详情并排。
- 列表条目必须保留识别任务所需信息：Files 保留类型和名称，Git 保留 path、status、scope；辅助信息压缩为短 badge 或单行 secondary text。
- 预览/diff 内容使用等宽文本、换行/横向约束和局部滚动，避免页面级横向溢出。
- 紧凑化不能通过隐藏菜单引入任何 Files/Git 写操作。

## 关键决策

- 使用现有组件和 Tailwind utility 调整密度，不引入新组件库或成熟第三方 viewer；“借鉴成熟组件”落实为列表/详情信息层级和密度模式，而不是新增依赖。
- Files/Git 的选中路径、当前目录、当前 diff file 继续保留在各自 panel 的本地 state。
- 当前 Project workspace 的 Files/Git action card 只负责入口；具体密度优化在 `FilesPanel` 和 `GitDiffPanel` 内完成。
- 移动端优先验证以手机竖屏截图为准，同时确保桌面宽度不会退化为不可读。

## 开放问题

- （无）

## 后续沉淀候选

- Files/Git 只读 inspection 的长期移动端密度规则可在 verify 后沉淀到 `docs/design/file-browser-preview.md` 与 `docs/design/git-diff-viewer.md`。
- 如果实现改变了 Project workspace 中 Files/Git panel 的长期组织规则，可在 verify 后补充 `docs/design/console-shell.md` 或 `docs/project.md`。
