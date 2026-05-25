# Design Overview

本文件汇总 `design-frontend-ui-architecture` 的设计范围、子域选择和整体设计结论。它是后续 prototype UI alignment changes 的共享上下文入口，不直接沉淀到长期 `docs/`。

## Change

- change-id：design-frontend-ui-architecture
- 所属 version：v0.8-prototype-ui-alignment

## 输入依据

- intents：`.workflow/changes/design-frontend-ui-architecture/intents.md`
- specs：`.workflow/changes/design-frontend-ui-architecture/specs/frontend-ui-architecture/spec.md`
- prototype：`docs/design/prototype/guidelines.md`、`docs/design/prototype/index.md`、`docs/design/prototype/screenshots/index.md`
- 相关长期 docs：`docs/project.md`、`docs/specs/project-console-navigation/spec.md`、`docs/design/console-shell.md`、`docs/design/frontend-stack.md`、`docs/design/mobile-session-interaction.md`
- 现有前端入口：`web/src/routes/router.tsx`、`web/src/routes/HomeRoute.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/SessionDetailRoute.tsx`、`web/src/state/ui.ts`

## 设计范围

### 本次覆盖

- 建立真实 Web UI 与 `docs/design/prototype/` 对齐时的来源优先级。
- 定义一级导航、Project 二级导航、深层详情页的导航层级和移动端返回模型。
- 定义 route/workspace 层级，约束 Home、Project Agent workspace、Files/Git/Terminal resource pages、Agent/Terminal instance detail 的职责边界。
- 定义跨页面布局、组件边界、响应式规则和基础视觉语言，供后续 page-level changes 复用。
- 明确当前前端应在现有 React/Vite/TanStack Router/TanStack Query/Jotai/Tailwind 约束内演进，不新增技术栈或依赖。

### 本次不覆盖

- 不做真实 UI 实现，不修改 `web/` 源码。
- 不追求 pixel-perfect；后续验证以结构、层级、密度和关键视觉基线为主。
- 不设计 Files/Git 写操作，不新增 Git stage/commit/checkout/reset。
- 不扩展 provider runtime、session protocol、后端 API 或 shared DTO。
- 不把本 change 的设计结论直接写入长期 `docs/`；后续由 distill 阶段在验证后沉淀。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 用户目标和非目标已由 intents/spec/roadmap 明确；本 change 的重点是 UI architecture，而不是重新定义产品能力。 |
| ui-ux | 是 | 需要把 prototype 的导航、布局、移动端返回、视觉密度和截图基线转译为后续可执行的页面体验规则。 |
| frontend | 是 | 需要把 UI/UX 规则映射到现有 route、组件边界、状态管理和工程约束，避免后续页面 change 各自发散。 |
| architecture | 否 | 本 change 不改变系统分层、后端边界或运行时架构；前端层级约束写入 frontend 子域即可。 |
| api | 否 | 不新增或修改 API 协议。 |
| data | 否 | 不新增数据模型、迁移或持久化结构。 |
| business-rules | 否 | 不改变 Project、Session、Files、Git 的业务规则或状态流转。 |
| error-handling | 否 | 不新增错误码或恢复策略；页面状态要求分别写入 UI/UX 与 frontend 子域。 |
| risks | 否 | 当前风险集中在 UI/UX 与 frontend 子域内，可在各自文件收口，无需独立 risks 文件。 |

## 总体设计结论

- `docs/design/prototype/` 是本轮 UI/UX 对齐的最高优先级来源；旧长期 docs 作为已验证约束和背景，但当旧文档仍引用旧结构或旧 prototype 时，后续实现优先跟随新 HTML prototype 体系。
- 页面层级采用三层模型：一级应用 shell、Project 直接二级 workspace、深层/contextual detail。后续所有 page-level changes 都应先判断页面属于哪一层，再决定导航、返回、布局和状态职责。
- 移动端直接二级页使用底部二级导航中的 Back 返回一级，不在左上重复返回；深层详情页使用顶部返回，不显示底部二级导航。
- Project workspace 不承载 shell-level runtime input；真实输入归 Agent/Terminal instance detail。
- 后续实现应先收敛 route/workspace 与共享 shell，再对齐具体页面；否则容易在 Home、Project、Files、Git、Terminal 和 detail 页面重复创建不一致的导航与列表结构。

## 关键决策

- 把 prototype alignment 设计先保存在 workflow change 中，待 `verify-prototype-ui-alignment` 后再沉淀长期 docs。
- 不新增前端技术或组件库；沿用 React、TypeScript、Vite、TanStack Router、TanStack Query、Jotai 和 Tailwind CSS。
- 暂不把每个页面的细粒度文案、颜色值和像素间距写死为长期规范；本轮只固定可验证的信息架构、导航规则、响应式职责和视觉基线。
- 把 Files/Git 定位为只读 inspection，把 Terminal/Agent 定位为 runtime session；两类页面共享 Project scope，但不共享输入语义。

## 开放问题

- 后续实现时是否需要把 `ProjectConsoleRoute.tsx` 拆成多个 route 文件或多个 section module，由 `align-ui-shell-foundation` 和页面级 changes 结合代码复杂度决定。
- 一级 Sessions、Config、Help 入口在 prototype 中存在为全局导航项，但当前实现是否全部落地、是否先显示占位，由后续 shell foundation change 决定。
- Contextual Files/Git/Terminal 从 Agent detail 进入时的真实 URL 形态尚未在本 change 固定；后续 instance-detail/resource-page changes 需要在不改 API 的前提下确定路由承载方式。

## 后续沉淀候选

- 经验证后可将 UI architecture 来源优先级、三层页面模型、移动端返回模型和基础组件边界沉淀到 `docs/design/`。
- 若后续实现中形成稳定 route/module 组织方式，可在 distill 阶段补充 `docs/design/frontend-stack.md` 或新增长期 UI architecture 文档。
