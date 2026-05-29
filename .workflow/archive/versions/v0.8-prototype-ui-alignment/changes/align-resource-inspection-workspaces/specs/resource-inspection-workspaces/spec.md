# resource-inspection-workspaces spec

本文件记录单个 change 对 `resource-inspection-workspaces` 的行为契约增量。

## Change context

- change-id：align-resource-inspection-workspaces
- 所属 version：v0.8-prototype-ui-alignment
- context：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/context.md

## 来源上下文摘要

- 用户原始意图：Files/Git/Terminal workspace 需要按 `files.html`、`git.html`、`terminal.html` 做细节级 prototype UI alignment，重点还原列表 + detail/preview 结构、移动端层级和非 happy path 状态。
- 主动规划上下文：Files、Git、Terminal 是 Project 直接二级资源工作区；本 change 补齐本轮核心页面的 resource inspection 覆盖，供最终 release verify 汇总。
- 当前已知边界：Files/Git 保持只读 inspection；Terminal workspace 只展示 live Terminal instances 与 create/open/close 入口；移动端 Files preview 与 Git diff detail 属于同 route 内深层 detail；不新增 Files/Git 写能力、不引入 Terminal runtime input、不伪造缺失数据或 API。

## ADDED Requirements

### Requirement: Files workspace SHALL align with the read-only list and preview prototype

系统 SHALL 将 Files workspace 呈现为 Project 直接二级 workspace：桌面端主结构为 Project 二级导航、文件列表和只读 preview 分栏；移动端直接 Files 页保留 Project 二级底部导航并优先展示可扫读文件列表；文件预览只使用真实 Files API 和 Project-safe relative path 能力，不提供 create、edit、delete、upload、rename 或 save 操作。

#### Scenario: Desktop Files list and preview inspection

- **WHEN** 用户在 desktop viewport `1440x1000` 打开 Project Files workspace
- **THEN** 页面显示 Project 二级 workspace chrome、Files 只读状态、文件/目录列表和当前文件 preview 区
- **AND** 文件列表保持可扫读密度，目录/文件路径不横向撑破页面
- **AND** preview 区只展示真实可预览内容、真实 loading/empty/error/unsupported 状态或未选中文件状态
- **AND** 页面不显示 Files 写操作入口

#### Scenario: Mobile Files direct workspace preserves secondary navigation

- **WHEN** 用户在 mobile viewport `390x844` 打开 Project Files workspace 且未进入文件 preview detail
- **THEN** 页面作为 Project 直接二级页显示 Files list 和 workspace context
- **AND** 底部显示带 Back 的 Project 二级导航，当前项为 Files
- **AND** 顶部不重复显示深层 detail 返回入口
- **AND** 文件列表主内容不被底部导航或 safe area 遮挡

### Requirement: File preview detail SHALL be a mobile deep inspection state

系统 SHALL 在移动端把选中文件 preview 表达为同 route 内深层 inspection detail：隐藏 Project 二级底部导航，显示顶部返回当前 Files list 的入口，并把可用空间优先留给文件内容；桌面端 SHALL 继续保持同页 list + preview 分栏。

#### Scenario: Mobile file preview hides bottom navigation

- **WHEN** 用户在 mobile Files workspace 选择一个文件进入 preview
- **THEN** 页面隐藏 Project 二级底部导航
- **AND** 页面显示顶部返回入口，返回后恢复 Files list 和底部二级导航
- **AND** preview 内容使用局部滚动、换行、截断或媒体约束避免横向溢出
- **AND** preview 不伪造文件内容、文件类型能力或写入能力

#### Scenario: Desktop file preview keeps split inspection layout

- **WHEN** 用户在 desktop Files workspace 选择一个文件
- **THEN** 文件列表仍可见，preview 在同页分栏中更新
- **AND** 页面不切换成深层 detail chrome，也不隐藏 Project 二级导航

### Requirement: Git workspace SHALL align with the read-only changed-file list and unified diff prototype

系统 SHALL 将 Git workspace 呈现为 Project 直接二级 workspace：桌面端主结构为 Project 二级导航、只读 changed-file list 和单文件 unified diff 分栏；移动端直接 Git 页保留 Project 二级底部导航并优先展示 branch/status 摘要与 changed-file list；Git 页面不得提供 stage、commit、checkout、reset、stash、discard 或其他写操作。

#### Scenario: Desktop Git read-only diff inspection

- **WHEN** 用户在 desktop viewport `1440x1000` 打开 Project Git workspace
- **THEN** 页面显示 Git 只读状态、branch/status 摘要、changed-file list 和当前文件 unified diff
- **AND** diff 行、路径和状态标签不会横向撑破页面
- **AND** staged/worktree/non-repository/loading/empty/error 状态使用真实 Git API 结果表达
- **AND** 页面不显示 Git 写操作入口

#### Scenario: Mobile Git direct workspace preserves secondary navigation

