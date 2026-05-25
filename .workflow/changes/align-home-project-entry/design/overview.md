# Design Overview

本文件汇总 `align-home-project-entry` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：align-home-project-entry
- 所属 version：v0.8-prototype-ui-alignment

## 输入依据

- intents：Home / Project entry 需要与 prototype 对齐，一级页面采用导航 + 工作区结构，移动端使用底部一级导航，顶部文案保持克制，Project 列表使用图标提升识别度，Create/adopt Project 降级为低频入口。
- specs：`.workflow/changes/align-home-project-entry/specs/project-console-navigation/spec.md`
- 相关长期 docs：`docs/design/frontend-ui-architecture.md`、`docs/specs/project-console-navigation/spec.md`、`docs/design/prototype/guidelines.md`、`docs/design/prototype/home.html`

## 设计范围

### 本次覆盖

- Home / Projects 一级页面的信息层级和视觉密度。
- 桌面端一级导航 + Projects 工作区结构的收敛。
- 移动端 Projects 工作区 + 底部一级导航结构的收敛。
- Project 列表行的图标、名称、路径/状态摘要和 Open 行为。
- Create/adopt Project 的低频入口呈现、展开表单和错误/提交状态保留。
- 从 Home 进入 Project 时默认落到 Agent workspace，并沿用 URL-visible `workspace` search。

### 本次不覆盖

- 不新增 Home 一级导航中 Sessions、Config、Help 的真实页面能力。
- 不修改 Project 创建/采用的服务端协议、路径安全规则或错误码。
- 不改变 Project 二级 workspace shell、Agent/Files/Git/Terminal 工作区内容。
- 不追求与 prototype 的像素级一致；优先保证层级、密度、入口和状态行为一致。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 用户路径和范围已由 intent/spec 明确：用户进入 Home 后选择或创建 Project。 |
| ui-ux | 是 | 本 change 核心是 Home 页面信息层级、响应式结构、列表密度和低频操作入口。 |
| frontend | 是 | 需要约束现有 React route、TanStack Query、Router search、组件边界和状态保留。 |
| architecture | 否 | 不改变系统架构、API、runtime 或安全边界。 |
| api | 否 | 沿用现有 `listProjects` / `createProject` client 与 shared DTO。 |
| data | 否 | 不引入数据库或 Project 数据模型变更。 |
| business-rules | 否 | Project 创建/采用规则沿用既有 Project model。 |
| error-handling | 否 | 错误处理不单独成域；在 UI/UX 与 frontend 中保留用户可感知状态。 |
| risks | 否 | 风险集中在视觉密度与状态保留，已在对应子域记录。 |

## 总体设计结论

- Home / Projects 是一级应用 shell 的 Projects workspace；页面主要任务是让用户尽快打开一个 Project。
- 一级导航只表达当前位置与未来全局入口，不应把 coming soon 项变成主工作区干扰。
- 顶部文案应保持一句话上下文，解释进入 Project 后可继续 Agent、Files、Git、Terminal，但不重复大块产品介绍。
- Project 列表应比创建/采用入口更突出：列表是默认主工作区，创建/采用是可发现但默认不抢占的低频入口。
- Project 条目采用轻量图标 + 名称 + 截断路径/状态 + Open 入口，保留移动端首屏密度和长路径安全。
- 空状态是例外：当没有 Project 时，创建/采用入口可以更突出，因为它变成完成首个 Project entry 的主路径。
- 从 Home 打开 Project 必须继续写入 `search: { workspace: defaultConsoleSection }`，与已验证的 shell foundation 保持一致。

## 关键决策

- 不把 Home 设计成通用 dashboard；它只服务 Project entry。
- 不把创建/采用表单常驻放在主列表之前；默认列表优先，表单按用户展开、提交中、错误或空状态显示。
- 保留现有 loading、empty、error、disabled、submit pending 和 create failure 反馈，不用视觉对齐替换状态行为。
- 不新增新组件库；优先复用 `IconMarker`、`NavItemContent`、`StatusPill`，必要时在 Home 内局部组合。

## 开放问题

- 无阻塞开放问题；后续实现可在当前 API 与路由边界内完成。

## 后续沉淀候选

- Home / Projects 作为一级 Project entry 的长期 WHAT 可合并到 `docs/specs/project-console-navigation/spec.md`。
- 若实现验证通过，可将“Project entry 列表优先、低频创建入口降级”的规则补充到 `docs/design/frontend-ui-architecture.md` 或 Project Console Navigation 相关长期设计中。
