# prototype 设计规范

本文件说明 `docs/design/prototype/` 下 HTML 原型的基础设计规范。HTML 原型用于对齐产品结构与交互方向，不是最终实现代码。

## 整体设计原则

- 产品气质是深色 Server Agent Console，而不是传统 SaaS 营销页或后台管理列表。
- 信息架构采用“导航 + 工作区”：导航负责切换主要区域，工作区承载当前任务内容。
- 移动端优先保证首屏可用性：顶部文案要克制，主要操作和主要内容必须尽早出现。
- 低频操作不能占据主工作区，例如创建/采用 Project 应降级为轻量入口。
- 图标是基础识别能力：Project、Agent provider、Files、Git、Terminal、history 等入口都应有一致图标语言。
- 跨页面重复的 token、shell、navigation、surface、row、status、action、input、terminal/code 基础样式应优先进入 `prototype-foundation.css`；standalone HTML 只保留页面特有状态和组合。

## 资产与截图来源

- Standalone HTML 是正式截图和详细评审来源，包括 `home.html`、`project-detail.html`、`agent-session-detail.html`、`terminal-instance-detail.html`、`files.html`、`git.html`、`terminal.html`。
- `overview.html` 是总览评审入口，只用于按页面分组比较 desktop/mobile 结构关系，不作为正式截图来源。
- 正式截图必须直接打开 standalone HTML，并使用本文件声明的标准 viewport。
- `screenshots/` 下每个 standalone 页面保留 desktop/mobile 两张 PNG，命名沿用 `<page>-desktop.png` 与 `<page>-mobile.png`。

## Viewport 标准

| 用途 | Viewport | 来源 | 说明 |
|---|---:|---|---|
| Desktop screenshot | `1440x1000` | standalone HTML | 用于正式桌面截图和后续 app-vs-prototype alignment。 |
| Mobile screenshot | `390x844` | standalone HTML | 用于正式手机竖屏截图，接近 iPhone 竖屏评审尺寸。 |
| Overview desktop preview | review frame | `overview.html` iframe | 只服务总览可读性，不是正式截图尺寸。 |
| Overview mobile preview | review frame | `overview.html` iframe | 只服务逐页对照，不是正式截图尺寸。 |

## Design tokens

`prototype-foundation.css` 是 prototype 的公共 token 和 primitive 基础。当前主 token 如下。

| Token | 值 | 用途 |
|---|---|---|
| `--bg` | `#080b10` | 页面深色基底。 |
| `--panel` | `#0f1520` | 主 shell / panel 基底。 |
| `--panel-2` | `#141b28` | 次级 panel、rail 渐变高点。 |
| `--panel-raised` | `rgba(20, 27, 40, 0.72)` | 卡片、行、按钮等 raised surface。 |
| `--panel-inset` | `rgba(5, 8, 13, 0.52)` | terminal wrap、preview/diff 背景等 inset surface。 |
| `--line` | `#263245` | 主要边框和分隔线。 |
| `--line-soft` | `rgba(148, 163, 184, 0.18)` | 轻分隔和卡片边框。 |
| `--text` | `#eef4ff` | 主文本。 |
| `--soft` | `#c1cad8` | 次主文本、按钮文本、row 内容。 |
| `--muted` | `#8d99aa` | 辅助文本和 metadata。 |
| `--code-text` | `#d6e4f7` | terminal/code 主文本。 |
| `--code-muted` | `#728197` | terminal/code muted 行。 |
| `--accent` | `#7dd3fc` | active nav、链接、primary outline、terminal prompt。 |
| `--accent-2` | `#a78bfa` | primary gradient 终点。 |
| `--good` | `#34d399` | running/success/added。 |
| `--warn` | `#fbbf24` | waiting/warning/modified。 |
| `--danger` | `#fb7185` | destructive/deleted/window close。 |
| `--ink-on-accent` | `#041019` | primary gradient 上的深色文字。 |
| `--radius-shell-desktop` | `28px` | Desktop frame 圆角。 |
| `--radius-shell-phone` | `38px` | Mobile phone frame 圆角。 |
| `--shadow-shell` | `0 26px 80px rgba(0, 0, 0, 0.38)` | Desktop/mobile frame 阴影。 |

## 尺寸、圆角、阴影与字体

