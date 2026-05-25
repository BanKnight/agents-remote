# project-console-navigation spec

本文件记录 `align-home-project-entry` 对 `project-console-navigation` 的行为契约增量。

## Change 来源

- change-id：align-home-project-entry
- 来源意图：Home / Project entry 需要与 prototype 对齐：一级页面采用导航 + 工作区结构，移动端使用底部一级导航，顶部文案保持克制，Project 列表使用图标提升识别度，Create/adopt Project 降级为不挤占主工作区的低频入口。
- 规划来源：本 change 直接承接用户原始意图，并以前置 `align-ui-shell-foundation` 与 `docs/design/frontend-ui-architecture.md` 为共享 UI architecture 上下文。

## ADDED Requirements

### Requirement: Home presents Projects as a level-one workspace

系统 SHALL 将登录后的 Home / Projects 入口呈现为一级应用 shell 中的 Projects 工作区，而不是无层级的项目列表页。

#### Scenario: User views Home on desktop

- **WHEN** 已认证用户在桌面端打开 Home / Projects
- **THEN** 页面展示一级导航与 Projects 工作区结构
- **AND** Projects 是当前 active 一级入口
- **AND** Project 列表是主工作区的主要内容

#### Scenario: User views Home on mobile

- **WHEN** 已认证用户在手机视口打开 Home / Projects
- **THEN** 页面底部展示一级导航
- **AND** Projects 是当前 active 一级入口
- **AND** 主工作区优先展示 Projects 内容而不是大段介绍文案

### Requirement: Home top copy stays concise and contextual

系统 SHALL 在 Home / Projects 顶部只展示一句话级别的上下文说明和必要标题，避免说明文案挤占首屏 Project entry 空间。

#### Scenario: User scans the Home header

- **WHEN** 用户进入 Home / Projects
- **THEN** 顶部区域展示当前页面标题或等价上下文
- **AND** 顶部说明保持简短，用于说明打开 Project 后可继续 Agent、Files、Git 或 Terminal 工作
- **AND** 顶部区域不展示大块产品介绍、重复 metadata 或与进入 Project 无关的内容

### Requirement: Project list rows support fast recognition and entry

系统 SHALL 让 Home / Projects 中的 Project 列表以可扫读列表行呈现，并为每个 Project 提供图标、名称、简短路径或状态和进入行为。

#### Scenario: User scans available Projects

- **WHEN** Home / Projects 加载出一个或多个 Project
- **THEN** 每个 Project 条目展示一致的 Project 图标或标记位置
- **AND** 每个 Project 条目展示 Project 名称
- **AND** 每个 Project 条目展示简短路径、状态摘要或等价辅助信息
- **AND** 每个 Project 条目提供进入对应 Project 控制台的行为

#### Scenario: Project path is long

- **WHEN** Project 的路径或辅助信息超过当前可视宽度
- **THEN** Project 条目不会造成页面横向溢出
- **AND** 主要 Project 名称和进入行为仍可识别

### Requirement: Create or adopt Project is a low-frequency Home action

系统 SHALL 将创建或采用 Project 的入口保留为 Home / Projects 中的低频操作，而不是让它占据主工作区或遮挡 Project 列表。

#### Scenario: User can create or adopt a Project

- **WHEN** 已认证用户在 Home / Projects 查看 Project 入口
- **THEN** 创建或采用 Project 的入口可被发现
- **AND** 该入口不作为大块表单常驻占据 Project 列表首屏
- **AND** 该入口在移动端不遮挡底部一级导航或 Project 列表内容

#### Scenario: Project creation fails or is unavailable

- **WHEN** 用户尝试创建或采用 Project 但操作失败、被禁用或仍在提交中
- **THEN** Home / Projects 仍展示对应错误、禁用、加载或恢复状态
- **AND** 不因视觉对齐移除已有安全提示或失败反馈

### Requirement: Entering a Project defaults to the Agent workspace

系统 SHALL 让用户从 Home / Projects 进入 Project 后落到默认 Agent workspace，并保留可恢复的 Project workspace route/search 状态。

#### Scenario: User opens a Project from Home

- **WHEN** 用户从 Project 列表选择一个 Project
- **THEN** 系统进入该 Project 的控制台
- **AND** 默认 active workspace 是 Agent
- **AND** Project workspace 状态可通过路由、search 或等价 URL-visible 机制恢复

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
