# Git diff viewer spec

本文件记录 `git-diff-viewer` 的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 在 Project console 内提供只读 Git diff 观察能力，让用户远程理解当前 Project 的 worktree/staged 未提交变化。
- Git diff viewer 是 Project 观察入口，不是 Git 操作工作流；第一轮只读查看，不改变 index、worktree、refs 或 remote state。

## Requirements

### Requirement: Git diff viewer is read-only

系统 SHALL 在 Project console 内提供只读 Git diff 观察能力，展示当前 Project 的 Git 变更文件和单文件 diff，但不提供任何 Git 写操作。

#### Scenario: User opens Git inside a Project console

- **WHEN** 已认证用户在 Project console 中打开 Git 入口
- **THEN** 系统展示当前 Project 的 Git diff 观察界面
- **AND** 页面不展示 commit、stage、unstage、checkout、reset、merge、rebase、push、pull 或其他会改变 Git 状态的操作入口

#### Scenario: User attempts unsupported write behavior

- **WHEN** Git 页面被评审或测试
- **THEN** 不存在可触发 Git 写操作的用户操作
- **AND** API 不提供 Git 写操作作为 Git diff viewer 能力的一部分

### Requirement: Git diff viewer reports non-repository Projects clearly

系统 SHALL 在当前 Project 不是 Git 仓库时展示明确的非 Git 仓库状态，而不是把它表现为系统异常。

#### Scenario: Project is not a Git repository

- **WHEN** 用户打开某个不包含 Git 仓库上下文的 Project 的 Git 入口
- **THEN** 页面提示当前 Project 不是 Git 仓库
- **AND** 用户仍可返回 Project console 或切换到其他 section
- **AND** 系统不展示误导性的空 diff 成功状态

### Requirement: Changed file list covers worktree and staged changes

系统 SHALL 展示当前 Project 中工作区和 staged 的已修改文件列表，让用户知道当前项目有哪些未提交变化。

#### Scenario: Project contains unstaged and staged changes

- **WHEN** Git 仓库中同时存在 unstaged 和 staged changes
- **THEN** Git 页面展示这两类变更对应的文件条目
- **AND** 每个条目包含 project-relative file path
- **AND** 每个条目包含变更来源范围（worktree 或 staged，或等价可理解表达）

#### Scenario: Project has no changes

- **WHEN** 当前 Git 仓库没有 worktree 或 staged 变更
- **THEN** 页面展示无变更的空状态
- **AND** 不把无变更表现为错误

### Requirement: Changed file list displays basic status types

系统 SHALL 在变更文件列表中展示 basic status 类型：modified、added、deleted、renamed。

#### Scenario: Changed files have different statuses

- **WHEN** Git 仓库中存在 modified、added、deleted 或 renamed 文件
- **THEN** 文件列表为每个文件展示对应状态
- **AND** 状态展示可被移动端用户读懂
- **AND** 不要求复杂筛选、搜索、排序切换或聚合统计

### Requirement: User can open a single-file unified diff

系统 SHALL 支持用户从变更文件列表中选择单个文件，并查看该文件的 unified diff 文本。

#### Scenario: User selects a changed file

- **WHEN** 用户点击某个变更文件条目
- **THEN** 页面展示该文件的 unified diff
- **AND** diff 内容以移动端可读的等宽文本形式呈现
- **AND** 页面保留返回文件列表或选择其他文件的能力

#### Scenario: User reviews diff on mobile

- **WHEN** 用户在手机窄屏上查看单文件 diff
- **THEN** 系统使用 unified diff 文本布局
- **AND** 不要求提供左右并排对比视图

### Requirement: Git diff access remains Project-scoped

系统 SHALL 在当前 Project 作用域内执行 Git diff 查看，不能通过客户端输入访问或展示 Project 外部路径。

#### Scenario: Git diff viewer loads Project changes

- **WHEN** 用户打开某个 Project 的 Git diff viewer
- **THEN** API 在该 Project 的安全解析目录内执行只读 Git diff 查询
- **AND** 返回的文件路径为 Project-relative 路径或 Git 路径

#### Scenario: Requested diff path escapes the Project

- **WHEN** 用户请求查看 `../other-project` 或等价越界路径的 diff
- **THEN** 系统拒绝请求
- **AND** 不读取或展示当前 Project 外部的文件或 Git 信息

### Requirement: Git mobile inspection uses compact content-first layout

系统 SHALL 在手机窄屏 Project workspace 中以紧凑、可扫读的 changed-file list 和内容优先的 unified diff 展示 Git 只读 inspection，减少状态、路径、说明文案和重复 metadata 占用的空间。

#### Scenario: User reviews changed files on mobile

- **WHEN** 用户在手机窄屏打开 Git diff viewer，且 Project 存在变更文件
- **THEN** 系统以紧凑列表展示 changed files
- **AND** 每个条目仍展示可理解的状态与 scope
- **AND** 长路径不会导致页面级横向溢出
- **AND** 用户可以快速选择某个文件查看 diff

#### Scenario: User opens a single-file diff on mobile

- **WHEN** 用户在手机窄屏从 changed-file list 选择一个文件
- **THEN** 页面展示紧凑的所选文件上下文
- **AND** unified diff 内容占据主要可用空间
- **AND** 用户可以返回 changed-file list 或选择其他文件
- **AND** diff 行可读且不会造成页面级横向溢出

#### Scenario: User inspects compact Git view

- **WHEN** 用户在手机窄屏查看 changed-file list 或单文件 diff
- **THEN** 页面不展示 commit、stage、unstage、checkout、reset、merge、rebase、push、pull 或其他 Git 写操作入口
- **AND** 紧凑布局不通过隐藏菜单引入任何 Git 写操作

### Requirement: Git mobile direct page and diff detail use distinct navigation levels

系统 SHALL 在移动端区分 Git 直接二级页和单文件 diff 深层 detail：changed-file list 属于 Project 直接二级 workspace，单文件 diff 属于同 route 内的深层 inspection detail。

#### Scenario: User views Git as a mobile direct secondary page

- **WHEN** 用户在手机视口打开 Project Git workspace
- **THEN** 页面底部展示 Project 二级导航或等价 Back/Agent/Files/Git/Terminal 结构
- **AND** 页面顶部不重复显示返回一级页面的 Back 控件
- **AND** changed-file list 保持紧凑可扫读，并明确展示 scope/status

#### Scenario: User opens a single-file diff on mobile

- **WHEN** 用户从 changed-file list 选择一个文件
- **THEN** 页面顶部展示返回 changed files 的入口
- **AND** 页面底部不显示 Project 二级导航
- **AND** unified diff 内容占据主要可用空间
- **AND** 页面不出现任何 Git 写操作或隐藏写操作菜单

## Notes

- Git diff viewer 与 Files viewer 同属 Project-scoped read-only inspection tools。
- 第一轮不承诺 branch/remote/submodule 管理、Git 写操作、双栏 diff、分页、搜索或语法高亮。
- 移动端 Git inspection 应优先保证 changed-file list 和 unified diff 内容可见，避免用大块说明文案或重复 metadata 挤占首屏。

## 来源

- change：implement-git-diff-viewer
- verify 证据：`.workflow/changes/implement-git-diff-viewer/verify.md`
- change：compact-inspection-mobile-views
- verify 证据：`.workflow/changes/compact-inspection-mobile-views/verify.md`
- change：align-resource-inspection-pages
- verify 证据：`.workflow/changes/align-resource-inspection-pages/verify.md`
- 运行态验证证据：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/git-direct-mobile.png`、`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/git-diff-mobile.png`
