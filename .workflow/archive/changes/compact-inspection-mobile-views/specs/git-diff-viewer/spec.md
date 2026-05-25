# git-diff-viewer spec

本文件记录单个 change 对 `git-diff-viewer` 的行为契约增量。

## Change 来源

- change-id：compact-inspection-mobile-views
- 来源意图：Git 页面在移动端的信息展示占用空间过多，需要更紧凑、更成熟的列表/查看表现方式。
- 规划来源：让只读 Git diff 查看在移动端更紧凑、可读，并减少列表/详情展示的空间浪费。

## ADDED Requirements

### Requirement: Git mobile changed-file list uses compact review rows

系统 SHALL 在手机窄屏 Project workspace 的 Git 入口中，以紧凑、可扫读的列表展示 changed files，减少状态、路径和说明文案占用的空间。

#### Scenario: User reviews changed files on mobile

- **WHEN** 用户在手机窄屏打开 Git diff viewer，且 Project 存在变更文件
- **THEN** 系统以紧凑列表展示 changed files
- **AND** 每个条目仍展示可理解的状态与 scope
- **AND** 长路径不会导致页面级横向溢出
- **AND** 用户可以快速选择某个文件查看 diff

### Requirement: Git mobile diff prioritizes selected file content

系统 SHALL 在手机窄屏选择 changed file 后优先展示该文件的 unified diff 内容，同时保留必要的返回列表和文件上下文。

#### Scenario: User opens a single-file diff on mobile

- **WHEN** 用户在手机窄屏从 changed-file list 选择一个文件
- **THEN** 页面展示紧凑的所选文件上下文
- **AND** unified diff 内容占据主要可用空间
- **AND** 用户可以返回 changed-file list 或选择其他文件
- **AND** diff 行可读且不会造成页面级横向溢出

### Requirement: Git mobile inspection remains read-only

系统 SHALL 在移动端紧凑化后继续保持 Git diff viewer 只读观察边界，不新增任何 Git 写操作入口。

#### Scenario: User inspects Git compact mobile view

- **WHEN** 用户在手机窄屏查看 changed-file list 或单文件 diff
- **THEN** 页面不展示 commit、stage、unstage、checkout、reset、merge、rebase、push、pull 或其他 Git 写操作入口
- **AND** 紧凑布局不通过隐藏菜单引入任何 Git 写操作

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
