# Design Overview

本文件汇总 `align-resource-inspection-pages` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：align-resource-inspection-pages
- 所属 version：v0.8-prototype-ui-alignment

## 输入依据

- intents：Files / Git / Terminal resource pages 需要与 prototype 对齐：Files 首版保持只读浏览/预览，Git 首版保持只读 status/diff inspection，Terminal 二级页展示 terminal instances 并支持进入/新建/关闭；这些直接二级页遵守统一底部二级导航和深层详情顶部返回规则。
- specs：`.workflow/changes/align-resource-inspection-pages/specs/file-browser-preview/spec.md`、`specs/git-diff-viewer/spec.md`、`specs/session-runtime/spec.md`
- 相关长期 docs：`docs/design/frontend-ui-architecture.md`、`docs/specs/file-browser-preview/spec.md`、`docs/specs/git-diff-viewer/spec.md`、`docs/specs/session-runtime/spec.md`、`docs/design/file-browser-preview.md`、`docs/design/git-diff-viewer.md`、`docs/design/console-shell.md`、`docs/design/prototype/guidelines.md`、`docs/design/prototype/files.html`、`docs/design/prototype/git.html`、`docs/design/prototype/terminal.html`

## 设计范围

### 本次覆盖

- Project Files 直接二级 workspace 的 compact read-only browsing / preview 结构。
- Project Git 直接二级 workspace 的 compact read-only status/diff inspection 结构。
- Project Terminal 直接二级 workspace 的 Terminal instance list、create、enter、close 状态和移动端导航规则。
- 移动端 Files preview、Git file diff 作为 deep inspection detail：顶部返回、隐藏 Project 二级底部导航、内容优先。
- 保留现有 API/DTO/read-only/runtime 边界，不新增写操作。

### 本次不覆盖

- 不新增 Files 写操作、下载、上传、编辑、删除或文件深链。
- 不新增 Git stage/commit/checkout/reset/push/pull 或 Git 写操作。
- 不新增 Terminal runtime API、session protocol 或 xterm/terminal emulator。
- 不重做 Agent workspace 或 Agent detail contextual tools。
- 不追求 prototype 像素级一致，只对齐结构、导航、密度和真实状态。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 用户价值明确：Files/Git 只读 inspection，Terminal instance list 控制。 |
| ui-ux | 是 | 核心是直接二级页 vs deep detail、compact content-first 布局、移动端导航互斥和只读 affordance。 |
| frontend | 是 | 需要约束 `ProjectConsoleRoute` 局部 state、TanStack Query、Files/Git preview/diff detail mode 和 Terminal list。 |
| architecture | 否 | 不改变 API、runtime、Project safe resolver 或 shared DTO。 |
| api | 否 | 沿用现有 Files/Git/Terminal APIs。 |
| data | 否 | 不新增数据模型。 |
| error-handling | 否 | 错误/空/unsupported 状态纳入 UI/UX 与 frontend。 |

## 总体设计结论

- Files/Git/Terminal workspace 是 Project 直接二级页；移动端保留 Project 二级底部导航，顶部不重复返回一级页面 Back。
- Files preview 与 Git single-file diff 是 workspace 内的 deep inspection detail；移动端应隐藏 Project 二级底部导航，显示顶部返回到列表/目录。
- 桌面端可保留列表 + preview/diff 同页结构，移动端在选中 preview/diff 时优先展示内容 detail，避免列表和底部导航挤压预览。
- Terminal workspace 继续是直接二级页，不常驻 runtime input；Terminal instance row 进入 Terminal Session detail 后才出现 input drawer / quick keys。
- Files/Git 保持只读；UI 不展示写操作或伪造能力，状态文案明确 read-only、unsupported、too large、not Git repository、no changes 等真实状态。
- 实现优先在 `ProjectConsoleRoute.tsx` 局部调整，不拆新 route，不改后端协议。

## 关键决策

- 本 change 对 Files/Git 移动端 deep detail 使用组件本地 state，不新增 route/search；因为当前长期 design 已明确 Files/Git section 保持 Project console route 内，深链需求不在本轮范围。
- Project 二级底部导航由 `ProjectConsoleRoute` 根据当前 workspace 和移动 deep detail 状态决定是否渲染；不把隐藏规则散落到 Files/Git panel 内部 CSS。
- Terminal workspace 的列表密度可以沿用 Agent instance row/list primitive，但文案必须表达普通 Project-scoped shell，不出现 provider 语义。
- Browser verification 使用临时 mock API 或 project fixture 采集 desktop/mobile Files/Git/Terminal workspace 与 mobile preview/diff detail 证据。

## 开放问题

- Files/Git preview/diff 是否需要 URL-visible path/deep detail 状态：本轮不做，后续如需要刷新恢复或分享链接再独立设计。

## 后续沉淀候选

- Project direct secondary resource pages 与 deep inspection detail 的长期移动端导航规则。
- Files/Git mobile content-first inspection 的长期 UI 边界。
- Terminal workspace 与 Terminal detail 的长期职责分离。
