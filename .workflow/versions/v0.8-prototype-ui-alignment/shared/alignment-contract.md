# Prototype Alignment Contract

本文件是 `v0.8-prototype-ui-alignment` 内所有页面还原 change 和最终 verify change 的共享验收契约。后续页面级 spec、design、implement、verify 都应先读取本文件，再判断页面是否“像原型”。

## Purpose

- 统一本 version 中 prototype UI alignment 的判断口径，避免每个页面 change 私有化“像原型”的标准。
- 约束页面还原只做视觉、布局、交互、状态和密度对齐，不扩展真实能力边界。
- 为后续页面 change 规定 prototype/app desktop/mobile artifacts 和缺口记录方式。

## References

- 主参考：`docs/design/prototype/*.html`，以 HTML 原型中的结构、层级、交互状态和 desktop/mobile 形态为准。
- 辅助参考：`docs/design/prototype/screenshots/`，用于检查浏览器真实渲染观感。
- 长期边界：`docs/project.md`、`docs/design/prototype/guidelines.md`、`docs/design/frontend-ui-architecture.md`、`docs/design/console-shell.md`、`docs/design/mobile-session-interaction.md`。
- 当前实现：仅作为真实数据、路由、API、状态管理和能力边界参考；当前视觉不是本轮对齐的最终标准。

## Viewports

- Desktop：`1440x1000`。
- Mobile：`390x844`。
- 如果同一个 HTML 原型同时包含 desktop/mobile 形态，页面 change 必须分别截图、分别核对、分别记录差异。
- 后续可在最终 verify 中按风险追加第三 viewport；本 contract 的最低验收 viewport 仍是上述两个。

## Prototype Map

| Prototype | Real route/page | Desktop shape | Mobile shape | Responsible change | Required artifacts |
|---|---|---|---|---|---|
| `home.html` | Home / Projects route | 一级左侧导航 + Project 工作区；Project 列表优先，创建/采用入口降级 | 底部一级导航 + 上方 Projects 工作区；首屏保持列表密度 | `align-home-project-shell` | prototype desktop/mobile screenshot；app desktop/mobile screenshot；browser check log |
| `project-detail.html` | Project Agent workspace | Project 二级左侧导航 + Agent instances 工作区；`+ Claude` / `+ Codex` 创建入口 | 底部二级导航含 Back；直接二级页顶部不重复 Back | `align-home-project-shell` | prototype desktop/mobile screenshot；app desktop/mobile screenshot；browser check log |
| `agent-session-detail.html` | Agent detail | Terminal-first detail；顶部返回、status、Files/Git/+Terminal/Meta contextual tools；主输出区 + input drawer | 顶部返回；无 Project 二级底部导航；input drawer 可收起且不遮挡输出 | `align-runtime-detail-workspaces` | prototype desktop/mobile screenshot；app desktop/mobile screenshot；browser check log |
| `terminal-instance-detail.html` | Terminal detail | Terminal-first focused shell；顶部返回、status、close/reconnect/resize；不显示 Agent-only tools | 顶部返回；无 Project 二级底部导航；focused input/output shell | `align-runtime-detail-workspaces` | prototype desktop/mobile screenshot；app desktop/mobile screenshot；browser check log |
| `files.html` | Files workspace and file preview detail | Project 二级 Files；只读文件列表 + preview 分栏 | 直接二级 Files 保留底部二级导航；进入 preview detail 后隐藏底部二级导航，仅顶部返回 | `align-resource-inspection-workspaces` | prototype desktop/mobile screenshot；app desktop/mobile screenshot；browser check log |
| `git.html` | Git workspace and diff detail | Project 二级 Git；只读 changed files list + unified diff | 直接二级 Git 保留底部二级导航；进入 diff detail 后隐藏底部二级导航，仅顶部返回 | `align-resource-inspection-workspaces` | prototype desktop/mobile screenshot；app desktop/mobile screenshot；browser check log |
| `terminal.html` | Terminal workspace | Project 二级 Terminal；live Terminal instances list；create/open/close 入口 | 直接二级 Terminal 保留底部二级导航和 Back；不承载 runtime input | `align-resource-inspection-workspaces` | prototype desktop/mobile screenshot；app desktop/mobile screenshot；browser check log |

