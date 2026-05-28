# Risks Design

## Change

- change-id：align-resource-inspection-workspaces

## 主要风险

- 原型能力与真实能力混淆：`files.html`、`git.html`、`terminal.html` 中如出现当前 API 不支持的 HTML sandbox preview、Terminal history/restore 或更丰富 metadata，不能通过 fake data 填充。
- Files/Git 写能力误入：为了贴近常见文件管理器或 Git 工具，容易无意加入 create/edit/delete/upload/stage/commit 等按钮；这些全部超出本 change 和长期 specs。
- Terminal workspace 与 Terminal detail 混淆：Terminal direct secondary 是 instance list，不是 runtime shell；如果加入 output/input/quick keys，会破坏 Project workspace 与 runtime detail 分层。
- Mobile navigation 层级错误：Files/Git list 页必须显示 Project 二级 bottom nav，preview/diff detail 必须隐藏 bottom nav；任一方向错误都是 blocking difference。
- 共享 primitive 漂移：Files/Git/Terminal 如果各自手写 button/list/surface/status，会再次出现导航、cursor、active、颜色、safe-area 等抽象不一致问题。
- 真实验证数据不足：空 Project 可能无法覆盖文件 preview、Git changed-file diff、Terminal instance row 和 close confirmation，导致 browser evidence 不完整。

## 跨子域权衡

- URL state vs local state：为 selected file/diff 增加 URL/search 能提升刷新恢复，但会扩大契约和实现范围；本轮选择 local state，满足同 route mobile deep detail 和返回模型即可。
- 抽象 vs 局部 helper：跨三类 resource workspace 的视觉重复需要收敛，但 Files/Git/Terminal API/query 语义不同；只抽 surface/list/action/mobile header 等 UI primitive，不抽业务数据模型。
- 原型完整度 vs 能力边界：视觉、密度、导航和状态要尽量对齐原型；遇到能力/API 缺口时优先 truthful empty/future/unsupported/gap，不牺牲真实边界换取视觉丰满。
- 桌面 split vs 移动 detail：桌面保留 list + content 同屏以提升扫读效率；移动端用互斥 detail 给内容让空间，这是响应式信息架构差异，不是实现不一致。

## 依赖与阻塞

- 已满足依赖：`establish-prototype-alignment-baseline`、`align-home-project-shell`、`align-runtime-detail-workspaces` 均已完成。
- 需要继承 shared：alignment contract、design system note 和 follow-up gaps rule。
- 无需新增 API、数据模型、依赖或技术研究。
- 当前无阻塞项。

## 验证建议

- 静态检查：`bun run --cwd web typecheck`、相关 web tests、`git diff --check`。
- Browser structure check：desktop/mobile 分别检查 Files、Git、Terminal direct workspace；mobile 额外检查 Files preview 和 Git diff detail。
- Artifact 最低集：`files.html`、`git.html`、`terminal.html` prototype desktop/mobile screenshots；app Files/Git/Terminal desktop/mobile screenshots；Files preview/Git diff mobile detail screenshots；browser check log。
- 结构断言：Files/Git read-only label、无写操作、Terminal direct workspace 无 runtime input/quick keys、mobile direct secondary 有 bottom nav、mobile preview/diff detail 无 bottom nav 且有顶部返回、Close Terminal 触发 confirm。
- 数据 fixture：使用 `PROJECTS_ROOT=/home/deploy/workspace` 下真实 Project，必要时选择包含文件、Git 变更和 Terminal session 的 fixture；不得在 UI 伪造 fixture 数据。

## 开放问题

- 无阻塞开放问题。
- 如果验证时真实 fixture 无法提供 Git changes 或 previewable file，应在 browser check log 记录证据不足，并优先准备本地真实 fixture，而不是修改 UI 数据。

## 后续沉淀候选

- Resource workspace browser artifact checklist。
- Mobile direct-secondary/deep-detail navigation 互斥风险清单。
- 原型-only resource capability gap 的登记模式。
