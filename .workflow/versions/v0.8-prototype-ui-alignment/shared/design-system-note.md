# Design System Note

本文件是 `v0.8-prototype-ui-alignment` 内 React UI 实现、组件抽象和 review 的共享实现口径。它是运行态基线，不是长期 design system 文档；后续页面 change 可以在验证后回写修正。

## Purpose

- 从 HTML 原型中提炼薄设计系统基线，让页面还原共享同一套视觉、密度、状态和组件抽象规则。
- 约束 shadcn/ui、lucide-react、Tailwind CSS 4、React 19、TanStack Router/Query 和 Jotai 的使用边界。
- 确保所有抽象服务于 prototype fidelity，而不是把页面改造成通用 dashboard 或完整组件库。

## Source Priority

1. `docs/design/prototype/guidelines.md`、prototype HTML、prototype screenshots。
2. 已验证长期 docs：`docs/design/frontend-ui-architecture.md`、`docs/design/console-shell.md`、`docs/design/mobile-session-interaction.md`。
3. 当前 React 实现中的真实数据流、route、API、runtime 和安全边界。
4. shadcn/ui 默认样式和外部组件习惯。

当视觉/布局冲突只涉及 UI 表达时，按原型对齐；当冲突涉及安全、真实能力、Project-safe path、session/runtime、Files/Git 只读或 API 边界时，保留真实能力边界并在 `follow-up-gaps.md` 记录。

## Technology Baseline

- 当前 web stack：React `19.2.6`、Vite `8.0.13`、Tailwind CSS `4.3.0`、`@tailwindcss/vite` `4.3.0`、TanStack Router/Query、Jotai、Bun workspace。
- 当前已初始化 shadcn/ui source setup：`web/components.json` 使用 Vite + Radix + Nova + lucide preset，生成组件放在 `web/src/components/ui/`，当前最小组件为 `Button`、`Badge`、`Card`、`Input`。
- 当前已引入并精确固定 `shadcn@4.7.0` 与 `lucide-react@1.16.0`；后续页面如需新增 shadcn 组件或 lucide 图标，仍必须重新检查 npm metadata 与 7 天安全规则。
- React 前端或 prototype UI alignment 的 `implement-change` 开始编码或 review 前，必须加载并参考已安装的 `vercel-react-best-practices` skill。
- shadcn/ui 只通过标准 CLI 初始化或添加组件；只添加当前页面 change 实际需要的最小组件集。
- shadcn/ui setup 已要求 `@` alias、`components.json`、CSS variables、`tw-animate-css`、`shadcn/tailwind.css` 和 `web/src/styles/index.css` 集成；默认 shadcn light tokens 必须改为项目 dark-only shell 基线，不能让 `body` 回到浅色背景。
- 2026-05-28 重新检查显示 `shadcn@4.8.2` 与 `lucide-react@1.17.0` 均在 7 天安全窗口内；后续安装、升级或版本选择必须重新检查 npm metadata。若 latest 发布未满 7 天，不应直接阻塞依赖采用，应优先选择已发布超过 7 天且兼容当前 React/Vite/Tailwind 栈的上一稳定版本；若没有安全窗口外的兼容版本，才记录阻塞或请求用户确认。本次采用回退版本：`shadcn@4.7.0`（2026-05-05 发布）与 `lucide-react@1.16.0`（2026-05-14 发布）。
- shadcn 相关依赖包括 Radix packages、`class-variance-authority`、`clsx`、`tailwind-merge`、`tw-animate-css` 和 Geist font package；最终依赖集由实际添加的最小组件决定。

## Tokens

### Color Roles

