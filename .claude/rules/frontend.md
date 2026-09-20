# 前端实现约定

> 来源：原 CLAUDE.md「前端实现约定」节迁移（2026-09-19 harness 改造）；2026-09-20 UI v2 重构起标尺切换为设计包三件套（见 `docs/design/redesign-v2.md`）。

- 执行 React 前端实现（含原型/UI 对齐类改动）时，必须先加载 `vercel-react-best-practices` skill，并把它作为组件编写、重构和代码评审约束。
- UI 改动的唯一对齐标尺 = **v1.3 设计包三件套**：`docs/design/design_spec.md`（规格+九铁律+验收清单）、`docs/design/tokens.json`（唯一数值源）、`docs/design/assets/components.css`（共享组件单源，直接沿用类名与结构）；54 页原型 HTML（`docs/design/*.html`）是像素级视觉标准。重构决策与里程碑状态见 `docs/design/redesign-v2.md`；v1 体系已归档 `docs/design-v1/`（仅历史参考）。
- **双主题（浅色/深色）是硬约束**：语义 token 两态一致（`$value`=浅、`$extensions["mode.dark"]`=深），每个组件浅深两态都要成立；主题切换走 `data-theme` 机制。
- 原型一致性通过横向和纵向两层抽象落地：横向复用同一套 Tab/工作台/工具/详情设计语言，纵向抽取 shell、workspace、navigation、surface、row、status、action、input、terminal/code 等 primitive。
- 颜色、间距、圆角、active 宽度、safe-area、bottom navigation、surface 层级等都属于抽象契约；不要在 route 文件里私自散写另一套设计语言。
- UI 样式细节以 `docs/design/tokens.json` 语义 token 为唯一权威：改动前对照其 token 与 components.css 组件，禁止散写绕过 token 的裸 Tailwind 值（`bg-cyan-300/10`、`text-slate-400`、`rounded-[1.5rem]` 等）；散落 HEX/裸色阶由机检脚本把关（见 `verification.md`）。
- 抽象只服务于还原原型和保持真实能力边界；不得伪造数据、日志、历史、文件/Git 能力或运行态输出让 UI 看起来更完整。
- 移动端/CSS/PWA 经验沉淀见根目录 `frontend-notes.md`（§N 编号是外部引用锚点，永不删除/重排）。
- 聊天界面使用 assistant-ui（文档：https://www.assistant-ui.com/llms-full.txt ）；`web/src/components/shell/icons/` 是 SVG 图标统一入口（新增图标 = 加 `.svg` + 在 `svgMap` 注册）；图标风格以 components.css 原型内嵌 SVG path 为基准（SF Symbols rounded，24 网格 2px 圆头描边）。
