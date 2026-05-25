# Design Overview

本文件汇总 `align-mobile-app-shell` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：align-mobile-app-shell
- 所属 version：v0.5-mobile-ux-polish

## 输入依据

- intents：`.workflow/changes/align-mobile-app-shell/intents.md`
- specs：`.workflow/changes/align-mobile-app-shell/specs/mobile-console-shell/spec.md`
- 相关长期 docs：`docs/project.md`、`docs/specs/pwa-console-shell/spec.md`、`docs/specs/project-console-navigation/spec.md`、`docs/design/console-shell.md`、`docs/design/frontend-stack.md`、`docs/design/mobile-session-interaction.md`
- 原型参考：`docs/design/prototype.png`

## 设计范围

### 本次覆盖

- 登录后移动端控制台的 App-like shell 基线：全高深色背景、收敛页头、明确页面上下文、减少网站式大块介绍。
- 首页 Project 列表与低频 Create/Adopt Project 入口的信息层级调整。
- 全局移动端溢出基线：页面级横向不溢出，固定区域与滚动区域边界清楚。
- 原型参考映射规则：只借鉴暗色移动端信息层级和密度，所有名称映射到本项目领域术语。
- 为后续 Project 工作区、Session 控制台、Files/Git 页面提供共享 shell 约束。

### 本次不覆盖

- 不新增 Agent/Terminal runtime 能力。
- 不重做 Project 详情页功能区、Agent 区、Terminal 区的完整移动工作区；该范围归 `rework-project-mobile-workspace`。
- 不重做 Agent/Terminal Session detail 的输入、快捷键、重连或选择输入体验；该范围归 `rework-session-mobile-console`。
- 不重做 Files/Git 的列表/详情信息密度；该范围归 `compact-inspection-mobile-views`。
- 不引入新前端框架、组件库、PWA service worker、离线能力或通知。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 是 | 需要明确移动端首页主路径、低频创建/采用入口和术语映射的产品边界。 |
| ui-ux | 是 | 需要定义 App-like shell、页面密度、滚动边界、响应式和原型参考规则。 |
| frontend | 是 | 需要把 UI/UX 约束落到现有 React/Vite/Tailwind/TanStack/Jotai 前端边界。 |
| architecture | 否 | 不改变系统分层、后端边界、API 或长期 runtime 架构。 |
| api | 否 | 不新增或修改 API 契约。 |
| data | 否 | 不新增数据模型、迁移或持久化字段。 |
| business-rules | 否 | 不改变 Project、Session、Files 或 Git 的业务规则。 |
| error-handling | 否 | 只复用现有加载/错误/空态表达，不新增错误码或恢复策略。 |
| risks | 否 | 风险可以在 product/ui-ux/frontend 中收口，不需要单独风险文件。 |

## 总体设计结论

- 以移动端首页和全局 shell 为第一落点：让用户打开控制台后优先看到 Project/工作上下文，而不是大页头和常驻创建表单。
- Shell 采用“全高容器 + 局部滚动内容 + 收敛固定区域”的基线，后续页面必须在该基线下组织内容，避免横向页面溢出和固定区域遮挡核心内容。
- 原型图只作为暗色移动端控制台气质参考；最终页面必须使用 Project、Agent Sessions、Terminal、Files、Git 等既有术语。
- Frontend 设计沿用现有 React + TanStack Router/Query + Jotai + Tailwind，不引入新依赖；shell 级共享 UI 状态才进入 Jotai，单页交互保持组件内 state。

## 关键决策

- 首页的 Create/Adopt Project 从首屏大块主表单降级为可发现的次级入口；如果用户主动进入该流程，仍保留完整输入、校验和错误展示。
- 移动端页头只承担身份、当前位置和必要行动，不再承载大段品牌/说明文案。
- 页面级容器统一使用 `min-h-dvh`/等价全高策略，内部列表或详情负责滚动；禁止通过超宽固定布局撑开 viewport。
- 后续三个移动 polish change 复用本 change 的 shell 与密度基线，而不是各自定义互相冲突的移动框架。

## 开放问题

- 无需用户确认即可推进；具体视觉值、组件拆分和测试覆盖可在 `plan-change` 与实现阶段根据现有代码落地。

## 后续沉淀候选

- 移动端 App-like console shell 的长期设计规则可在 verify 后沉淀到 `docs/design/console-shell.md` 或新增长期 mobile shell 设计文档。
- 全局移动端溢出和固定/滚动区域边界可在 verify 后补充到 `docs/project.md` 的易错边界或开发准则。
