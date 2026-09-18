# 前端实现约定

> 来源：原 CLAUDE.md「前端实现约定」节迁移（2026-09-19 harness 改造）。

- 执行 React 前端实现（含原型/UI 对齐类改动）时，必须先加载 `vercel-react-best-practices` skill，并把它作为组件编写、重构和代码评审约束。
- UI 改动以 app 真实实现 + `docs/design/DESIGN.md` 为对齐标尺；历史 prototype HTML 已归档（见 `docs/design/prototype/index.md`），仅作参考不再维护；实现过程中对照 app 真实截图，不对照已过时的 prototype。
- 原型一致性必须通过横向和纵向两层抽象落地：横向复用同一套 Home/Project/Agent/Files/Git/Terminal 设计语言，纵向抽取 shell、workspace、navigation、surface、row、status、action、input、terminal/code 等层级 primitive。
- 颜色、间距、圆角、active 宽度、safe-area、bottom navigation、surface 层级等都属于抽象契约；不要在 route 文件里为了单页观感私自散写另一套设计语言。
- UI 样式细节（颜色/间距/圆角/elevation/交互态）以 `docs/design/DESIGN.md`（Google DESIGN.md 格式）为唯一权威标尺：改动前对照其 token 与 component variant，禁止散写绕过 token 的裸 Tailwind 值（`bg-cyan-300/10`、`text-slate-400`、`rounded-[1.5rem]` 等）；token 映射见其 Colors 对照表与 Migration & Mapping 节。
- 抽象只服务于还原原型和保持真实能力边界；不得伪造数据、日志、历史、文件/Git 能力或运行态输出让 UI 看起来更完整。
- 移动端/CSS/PWA 经验沉淀见根目录 `frontend-notes.md`（§N 编号是外部引用锚点，永不删除/重排）；设计系统权威源是 `docs/design/DESIGN.md`。
- 聊天界面使用 assistant-ui（文档：https://www.assistant-ui.com/llms-full.txt ）；`web/src/components/shell/icons/` 是 SVG 图标统一入口（新增图标 = 加 `.svg` + 在 `svgMap` 注册）。
