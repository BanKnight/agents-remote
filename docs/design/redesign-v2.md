# UI v2 重构总纲（redesign-v2）

> UI v2 重构的**唯一总纲**：权威源声明、决策日志、铁律映射、现状盘点、里程碑计划。
> 长任务持久文档——所有阶段计划、待定项、里程碑状态在此滚动更新；plan/handoff 引用本文档章节号。
> 创建：2026-09-20（23 问决策拍板后沉淀）。权威源变更、决策增补、里程碑状态更新直接改本文件。

## §1 权威源声明

| 权威物 | 职责 | 使用方式 |
| --- | --- | --- |
| `docs/design/design_spec.md` | 规格、九条铁律、IA 总览、逐页说明、§8 数据模型、§9 验收清单 | 行为/结构争议以此为准 |
| `docs/design/tokens.json` | **唯一数值源**（color/radius/space/typography/icon/component 七组） | `$value` = 浅色，`$extensions["mode.dark"]` = 深色；语义名两态一致；**禁止散落 HEX** |
| `docs/design/assets/components.css` | 共享组件**单源参考实现**（.stage/.nav/.row2/.pill/.chips/.stream/.tray/.input/.tabbar/.sheet/.side/.pane/.seg4/.tree/.dcode 等） | 直接沿用类名与结构，不另造平行组件 |
| `docs/design/index.html` + 54 页原型 | 像素级视觉标准（舞台图 + 编号说明面板） | 每页 HTML 本身即视觉标尺 |
| `docs/design/assets/theme.js` | 双主题运行时（`data-theme` 切换；URL `?theme=` / localStorage `adr-theme` / postMessage 三通道） | Web 实现采用同款 `data-theme` 机制 |

- v1 设计体系（深色 Server Agent Console、`#7dd3fc` primary、Geist Variable）已**整体归档**至 `docs/design-v1/`；其**非视觉机制结论**（message-replay 进程模型、session 数据边界、协议设计）仍然有效，引用时注意区分。
- 治理模式沿用 v1 确立的原则：唯一标尺、token 唯一数值源、禁散写、组件单源——权威物从 DESIGN.md 换为设计包三件套。

## §2 决策日志（23 问拍板 + 补充拍板，2026-09-20）