## Equivalence Rules

- HTML 原型是结构与交互主参考，React 实现可以使用不同 DOM 节点、组件边界和 class 命名。
- 验收优先判断视觉、布局、交互路径、导航层级、返回模型、状态语义、密度和主任务可达性是否等价。
- 结构检查只验证行为地标，例如导航层级、当前 workspace、detail 返回入口、terminal-first 输出区、input drawer、Files/Git 只读 inspection、危险动作确认。
- 不使用 DOM tree、class name 或 pixel-perfect 作为硬性验收标准。
- 当前实现、长期 docs 与原型冲突时：安全、真实能力、Project-safe path、session/runtime、Files/Git 只读边界优先；纯布局、密度、导航、返回模型、状态表达和 console copy 气质按原型对齐。

## Acceptable Differences

- React 组件、shadcn/ui 或 Radix 语义结构导致 DOM 包装不同。
- 少量字体渲染差异，前提是层级、密度和可读性等价。
- `1-2px` 级别的间距、边框、阴影、圆角或抗锯齿差异，前提是不改变布局节奏。
- 真实数据长度、真实 ID、真实 Project 路径或运行态状态导致文本内容不同。
- 原型中缺少真实功能/API 支撑的区域使用真实 empty、staged 或 future 状态表达。
- 当前 route/search/state 边界在不破坏移动端返回和深层 detail 语义时与原型结构不完全一致。
- shadcn/ui 默认可访问性结构保留，但视觉通过 project tokens、variants、className 和 wrapper primitives 对齐原型。

## Blocking Differences

- 一级、二级、深层/contextual detail 的导航层级错误。
- 移动端直接二级页和深层 detail 的返回位置错误。
- detail 页底部 Project 导航与 input drawer、quick keys 或 terminal output 冲突。
- Agent/Terminal detail 的 terminal-first 输出区被 metadata、说明文案、厚卡片或工具面板挤掉。
- Home/Project、Agent list、Files/Git/Terminal list 的扫读密度明显偏离原型。
- Files/Git/Terminal workspace 混入不属于当前能力边界的输入、写操作或 runtime 语义。
- Terminal detail 显示 Agent-only Files/Git/+Terminal/Meta tools。
- Files preview 或 Git diff detail 在 mobile 下仍显示 Project 二级底部导航。
- 伪造不存在的数据、history、provider metadata、runtime output、Git 写操作、Files 写操作或 API 能力。
- 为本轮对齐新增 light mode、PWA offline/notification/service worker、Git stage/commit/checkout/reset、Files create/edit/delete/upload 或大规模 API/client/query/session 重写。

## Artifact Requirements

每个页面还原 change 至少保存以下 artifacts 到该 change 的 `artifacts/` 下：

- Prototype desktop screenshot at `1440x1000`。
- Prototype mobile screenshot at `390x844`。
- App desktop screenshot at `1440x1000`。
- App mobile screenshot at `390x844`。
- Browser check log，包含访问路径、viewport、关键结构检查、主要差异和是否存在 blocking difference。

最终 `verify-prototype-alignment-release` 必须汇总：

- 所有页面 change 的 prototype/app desktop/mobile screenshots。
- 跨页面结构检查日志。
- 可接受差异清单。
- blocking differences 或 CRITICAL 缺陷清单。
- `follow-up-gaps.md` 中未解决条目的最终状态。

## Follow-up Gap Rule

- 原型缺口、长期 docs 冲突、缺失功能/API、真实能力不足、后续版本候选问题都记录到 `follow-up-gaps.md`。
- 页面 change 不得为了让视觉更丰满而伪造缺失能力；应使用 empty、staged、disabled 或 future 状态表达真实边界。
- 如果 shared contract 本身不准确或不完整，页面 change 应回写本文件或在 `follow-up-gaps.md` 记录需要后续处理的 shared gap。
- 缺口记录不能替代本轮可做的视觉/布局对齐；只有能力、API、安全边界或版本范围之外的问题才进入 follow-up。