- App background：接近黑色的深色基底，允许轻微冷色渐变增强 console 氛围。
- Shell surface：大面板深色 surface，用于一级/二级应用框架。
- Workspace surface：主工作区深色 surface，弱于 shell 边界，突出内容区域。
- Raised surface：列表行、preview、terminal panel、drawer 等局部 surface。
- Border：低透明灰蓝边框，避免重分割。
- Text primary：高亮浅色。
- Text secondary：低饱和灰蓝。
- Text muted：用于 metadata、路径、时间和辅助提示。
- Accent：主要行动可使用蓝到紫的克制渐变或单色 accent，但不得覆盖 console 气质。
- Success/active：绿色语义，必须配合文字状态。
- Waiting/input-needed：黄色语义，必须配合文字状态。
- Danger/close：红色语义，保持克制并配合确认。

### Text Hierarchy

- 页面标题短而紧凑，不使用 marketing hero 级大字。
- Workspace header 只保留一句话级上下文或关键 scope，不堆叠说明文案。
- 列表主文本优先可扫读，metadata 控制在少量短字段。
- Terminal output 使用等宽字体、稳定行高和局部滚动。
- Copy 可轻量贴近原型短句和 console 气质，但不改变行为含义，不承诺缺失能力。

### Spacing and Density

- 移动端以主内容首屏可达为优先，避免厚卡片、大段说明、重复 metadata 和低频入口挤占。
- 列表行、Project entry、Agent instance、history、changed files、terminal instances 都应保持紧凑可扫读。
- 卡片/行内部常用 `12px-16px` padding；大 shell/workspace 容器可用 `20px-28px`。
- 底部导航、input drawer、滚动区和 safe-area padding 必须共同计算，不得遮挡。

### Radius, Border, and Surface Layers

- 大 shell 面板可以保持明显圆角表达独立应用 shell。
- 可复用 primitive 的圆角应克制，优先服务密度与可扫读性。
- 不在卡片中再嵌套卡片；重复项用 list row 或单层 surface。
- Border 用于层级和可点击区域识别，不制造厚重 dashboard 分割。

### Status Semantic Colors

- 状态不能只依赖颜色；必须有文字 status pill、标签或可读说明。
- Runtime、transport、disabled、dangerous confirmation 等状态应沿用真实能力边界。
- Loading/empty/error/disabled/danger 状态保持与默认态同一密度和 surface 体系，不使用大块营销式说明。

### Terminal Typography and Line Height

- Agent/Terminal detail 的输出区是主内容，使用等宽字体和可读字号/行高。
- Terminal panel 必须有稳定高度、局部滚动、长行处理和移动端可读性。
- Input drawer 参与布局，不使用 fixed/floating 遮挡输出。

## Console Primitives

- App shell surface：一级应用 shell 或 Project shell 的外层 surface 与导航容器。
- Nav item：一级/二级导航项，包含图标、短标签、active/disabled 状态。
- Workspace header：当前 scope、短上下文、低频操作和返回入口。
- List row：Project、Agent instance、history、file、changed file、terminal instance 的可扫读行。
- Status pill：文字 + 状态色语义，不只依赖颜色。
- Action button：主要、次要、ghost、danger、disabled 等操作层级。
- Icon marker：Project、provider、Files、Git、Terminal、history、status 的统一图标容器。
- Terminal panel：terminal-first 输出 surface。
- Input drawer：Agent/Terminal detail 底部输入控制区，可展开/收起，不遮挡输出。
- Quick key：即时发送 control sequence 的小型操作按钮。
- Contextual tool button：Agent detail 的 Files/Git/+Terminal/Meta 等来源上下文工具。

这些 primitive 只有在跨页面真实复用并提升原型一致性时才抽取；已跨 Home、Project workspace、Session detail 复用的 shell primitives、shell layout 和 shell navigation 应放在 `web/src/components/shell/` 作为轻量组件库边界，单页组合和文案保留在页面内。`ActionButton`、`StatusPill`、`ShellPanel`、`ShellHeaderSurface`、`ShellSidebar`、`ShellInput`、`ListRow` 等 shell component 可以包装 `web/src/components/ui/` 的 shadcn source component，但 route 文件不直接散用 shadcn 组件。

