# file-browser-preview spec

本文件记录 `align-resource-inspection-pages` 对 `file-browser-preview` 的行为契约增量。

## Change 来源

- change-id：align-resource-inspection-pages
- 来源意图：Files / Git / Terminal resource pages 需要与 prototype 对齐：Files 首版保持只读浏览/预览，Git 首版保持只读 status/diff inspection，Terminal 二级页展示 terminal instances 并支持进入/新建/关闭；这些直接二级页遵守统一底部二级导航和深层详情顶部返回规则。
- 规划来源：本 change 直接承接用户原始意图，并以前置 `align-ui-shell-foundation`、长期 `docs/design/frontend-ui-architecture.md`、`docs/specs/file-browser-preview/spec.md` 和 prototype Files 页面为上下文。

## ADDED Requirements

### Requirement: Files direct secondary page follows compact Project workspace structure

系统 SHALL 将 Project Files 作为 Project 直接二级 workspace 呈现，保持只读 inspection，并在桌面/移动端优先展示目录列表和预览内容。

#### Scenario: User opens Files from Project navigation

- **WHEN** 用户在 Project 二级导航中打开 Files
- **THEN** Files 页面保留当前 Project 上下文
- **AND** 页面主体优先展示当前目录条目或文件预览
- **AND** 说明文案、路径 metadata 或装饰卡片不得挤占主要内容首屏
- **AND** 页面不提供编辑、删除、重命名、上传、下载或其他文件写操作

#### Scenario: User views Files on mobile as a direct secondary page

- **WHEN** 用户在手机视口打开 Project Files 直接二级页
- **THEN** 页面使用 Project 二级底部导航或等价 Back/Agent/Files/Git/Terminal 结构
- **AND** 页面顶部不重复显示返回一级页面的 Back 控件
- **AND** 文件/目录列表保持紧凑可扫读，并避免长路径横向溢出

### Requirement: File preview behaves as deep inspection detail on mobile

系统 SHALL 将移动端文件预览视为 Files workspace 内的深层 inspection detail，而不是 Project 直接二级页。

#### Scenario: User opens a file preview on mobile

- **WHEN** 用户从 Files 列表选择文本、图片或其他可预览文件
- **THEN** 页面提供顶部返回到 Files 列表或当前目录的入口
- **AND** 页面底部不显示 Project 二级导航
- **AND** 预览内容占据主要可用空间
- **AND** 文件上下文和不可预览/过大状态不伪装成编辑能力

#### Scenario: User returns from file preview

- **WHEN** 用户从文件预览点击顶部返回
- **THEN** 系统回到同一 Project Files context
- **AND** 用户不需要重新选择 Project 或经过 Home

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