| 项 | 值 | 用途 |
|---|---|---|
| 字体 | `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | 页面 UI 字体。 |
| 等宽字体 | `"SFMono-Regular", Consolas, "Liberation Mono", monospace` | terminal、diff、code、path。 |
| 页面最大宽度 | `1180px` Home；`1480px` 其他 standalone | 让 desktop frame 与 mobile frame 同屏评审。 |
| 页面 padding | `28px` | standalone 页面外边距。 |
| Desktop shell 圆角 | `28px` | overview 评审 frame；standalone 页面本体铺满 viewport 时不额外加外框。 |
| Mobile shell 圆角 | `38px` | overview 评审 frame；standalone mobile 截图使用真实 `390x844` viewport。 |
| Shell 阴影 | `0 26px 80px rgba(0, 0, 0, 0.38)` | desktop/mobile frame。 |
| Mobile 宽度 | `390px` | phone shell 和截图 viewport 对齐。 |
| Desktop rail 宽度 | `220px` 一级；`210px` 二级 | 左侧导航宽度。 |
| Bottom nav item icon | `30px` | 移动端底部导航图标。 |
| Compact icon mark | `32px-44px` | provider、file、terminal、history 标记。 |
| Status pill | `999px` radius，`6px 8px` padding | running/waiting/idle 等状态。 |
| Row/card radius | `14px-22px` | 列表行、Project/Agent/Terminal card。 |
| Input drawer padding | `8px 9px calc(10px + env(safe-area-inset-bottom))` | 移动端 terminal 输入抽屉安全区。 |

## 导航规范

### 一级导航

- 一级页面包含 Projects、Sessions、Config、Help 等全局入口。
- 桌面端使用左侧一级导航 + 右侧工作区。
- 移动端使用底部一级导航 + 上方主工作区，参考微信一类移动应用的一级页面结构。
- 一级页面顶部只保留一句话级别上下文和必要低频操作，不堆叠大段说明。
- 一级导航 rail 使用 `220px` 宽度；active 项使用 `rgba(125, 211, 252, 0.12)` 背景和主文本色。

### 二级导航

- 进入 Project 后出现二级导航：Agent、Files、Git、Terminal。
- 桌面端使用左侧二级导航 + 右侧 Project 工作区。
- 移动端进入 Project 后，底部切换为二级导航，并在二级导航中提供返回一级页面的 Back 项。直接通过二级导航进入的 Agent、Files、Git、Terminal 页面不在左上角重复返回。
- 二级页面拥有自己的工作区布局，不需要继承一级页面的底部导航结构。
- 二级导航 rail 使用 `210px` 宽度；移动底部二级导航使用 5 列：Back、Agent、Files、Git、Terminal。

## 布局规范

- 桌面端优先使用左右结构，给工作区足够横向空间。
- 移动端带底部导航的页面统一使用三段式上下结构：`header` 置顶、`bottom nav` 置底、`content` 使用 `minmax(0, 1fr)` 撑满剩余空间；content 内部内容超出时只在 content 区域出现滚动条，页面 body、header 和 bottom nav 不参与滚动。从 Agent instance 等深层上下文打开的 Files/Terminal 属于上下文详情页，不显示底部二级导航，使用顶部返回回到来源。
- 页面外层使用大圆角深色面板，表达独立应用 shell。
- 卡片应服务可扫读性，不要为了展示 metadata 牺牲首屏密度。
- 历史记录这类辅助内容应轻量呈现，适合用表格行或列表行，而不是厚卡片堆叠。
- Standalone HTML 不再包含并排 desktop/mobile mockup，也不包含额外说明区域；每个页面只有一个响应式原型本体。
- Desktop/mobile 并排评审只发生在 `overview.html`：同一个 standalone HTML 被 `1440x1000` 与 `390x844` 两个 iframe viewport 包住，用于观察真实响应式变化。

## 响应式要求

| 场景 | 导航 | 内容滚动 / 安全区 | 输入职责 |
|---|---|---|---|
| Desktop 一级 | 左侧一级 rail + workspace | 工作区内部滚动，shell 保持左右结构 | 不显示 runtime input。 |
| Mobile 一级 | header + content + 底部一级 nav | 页面锁定 `100vh`；header 置顶、nav 置底、content 撑满中间，超出时 content 内部滚动 | 不显示 runtime input。 |
| Desktop Project 二级 | 左侧二级 rail + workspace | Files/Git/Terminal workspace 内部承担列表/详情布局 | Project workspace 不显示 runtime input。 |
| Mobile direct 二级 | header + content + 底部二级 nav 含 Back | 直接二级页不显示左上返回；页面锁定 `100vh`，content 超出时只在 content 区域滚动 | Agent/Terminal list 不显示 runtime input。 |
| Mobile deep/detail | 顶部返回，不显示底部二级 nav | 主内容拿到完整垂直空间，详情区可独立滚动 | Agent/Terminal instance detail 才显示输入抽屉。 |
| Mobile fixed input | 顶部返回 + 中部 terminal | 输入抽屉 padding 使用 `env(safe-area-inset-bottom)`，不能遮挡 scrollback | 输入只属于 runtime detail。 |

## 组件规范

- **Project 入口**：使用 Project 图标 + 项目名 + 简短路径/状态 + Open 行为，避免重复 metadata。Project card 使用 `grid-template-columns: auto minmax(0, 1fr) auto`，icon `42px`，card radius `20px`。
- **Agent 实例卡片**：展示 provider 图标、实例名称、当前任务摘要、运行状态、少量 metadata、最近输出摘要和操作入口。卡片 radius `22px`，provider mark `44px`，输出块使用等宽字体和 inset surface。
- **创建 Agent 实例**：在 Agent 页顶部提供 `+ Claude` / `+ Codex` 等 provider 入口；primary 创建按钮使用 accent 到 accent-2 gradient。
- **Files 二级页**：首版定位为只读浏览/预览，不提供新建、编辑、删除、上传或 Agent 关联。目录列表按文件夹优先 + 名称排序；预览类型覆盖文本/代码、图片和 HTML，其他二进制、大文件或未知类型展示轻量不可预览状态。直接从二级导航进入 Files 时，移动端顶部只显示当前路径，列表区域不重复路径说明，文件列表应比桌面更紧凑：小图标、短行高、少 padding，隐藏可由图标/文件名推断的右侧类型 metadata，底部保留带 Back 的二级导航；点击文件或文件夹后进入新的全屏详情页，不在列表下方堆叠 preview。如果从 Agent instance 打开 Files，则左上角显示返回按钮，底部不显示二级导航。文件夹行右侧用箭头表示可进入下级目录；进入文件 preview 后隐藏底部二级导航，只保留顶部返回和文件上下文。
- **Terminal 二级页**：参考 Agent 页的实例列表模型，展示多个 Terminal instance，支持进入、新建和关闭。移动端直接从二级导航进入 Terminal 时，不显示左上返回，底部保留带 Back 的二级导航；Terminal workspace 不出现 runtime input。
- **Git 二级页**：首版定位为只读 status/diff inspection，不提供 stage、commit、checkout、reset 或其他写操作。桌面端使用变更文件列表 + unified diff 预览结构；移动端直接从二级导航进入 Git 时，不显示左上返回，底部保留带 Back 的二级导航；变更文件列表应比桌面更紧凑，使用小状态标记、短行高、少 padding，并隐藏次要摘要。点击变更文件后进入新的全屏 diff 详情页，不在列表下方堆叠 diff；详情页隐藏底部二级导航，只保留顶部返回和文件 diff 上下文。
- **Terminal instance 详情**：参考 Agent instance 的 terminal-first 结构，桌面端保留 Project 二级导航 rail 和左上返回；顶部只保留实例身份与 Close，不展示无意义 live 状态，也不提供 Files/Git/Terminal 快捷入口。中间终端面板撑满剩余空间，底部输入抽屉承载 runtime input。
- **Session history**：使用图标 + 一句话摘要 + 相对时间，例如 `12 min ago`；未来用于恢复上下文和查看历史输出。
- **Agent session 详情**：从 Agent 二级页的实例进入后，桌面端仍保留 Project 二级导航 rail；顶部只保留实例身份和 Files/Git/+Terminal 快捷入口，不展示无意义的 live、Meta 或 Pause 状态。移动端作为深层详情页使用顶部返回，不显示底部二级导航；中间是可滚动、可输入的终端面板，底部输入抽屉可收起为快捷键栏，快捷键应围绕 `Shift+Tab`、`Esc`、`Ctrl+C`、方向键等真实终端操作。Files/Git 打开上下文详情页，`+ Terminal` 可立即新建 Terminal instance 并进入对应详情页。移动端 runtime header 的标题身份区必须可收缩，右侧快捷 action 使用内容自适应宽度并保持单行，不按图标按钮压成固定正方形。
- **底部导航项**：包含图标和短标签，当前项高亮，避免长文案。
- **返回按钮**：移动端直接二级页（Agent、Files、Git、Terminal）不在左上角放返回按钮；回到一级页面的动作放在底部二级导航的 Back 项。层层深入的详情页，例如 Agent instance detail、Terminal detail、文件 preview 或 diff detail，才在顶部保留返回。顶部返回按钮统一使用 `back-button` primitive：desktop `34px`、mobile `32px`，soft surface，不混用 accent mark 样式。详情页的 shell、header、head actions、identity mark、title、composer/input drawer 等跨页结构必须进入 `prototype-foundation.css`，页面文件只保留 terminal、preview、diff 等内容区特有组合。
- **Status pill**：状态语义必须有文字参与，不能只靠颜色。running/live 使用 green，waiting/needs input 使用 yellow，idle/paused 使用 soft gray，danger/close 使用 red 且克制。
- **Terminal/code panel**：terminal-first detail 中，terminal 区域必须撑满 header 和 composer 之间的剩余空间；滚动只发生在 terminal screen 内。terminal window 使用 `#05070b` 背景、`20px` radius、titlebar、window dots、等宽字体 `12px` / `1.65` line-height；移动端可降到 `11px` / `1.58`。快捷键使用简短内容型 pill，例如 `Shift+Tab`、`Esc`、`Ctrl+C`、`Ctrl+D`、`↑`、`↓`；移动端按内容自适应宽度并允许换行，不使用等分列。

