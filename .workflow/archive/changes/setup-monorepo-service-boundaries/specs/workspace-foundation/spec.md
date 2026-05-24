# workspace-foundation spec

本文件记录单个 change 对 `workspace-foundation` 的行为契约增量。

## Change 来源

- change-id：setup-monorepo-service-boundaries
- 来源意图：
  - 编号：2：项目采用 monorepo 结构，至少包含 `web`、`api` 和共享类型区域。
  - 编号：10：后端服务统一命名为 `api`，避免和 Claude/Codex 这类 AI Agent 混淆。
  - 编号：38：固定使用 Tailwind CSS 支持移动端优先和深色界面迭代。
  - 编号：39：Bun 同时作为 monorepo 包管理器、脚本运行器和 `api` 运行时；`web` 使用 Bun 管理依赖和开发流程，前端应用仍是 React + TypeScript。
  - 编号：40：`packages/shared` 第一轮主要放 `web` 和 `api` 共用类型定义，谨慎添加共享工具，不放业务逻辑。
  - 补充约束：第一轮前端工程基础固定使用 TanStack 与 Jotai；当前 change 只定义工程入口与依赖边界，不承接 E2E 链路细节。
- 规划来源：服务边界、包结构、共享类型和前端样式基础需要在功能开发前稳定。

## ADDED Requirements

### Requirement: Repository exposes the first-round workspace areas

系统 SHALL 以 monorepo 形式暴露第一轮必需工作区：`web`、`api` 和 `packages/shared`。

#### Scenario: Workspace areas are discoverable

- **WHEN** 开发者查看仓库根目录
- **THEN** 可以找到独立的 `web`、`api` 和 `packages/shared` 工作区入口

#### Scenario: Backend service naming is reviewed

- **WHEN** 开发者查看后端服务的目录、脚本、包名或文档入口
- **THEN** 后端服务被命名为 `api`，而不是泛称为 `agent`

### Requirement: Bun is the workspace command surface

系统 SHALL 使用 Bun 作为 monorepo 包管理和脚本执行入口，并将 `api` 作为 Bun 运行的后端服务。

#### Scenario: Dependencies and scripts are invoked

- **WHEN** 开发者在仓库中安装依赖或运行工作区脚本
- **THEN** 命令入口以 Bun 为准，而不是要求混用其他包管理器作为第一轮默认路径

#### Scenario: API service is started

- **WHEN** 开发者启动 `api` 服务
- **THEN** 默认运行时为 Bun，并且服务身份仍表现为 `api`

### Requirement: Web workspace is React and TypeScript based

系统 SHALL 将 `web` 定义为 React + TypeScript 前端应用，并使用 Bun 管理其依赖和开发脚本。

#### Scenario: Web application stack is inspected

- **WHEN** 开发者查看 `web` 工作区的应用入口和配置
- **THEN** 可以确认前端应用使用 React 与 TypeScript，并通过 Bun 管理开发流程

### Requirement: Tailwind is available for mobile-first dark UI styling

系统 SHALL 在 `web` 工作区提供 Tailwind CSS 支撑第一轮移动端优先、深色控制台界面样式。

#### Scenario: Web styling foundation is inspected

- **WHEN** 开发者查看前端样式基础
- **THEN** 可以确认 Tailwind CSS 已作为第一轮布局和状态样式的默认工具

### Requirement: Frontend state and data foundations use TanStack and Jotai

系统 SHALL 将 TanStack 与 Jotai 纳入第一轮 `web` 前端工程基础，用于后续页面路由、服务端状态/数据获取和本地 UI 状态管理的边界设计。

#### Scenario: Frontend dependency foundation is inspected

- **WHEN** 开发者查看 `web` 工作区的前端基础依赖或配置
- **THEN** 可以确认 TanStack 与 Jotai 是第一轮前端工程基础的一部分

#### Scenario: Frontend state boundary is reviewed

- **WHEN** 后续 change 设计页面路由、API 数据获取或本地 UI 状态
- **THEN** 设计应优先在 TanStack 与 Jotai 的职责边界内表达，而不是临时引入另一套全局状态或数据获取基础

### Requirement: Workspace exposes baseline test command entrypoints

系统 SHALL 在 monorepo 基础中预留可被后续质量基线复用的测试命令入口，但不在本 change 定义 E2E 场景细节。

#### Scenario: Test entrypoints are inspected

- **WHEN** 开发者查看仓库脚本入口
- **THEN** 可以找到用于后续运行工作区测试或质量检查的基础命令入口

#### Scenario: E2E scope is reviewed

- **WHEN** 需要定义登录、Project、Terminal Session 或 WebSocket 端到端链路
- **THEN** 这些具体 E2E 行为仍归属 `setup-e2e-quality-baseline`，而不是当前 workspace foundation spec

### Requirement: Workspace exposes baseline Oxc quality harnesses

系统 SHALL 在 monorepo 基础中提供 Oxc 体系的静态质量检查入口，用于约束 JavaScript/TypeScript/React 代码的 lint 和格式检查。

#### Scenario: Oxc harnesses are inspected

- **WHEN** 开发者查看仓库脚本入口
- **THEN** 可以找到基于 Oxlint 的 lint 命令和基于 Oxfmt 的格式检查命令

#### Scenario: Oxc harnesses run in verification

- **WHEN** 开发者执行基础质量检查
- **THEN** Oxc 相关 harness 可以与 `typecheck`、`build`、`test` 一起运行，并排除生成产物目录

### Requirement: Shared package contains cross-boundary types first

系统 SHALL 将 `packages/shared` 的第一轮职责限定为 `web` 与 `api` 共享类型、状态枚举和 API DTO。

#### Scenario: Shared package contents are reviewed

- **WHEN** 开发者查看 `packages/shared`
- **THEN** 其中的主线内容是 `Project`、`AgentSession`、`TerminalSession`、状态枚举或 API DTO 等跨边界类型

#### Scenario: Business logic placement is reviewed

- **WHEN** 新增逻辑需要放入共享区域
- **THEN** 业务流程、provider 适配、路径解析或运行态控制逻辑不会因为复用便利而放入 `packages/shared`

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
