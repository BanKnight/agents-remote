# project-safe-paths spec

本文件记录 Project 安全路径解析的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 定义 `PROJECTS_ROOT` 作为 project-scoped 数据访问的根信任边界。
- 为 Project、Files、Git、Terminal 启动目录和 Agent 启动目录提供统一的安全路径解析语义，避免各模块重复实现路径拼接和越界判断。

## Requirements

### Requirement: Project APIs resolve project names through PROJECTS_ROOT

系统 SHALL 在所有 project 内 API 中通过统一安全解析将 project 标识解析为 `PROJECTS_ROOT` 下的真实一级目录路径，而不是直接信任客户端传入的路径。

#### Scenario: Existing project name is resolved

- **WHEN** 客户端请求 project 名称对应的能力
- **THEN** API 将该名称解析为 `PROJECTS_ROOT/<project-name>` 的真实目录路径

#### Scenario: Project name does not exist

- **WHEN** 客户端请求的 project 名称在 `PROJECTS_ROOT` 下不存在对应一级目录
- **THEN** API 返回 project 不存在的错误，而不是退化为其他目录

#### Scenario: Project name resolves outside root

- **WHEN** 客户端提供的 project 标识会导致解析结果越出 `PROJECTS_ROOT`
- **THEN** API 拒绝该请求，并且不会访问越界路径

### Requirement: Safe path resolution is shared by project-scoped capabilities

系统 SHALL 为 Project、Files、Git、Terminal 启动目录和 Agent 启动目录等 project-scoped 能力提供同一套 `PROJECTS_ROOT` 内安全路径解析语义。

#### Scenario: Project list and project detail resolve paths

- **WHEN** Project 列表、Project 详情或进入 Project 的 API 需要访问 project 目录
- **THEN** 它们使用同一套 project 解析语义获得真实路径

#### Scenario: Future file and Git capabilities resolve paths

- **WHEN** 文件浏览、文件预览或 Git diff 能力在后续 change 中访问 project 内路径
- **THEN** 这些能力必须基于同一套安全解析语义限制在目标 project 内

#### Scenario: Future session capabilities choose working directory

- **WHEN** Terminal Session 或 Agent Session 在后续 change 中选择 project 工作目录
- **THEN** 启动目录必须来自同一套安全解析语义得到的 project 内路径

### Requirement: Project-relative paths remain inside the selected project

系统 SHALL 对 project 内相对路径进行安全解析，确保最终真实路径不会越出已解析的 project 根目录。

#### Scenario: Relative path stays inside project

- **WHEN** project-scoped 能力请求访问 project 内的相对路径 `src/index.ts`
- **THEN** 系统将其解析为该 project 真实目录下的路径

#### Scenario: Relative path attempts parent traversal

- **WHEN** project-scoped 能力请求访问 `../other-project` 或等价越界路径
- **THEN** 系统拒绝该请求，并且不会访问目标 project 外部路径

#### Scenario: Empty relative path is requested

- **WHEN** project-scoped 能力请求空路径或 project 根路径
- **THEN** 系统将其解析为当前 project 的真实根目录

### Requirement: Path validation reports boundary errors without exposing unrelated filesystem access

系统 SHALL 对越界、非一级目录、缺失 project 和非目录 project 目标返回明确错误，并且不把错误请求转换成对其他文件系统位置的访问。

#### Scenario: Project target is a file

- **WHEN** project 标识对应的 `PROJECTS_ROOT` 下条目存在但不是目录
- **THEN** 系统拒绝将其作为 project 使用

#### Scenario: Path uses an unsupported nested project identity

- **WHEN** 客户端把嵌套路径作为 project 标识传入
- **THEN** 系统拒绝该标识，因为 project 身份只能来自一级目录名

#### Scenario: Boundary check fails

- **WHEN** 任一安全解析步骤发现最终真实路径不在允许边界内
- **THEN** 系统返回错误，并且不会继续执行依赖该路径的 project-scoped 操作

### Requirement: Projects root becomes the trust boundary for project-scoped data

系统 SHALL 将 `personal-app-config` 中已验证为绝对路径的 `PROJECTS_ROOT` 作为 Project 能力的根信任边界；Project 能力不改变 `PROJECTS_ROOT` 的配置来源优先级。

#### Scenario: API starts with configured PROJECTS_ROOT

- **WHEN** `api` 已通过配置文件或环境变量获得绝对路径形式的 `PROJECTS_ROOT`
- **THEN** Project 能力使用该路径作为 project 列表、创建和安全解析的唯一根目录

## Notes

- 安全路径解析属于 `api` runtime 能力，不属于 `packages/shared`。
- 当前已验证实现覆盖已存在路径的真实路径解析、parent traversal 和 symlink escape；后续 Files/Git 如需解析尚不存在目标，应在对应 change 中扩展语义和测试。

## 来源

- change：implement-project-model-and-safe-paths
- verify 证据：`.workflow/changes/implement-project-model-and-safe-paths/verify.md`