## 配色规范

- 背景使用接近黑色的深色基底，并用轻微蓝紫径向光增强 console 氛围。
- 主文本使用高亮浅色，辅助文本使用低饱和灰蓝。
- 主要行动色使用蓝到紫的渐变。
- 运行成功/活跃状态使用绿色，等待/需要输入状态使用黄色，危险或关闭动作可使用红色但应克制。
- 边框使用低透明灰蓝，避免卡片之间过重分割。
- 状态表达不能只靠颜色，必须配合 pill、label 或文字。

## 间距与密度规范

- 桌面端可以使用更宽松的工作区间距，避免卡片和历史记录挤成一列。
- 移动端保持紧凑，避免顶部区域、说明文案和低频操作占据首屏。
- 卡片内部优先使用 `12px` 到 `16px` padding；大容器可以使用 `20px` 到 `28px`。
- 列表项之间保留明确间隔，但不要让 metadata 行过多导致内容下沉。
- 底部导航不通过覆盖内容实现，而是作为移动端 grid 的第三段固定在底部；content 区域不需要为 nav 额外堆大 padding。
- 固定输入抽屉使用 safe-area padding；带 bottom nav 的页面由三段式 grid 处理 safe area 和内容滚动边界。

## 公共 foundation 边界

- `prototype-foundation.css` 负责 token、reset、page/intro/stage、desktop/mobile shell、Project rail、nav item、bottom nav、status pill、terminal/code/input 等跨页面 primitive。
- Standalone HTML 负责页面特有结构和状态组合，例如 Home project card、Project Agent card、Files preview、Git diff、Terminal list、Agent Meta popover。
- 如果某个 class 在两个以上页面表达同一视觉角色，应优先移动到 foundation；如果它只表达单页状态，保留在 standalone HTML。
- 公共 foundation 不绑定 React app 组件，也不引入构建系统；它是长期 prototype 资产基础。