- **WHEN** 用户在 mobile viewport `390x844` 打开 Project Git workspace 且未进入单文件 diff detail
- **THEN** 页面作为 Project 直接二级页显示 Git workspace context、只读状态和 changed-file list
- **AND** 底部显示带 Back 的 Project 二级导航，当前项为 Git
- **AND** 顶部不重复显示深层 detail 返回入口
- **AND** changed-file list 主内容不被底部导航或 safe area 遮挡

### Requirement: Git diff detail SHALL be a mobile deep inspection state

系统 SHALL 在移动端把选中 changed file 的 diff 表达为同 route 内深层 inspection detail：隐藏 Project 二级底部导航，显示顶部返回当前 Git list 的入口，并把可用空间优先留给 unified diff；桌面端 SHALL 继续保持同页 changed-file list + diff 分栏。

#### Scenario: Mobile diff detail hides bottom navigation

- **WHEN** 用户在 mobile Git workspace 选择一个 changed file 进入 diff detail
- **THEN** 页面隐藏 Project 二级底部导航
- **AND** 页面显示顶部返回入口，返回后恢复 Git changed-file list 和底部二级导航
- **AND** diff 内容使用局部滚动、换行、截断或 code surface 约束避免横向溢出
- **AND** diff detail 不提供 stage、commit、checkout、reset、discard 或伪造 diff 数据

#### Scenario: Desktop diff detail keeps split inspection layout

- **WHEN** 用户在 desktop Git workspace 选择一个 changed file
- **THEN** changed-file list 仍可见，unified diff 在同页分栏中更新
- **AND** 页面不切换成深层 detail chrome，也不隐藏 Project 二级导航

### Requirement: Terminal workspace SHALL present live Terminal instances without runtime input

系统 SHALL 将 Terminal workspace 呈现为 Project 直接二级 workspace：桌面端主结构为 Project 二级导航和 terminal instance list；移动端直接 Terminal 页保留 Project 二级底部导航；页面允许基于真实 Terminal Session API 展示 live instances，并提供 create、open detail、close 入口，但不得在 direct secondary workspace 中承载 runtime output、textarea input drawer、quick keys 或 shell command composer。

#### Scenario: Desktop Terminal instance workspace

- **WHEN** 用户在 desktop viewport `1440x1000` 打开 Project Terminal workspace
- **THEN** 页面显示 Terminal workspace context、live Terminal instances list 或真实 empty/loading/error 状态
- **AND** 页面提供 New Terminal、Open detail 和 Close 等真实 session 操作入口
- **AND** Close 使用危险动作确认语义
- **AND** 页面不显示 runtime input drawer、quick keys、terminal output scrollback 或 shell prompt composer

#### Scenario: Mobile Terminal direct workspace keeps secondary navigation

- **WHEN** 用户在 mobile viewport `390x844` 打开 Project Terminal workspace
- **THEN** 页面作为 Project 直接二级页显示 Terminal instance list 和 workspace context
- **AND** 底部显示带 Back 的 Project 二级导航，当前项为 Terminal
- **AND** 顶部不显示 deep detail 返回入口
- **AND** 用户进入单个 Terminal detail 后，runtime input/output 才出现在 Terminal detail 页面

### Requirement: Resource workspace non-happy paths SHALL preserve the shared shell density and real capability boundaries

系统 SHALL 在 Files、Git、Terminal workspace 的 loading、empty、error、disabled、unsupported、close-pending 和 dangerous confirmation 状态中沿用本 version shared shell/surface/status/action 视觉语言，并保留真实能力边界；状态表达不能用大块营销式说明挤占主内容，也不能为贴近原型伪造数据或能力。

#### Scenario: Empty or error states remain compact and truthful

- **WHEN** Files/Git/Terminal workspace 处于 loading、empty、error、unsupported 或 disabled 状态
- **THEN** 页面使用紧凑、可扫读、深色 console surface 表达状态
- **AND** 状态包含文字说明，不只依赖颜色
- **AND** 页面不显示与真实 API 或长期边界冲突的操作
- **AND** 如果原型表达了当前真实能力不支持的区域，则该差异进入 `follow-up-gaps.md` 或以真实 empty/future/disabled 状态表达

### Requirement: Resource alignment evidence SHALL cover prototype and app desktop/mobile paths

系统 SHALL 为 Files、Git、Terminal workspace 对齐保存可审查 artifacts，最低覆盖 `1440x1000` desktop 和 `390x844` mobile viewport 的 prototype/app 截图，以及包含关键结构断言的 browser check log。

#### Scenario: Verification artifacts are complete for resource workspaces

- **WHEN** 本 change 进入 verify
- **THEN** artifacts 目录包含 `files.html`、`git.html`、`terminal.html` 对应的 prototype desktop/mobile 截图
- **AND** artifacts 目录包含真实 app Files/Git/Terminal workspace desktop/mobile 截图
- **AND** browser check log 记录 Files/Git 只读边界、Terminal workspace 无 runtime input、mobile direct secondary bottom navigation、mobile Files preview/Git diff detail bottom navigation 隐藏、危险关闭确认和主要可接受差异
- **AND** 如存在原型-only 能力缺口，browser check log 引用 `follow-up-gaps.md` 中对应条目

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
