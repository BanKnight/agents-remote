# Design Overview

本文件汇总本 change 的设计范围、子域选择和整体设计结论。

## Change

- change-id：align-resource-inspection-workspaces
- 所属 version：v0.8-prototype-ui-alignment

## 输入依据

- context：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/context.md
- specs：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/specs/resource-inspection-workspaces/spec.md
- version shared：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md；.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md；.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md
- prototype：docs/design/prototype/guidelines.md；docs/design/prototype/files.html；docs/design/prototype/git.html；docs/design/prototype/terminal.html
- 长期 docs：docs/project.md；docs/design/frontend-ui-architecture.md；docs/specs/file-browser-preview/spec.md；docs/specs/git-diff-viewer/spec.md；docs/specs/session-runtime/spec.md
- 当前实现：web/src/routes/ProjectConsoleRoute.tsx；web/src/routes/console-model.ts

## 设计范围

### 本次覆盖

- Files workspace 的只读 file list + preview split、移动端 Files direct secondary 和 file preview deep detail。
- Git workspace 的只读 changed-file list + unified diff split、移动端 Git direct secondary 和 diff deep detail。
- Terminal workspace 的 live Terminal instance list、create/open/close 操作、移动端 direct secondary layout。
- Files/Git/Terminal 的 loading、empty、error、disabled、unsupported、close-pending 与 dangerous confirmation 的视觉和密度一致性。
- 与 Home/Project shell、runtime detail 已验证 primitives 保持一致的 surface、list row、status、action、bottom navigation 和 mobile safe-area 行为。
- 本 change verify 所需 prototype/app desktop/mobile screenshots 和 browser check artifacts 的设计约束。

### 本次不覆盖

- Files create/edit/delete/upload/rename/save 等写操作。
- Git stage/commit/checkout/reset/stash/discard 等写操作。
- Terminal direct secondary workspace 的 runtime output、textarea input drawer、quick keys 或 shell command composer。
- Files/Git/Terminal API、Project-safe path、Git CLI、Session Runtime 或 WebSocket 协议变更。
- Agent-derived contextual Files/Git route/search 深链扩展；本 change 只修正当前 Project direct secondary resource workspaces。
- 新增 shadcn/ui 组件、lucide 版本升级或外部依赖。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 产品目标和能力边界已由 context、specs 和长期 Files/Git/Session specs 明确；本阶段不重新定义产品能力。 |
| ui-ux | 是 | 需要明确三类 resource workspace 的列表/detail、移动端导航互斥、非 happy path 和原型视觉密度。 |
| frontend | 是 | 需要明确现有 `ProjectConsoleRoute.tsx` 内 route/search、本地 selected state、shared shell primitives 和 API/query 边界。 |
| architecture | 否 | 不改变 web/api/shared 分层、Project-safe path、Session Runtime 或 Git/Files 架构。 |
| api | 否 | 不新增或修改 Files/Git/Terminal API；只消费现有 client/query。 |
| data | 否 | 不改 DTO、数据库、runtime metadata 或文件/Git 数据模型。 |
| business-rules | 否 | 只读和 runtime 边界已由长期 specs 给出；不新增业务规则。 |
| error-handling | 否 | 错误态以 UI/UX/frontend 子域描述为页面状态，不需要独立错误码或重试策略设计。 |
| risks | 是 | 需要集中收口原型缺口伪造、移动端导航、Terminal workspace/runtime detail 混淆和 shared primitive 漂移风险。 |

## 总体设计结论

- Resource workspaces 继续属于 Project 直接二级页面，继承 Home/Project shell 的二级导航模型；Files/Git 的 mobile preview/diff 才进入深层 inspection detail 并隐藏底部二级导航。
- Desktop Files/Git 采用同页 list + content split；mobile list 和 detail 采用互斥视图，依赖已有 `resourceDeepDetailOpen` 向 `ShellLayout` 隐藏 bottom navigation。
- Terminal workspace 使用 Agent workspace 的实例列表语义和 shared list/action/status primitives，但必须保持 direct secondary：只列 live Terminal sessions，不展示 runtime output/input。
- 视觉层不为 resource 页面创建一套私有深浅；优先复用 `ShellLayout`、`ShellPanel`、`ShellHeaderSurface`、`ProjectShellNavigation`、`ProjectShellBottomNavigation`、`ListRow`、`StatusPill`、`ActionButton`、`IconMarker` 和 `shellSurfaceClasses`。
- Files/Git/Terminal 页面可以轻量拆出 route-local resource 组合组件，但跨 Files/Git/Terminal 重复的 list/detail/mobile header/surface/action 模式应优先收敛到 shell primitives 或小型 route helper，不能继续散写三套不一致按钮和 surface。

## 关键决策

- Files/Git selected detail 仍保留组件本地 state，不进入 route/search；它只影响当前同 route mobile chrome，不需要深链恢复。
- `resourceDeepDetailOpen` 继续作为 Project Console route 内部 UI 状态，专门控制 mobile deep detail 与 bottom navigation 互斥；切换 workspace 时必须清空。
- Files/Git `Retry` 是读取/重试动作，不是写操作；Root/Up 是文件浏览导航，不是文件写能力。
- Terminal `New Terminal` 是现有真实 Session Runtime create 能力；Terminal direct workspace 不新增 command input 或 quick key bar。
- Browser verify 必须覆盖 direct secondary 和 deep detail 两种 mobile 状态，不能只截默认列表页。

## 开放问题

- 无阻塞开放问题。
- 如实现阶段发现 `terminal.html` 中存在当前真实 API 不支持的 persistent history/restore 区域，不应伪造；应以真实 empty/future 状态表达并按需记录到 `follow-up-gaps.md`。
- 如 Files 原型中的 HTML sandbox preview 与当前 Files preview DTO 不完全等价，应保留真实 preview union 边界；缺失 HTML sandbox 能力按 follow-up gap 处理。

## 后续沉淀候选

- `docs/design/frontend-ui-architecture.md`：resource workspace 的 direct secondary/list-detail、mobile deep detail 和 bottom navigation 互斥边界。
- `docs/design/console-shell.md`：如验证后发现 Project Console shell 的 resource workspace 规则需要补充，可增量沉淀。
