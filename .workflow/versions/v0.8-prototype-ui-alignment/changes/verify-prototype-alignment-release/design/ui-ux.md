# UI/UX Design

## Change

- change-id：verify-prototype-alignment-release

## 验证体验范围

- Home / Projects 一级 shell。
- Project Agent workspace 直接二级页。
- Agent detail 与 Terminal detail 深层 runtime detail。
- Files、Git、Terminal resource workspaces。
- Files preview 与 Git diff mobile deep inspection detail。
- 跨页面 shared navigation、surface、list、status、action、input/terminal density。

## 页面层级验证模型

- 一级应用 shell：desktop 左侧一级导航 + workspace；mobile 底部一级导航 + workspace。Home/Projects 只属于这一层。
- Project 直接二级 workspace：desktop 左侧二级导航 + Project workspace；mobile 带 Back 项的 Project 二级 bottom nav。Agent、Files、Git、Terminal direct workspaces 属于这一层。
- 深层/contextual detail：顶部返回 + content-first 主体；mobile 不显示 Project 二级 bottom nav。Agent detail、Terminal detail、Files preview detail、Git diff detail 属于这一层。

## 关键结构断言

- Mobile Home 显示一级 bottom nav，不显示 Project 二级 nav。
- Mobile Project Agent workspace 显示 Project 二级 bottom nav，顶部不重复返回。
- Mobile Agent/Terminal detail 显示顶部返回，不显示 Project 二级 bottom nav；detail 中 runtime output/input 才出现。
- Mobile Files/Git direct workspace 显示 Project 二级 bottom nav；进入 preview/diff detail 后隐藏 Project 二级 bottom nav并显示顶部返回。
- Mobile Terminal direct workspace 显示 Project 二级 bottom nav，不显示 runtime input/output/quick keys。
- Desktop Home/Project/resource/runtime 页面保持左侧导航与右侧工作区的连续 shell 结构。

## 视觉一致性检查

- 所有页面保持深色 Server Agent Console 气质，不出现浅色 shadcn 默认 dashboard 风格。
- Home/Project/Agent/Files/Git/Terminal 的 shell、sidebar、workspace、raised row、dashed empty、inset toolbar、code/output、danger/warning surface roles 保持一致。
- 列表优先可扫读：Project rows、Agent rows、Terminal rows、file rows、changed-file rows 不应退化为厚卡片墙。
- 状态必须同时有文字和语义色，不能只依赖颜色。
- 操作 affordance 需要一致：navigation、list row、action button 的 cursor、hover、selected、focus、disabled 形态应来自 shared primitive。
- Mobile 主内容不得被 fixed bottom navigation 或 safe area 遮挡；direct pages 内容超过可见区时应可滚动。

## 真实能力边界检查

- Home/Project Agent workspace 不伪造 provider history、task summary、recent output 或 relative time。
- Agent detail 只显示真实 provider/session/status/stream 字段，Meta 是本地 overlay，不新增 API。
- Terminal detail 不显示 Agent-only Files/Git/+Terminal/Meta/provider metadata。
- Files/Git 保持只读 inspection，不出现写操作。
- Terminal direct workspace 只列 live Terminal instances 与 create/open/close，不渲染 runtime composer 或 quick keys。
- Runtime quick key 缺口等 future gap 用 not-rendered 或 follow-up gap 表达，不伪造能力。

## Follow-up gaps 处理

- Release verify 应按 open gap 分类：future enhancement、missing API、capability boundary、shared baseline gap。
- Future enhancement 在真实 UI 未伪造能力时不阻塞 release。
- Shared baseline gap、missing artifact、navigation layer mismatch 或伪造能力应升级为 WARNING/CRITICAL。

## 后续沉淀候选

- Release 级 UI/UX 验证矩阵可沉淀到长期 frontend UI architecture 或单独 design system 文档。
