# Design Overview

本文件汇总 `align-ui-shell-foundation` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：align-ui-shell-foundation
- 所属 version：v0.8-prototype-ui-alignment

## 输入依据

- intents：`.workflow/changes/align-ui-shell-foundation/intents.md`
- specs：`.workflow/changes/align-ui-shell-foundation/specs/project-console-navigation/spec.md`
- 相关长期 docs：
  - `docs/design/frontend-ui-architecture.md`：本 change 和后续 UI alignment changes 的必读先导上下文，提供来源优先级、三层页面模型、移动端返回规则、共享 UI 边界和视觉密度基线。
  - `docs/design/prototype/guidelines.md`：prototype 导航、布局、组件、配色、间距和移动端规则。
  - `docs/design/prototype/index.md`、`docs/design/prototype/screenshots/index.md`：prototype 页面与截图覆盖范围。
  - `docs/specs/project-console-navigation/spec.md`、`docs/design/console-shell.md`、`docs/design/frontend-stack.md`：既有 Project console、shell 和 frontend 边界。

## 设计范围

### 本次覆盖

- 建立可复用的一级/二级 navigation shell 结构。
- 将 Project 直接二级页与深层/contextual detail 的移动端返回模型落到真实 UI 结构。
- 调整可恢复的 workspace 状态边界，避免可导航页面只依赖 shell-local state。
- 建立 shared icon marker、nav item、list row、button、status pill、card/panel 等基础视觉组件语言。
- 为后续 Home、Project Agent workspace、instance detail、resource pages 提供实现基础。

### 本次不覆盖

- 不完成具体 Home / Project Agent / instance detail / resource pages 的全部页面对齐。
- 不新增 Files/Git 写操作或 runtime/provider 能力。
- 不引入新前端框架、状态库、组件库或图标依赖。
- 不把页面级验证截图作为本 change 的唯一完成条件；本 change 验证重点是 shell、路由、返回和基础视觉边界。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 用户目标与能力边界已由 roadmap、intent 和 `docs/design/frontend-ui-architecture.md` 明确。 |
| ui-ux | 是 | 本 change 核心是跨页面导航、返回、视觉识别和密度基线，需要 UI/UX 设计。 |
| frontend | 是 | 需要明确 route/search/state、组件边界、文件组织和实现顺序。 |
| architecture | 否 | 不改变系统架构、后端边界或运行时协议。 |
| api | 否 | 不新增或修改 API。 |
| data | 否 | 不新增数据模型或迁移。 |
| business-rules | 否 | 不改变 Project/Session/Files/Git 的业务规则。 |
| error-handling | 否 | 保留现有错误/空/加载状态，不新增错误分类。 |
| risks | 否 | 风险已在 UI/UX 与 frontend 子域内收口。 |

## 总体设计结论

- 以 `docs/design/frontend-ui-architecture.md` 的三层页面模型作为强约束：一级应用 shell、Project 直接二级 workspace、深层/contextual detail。
- Shell foundation 应先提供统一结构和 primitives，页面级 change 再填充具体内容。
- 移动端直接二级页通过底部二级导航 Back 返回一级；深层详情页使用顶部返回并隐藏底部二级导航。
- Project workspace active section 不能长期只存在于 Jotai atom；对用户可感知且需要刷新/返回恢复的二级 workspace，应由路由/search 或等价 URL-visible 机制承载。
- Shared primitives 只覆盖本 version 已确定复用的结构，不建设泛化组件库。

## 关键决策

- 采用“先 shell/primitives，后页面内容”的实现顺序。
- 继续沿用现有前端栈和 Tailwind；不新增图标库，首轮图标/标记可用轻量文本或 inline marker 实现。
- 先用同一 Project shell 承载 Agent/Files/Git/Terminal 的直接二级 workspace；深层 detail 保持独立 detail chrome。
- 保留现有 loading/empty/error/disabled/danger confirm 行为，不为视觉对齐删除真实状态表达。

## 开放问题

- Project 二级 workspace 最终使用 nested routes 还是 search param，可在 plan/implementation 结合现有 TanStack Router 改动成本确定；无论方案如何，用户可感知 active section 必须可恢复。
- 一级 Sessions/Config/Help 是否作为占位进入本 change，取决于不干扰当前 version 主路径的实现成本。
- 图标语言首轮是否使用纯文本缩写或 inline SVG，应以不引入依赖、可读且一致为准。

## 后续沉淀候选

- 经实现和验证后，可将 Project shell 的 route/state 方案和 shared primitive 边界增量沉淀回 `docs/design/frontend-ui-architecture.md` 或 `docs/design/frontend-stack.md`。