| # | 决策 | 结论 | 来源 |
| --- | --- | --- | --- |
| D1 | 迁移方式 | **全新 UI 层重写**（非渐进改造），多里程碑推进，每里程碑确保完成 + 过 review；顺序 = token 化/组件化 → IA 骨架 → 主页对齐 | 用户 |
| D2 | 旧设计体系 | 全部归档（`docs/design-v1/`）；新设计以最新设计图为准 | 用户 |
| D3 | 多端形态 | Web 本身即响应式多端，iPhone/iPad/Mac = 同一实现的三档响应式呈现（非三个独立 app） | 用户 |
| D4 | 作用域语义 | 项目 ⇄ 全部为**查询参数**（`?scope=`），核心组件单例两种呈现；工作台 Tab = `/` 渲染上次项目，记忆存 **localStorage**（与上次实例/工具面板同层） | Claude 拍板（用户授权按最佳实践） |
| D5 | 功能视图切换 | 文件/插件/设置切换 = **同 layout 子路由 + 主区替换**，零销毁会话（现有 workbench pathless layout 保活机制复用） | Claude 拍板 |
| D6 | Chat (Pi) 归位 | 归属特殊项目 **`default`**（项目实例体系内）；不再有独立全局 `/chat` 入口 | 用户 |
| D7 | Instance 实体 | **不引入新实体层**——现有 session 升格语义：closed 状态 + 恢复复用同 id（理由：现有 close/resume 机制已满足 spec §8 Instance 语义，避免 api 数据模型大改） | Claude 拍板（最佳实践） |
| D8 | 审批中心聚合 | **服务端聚合**（api 新增跨会话审批注册表 + WS 推送）；批量允许 = 逐个转发允许确认；理由：客户端多连 WS 移动端不可靠 | Claude 拍板 |
| D9 | 文件移动 | 「移动到…」用 **rename 带路径** 实现（复用现有 rename 端点） | Claude 拍板 |
| D10 | 全局文件写边界 | PROJECTS_ROOT **不能逃逸**；规则范围内可写（全局文件 Tab 的结构操作在安全边界内开放） | 用户 |
| D11 | 采用项目 | **目录自动出现**（PROJECTS_ROOT 下目录即项目，projectService 自动发现） | 用户（Q12「自动」） |
| D12 | Git ✦ 来源标注 | commit ↔ 会话关联**暂不做**（从里程碑移除，数据面未定） | 用户（Q13 待定） |
| D13 | Wiki「让 Agent 读这篇」 | 注入协议**待定**（M4 留白：stdin 指令 vs attachment 待调研） | 用户（Q14 待定） |
| D14 | 全局活动行摘要 | 用**现有 subtitle**（lastCommand/lastAssistantMessage），不做「第 N 轮」结构化摘要 | 用户（Q16） |
| D15 | 字体 | 移除 Geist Variable 捆绑，切**系统字体栈**（设计铁律：禁捆绑字体） | 用户（Q19 确认） |
| D16 | 图标 | 按 **components.css 原型内嵌 SVG path** 为基准移植（SF Symbols rounded 风格，24 网格 2px 圆头描边），新增约 10+ 个全量重绘 | 用户（Q18 确认） |
| D17 | 舞台尺寸折算 | Tab Bar 等按**真机惯例**（49pt + safe-area），非设计示意 100px；舞台 390×844 作对齐基准 | 用户（Q21） |
| D18 | 双主题 | 浅色/深色**全程成立**（硬约束）；现有 light tokens 整体废弃重写；PWA theme_color 安装定格 = 平台已知限制（已关闭） | 用户（Q20/Q8） |
| D19 | iPad/Mac 优先级 | iPhone + 桌面先落，iPad/Mac 后补但**纳入里程碑顺序**（M9） | 用户（Q22/Q23） |
| D20 | e2e 时机 | 完成所有里程碑后跑**新 e2e**，用户再做总验证（期间每里程碑 reviewer + 四门禁） | 用户（Q17） |
| D21 | 设置入口 | 移动设置挪进项目 Tab ⚙（4 Tab = 项目/工作台/文件/插件）；桌面 Sidebar footnav | 设计包 v1.3 |
| D22 | 会话历史过滤 | 无归档功能（spec §4.2 为准；03n 原型「已归档」过滤为包内矛盾，已与产品确认） | 已确认 |
| D23 | 审批范围 | 现状仅单会话 tray（collectPendingApprovals）→ v2 建跨会话聚合审批中心（见 D8） | Claude 拍板 |

## §3 九条铁律实现映射

| # | 设计包铁律 | Web 实现机制 |
| --- | --- | --- |
| 1 | 导航深度 ≤3 层 | 路由层级：L1 Tab → L2 项目/工作台 push → L3 详情；TanStack Router 层级约束 |
| 2 | 运行状态永不销毁 | workbench **pathless layout** 保活（跨 scope 零销毁）；功能视图切换走子路由（D5） |
| 3 | 核心组件单例两种呈现 | 数据层唯一，scope = **查询参数**（D4）；项目/全局工作台同一组件树 |
| 4 | Tab = 平级目的地 | 4 Tab 互相平级不嵌套；工作台 Tab 直达上次项目（D4） |
| 5 | 三端同名同图标只换容器 | 响应式三档（D3）共用组件，只换布局容器（.stage/.stagewin/分栏） |
| 6 | 工作台常驻 ≤3 行 | 行1 导航 / 行2 实例+工具三件套 / 行3 运行摘要；其余进浮层 |
| 7 | 只读/运行边界 | 结构操作归 UI（rename/delete/mkdir/upload），内容编辑归 Agent；Git/Wiki 只读 |
| 8 | 双主题全程成立 | `data-theme` 机制（theme.js 同款）；语义 token 两态一致；每个组件浅深两态同验 |
| 9 | Apple HIG | 系统字体栈（D15）、SF Symbols 风格图标（D16）、系统色、真机尺寸惯例（D17） |

## §4 现状能力盘点（2026-09-20）

**已有可复用**：五类实例（claude/codex/omp agent + tmux 终端 + Pi chat）；单密码 + HMAC token 认证（30 天 TTL 50% 刷新）；pinned 置顶；claude-auto-retry；文件结构操作（rename/save/delete/mkdir/upload/preview）；Git 只读全套（diff/history/branches）；Wiki；技能 + MCP 管理与市场；`/api/overview` + subtitles 聚合；单会话审批 tray；workbench pathless 保活；移动两层导航 + 桌面三栏。

