# CLAUDE

## 行为规范
- @GUIDLINES.mds

## 项目目标
- 实现一个优化版本的 hapi，使用户可以通过网页控制服务器上的 agent，包括 Codex 和 Claude。

## 前端实现约定
- 执行 React 前端或 prototype UI alignment 的 `implement-change` 时，必须先加载 `vercel-react-best-practices` skill，并把它作为组件编写、重构和代码评审约束。
- Prototype UI alignment 必须先读原型 HTML，再在实现过程中持续对照 prototype/app 截图；不能只依赖最终 verify 才发现视觉漂移。
- 原型一致性必须通过横向和纵向两层抽象落地：横向复用同一套 Home/Project/Agent/Files/Git/Terminal 设计语言，纵向抽取 shell、workspace、navigation、surface、row、status、action、input、terminal/code 等层级 primitive。
- 颜色、间距、圆角、active 宽度、safe-area、bottom navigation、surface 层级等都属于抽象契约；不要在 route 文件里为了单页观感私自散写另一套设计语言。
- 抽象只服务于还原原型和保持真实能力边界；不得伪造数据、日志、历史、文件/Git 能力或运行态输出让 UI 看起来更完整。

## 数据流设计原则

- UI 组件的数据流必须遵循 `UI = f(state)`：同一数据类型的渲染只能有一条管道进入 UI 层。
- 如果同一数据类型（如消息）有多条管道（如 REST 历史 + WebSocket 实时），应合并为单一 state 数组，由 React 统一渲染，而不是为不同来源维护平行的渲染组件和状态管理。
- 分页、实时追加、历史回放等能力应只是对单一 state 数组的不同操作（prepend / append / reset），不应产生独立的 UI 分支。
- 使用 `useExternalStoreRuntime`（assistant-ui）或等价的外部 state 管理时，应让框架只负责渲染，业务层自己掌控 state 生命周期。
- 聊天记录以 Claude CLI 的 JSONL session 文件为唯一权威来源。不要自行"注入"或"伪造"消息；如果某条消息在 JSONL 中存在但 UI 没有显示，说明是渲染层过滤逻辑的问题。CLI 自身的 `isMeta: true/false` 分类是是否展示的第一手依据，不应以我们对 message type 的猜测替代。

## 调试第三方库 Bug
- 遇到第三方库 bug 时，正确顺序：① `tvly search` 查库的 issue → ② 找同样使用该库的开源项目参考实战解法（clone 到 `~/repos`）→ ③ 读 `node_modules` 源码验证机制 → ④ 一次性实现。不要靠猜测反复试错。

## 参考实现研究方法
- Claude Code CLI / SDK 等上游文档稀疏时，不要反复试探或盲猜协议格式。
- 优先通过 deepwiki 查询参考项目（如 hapi `tiann/hapi`）对同一问题的处理方式：协议消息格式、生命周期阶段、UI 呈现策略。
- 参考项目的源码已在 `~/repos/` 内，deepwiki 查不到的细节再用 grep 读源码补充。不要从零手动扫源码。

<!-- WORKFLOW:GOVERNANCE:START -->
## 治理文档导入

- @.workflow/AGENTS.md
- @docs/AGENTS.md
- @docs/project.md

必须读取并遵循：
1. `.workflow/AGENTS.md` 负责运行态、流程态与变更工作区治理。
2. `docs/AGENTS.md` 负责长期文档、索引与沉淀治理。
<!-- WORKFLOW:GOVERNANCE:END -->
