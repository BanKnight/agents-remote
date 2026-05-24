# project-model spec

本文件记录 Project 模型的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 定义第一轮 Project 如何从服务器文件系统中产生、如何被 URL/API 标识，以及 Project 列表和创建能力对外承诺哪些可观察行为。
- 为后续控制台外壳、Files、Git、Terminal Session 和 Agent Session 提供统一 project scope。

## Requirements

### Requirement: Projects are first-level directories under PROJECTS_ROOT

系统 SHALL 将 `PROJECTS_ROOT` 下的一级真实目录识别为 project，并且不要求额外数据库注册才能出现在第一轮 Project 列表中。

#### Scenario: First-level directories are listed as projects

- **WHEN** `PROJECTS_ROOT` 下存在一个或多个一级目录
- **THEN** Project 列表包含这些一级目录对应的 project

#### Scenario: Non-directory entries are not projects

- **WHEN** `PROJECTS_ROOT` 下存在普通文件或其他非目录条目
- **THEN** 这些条目不会被识别为 project

#### Scenario: Nested directories are not separate projects

- **WHEN** `PROJECTS_ROOT` 的一级目录下还存在子目录
- **THEN** 子目录不会作为独立 project 出现在第一轮 Project 列表中

### Requirement: Project identity is the first-level directory name

系统 SHALL 使用 `PROJECTS_ROOT` 下一级目录名作为 project 名称和第一轮 URL/API 中的 project 标识。

#### Scenario: Project name is derived from final folder name

- **WHEN** 系统识别或创建一个 project 目录
- **THEN** project 名称等于该一级目录的最终文件夹名

#### Scenario: Project names are unique within PROJECTS_ROOT

- **WHEN** 两个请求引用同一个一级目录名
- **THEN** 它们指向同一个 project，而不是创建同名但不同路径的 project

#### Scenario: Project name contains URL-sensitive characters

- **WHEN** project 一级目录名包含需要 URL 编码的字符
- **THEN** 前端可以使用 URL encode/decode 表达该名称，API 仍按解码后的一级目录名识别 project

### Requirement: Project list exposes first-round summary fields

系统 SHALL 为每个 project 返回第一轮 Project 列表所需的基础摘要：名称、真实路径、Agent Session 数量和 Terminal Session 数量。

#### Scenario: Project has no sessions

- **WHEN** project 当前没有 Agent Session 或 Terminal Session
- **THEN** Project 列表仍返回该 project，并将对应数量表达为 0

#### Scenario: Optional Git branch is unavailable

- **WHEN** 系统无法低成本获得 project 的 Git 分支信息，或该目录不是 Git 仓库
- **THEN** Project 列表仍返回该 project，且不会因为缺少 Git 分支而失败

#### Scenario: Recent opened time is not available in the first round

- **WHEN** 第一轮 Project 列表没有最近打开时间数据
- **THEN** Project 列表仍可展示 project 的基础摘要

### Requirement: Project creation creates or adopts one first-level directory

系统 SHALL 允许用户通过文件夹名称或指向 `PROJECTS_ROOT` 一级子目录的路径创建 Project；目标目录不存在时创建目录，目标目录已存在且是目录时直接作为 project 使用。

#### Scenario: Folder name does not exist

- **WHEN** 用户请求创建名称为 `demo` 的 project，且 `PROJECTS_ROOT/demo` 不存在
- **THEN** 系统创建 `PROJECTS_ROOT/demo` 目录，并返回名称为 `demo` 的 project

#### Scenario: Folder name already exists as directory

- **WHEN** 用户请求创建名称为 `demo` 的 project，且 `PROJECTS_ROOT/demo` 已存在并且是目录
- **THEN** 系统直接返回该目录对应的 project

#### Scenario: Absolute path points to a first-level child

- **WHEN** 用户请求创建的路径位于 `PROJECTS_ROOT` 内且指向一个一级子目录
- **THEN** 系统以该一级子目录作为 project，并从最终文件夹名派生 project 名称

### Requirement: Project creation rejects unsupported targets

系统 SHALL 拒绝把 `PROJECTS_ROOT` 外部路径、嵌套子目录、`PROJECTS_ROOT` 本身或非目录条目作为第一轮 project。

#### Scenario: Target is outside PROJECTS_ROOT

- **WHEN** 用户请求创建的路径不在 `PROJECTS_ROOT` 内
- **THEN** 系统拒绝该请求，并且不会创建或注册 project

#### Scenario: Target is nested below a first-level directory

- **WHEN** 用户请求创建的路径对应 `PROJECTS_ROOT/demo/nested`
- **THEN** 系统拒绝该请求，因为第一轮 project 只能是 `PROJECTS_ROOT` 的一级目录

#### Scenario: Target is an existing file

- **WHEN** 用户请求创建的目标已存在但不是目录
- **THEN** 系统拒绝该请求，并且不会覆盖该文件

### Requirement: First-round project creation does not perform scaffolding

系统 SHALL 将第一轮 Project 创建限定为创建目录或使用已存在目录，不执行 Git clone、模板初始化或脚手架生成。

#### Scenario: Project is created successfully

- **WHEN** 用户创建一个新的 project 目录
- **THEN** 系统只保证目录存在并被识别为 project，不要求生成仓库、模板文件或脚手架内容

## Notes

- Project 本身没有独立数据库状态；其存在性由 `PROJECTS_ROOT` 下一级目录决定。
- Project summary 中的 Agent/Terminal session count 在 Session Runtime 未接入前返回 0。
- 最近打开时间、收藏、排序偏好、Git branch 同步读取和 Project metadata 持久化属于后续能力。

## 来源

- change：implement-project-model-and-safe-paths
- verify 证据：`.workflow/changes/implement-project-model-and-safe-paths/verify.md`