**缺失（补齐项）**：跨会话审批中心（M5）；全局活动流形态（M3）；文件搜索（M8）；移动到（M8，D9 rename 实现）；上传队列 + 冲突三选（M8）；拖拽上传（M8/M9）；采用项目自动发现（M8，D11）；全局文件写边界放开（M8，D10）；子 agent 概览条（M8）；iPad 三栏（M9）；Mac 分屏 + Inspector + 状态栏审批 + ⌘ 快捷键（M9）。

**系统性冲突（换代项）**：token 整套换代（v1 sky-300 体系 → Apple 系统色双主题）；IA 重排（移动 4 Tab 重构 + ActivityBar→Sidebar）；深度模型（中栏多 tab → L1→L2→L3 + 工具原位高亮）；Geist→系统字体；图标全量重绘；浅色主题整体重写。

## §5 现状锚点（关键代码位置）

| 文件 | 内容 |
| --- | --- |
| `web/src/routes/router.tsx` | 全部路由；workbenchLayoutRoute（pathless 保活）；projectScope/projectFocus/globalScope |
| `web/src/routes/claude-adapter.ts` | WS 适配器；`collectPendingApprovals`（单会话审批，M5 改造点） |
| `web/src/routes/workbench-model.ts` | jotai atoms；`atomWithLocalOnlyStorage`（localStorage 持久化范式，D4 用） |
| `web/src/components/shell/mobile-primary-nav.tsx` | 现移动底部 nav（项目/文件/插件/设置 → v2 重排为 D21） |
| `web/src/components/shell/activity-bar.tsx` | 桌面 ActivityBar（v2 换 Sidebar） |
| `web/src/styles/index.css` | v1 token 物化（@theme inline + shadcn vars）；M1 换底改造点 |
| `api/src/index.ts` | api 路由分发（auth/overview/projects/files/git/wiki/session-stream） |
| `api/src/session-routes.ts` | agent/terminal sessions CRUD、close/rename/auto-retry、双路历史合流 |
| `api/src/agent-provider-profiles.ts` | claude(90)/codex(103)/omp(120) profiles；CLAUDE_PERMISSION_MODES |
| `api/src/auth.ts` | 单密码 + HMAC token（TokenTtl 30d，REFRESH_THRESHOLD_RATIO 0.5） |
| `api/src/state-routes.ts` | pinned-sessions（overview.pinnedSessions read-modify-write） |
| `api/src/claude-stream.ts` + `session-relay.ts` | relay 双缓冲（history+live）；M5 审批推送参考 |
| `packages/shared/src/index.ts` | 协议类型单源 |
| `scripts/ar-verify-css.mjs` | CSS 落盘硬闸（M0 机检脚本的形态参考） |

## §6 里程碑计划

> 节奏：每里程碑 reviewer 审查（触发表见 rules/agent-workflow.md）+ 四门禁全绿 + CSS 落盘硬闸；状态列滚动更新。

| # | 里程碑 | 范围 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| M0 | 设计基座 | ①v1→v2 token 映射表（§附录）②`scripts/ar-verify-tokens.mjs` 散落 HEX 机检（先报告后收紧）③e2e 基线跑绿记录 | 映射表全覆盖；脚本可跑；基线记录在案 | ✅ 2026-09-20：映射表（附录）+ 机检脚本（report 模式基线：HEX 15 处/裸色阶 0 处，全部为已知 M1 处理项——theme_color 2、氛围光 4、ANSI 深档表 9；`--strict` 收紧留 M1 后）；e2e 基线 **29/29 绿**（systemd-run cgroup 2G，3.3m） |
| M1 | 组件化层 | tokens.css 语义变量做 `@theme inline` 新基座（shadcn vars 对齐新语义名）；components.css 原语重建（pill/chip/sheet/seg4/side/pane…）；30+ 图标内嵌 path 移植注册；`data-theme` 双主题机制；移除 Geist | 双主题全成立；门禁全绿；design-reviewer 过 | ⬜ |
| M2 | IA 骨架 | 移动 4 Tab（D21）+ 桌面 Sidebar；L0 登录页；深度模型 L1→L2→L3；工作台 3 行骨架；`/`=上次项目（D4） | 路由切换零会话销毁；门禁全绿 | ⬜ |
| M3 | 主页对齐 | 项目 Tab（Large title+搜索+活动卡+审批入口+置顶紫标）+ 工作台逐状态（agent/idle/error/offline/terminal/chat） | 对照 02/03 系列逐页；design-reviewer 过 | ⬜ |
| M4 | 工具与深度页 | Git/文件/Wiki 原位高亮切换；L3 详情（preview/diff/wiki reader/git history/commit/branches）；Wiki 注入协议落地（D13） | 只读边界成立 | ⬜ |
| M5 | 浮层与审批 | sheet/popover 体系；审批中心服务端聚合（D8/D23） | security-reviewer 必过 | ⬜ |
| M6 | 插件与市场 | 插件 Tab（作用域分段+MCP 组+技能+市场四页） | 对照 09/12/13/14/15/16/17/18 | ⬜ |
| M7 | 设置与登录 | 设置页（通用/Runtime/自动重试/服务器/退出）；登录完整态 | 对照 06/07 | ⬜ |
| M8 | 缺口功能 | 文件搜索/移动到/上传冲突三选/拖拽上传/采用项目自动/全局文件写边界/子 agent 概览条 | security-reviewer 必过 | ⬜ |
| M9 | 多端 | iPad 三栏；Mac 分屏+Inspector+状态栏审批+⌘ 快捷键；触屏/hover 正交 | 细节先与用户确认（§7） | ⬜ |
| M10 | 总验收 | 新 e2e 全套 + spec §9 验收清单逐项机检 | **用户总验证通过** | ⬜ |

