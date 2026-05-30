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

<!-- WORKFLOW:GOVERNANCE:START -->
## 治理文档导入

- @.workflow/AGENTS.md
- @docs/AGENTS.md
- @docs/project.md

必须读取并遵循：
1. `.workflow/AGENTS.md` 负责运行态、流程态与变更工作区治理。
2. `docs/AGENTS.md` 负责长期文档、索引与沉淀治理。
<!-- WORKFLOW:GOVERNANCE:END -->
