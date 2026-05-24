# Design Overview

本文件汇总 `build-responsive-pwa-console-shell` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：build-responsive-pwa-console-shell
- 所属 version：v0.2-project-console-shell

## 输入依据

- intents：`.workflow/changes/build-responsive-pwa-console-shell/intents.md`
- specs：`specs/pwa-console-shell/spec.md`、`specs/project-console-navigation/spec.md`
- 相关长期 docs：`docs/project.md`、`docs/specs/workspace-foundation/spec.md`、`docs/specs/project-model/spec.md`、`docs/specs/service-access-boundary/spec.md`、`docs/specs/agent-access/spec.md`、`docs/design/frontend-stack.md`、`docs/design/agent-session-model.md`、`docs/architecture/monorepo-service-boundaries.md`、`docs/architecture/project-boundary.md`
- 原型参考：`docs/design/prototype.png`

## 设计范围

### 本次覆盖

- 登录后 Project 控制台外壳的信息架构：Project 上下文、Agent 默认焦点、Terminal/Git/Files 辅助入口。
- 移动端优先、深色-only 的 PWA 控制台视觉与响应式结构。
- 第一轮 PWA 安装外壳：manifest、icons、standalone、theme/background color。
- 未接入真实 Agent/Terminal/Git/Files 能力前的占位、空状态和禁用输入表达。

### 本次不覆盖

- 真实 Agent Runtime、Terminal Runtime、WebSocket stream、历史恢复和输入发送。
- Files/Git 的真实数据读取或写操作。
- 系统通知、离线缓存、service worker 更新策略和推送能力。
- PC 端独立产品逻辑、精细动效、图标体系和像素级还原。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 是 | 需要明确首轮 shell 的用户目标、功能边界和 Agent 优先信息架构。 |
| ui-ux | 是 | 涉及原型优先、移动端优先、深色视觉、响应式和页面状态。 |
| frontend | 是 | 需要明确 TanStack Router/Query、Jotai、组件边界、PWA 静态资源接入方式。 |
| architecture | 是 | 需要明确 `web/api/shared` 边界、Project scope、PWA 方案取舍和后续 runtime 演进边界。 |
| api | 否 | 本 change 使用既有 Project API 和占位数据，不新增后端接口契约。 |
| data | 否 | 不新增数据库、持久化模型或数据迁移。 |
| business-rules | 否 | 业务规则较轻，已在 product/ui-ux/frontend 中表达；无复杂状态机。 |
| error-handling | 否 | 失败路径主要是前端加载/空/禁用状态，纳入 ui-ux/frontend；不新增错误码。 |
| risks | 是 | 需要集中收口 PWA installability、占位数据误导、原型冲突和后续 runtime 接入风险。 |

## 总体设计结论

- 将当前 `HomeRoute` 从工程 smoke 页面演进为登录后的 Project 控制台入口：根路径展示 Project 列表/创建入口，Project 路由展示具体 Project console shell。
- Project console 默认聚焦 Agent Sessions，Terminal/Git/Files 是同一 Project scope 下的辅助入口。
- 页面视觉采用深色移动端控制台风格：顶部 Project 上下文、状态摘要、会话卡片、辅助能力入口和底部输入/快速操作 affordance。
- 第一轮 PWA 使用静态 manifest、HTML meta/link 和图标资源，不新增 `vite-plugin-pwa`，不实现 service worker/offline。
- 真实 session 数据未接入前，所有 Agent/Terminal/Git/Files 内容必须明确是空状态、占位或禁用 affordance，不伪装真实运行数据。

## 关键决策

- 移动端是主设计基准；桌面只扩展布局密度和导航呈现，不新增独立产品路径。
- Agent Sessions 是 Project console 默认焦点，符合远程控制 AI Agent 的核心目标。
- PWA 第一轮只承诺 installable shell，不承诺离线能力或系统通知。
- 不新增 PWA 插件依赖，减少供应链和 service worker 生命周期复杂度。
- 保持 `web` 只通过 `/api` client 获取 Project 数据，不直接访问 `api` 内部模块或服务器文件系统。

## 开放问题

- 第一轮是否展示演示 session 卡片：设计结论是不展示伪真实数据，只展示空状态和结构占位。
- 后续 Agent Runtime 接入后，session summary 字段和状态枚举由 `design-session-runtime-boundaries` 决定。
- PWA icon 是否需要最终品牌图形：本 change 可用项目内生成的简单图标，后续品牌设计可替换。

## 后续沉淀候选

- `docs/design/frontend-stack.md`：补充静态 PWA shell 接入边界。
- `docs/design/console-shell.md`：沉淀 Project console 信息架构和移动端优先深色控制台布局。
- `docs/architecture/monorepo-service-boundaries.md`：如实现验证后有必要，补充 PWA 静态资源属于 `web` 边界。