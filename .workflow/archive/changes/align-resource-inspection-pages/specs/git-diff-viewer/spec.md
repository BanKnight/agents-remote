# git-diff-viewer spec

本文件记录 `align-resource-inspection-pages` 对 `git-diff-viewer` 的行为契约增量。

## Change 来源

- change-id：align-resource-inspection-pages
- 来源意图：Files / Git / Terminal resource pages 需要与 prototype 对齐：Files 首版保持只读浏览/预览，Git 首版保持只读 status/diff inspection，Terminal 二级页展示 terminal instances 并支持进入/新建/关闭；这些直接二级页遵守统一底部二级导航和深层详情顶部返回规则。
- 规划来源：本 change 直接承接用户原始意图，并以前置 `align-ui-shell-foundation`、长期 `docs/design/frontend-ui-architecture.md`、`docs/specs/git-diff-viewer/spec.md` 和 prototype Git 页面为上下文。

## ADDED Requirements

### Requirement: Git direct secondary page follows compact Project workspace structure

系统 SHALL 将 Project Git 作为 Project 直接二级 workspace 呈现，保持只读 status/diff inspection，并在桌面/移动端优先展示 changed-file list 和 diff 内容。

#### Scenario: User opens Git from Project navigation

- **WHEN** 用户在 Project 二级导航中打开 Git
- **THEN** Git 页面保留当前 Project 上下文
- **AND** 页面主体优先展示 Git repository 状态、changed-file list 或当前 diff 内容
- **AND** 页面不提供 commit、stage、unstage、checkout、reset、merge、rebase、push、pull 或其他 Git 写操作
- **AND** 长路径、scope/status 和 diff 行不造成页面级横向溢出

#### Scenario: User views Git on mobile as a direct secondary page

- **WHEN** 用户在手机视口打开 Project Git 直接二级页
- **THEN** 页面使用 Project 二级底部导航或等价 Back/Agent/Files/Git/Terminal 结构
- **AND** 页面顶部不重复显示返回一级页面的 Back 控件
- **AND** changed-file list 保持紧凑可扫读，并明确展示 scope/status

### Requirement: Git file diff behaves as deep inspection detail on mobile

系统 SHALL 将移动端单文件 diff 视为 Git workspace 内的深层 inspection detail，而不是 Project 直接二级页。

#### Scenario: User opens a single-file diff on mobile

- **WHEN** 用户从 Git changed-file list 选择某个文件
- **THEN** 页面提供顶部返回到 changed-file list 的入口
- **AND** 页面底部不显示 Project 二级导航
- **AND** unified diff 内容占据主要可用空间
- **AND** 页面不出现任何 Git 写操作或隐藏写操作菜单

#### Scenario: Project is not a Git repository

- **WHEN** 用户打开非 Git Project 的 Git workspace
- **THEN** 页面展示明确的非 Git 仓库状态
- **AND** 该状态仍遵守 Project 直接二级页导航模型
- **AND** 不把非 Git 状态表现为系统异常或伪造空 diff 成功状态

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
