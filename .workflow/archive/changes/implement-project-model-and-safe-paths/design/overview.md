# Design Overview

本文件汇总 `implement-project-model-and-safe-paths` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：implement-project-model-and-safe-paths
- 所属 version：v0.2-project-console-shell

## 输入依据

- intents：`.workflow/changes/implement-project-model-and-safe-paths/intents.md`
- specs：
  - `.workflow/changes/implement-project-model-and-safe-paths/specs/project-model/spec.md`
  - `.workflow/changes/implement-project-model-and-safe-paths/specs/project-safe-paths/spec.md`
- 相关长期 docs：
  - `docs/project.md`
  - `docs/specs/personal-app-config/spec.md`
  - `docs/specs/private-access-auth/spec.md`
  - `docs/specs/workspace-foundation/spec.md`
  - `docs/architecture/monorepo-service-boundaries.md`
  - `docs/design/frontend-stack.md`
- 现有代码现状：
  - `api/src/settings.ts` 已解析 `projectsRoot` 并保证绝对路径。
  - `api/src/index.ts` 已有 `/api` 路由分发和认证 guard。
  - `packages/shared/src/index.ts` 已有 `Project` DTO 和通用 `ApiErrorCode`。

## 设计范围

### 本次覆盖

- `PROJECTS_ROOT` 下一级目录作为 Project 的领域边界。
- Project 列表、Project 创建/采用、Project 详情/解析所需的后端模块边界。
- Project 名称与 URL/API 参数的关系。
- Project 内路径统一安全解析语义，为后续 Files/Git/Terminal/Agent 复用。
- `/api` HTTP 接口形态、响应 DTO 和错误语义。
- 目录创建、已存在目录采用、越界/嵌套/文件目标拒绝等业务规则。

### 本次不覆盖

- 登录后 Project 列表页的视觉和交互实现；由 `build-responsive-pwa-console-shell` 承接。
- 真实 Agent Runtime、Terminal Session、Files、Git diff 的业务实现；本 change 只提供可复用的 project scope 与安全路径能力。
- Project 元数据持久化、最近打开时间、收藏、排序偏好或跨路径同名 project。
- Git clone、模板初始化、脚手架生成或 Project 创建向导。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | specs 已明确首轮能力边界；产品页面体验转交 console shell change。 |
| ui-ux | 否 | 本 change 提供后端 Project 能力和安全路径，不定义页面布局。 |
| frontend | 否 | 当前只需保持 `/api` DTO 适合前端调用；页面路由和状态设计属于后续 shell change。 |
| architecture | 是 | 需要定义 `api` 内 Project 模块、安全路径解析模块、shared DTO 与后续模块复用边界。 |
| api | 是 | 需要明确 Project 列表、创建和详情/解析接口的请求响应、认证、幂等与兼容性。 |
| data | 否 | 第一轮不引入数据库或持久化 Project 元数据；目录本身是数据来源。 |
| business-rules | 是 | 需要定义 project 术语、一级目录约束、创建/采用/拒绝规则。 |
| error-handling | 是 | 路径安全和文件系统操作需要明确错误分类、可恢复性和不泄露内部路径的策略。 |
| risks | 否 | 跨域风险已分别收口在 architecture/api/error-handling 中，暂不需要独立文件。 |

## 总体设计结论

- `PROJECTS_ROOT` 是 Project 能力的唯一根信任边界；其配置来源和绝对路径校验沿用 `personal-app-config`，本 change 不重做配置机制。
- `api` 新增 Project 领域模块，负责列出一级目录、创建或采用一级目录，并暴露统一的 project 安全解析能力。
- 安全解析能力应留在 `api`，不能放入 `packages/shared`，因为它依赖文件系统真实路径、符号链接解析和 Bun/Node runtime API。
- `packages/shared` 只扩展跨边界 DTO 和错误码，例如 Project 创建请求、Project 列表响应、Project 错误码；不包含路径拼接或文件系统逻辑。
- API 以 `/api/projects` 为稳定入口，所有 Project API 受现有 HTTP token guard 保护。
- Project 名称是 `PROJECTS_ROOT` 下一级目录名；URL 中使用 URL encode/decode 传递，API 内部按解码后的名称解析。
- 第一轮 session count 可返回 0，因为 Agent/Terminal Session Runtime 尚未实现；接口字段保留以支持前端信息架构。

## 关键决策

- 目录即数据源：不增加 Project 数据库表或注册表，避免在首轮引入目录与元数据不一致问题。
- 只支持一级目录：拒绝嵌套 project，换取简单、可验证、不会同名歧义的 Project 身份模型。
- 创建接口采用“创建或采用”语义：目标一级目录存在且为目录时成功返回，目标不存在时创建，目标为文件或越界时失败。
- 安全解析采用“真实路径边界”语义：对 root、project 和相对路径做规范化/真实路径检查，确保最终路径留在允许边界内。
- Project API 不负责 Git 分支强保证：Git branch 是可选摘要字段，无法获得时不影响列表成功。

## 开放问题

- 无阻塞开放问题。Git branch 是否在本 change 实现由后续 `plan-change` 根据成本决定；API/DTO 已允许其缺省。

## 后续沉淀候选

- `docs/specs/project-model/spec.md`：Project 作为 `PROJECTS_ROOT` 一级目录的长期 WHAT。
- `docs/specs/project-safe-paths/spec.md`：Project 内路径安全长期 WHAT。
- `docs/architecture/project-boundary.md`：`api` Project 模块、安全路径解析和下游 Files/Git/Session 复用边界。
