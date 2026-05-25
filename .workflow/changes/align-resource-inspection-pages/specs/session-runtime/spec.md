# session-runtime spec

本文件记录 `align-resource-inspection-pages` 对 `session-runtime` 的行为契约增量。

## Change 来源

- change-id：align-resource-inspection-pages
- 来源意图：Files / Git / Terminal resource pages 需要与 prototype 对齐：Files 首版保持只读浏览/预览，Git 首版保持只读 status/diff inspection，Terminal 二级页展示 terminal instances 并支持进入/新建/关闭；这些直接二级页遵守统一底部二级导航和深层详情顶部返回规则。
- 规划来源：本 change 直接承接用户原始意图，并以前置 `align-ui-shell-foundation`、长期 `docs/design/frontend-ui-architecture.md`、`docs/specs/session-runtime/spec.md` 和 prototype Terminal 页面为上下文。

## ADDED Requirements

### Requirement: Terminal workspace presents terminal instances as a Project direct secondary page

系统 SHALL 将 Project Terminal workspace 呈现为 Project 直接二级页中的 Terminal instances 列表，支持查看、创建、进入和关闭当前 Project 下的 Terminal Session。

#### Scenario: User opens Terminal workspace from Project navigation

- **WHEN** 用户在 Project 二级导航中打开 Terminal workspace
- **THEN** 页面保留当前 Project 上下文
- **AND** 页面展示当前 Terminal Session 列表或明确空状态
- **AND** 用户可以创建新的 Project-scoped Terminal Session
- **AND** 用户可以进入某个 Terminal Session detail
- **AND** 用户可以关闭当前 Terminal Session，且关闭仍保留危险确认

#### Scenario: User views Terminal workspace on mobile as a direct secondary page

- **WHEN** 用户在手机视口打开 Project Terminal 直接二级页
- **THEN** 页面使用 Project 二级底部导航或等价 Back/Agent/Files/Git/Terminal 结构
- **AND** 页面顶部不重复显示返回一级页面的 Back 控件
- **AND** Terminal instance 列表保持紧凑可扫读，长 displayName 或 session id 不造成横向溢出

### Requirement: Terminal instance detail remains the deep runtime detail

系统 SHALL 让 Terminal workspace 中的 Terminal instance row 进入现有 Terminal Session detail，而不是在直接二级页中常驻 runtime input。

#### Scenario: User opens a Terminal instance

- **WHEN** 用户从 Terminal workspace 打开某个 Terminal Session
- **THEN** 系统进入 Terminal Session detail 或等价 focused shell detail
- **AND** detail 使用顶部返回回 Terminal workspace 或来源上下文
- **AND** Project 直接二级底部导航不显示在 Terminal instance detail 中
- **AND** 当前 session 输入和 quick keys 只在 detail 中出现

#### Scenario: Terminal creation is pending or fails

- **WHEN** 用户在 Terminal workspace 创建 Terminal Session
- **THEN** 页面展示 pending、disabled 或错误状态
- **AND** 不伪造已创建的 Terminal instance
- **AND** 失败后用户仍可留在同一 Project Terminal workspace 恢复或重试

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