## 原型页面说明

- [home.html](./home.html) — 展示一级首页在桌面端左侧导航 + 工作区、移动端底部一级导航 + 工作区的布局；Project 列表引入图标，创建/采用入口降级为轻量按钮。
- [project-detail.html](./project-detail.html) — 展示进入 Project 后的 Agent 二级页：桌面端左侧二级导航，移动端底部二级导航含 Back 返回一级入口；工作区展示多个 Agent 实例、创建 Claude/Codex 入口和未来会话历史区域。
- [agent-session-detail.html](./agent-session-detail.html) — 展示从 Agent 实例列表进入后的 terminal-first Agent instance 详情页，包含可滚动/可输入终端、顶部 Files/Git 快捷入口、Meta 浮窗和移动端可收起输入抽屉。
- [terminal-instance-detail.html](./terminal-instance-detail.html) — 展示单个 Terminal instance 详情页，采用 terminal-first 输出与输入布局，但顶部不显示 Files/Git/Terminal 快捷入口。
- [files.html](./files.html) — 展示 Project Files 的只读浏览体验：standalone direct Files 页面在移动端只保留紧凑列表。
- [file-preview-detail.html](./file-preview-detail.html) — 展示从 Files 列表打开后的独立 file preview 详情页，移动端全屏显示且隐藏底部二级导航。
- [git.html](./git.html) — 展示 Project Git 的只读 status inspection 体验：standalone direct Git 页面在移动端只保留紧凑变更列表。
- [git-diff-detail.html](./git-diff-detail.html) — 展示从 Git 变更列表打开后的独立单文件 diff 详情页，移动端全屏显示且隐藏底部二级导航。
- [terminal.html](./terminal.html) — 展示 Terminal 二级页的实例列表体验：支持进入、新建、关闭 Terminal instance，并沿用带 Back 的移动端二级导航。
- [overview.html](./overview.html) — 按页面分组展示每个 standalone 页面的一组 desktop/mobile iframe，总览评审用，不作为正式截图来源。
- [prototype-foundation.css](./prototype-foundation.css) — 跨页面 prototype token 和 primitive 基础。

## 后续扩展约定

- Files、Git、Terminal 的二级页应沿用 Project 详情页的二级导航模型。
- Files/Git 可以复用图标体系和“资源列表 + 内容/详情”的工作区结构。
- Git 首版只承担只读 inspection：status、changed files、unified diff 和详情查看；写入类 Git 操作应等后续规格明确后再进入原型。
- Terminal 可以复用 Agent 页的实例/会话列表思路，但内容区应更强调实时输出和输入控制。
- 如果新增原型页面，应同步更新本文件的“原型页面说明”、`overview.html`、`screenshots/` 与本目录 `index.md`。