## §7 待定项跟踪

| 项 | 决策点 | 摊牌时点 |
| --- | --- | --- |
| Wiki「让 Agent 读这篇」注入协议 | stdin 指令 vs attachment/引用卡；引用卡状态归属（客户端 state vs 服务端 session 元数据） | M4 开工前 |
| iPad 三栏细节 | 断点值（1180×820 基准）、Sidebar/中/右宽度分配 | M9 开工前与用户确认 |
| Mac 专属件取舍 | 分屏多窗格保留度、Inspector 形态、快捷键全集 | M9 开工前与用户确认 |
| Git ✦ 来源标注 | 关联数据面（会话提交映射表 vs commit message heuristic） | 暂不做（D12），重开需用户发起 |

## 附录：v1→v2 token 映射表（M0 交付，M1 施工图）

> v2 CSS 变量命名以设计包 `assets/tokens.css` 为准（kebab-case 直译 tokens.json）。
> **主题机制变更**：v1 = `:root`(light) + `<html class="dark">` 覆盖；v2 = `:root`(**dark 基准**，产品主主题) + `html[data-theme="light"]` 覆盖。shadcn `.dark` 选择器、`@custom-variant dark` 同步改属性选择器。

### 颜色映射（v1 var → v2 var）

| v1 | v2（--var，两态值见 tokens.css） | 说明 |
| --- | --- | --- |
| `--primary` | `--c-primary` | 品牌主色换代（sky → Apple 蓝） |
| `--on-primary` | `--on-accent` | 实心主色钮文字 |
| `--secondary`（violet 品牌色） | **废除**；紫语义归 `--c-pin` | v2 无 secondary；紫 = 置顶/引用/思考标记 |
| `--surface-base` | `--bg-base` | 页面分组底 |
| `--surface` | `--bg-canvas` | 工作区/输出流底 |
| `--surface-raised` | `--bg-elevated` | 卡片/列表/sheet |
| `--surface-inset` | `--bg-elevated2` | 嵌套卡/chips/表单字段 |
| （无） | `--bg-elevated3` `--bg-tabbar` `--bg-sidebar` `--bg-inspector` `--bg-tabstrip` `--menu` | 新增：v2 材质分层（分段容器/Tab Bar/Sidebar/Inspector/tab 条/菜单） |
| `--bg-base` + `--bg-glow`（radial 氛围光） | **废除渐变**，`--bg-base` 纯色平铺 | Apple 风无氛围光 |
| `--on-surface` | `--ink-1` | 一级正文 |
| `--on-surface-soft` | `--ink-1`（弱化场景直接用 `--ink-2`） | v2 三档墨色收敛 |
| `--on-surface-muted` | `--ink-2` | 辅助/未激活/占位 |
| （无） | `--ink-title` `--ink-3` | 新增：大标题 / 极弱提示 |
| `--neutral-line` | `--sep` | 通用发丝描边 |
| （无） | `--sep-strong` `--sep-row` | 新增：强分隔/输入描边、行内分隔 |
| （v1 搜索框用 surface-inset） | `--fill-search` `--fill-segmented` `--segmented-thumb` `--fill-selected` | 新增：填充式输入/分段滑块/Sidebar 选中 |
| `--code-text` / `--code-muted` | `--ink-1` / `--ink-2` on `--bg-codeblock` | v2 代码块 = 底 token + 墨色 |
| `--success` `--warning` `--error` | `--c-success` `--c-warning` `--c-danger` | 浅底文字用 `--c-success-text` `--c-warning-text` |
| `--on-error` | **废除**（danger 实心钮白字沿用 `--on-accent`） | |
| `--assistant` `--assistant-soft` `--assistant-deep` | **废除** | v2 消息流中性墨色；思考/Agent 引用 = `--c-pin` |
| `--user` `--user-soft` `--user-deep` | **废除**（用户消息衬底按原型用 `--fill-selected`/`--tint-blue`） | |
| `--permission` `--permission-soft` | **废除**；审批衬底 = `--tint-orange` | |
| （无） | `--tint-blue` `--tint-green` `--tint-orange` `--tint-purple` `--tint-red` `--tint-diff-green` `--scrim` `--home-indicator` `--seg-track` `--seg-thumb` | 新增：彩色衬底体系 + 浮层压暗 + Home 指示条 + 分段控件 |
| `--terminal-*`（ANSI 16 色） | **保留独立体系**（设计包缺口，xterm 需 16 色）；M1 按双主题校准 | 实现侧补充，不入 tokens.json |
| `--hover-overlay` `--active-overlay` `--shimmer-*` `--scrollbar-thumb*` | 保留实现侧补充（去品牌色相，灰阶化） | |