## shadcn/ui Boundary

- 使用 shadcn/ui 的目的：获取可访问交互语义、Radix 行为和基础组件源码，而不是继承默认 dashboard 视觉。
- shadcn/ui components 应作为 CLI 生成的本地 source components 管理，不手写复制上游源码，不提前添加未使用组件。
- 视觉层由 project tokens、variants、className 和 wrapper primitives 接管；当前 shell layer 通过 wrapper 消费 shadcn source：`ActionButton`/navigation buttons/`ListRow` 包装 `Button`，`StatusPill` 包装 `Badge`，shell surfaces 包装 `Card`，`ShellInput` 包装 `Input`，并保留原型所需的深色 console 视觉。
- 如果 shadcn 默认结构、tokens 或 light theme 与原型交互/视觉冲突，优先保留交互语义并局部封装或改写 token；只有默认抽象阻碍原型语义时才不用该组件。
- 每个页面 change 在 plan/implementation 中选择最小组件集，并记录版本安全检查结果。

## Icon Boundary

- 图标体系优先使用 `lucide-react` named imports。
- 所有图标通过统一 icon primitive 或等价封装管理尺寸、stroke、颜色、容器、active/disabled 状态。
- Project、Agent provider、Files、Git、Terminal、History、Status 等入口不得手写零散 SVG。
- 后续若替换图标库，应只影响统一图标边界，不扩散到页面业务代码。

## State and Route Boundary

- Server state 继续使用 TanStack Query。
- URL-visible workspace state 使用 TanStack Router route/search；例如 Project 直接二级 workspace active 状态。
- 单页 UI 状态保持组件本地，例如 input drawer collapsed、selected file preview、local overlay、Meta popover。
- Jotai 仅用于 shell-level shared UI state，不作为 Project workspace active state 的唯一来源。
- 不主动改路由/search/state；只有当前状态无法表达原型要求的移动端返回、二级 workspace 或深层 detail 语义时，才做最小调整。

## Non-abstraction List

不要抽象以下内容：

- 页面专属文案。
- 一次性布局细节。
- 只出现一次的组合。
- 业务数据转换。
- API/query 逻辑。
- route/search 状态逻辑。
- provider/runtime/session 语义。
- 为了贴近某个页面原型而存在的局部顺序、局部 copy 或局部 empty/future 文案。

## Implementation Review Gate

- 每个 React/prototype UI change 开始改 route JSX 前，必须先对照 prototype HTML 识别可复用的 layout、navigation、surface、control、status、row/input 边界；明显跨页面或跨层级复用的内容应进入 `web/src/components/shell/`，不要停留在 route-local helper。
- 如已明确采用 shadcn/ui，implementation 必须说明本轮实际消费哪些 shadcn source components、由哪些 shell wrappers 消费，以及哪些 shadcn components 暂不添加；不能只记录依赖或初始化而不接入组件层。
- Browser verify 必须人工检查 desktop shell structure：左/右是否贴合、右侧 workspace 是否按 prototype 分成 header/content、主操作按钮是否符合 primary action 层级；结构检查日志不能替代这一步。

## Verification Hooks

- 每个页面 change 必须按 `alignment-contract.md` 保存 prototype/app desktop/mobile screenshots 和 browser check log。
- Browser check 应检查行为地标：导航层级、当前 workspace、返回入口、terminal-first 输出区、input drawer、quick keys、Files/Git 只读边界、mobile 底部导航互斥、danger confirmation。
- React/prototype implementation review 必须同时检查：是否加载 `vercel-react-best-practices`；是否保持现有 data/query/runtime 边界；是否只抽取服务原型还原的 primitive；是否没有伪造数据或新增范围外能力。
- Typecheck/test 不能替代浏览器 desktop/mobile 验证；页面级 UI change 完成前必须有真实浏览器证据或明确说明阻塞原因。