### Radius / 字体 / 间距

| 类别 | v1 | v2 | M1 动作 |
| --- | --- | --- | --- |
| radius | `--radius` 10px 衍生 sm6/md10/lg14/xl20/2xl24 + shell-28/38 | 语义档：input 12 / segmented 10 / segmentedThumb 8 / menu 14 / card 16 / sheet 20 / pill 999；bezel/screen 48/42 为设计轨示意**不入实现** | 重定义 Tailwind 档：`--radius-sm`=8 `--radius-md`=10 `--radius-lg`=12 `--radius-xl`=16 `--radius-2xl`=20，移除 3xl 与 `--radius-shell-*` |
| 字体 | Geist Variable（@fontsource-variable/geist）| `typography.web-stack`：system-ui, -apple-system, 'SF Pro Text', 'PingFang SC', Roboto, 'Noto Sans SC', 'Microsoft YaHei', sans-serif | 移除依赖 + `--font-sans` 换栈（D15） |
| mono | SFMono-Regular, Consolas, Liberation | `mono-stack`：ui-monospace, 'SF Mono', 'Cascadia Mono', Consolas, monospace | `--font-mono` 换栈 |
| 字号档 | Tailwind 默认 + 自定义 | large-title 30/800、title 17/600-700、body 16、callout 15、subhead 14、footnote 13、caption 12、micro 10.5 | 落 `--text-*` 语义档（text-title/text-callout/…），行高 UI 1.4 / 正文 2.0 |
| 间距 | Tailwind 默认 | screenEdge 20 / cardGap 12 / rowGap 8 / rowHeight 44 / inputHeight 40 | 前三个 = Tailwind p-5/gap-3/gap-2 消费；rowHeight/inputHeight 为组件常量 |
| 组件尺寸 | 各组件散定 | tabBarHeight 100（示意）→ 真机 49pt+safe-area（D17）；workspaceRow2 30、approvalTray 52、inputBar 40、instancePill 30、sidebarRow 34 | M1 起组件常量；stage* 三档为设计轨专用不入实现 |
| 断点 | `--breakpoint-sm` 1024 | 维持移动/桌面两档 | M9 增 iPad 中间档（与用户确认） |

### shadcn vars 重绑（M1）

`--background`→`--bg-base`；`--card`/`--popover`→`--bg-elevated`；`--primary`→`--c-primary`；`--border`/`--input`→`--sep`；`--ring`→`--c-primary`；`--destructive`→`--c-danger`；`--muted`/`--accent`→`--bg-elevated2`；`--sidebar*`→`--bg-sidebar` 系。`--chart-*` 保留（业务零消费）。

### 主题切换机制（M1）

- `<html>` 挂 `data-theme="light" | "dark"`（缺省 = dark 基准）；读取顺序沿用 theme.js 三通道（URL `?theme=` → localStorage `adr-theme` → 系统偏好）。
- `@custom-variant dark` 改 `(&:where(html:not([data-theme="light"]) *))`（或按 light 正向），shadcn `.dark {}` 块改 `html[data-theme="light"] {}` 覆盖块（基准反转）。
- PWA `theme_color` 安装定格 = 已知限制（D18，不处理）。
