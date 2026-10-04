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
| M0 | 设计基座 | ①v1→v2 token 映射表（§附录）②`scripts/ar-verify-tokens.mjs` 散落 HEX 机检（先报告后收紧）③e2e 基线跑绿记录 | 映射表全覆盖；脚本可跑；基线记录在案 | ✅ 2026-09-20：映射表（附录）+ 机检脚本（report 模式基线：HEX 15 处/裸色阶 0 处，全部为已知 M1 处理项——theme_color 2、氛围光 4、ANSI 深档表 9；`--strict` 收紧留 M1 后）；e2e 基线 **29/29 绿**（systemd-run cgroup 2G，3.3m）。**code-reviewer 通过**，4 项加固已修（side 变体漏报 border-x-*/divide-y-*/ring-offset-*、白名单前缀 sep 守卫、symlink/无权限目录防护、cwd 锚定脚本自身）；M1 收紧清单：white/black 色阶 + 行尾注释内 HEX |
| M1 | 组件化层 | tokens.css 语义变量做 `@theme inline` 新基座（shadcn vars 对齐新语义名）；components.css 原语重建（pill/chip/sheet/seg4/side/pane…）；30+ 图标内嵌 path 移植注册；`data-theme` 双主题机制；移除 Geist | 双主题全成立；门禁全绿；design-reviewer 过 | ✅ 2026-09-20：①`index.css` 重写 = v2 token 底座（`:root` dark 基准 + `data-theme="light"` 覆盖 + shadcn 单份映射 + v1 桥接 ~250 处旧 utility 零改动换新外观）②`v2-primitives.css` 新建（components.css 原语 1:1，`@layer components`；`.grow`→`.growrow` 避让 Tailwind utility）③29 图标重绘（20 中心坐标系 viewBox=-10 -10 20 20 + `data-symbol` SF Symbols 命名锚点；anthropic/openai 品牌 fill logo 例外保留）④双主题机制（theme.ts `applyResolvedTheme` 双轨：data-theme + .dark class；FOUC inline script；Geist 移除→系统字体栈）⑤偏离记档 3 条 + 对比度已知限制（附录「主题切换机制」节）。验证：探针 61/61（token 两态/桥接换值/双轨/FOUC/实时切换）；机检 HEX 11 < 基线 15；e2e 29/29；**design-reviewer 复审通过**（首轮 2 高 2 中 4 低全修复） |
| M2 | IA 骨架 | 移动 4 Tab（D21）+ 桌面 Sidebar；L0 登录页；深度模型 L1→L2→L3；工作台 3 行骨架；`/`=上次项目（D4） | 路由切换零会话销毁；门禁全绿 | ✅ 2026-09-20：①移动 4 Tab（`mobile-primary-nav.tsx`：项目/工作台/文件/插件；[设置] 自底 nav 移除，D21 移到项目页 ⚙ push——M7；`/settings` 路由保留深度链接不破）②桌面 Sidebar 换代（`sidebar.tsx` 新建，ActivityBar 48px 图标条 → 250px 竖排列表；与移动 4 Tab 同构：同 label 键 + 同图标语义 + 同 active 判定；`workbench-shell.tsx` prop `activityBar`→`sidebar`，`SIDEBAR_WIDTH = "250px"` 对齐 `05-mac-workspace.html` `.side{width:250px}`；`activity-bar.tsx` + 其测试 `git rm`——我的改动造成的零消费孤儿）③L0 登录页对齐 `06-login.html`（logo 徽章 72×72/圆角 18/主色底/`size-10` on-accent 图标、品牌名 22px bold、tagline footnote、服务器 field `h-11 rounded-xl` 等宽 + ›、密码 field、胶囊钮 `h-[46px] rounded-full`、hint、底部语言条 + PWA 提示仅非 standalone）④深度模型 L1→L2→L3 判定现有路由树已满足（pathless layout + `/projects/$key` push + 工具子路由），未新增路由 ⑤工作台 3 行骨架**有意留 M3** ⑥D4「直达上次位置」（`/` = beforeLoad 跳板读 `workbench.lastProjectKey` → replace 跳 `/projects/$key` 或 `/projects`；`WorkbenchRoute` project scope effect 写入；try/catch + 类型守卫 + `replace: true` 防历史污染）。**e2e 基线修复**：登录文案改版（`Unlock console`→`Sign in`）+ D21 IA 变更破 100% 旧断言（29/29 全红）—— 按 memory「基线 harness 必须绿」不等 M10 修，当场适配 21 处按钮定位器 + `mobile-nav.spec` 重写 v2 IA + `middle-tab-left.spec` 活动栏 [会话]→[项目] + 探针登录文案，**恢复 29/29 绿**。验证：探针 20/20（IA 骨架）+ 61/61（双主题无回归）；四门禁全绿（api 781 / shared 9 / web 670，web −3 = 删 activity-bar.test）；CSS 落盘硬闸过；token 机检 HEX 11 无新增 |
| M3 | 主页对齐 | 项目 Tab（Large title+搜索+活动卡+审批入口+置顶紫标）+ 工作台逐状态（agent/idle/error/offline/terminal/chat） | 对照 02/03 系列逐页；design-reviewer 过 | ✅ 2026-09-21：a–d 全部完成，详记 §6.1「M3 收口补记」 |
| M4 | 工具与深度页 | Git/文件/Wiki 原位高亮切换；L3 详情（preview/diff/wiki reader/git history/commit/branches）；Wiki 注入协议落地（D13） | 只读边界成立 | ✅ 2026-09-21（`1891a43`）：详记 §6.2 开工摊牌 + §6.3 收口补记；探针 41/41；design-reviewer 修复后通过 |
| M5 | 浮层与审批 | sheet/popover 体系；审批中心服务端聚合（D8/D23） | security-reviewer 必过 | ✅ 2026-09-21（`1814270`）：详记 §6.4 开工摊牌 + §6.5 收口补记；探针 45+26；三份 reviewer 均修复后通过（security 五红线全过） |
| M6 | 插件与市场 | 插件 Tab（作用域分段+MCP 组+技能+市场四页） | 对照 09/12/13/14/15/16/17/18 | ⬜（进行中） |
| M7 | 设置与登录 | 设置页（通用/Runtime/自动重试/服务器/退出）；登录完整态 | 对照 06/07 | ⬜ |
| M8 | 缺口功能 | 文件搜索/移动到/上传冲突三选/拖拽上传/采用项目自动/全局文件写边界/子 agent 概览条 | security-reviewer 必过 | ⬜ |
| M9 | 多端 | iPad 三栏；Mac 分屏+Inspector+状态栏审批+⌘ 快捷键；触屏/hover 正交 | 细节先与用户确认（§7） | ⬜ |
| M10 | 总验收 | 新 e2e 全套 + spec §9 验收清单逐项机检 | **用户总验证通过** | ⬜ |

## §6.1 M3 收口补记（2026-09-21）

**落地（a–d）**：

- **M3-a 项目 Tab**（`mobile-projects-home.tsx` 新建）：Large title h1 30px/800 + ➕（home.createProjectAria）/⚙（nav.settings）22px 图标组（02 原型 .h-row）；搜索框过滤；全局活动摘要卡；项目卡（置顶紫标 tint-purple + Idle 状态点 + 活动副标题）；⚙ push `/settings`。探针 `probe-mobile-projects-home.mjs` 23 断言。
- **M3-b 工作台 3 行骨架**（`mobile-project-header.tsx` 新建 + `mobile-workbench.tsx` 重构）：nav 行（恒显 ‹ back + 标题 + ℹ✕ focusActions）；row2（项目工具 ticon ×3 原位高亮 + ＋ 新建菜单 + pills 实例带）；chips 运行摘要行（agent = dot + 摘要 + 自动重试 chip；terminal = `tmux · 名` mono chip）。删除 `mobile-tab-strip.tsx` / `mobile-project-drawer.tsx`（浏览态 grid 一并删除——v2 IA 裁决）。探针 `probe-mobile-project-header.mjs` 21 断言。
- **M3-c 工作台逐状态**：03h 空态卡（`EmptyProjectState`：图标容器 64×64 + h2 16/600 + CTA 200×40 胶囊 + 工具引导 link）；浏览态自动聚焦（`effectiveFocusId = focusId ?? autoFocusId`：layout 上次 activeTab → 回退 instances[0]；**renderItems 注入临时投影**不写 layout——显式点 pill 才由 WorkbenchRoute focus effect ensure 入，不写 URL 防 back 循环）；file/git focus ✕（`removeTabFromLeaf` + navigate 回浏览态）；03i OfflineBanner v2 化（`warning-triangle` 图标新增）；03f terminal chips。探针 `probe-mobile-workbench-states.mjs` 24 断言。
- **M3-d 流内容**（turn 终态四件套 + tray）：.count（`RetryIndicator` 迁流顶 = 03d 编号②位置；**取消/立即重试按钮不画**——服务端无控制端点，用户插话即隐式取消注入）；.done/.stat（`TurnStatsFooter`：completed → 绿横幅 ✓ + 状态词 + 统计 + .tm 时长；其余 tone → 中性统计行，错误细节归 errcard）；.errcard（`ApiErrorRow`：tint-red 卡 + e1 mono 红行 + 折叠展开详情保留，原型 e2 静态建议文案无数据来源不画）；.cap（`VirtualizedThreadContent` 新 prop `offlineCap`：断线且已有内容时流末「—— 离线中 · 此后内容将在重连后补齐 ——」）；.tray（`ApprovalTray`：tint-orange + .w 警示行 + .c mono 摘要 + btn ghost/ok——03/04/05 三端同源）。流原语 `.done/.errcard/.count/.cap` 随落地移植进 `v2-primitives.css`（03c/03d/03i「仅本页样式」入单源）。i18n：`claude.retry.countTitle/countSchedule`（替孤儿 bannerMulti/bannerSingle）+ `claude.offlineCap`。

**范围裁决（记档）**：

1. **「气泡流 → 卡片流」是架构级范式差异，留专项裁决**：03 原型流 = 无大气泡的卡片流（.plain 平文 + 独立 .card）；现有 = assistant 大气泡包工具卡（`CollapsibleSection` 无框内嵌设计）。工具卡 .card 化 + composer .input 化牵动 tool-ui-registry 30+ 渲染器、virtualizer 测量、assistant-ui 集成与权限流——不在 M3-d 样式壳内强行重排；开工前需 perf-reviewer（virtualizer 测量变化）+ design-reviewer 联审。**M3-d 已落地的是 turn 终态四件套 + .tray（均为 bubble 外流级元素，无范式冲突）**。
2. 03d .count 无取消/立即重试（无服务端控制端点，能力边界；若后续做，归 M8 服务端加端点）；03g chat 不进项目工作台（chat 是全局会话走 `/chat` 独立路由，记档不实现）；03f tmux chip 无 ▾（1:1 绑定无切换能力）；OfflineBanner = `navigator.onLine` 全局近似，session WS 断线由 panel 内 .cap + composer 禁用呈现（两层语义分层）。
3. 工作台过渡期交互缺口（有意留后续里程碑）：sw▾/⋯ 菜单留 M5（sheet 体系）；pill 长按菜单留 M5；tab 最小化入口过渡期缺失（file/git 靠 ✕ 关闭、session 靠 pills 切换）；恒显 back 是 v2 拍板（push 态语义，03c 编号④「Tab 直达无返回键」的例外留待真机验证反馈）。
4. **design-reviewer M3-c 审查 = 修复后通过**：[高]#1 注入 ref 兜底 focusRef（修骨架双渲染 + 回退态 chips/ℹ✕ 全缺——`findTabRefLeaf` 失败时落 `renderItems` 投影）+ [中]#2 isLoading 骨架（空态卡不再与 pills 同屏闪）+ [中]#3 rounded-xl（card 档 16px）+ [低]#4 OfflineBanner safe-area + [低]#5 `useCreateSessionMenuItems` 单一装配收口 已修；[低]#6 图标 path 与 D16 原型基准偏差（rotate 24 网格 vs 20 网格、warning-triangle 缩放）留图标统一重绘批次。
5. **e2e 基线适配**（当场修，不等 M10）：`mobile-nav.spec` landing 断言 v1 mode-tabs → v2 项目 Tab（h1 + ➕ + ⚙）；`acp-session.spec` 项目行按钮去掉 `exact`（label = 名称 + 活动副标题）。

**验证**：探针 23 + 21 + 24 全绿；四门禁全绿（web 670 pass）；CSS 落盘硬闸过；token 机检基线内无新增；e2e 29/29。

## §6.2 M4 开工摊牌（2026-09-21）

M4 开工前三项裁决，基于原型（03m/03o/03p/03q/03r/03s/03t/03u/03v/03w）与现状盘点逐条对齐后拍板：

1. **「气泡流 → 卡片流」范式专项与 M4 无交集，推迟到真正触达会话流工具卡的批次**（§6.1 裁决 1 的落定）：M4 的三工具态是「工具面板替换流区」（frow/crow/tgrp/wpg 纯列表行，与 M3 流级元素同族），L3 详情页是独立 push 页（列表 + 代码块 + 文章）——两者都不触碰 agent 会话流内的工具卡渲染（tool-ui-registry）。专项摊牌时点顺延至会话流工具卡形态收敛专项（perf-reviewer + design-reviewer 联审不变）。
2. **D13 Wiki 注入协议拍板**（spec §5.5「引用卡可移除」为关键输入）：
   - **注入机制 = stdin prompt**：readbtn「✦ 让 Agent 读这篇」→ ActionMenu 选会话 → 以用户身份向该会话发送结构化 prompt（wiki 页标题 + 全文 markdown）——JSONL 有真实记录、跨会话类型统一（claude stdin 直写 / acp·pi 各自 send 路径均已存在）、服务端零改动。
   - **引用状态 = 客户端 per-session atom**（localStorage 持久化，`wikiRefs[projectName][sessionId]`）：驱动 ①流顶引用卡（可移除，spec 明确）②wiki 面板 refnote「正在引用此页」（同浏览器读同项目全部会话的引用 atom）。服务端不加元数据端点；跨设备一致性弱是 v1 明示取舍，服务端元数据化归 M8 缺口功能批次再议。
3. **L3 详情页路由形态**：file/git 详情复用现有 splat 路由 URL（`/projects/$key/file/$`、`/projects/$key/git/$`），仍写 layout（「打开过」记录，桌面中栏 tab 语义不变）；移动端渲染层把 focus 呈现收敛为 L3 顶部返回式——back 显示来源名（03q「src/auth」/ 03r「Git 检视」），back 动作 = removeTabFromLeaf + navigate 回工具态（替代 M3-c 的 ✕ 唯一关闭路径）。新增三个显式子路由（优先于 `git/$` splat）：`git/history`（03t）、`git/branches`（03v）、`git/commit/$`（03u）→ focusId `githistory` / `gitbranches` / `gitcommit_<hash>`，**不写 layout**（纯列表/详情页廉价重建，不进保活层、不污染布局 ref 类型）；桌面不生成这些 URL（入口仅移动端），focus effect 对这三种 focusId 直接跳过。
4. **范围与能力裁决**：
   - **03q 预览只读**（spec 铁律 7 + 验收机检「内容编辑器不存在」）：移动端 L3 预览 = meta 行 + 行号渲染 + ⋯ 菜单（复制路径/在 Git 中查看 diff）+「查看 diff ›」；**现有 FileTabPreview 可编辑预览与 v2 冲突**——M4 只换移动端 L3 形态，桌面 file tab 可编辑保留为过渡期遗留（桌面预览只读化归 M9 多端收敛统一处理，saveFileContent API 保留）。
   - **03w 移动到 = rename 带路径**：服务端 renameFile 扩展可选 `targetDir`（project-relative，过 resolver；fs.rename 原生支持跨目录）；删除确认在 git 工作区有改动时加警示行（查 listProjectGitDiff 对比 path）。
   - **03u 提交详情需新服务端端点**（R1–R6 无单 commit 文件列表）：R7a `GET .../git/commit/$hash`（author/time/subject + numstat 文件列表）；R7b commit 单文件 diff（`git diff hash~1..hash -- path`，与 R5 分支 compare 同构）。
   - **03p wiki 全文搜索进 M4**（编号③「页面树 + 全文搜索」明确画出，服务端 grep wiki/*.md 成本低）；03x 文件搜索仍归 M8（有独立原型页）。「上滑加载更早」（03t）v1 = 流底「加载更早」按钮 + R6 加 isoDate 字段与 limit/offset 分页参数（向后兼容可选字段）。
   - **wiki 分组树（tgrp）客户端派生**：页面首个 tag 为组名、无 tag 归「未分组」——服务端 WikiPageSummary 已有 tags，零服务端改动。

## §6.3 M4 收口补记（2026-09-21）

**落地**：

- **三工具态**（`mobile-project-tools.tsx` 新建）：MobileGitTool（03m：gitchip 工作区/暂存计数 chip + sect 工作区改动/暂存区 + frow numstat 行 + links「全部历史」「分支 (N)」）、MobileFilesTool（03o：crumb 目录链 + frow；长按写操作菜单（03w）待 M5 sheet 体系一并做）、MobileWikiTool（03p：wsearch 搜索胶囊 + tgrp tag 分组 + wpg 行 + refnote「✦ 正在引用此页」）；ticon `.hl` 原位高亮，query key 与桌面完全一致共享缓存。
- **L3 双通道**：显式子路由（`/git/history`、`/git/branches`、`/git/commit/$`、`/wiki/$` → focusId `githistory`/`gitbranches`/`gitcommit_<hash>`/`wiki_<slug>`，不写 layout）+ 保活层分流（file/git ref 仍写 layout 进保活，渲染层按 ref.kind 分流到移动 L3 组件）；back 全部回工具态（`navigateWorkbench(scope, undefined, { tab })`，`?tab` 记忆保持）。
- **六个 L3 组件**（`mobile-l3.tsx` 新建）：MobileL3FilePreview（03q meta 行 + 查看 diff）、MobileL3GitDiff（03r diffBaseScope + numstat + DiffContent 桌面复用）、L3GitHistory（03t useInfiniteQuery + 日期分组 + 「加载更早」）、L3GitCommit（03u cmsg/dstat + frow 内嵌 CommitFileDiff 展开）、L3GitBranches（03v bcur/brow/rocard + 远程 sect）、L3WikiReader（03s wmeta + readbtn + wlink + Markdown 正文 + rel 同组页）。
- **D13 落地**：L3WikiReader readbtn 注入成功写 `workbenchWikiRefsAtom`（projectName→sessionId→[{slug,title}] 去重）→ MobileWikiTool refnote ✦ 标记 + `MobileWikiRefBar` 流顶引用卡（✕ 移除写 atom，删空 session 键）。
- **服务端**：R7a `GET .../git/commit/$hash`（meta + numstat 文件列表）+ R7b commit 单文件 diff（`hash~1..hash -- path`）；`getProjectGitLog` limit/offset 分页参数。
- 杂项：`magnifyingglass.svg`（03p 第一手 path）；i18n `workbench.moreActions`；`.wikiref` 原语入 `v2-primitives.css`。

**记档项**：

1. .kw 语法高亮不做——只读预览收敛纯文本行号渲染（03q 原型关键字着色不还原）。
2. 03u 内嵌文件 diff 展开不做独立 URL（就地展开，无深链）。
3. merged 分支置灰不做（需服务端 merged 判定，归 M8 缺口批次）。
4. 03m badge「U」显「A」——以 git status 字段语义为准（A=added/U=untracked 原型混写）。
5. cmsg 提交消息用 ink-title（03u 原型第一手）。
6. git/wiki L3 back 全回工具态（`?tab` 记忆），backLabel 标语义来源：history/branches=「Git 检视」、commit=「提交历史」、wiki=分组名、file=父目录名（根=项目名）。
7. file L3 ⋯ 菜单「复制路径」用全路径（含 projectName 前缀）；「在 Git 查看 diff」→ `onOpenGitFile("worktree", relPath)`。
8. H1 effect L3 守卫：focusId 为 L3 前缀（`githistory`/`gitbranches`/`gitcommit_`/`wiki_`）时跳过「退工具」effect——L3 是内容区替换非 focus 语义，`onTabChange` 会把 focusId 透传进 session 路由。

**design-reviewer 审查 = 修复后通过**（2026-09-21，DOM 几何实测）：

- **P1 已修**：L3 深度页与工具面板无互斥（`?tab=git` 进 `/git/history` 时两者同屏叠放各占 flex-1）——三处工具面板渲染条件补 `&& !l3Route`，探针加「L3 独占内容区」断言。
- **P2 已修**：① `.ticon.hl svg` 被基规则 `stroke: var(--ink-2)` 钉死、高亮不生效 → 改 `stroke: var(--ink-1)`；② 成功态文字 token（`.bcur .r1 .st` 与 numstat `text-success`）→ `--c-success-text`/`text-success-text`（浅底对比度语义，与 `.dstat .add` 对齐）；③ gitchip `b` 固定「Git 检视」→ 分支名 + `↑n ↓n`（spec §4.4 `main ↑1 ↓0`，数据源 `gitDiffForChip.data.branch`，detached 降级工具名）；④ 03w 菜单 iOS 不可达（contextmenu 不派发且无 ⋯）→ touch 长按计时路径（500ms + 10px slop + 合成 click 抑制），探针 Part 6 用 CDP touchStart/End 验证。
- **顺手修（reviewer 标注低风险）**：wiki 搜索态 `.wpg` 补 `flex-wrap`（refnote 挤行）；提交详情 nav 标题裸短 hash（去 `#`，03u 口径）。
- **P3 记档**：① `.crow` 原语按 03m 移植，03t 历史页 hash 主蓝 11.5px / message 600 需变体类（如 `.crow-lg`）；② 03t/03u ✦ Agent 来源标注与「N 文件」数据缺失不伪造（M8 后端：作者→会话映射 + numstat/文件数）；③ `.wpg` border-top 应为相邻选择器（组头/搜索下首行分隔线多余）；④ crumb 强调位应在当前目录末段（现为项目名）；⑤ L3 focusId 前缀判定三处字符串重复 → 待提 `isL3FocusId()` 单源；⑥ 03t「上滑加载更早」现为点击按钮（后续 IntersectionObserver + 按钮兜底）；⑦ 03r meta 缺「N 个代码块」（hunk 数在 DiffContent 内部未上抛）。

**验证**：探针 `probe-v2-m4-tools-l3.mjs` 41 断言全绿（含 L3 互斥 / gitchip 分支名 / 03w 触屏长按可达 + click 抑制）；四门禁全绿（lint 0 warning / typecheck / api 789 + shared 9 + web 670 pass）；CSS 落盘硬闸过；token 机检基线内无新增；e2e 29/29。

## §6.4 M5 开工摊牌（2026-09-21）

M5 = 浮层体系 + 审批中心（总纲 §6），基于现状盘点拍板：

1. **范围拆分**：
   - **M5-a 浮层族**：sheet 容器原语（v2-primitives 单源：Radix Dialog modal + 底部滑入 + grab 条 + radius 2xl，frontend-notes §4/§9 纪律）+ 03j 新建实例 / 03k 实例信息 / 03l 项目切换 / 03n 会话历史 / 08 新建项目 sheet 化对齐 / 02c pill 长按菜单（长按 hook 与 03w 同源抽取共享）。
   - **M5-b 审批中心**：服务端聚合 + 移动 sheet（11 原型）+ 入口接线。
2. **审批中心服务端聚合协议**（现状 = 客户端从单会话流 chatStream 派生 PendingApproval，无跨会话视图）：
   - **登记点 = 服务端 relay 解析出 `control_request` 帧**（stdout 流，ClaudeControlRequest 已是 SessionStreamServerMessage 联合成员）。新 `ApprovalRegistry`（内存 Map，runtimeKey→requestId→entry）：登记于 control_request 出现；注销于 control_response 出现 / CLI result / 进程退出。**仅 claude provider**（acp/pi 无 CLI control_request 流，后续按需）。
   - **快照 = `GET /api/approvals`**（全量数组，数量级小）：projectName/sessionId/sessionName/controlRequestId/toolName/input 摘要（截断，原型 cmd mono 一行）/createdAt/runtimeAlive。args 只在内存不落盘。
   - **响应 = `POST /api/approvals/respond`**（projectName+sessionId+requestId+decision）：服务端查 registry 拿 runtimeKey → `claudeRuntime.write(control_response)` 与 WS 转发完全同管道（injectUserPrompt 同款先例）；已注销 = 已被处理（SESSION_NOT_FOUND 语义）。
   - **推送 = 全局 WS approvals 频道**：registry 变更即推全量快照（鉴权同现有 stream WS）；审批中心 sheet 打开时订阅，关闭即断。
   - **UI（11 原型）**：grab + shd（「审批中心 / N 待审批 / 全部允许 ›」）+ acard×N（dot + 会话名 + pj 项目 chip + cmd mono（强写操作 hot 红）+ 拒绝/允许 btn ghost/ok）+ sfoot；「全部允许」二次确认；点卡 → navigate 跳该会话；runtimeAlive=false 卡置灰（断线冻结，spec 验收）。
   - **入口**：①项目 Tab 活动卡 `.ap-row`（M3-a 已预留注释位，pending=0 隐藏）②ApprovalTray 标题可点 → `/projects?approvals=1` 自动开 sheet。桌面状态栏/Popover 入口归 M9（服务端聚合端无关，桌面白捡）。
3. **浮层交互通用纪律**：portal fiber 冒泡 contains 判断（§4）、退出动画 fill-mode-forwards（§9）、触屏长按（§7 + 03w 范式）、scrim/Esc/focus-trap 全交 Radix（`ui/dialog.tsx` 形态覆盖）。

## §6.5 M5 收口补记（2026-09-21）

**M5-a 浮层族落地**：

- **sheet 容器**（`shell/mobile-sheet.tsx` 新建）：Radix Dialog modal + `.msheet` 底部滑入（radius 2xl + grab 条 + scrim，退出 fill-mode-forwards——frontend-notes §4/§9）；`headerExtra` slot（标题后）供 11 审批中心放 .cnt+.all。M5 行级原语（grp/sess/fc/hrow/srow/tile/gempty/newp/filters/cnt/all/acard/sfoot/ap-row）入 `v2-primitives.css` M5 段单源。
- **03l 项目切换**（`MobileProjectSwitchSheet`）：nav 标题 ▾ 入口；grp 点击只切项目 / sess 点击切项目并激活 / gempty 引导 / newp 接 08 新建；搜索同 match 项目名+会话名。
- **03n 会话历史**（`MobileSessionHistorySheet`）：nav ⋯ →「会话历史」；filters 三态 + hrow；已结束行点击 = 恢复——`useResumeAgentSession` 从 `history-list.tsx` 抽出复用（resume 需完整 session）。
- **03j 新建实例**（`MobileCreateInstanceSheet`）：row2 ＋ 与 03h 空态卡 CTA 共用；srow/tile 富行 3 行（Claude/OMP/终端，Codex/Pi 无接入能力不画）；图标 bolt/sparkles.svg 新注册。e2e `acp-session.spec.ts` 选择器同步（menuitem → button「＋ omp」）。
- **08 新建项目 sheet 化**（`project-setup.tsx`）：`useCreateProjectDialog` 双形态——移动 MobileSheet / 桌面居中 Dialog；表单抽 `ProjectSetupPanel` 共用。
- **02c pill 长按菜单**：`useLongPressActions` 抽入 `ui/action-menu.tsx` 与 03w 文件行共享（500ms 计时 + 10px slop + guardClick 抑制合成 click；桌面右键独立路径）；`mobile-project-header.tsx` pillCtx 绑定。
- 探针 `probe-v2-m5-sheets.mjs` 45 断言全绿（含 reviewer 修复后新钉的 P1 守卫 + 状态层级）。

**M5-b 审批中心落地**（协议 = §6.4 第 2 条，全按定稿实现）：

- **shared**：ApprovalSummary / ApprovalsSnapshotResponse / ApprovalRespondRequest（projectName+sessionId+controlRequestId+decision）/ ApprovalRespondResponse（delivered | not_found | runtime_dead）/ ApprovalsStreamServerMessage。
- **服务端**：`approval-registry.ts`（纯内存 Map，input 只存内存不落盘，inputSummary 登记时定格 ≤80 字符语义字段优先）；`claude-runtime.ts` 捕获挂钩（processStdoutLine 唯一登记入口 + result 帧/进程退出收口，ClaudeProcess 补 projectName 随行）；`claude-stream.ts` 转发挂钩（会话内应答 → 即时注销）；`approval-center.ts`（快照/respond/WS hub + broadcasting+dirty 合并广播）；`index.ts` 装配（REST 走 requireHttpAuth、upgrade 走 canUpgradeWebSocket、respond 过 resolveProjectPath 守卫；错误码复用 SESSION_NOT_FOUND/SESSION_RUNTIME_MISSING）。7 单测全过。
- **客户端**：`use-approvals.ts` 单订阅（REST 初值 + WS 帧整体替换同一 query cache + 15s refetch 兜底）；`MobileApprovalSheet`（11 原型：shd+cnt+all 二次确认 / acard hot 红置灰 / 拒绝允许 / sfoot）；入口① `.ap-row`（02，pending=0 隐藏）+ 入口② ApprovalTray 标题可点（移动端）→ `/projects?approvals=1` 挂载即开、关闭清参。
- 探针 `probe-v2-m5-approvals.mjs` 26 断言全绿；API 单测 +2（can_use_tool 捕获边界四类忽略 / close 路径审批收口）。

**记档项 / 拍板**：

1. **hot 红判定机械规则**（拍板）：写文件族工具（Write/Edit/MultiEdit/NotebookEdit）恒红 + Bash 按内容启发 `/\b(rm|git push)\b/`——原型 11 仅 git push 卡明确红，其余需机械判定。
2. **单订阅拍板**：审批数据一条管道（useApprovals REST+WS 同 query cache），sheet 收 prop 不自建订阅——UI=f(state) 纪律（data-flow.md）。
3. **mock 同构原则**（探针教训）：服务端 REST 快照与 WS 推送天然同源（registry 单源），mock 必须同构可变，否则客户端 refetch 兜底会「回滚」推帧。
4. WS 订阅生命周期：挂载期常开（非 sheet 开关跟随）——ap-row 计数需实时；15s refetch 兜底 WS 断线。
5. `approvals.dead` i18n 键删除（置灰纯视觉，无文案消费点）。
6. confirmAll 二次确认无自动还原 timer（关 sheet / 应答完还原）。

**验证**：探针 45（M5-a）+ 26（M5-b）断言全绿；四门禁全绿（api 798 + shared 9 + web 670 pass / lint 0 warning / typecheck）；CSS 落盘硬闸 + token 机检基线内（11 处存量）；e2e 29/29。

**reviewer 审查（三份独立报告，均为「修复后通过」）**：

- **design-reviewer（M5-a 浮层族）**：P1×1 + P2×7 + P3×9。
  - **P1 已修**：03n 会话历史行点击对 running/idle 会话无去重 → `resumeSession` 新建重复实例、旧实例孤儿（违反铁律 2；桌面 HistoryList 有 `hasActiveSession` 守卫，移动侧 `AgentSession` 无该字段）。修法：`closed` 行才 resume，活跃态行改为 `onFocusExisting` 聚焦既有实例；探针加「running 行点击不 resume（POST 数 0）+ 关 sheet」断言。
  - **P2 已修 5 项**：① scrim 硬编码 `bg-black/60 backdrop-blur-sm`（两态同值 → 双主题失效、比原型重且多 blur）→ `bg-scrim` 语义 token + 删 blur；② M5 段 CSS 全在 `@layer components` 之外（unlayered 反超 utilities 的静默失效隐患）→ 整段包层，产物验证 `.msheet` 落于 components 层内（8110 < 29506 < 33949）；③ `.hrow.idle/.end .r1{font-weight:400}` 死规则（行未挂变体类）→ 按 status 挂 `idle`/`end`，探针加 computed 字重 600/400 断言；④ closed 行渲染灰点（原型 end 行无 dot）→ closed 不渲染 dot，探针加断言；⑤ `.tile svg` 16×19 非方形 → `size-[19px]` 三处。
  - **P2 记档 1 项**：03n 数据管道与桌面历史不同源（`agent-sessions` vs `agent-history`）——修 P1 后去重诉求已解决，管道统一归 M8 缺口批次（需服务端 `hasActiveSession` 面）。
  - **P3 已修 3 项**：`.fc` 搜索框 `rounded-[10px]` 裸值 → `rounded-md`；搜索框补 `aria-label`；pill 补 `select-none`（iOS 长按文本选择与 500ms 计时竞争）。**P3 记档 6 项**：`.fc.ghost` 无消费者、MobileSheet 缺 Description、`.d2` 命名双义、`76dvh` 绕开 `--app-viewport-height`、03j Claude 行描述文案、ActionMenu 移动端承载形态。
- **code-reviewer（M5-b 全量）**：无 P1；P2×3 全修，P3×7 记档。
  - **P2-1 已修**：`captureApprovalRequestFromLine` 放行 `input: null`（`typeof null === "object"`）→ registry 摘要 TypeError → `readStdout` catch 后 reader 循环永久退出（整条会话流冻结）。修法：补 `!request.input` 判断 + 单测钉住四类忽略。
  - **P2-2 已修**：`close()` 绕过 `onApprovalRuntimeSettled`（先 `processes.delete` → exited 回调 generation 守卫恒 false）→ 僵尸卡片。修法：close 内显式收口 + 单测。
  - **P2-3 已修**：respond 失败静默（无 `onError`、respondAll 无条件清确认态、共享 isPending）→ mutation `isError` 行内提示（`text-error`，SessionDetailRoute 先例）+ `respondAll` 改 `allSettled` 后清确认态。**记档**：按钮 pending 粒度不细化（并发下 isPending 跟踪最新一次）。
  - **P3 已修 2 项**：`parsed.response.request_id` 补可选链；approval-center 帧构造抽 `frame()` 单源 + `sendSnapshot` 挂 catch（对齐 claude-stream open 纪律）。**P3 记档 5 项**：并发 respond 同 requestId 双写（CLI 按 id 去重无害）、`resolveSessionNames` 串行 IO、`summarizeControlInput` 先 stringify 后截断、hot 启发跑在截断后摘要上（假阴性/假阳性，仅颜色）、approvals WS 无重连心跳（15s refetch 兜底）。
- **security-reviewer（M5-b 服务端）**：**五条红线全过**（鉴权覆盖 / PROJECTS_ROOT 不逃逸 / 注入面 / 密钥 / 回调装配），无 P1。P2-1 = code-reviewer P2-2 同一处（close 注销缺口，两方独立发现互相印证），已修。P3-1 = code 的 P2-1（input null，已修）；P3-2/P3-3 已修。**关键核验**：`validateProjectName` 拒绝 `/\`/`\0`/`.`/`..`，respond 的 projectName 仅作 registry 匹配键不入文件系统路径；整帧 `JSON.stringify` 保证单帧边界，无用户可控字符串拼接；完整 input 只存服务端内存，协议只出 80 字符摘要。

## §6.6 M6 开工摊牌（2026-09-21）

M6 = 插件 Tab + 市场体系（原型 09/12/13/14/15/16/17/18）。基于现状盘点（`PluginsRoute.tsx` 1014 行现有三 tab：Discover/Manage/Sources + `McpPanel`；后端 `/api/skills/{search,installed,preview,install,uninstall,updates,update,sources,task/:id/events}` + `/api/mcp{,/add,/remove,/update}`）逐条对齐：

1. **能力边界裁定（核心，决定每页画什么）**——spec §214 定义 `McpServer { id, scope, name, status, tools[], secret_ref }`，但**现有后端 `McpServerEntry` 只有 `{name, type, command, args, env, url, headers}`**：不 connect、不 list tools、无运行时状态。故：
   - **13 MCP 详情**：配置段（命令/args/url/env 脱敏）**有数据源**→ 画；「● 已连接 · 运行中 / 启动于 N 小时前 / 注入工具 · N / 重启」**无数据源**→ 不画（诚实呈现，补后端归 M8 缺口批次）。
   - **14 添加 MCP**：表单字段（名称/类型/命令/args/env/作用域）**全部有数据源**（`AddMcpServerRequest`）→ 完整实现，含 stdio/URL 类型联动、密钥输入走 `env` 键值行、作用域 user/project 分段。
   - **16 安装审计**：校验和（sha256）与权限声明（manifest）**无数据源**（skills.sh search 只回 name/installs/source，无详情端点）→ 审计 sheet 保留结构但只画有据字段（名称/来源分级/安装量 + 作用域选择 + 注入工具预览降级为「技能名 + 来源」）；校验和/权限声明行不画。
   - **17 MCP 市场**：**无 MCP registry 数据源**（无远端目录 API）→ 页面不实现；入口在 09 市场段标注为「技能市场」单入口（MCP 市场行不画）。**记档**：若后续接入 registry.modelcontextprotocol.io，归独立批次。
   - **18 技能市场**：`/api/skills/search`（skills.sh）**有数据源**→ 完整实现（源 chips + 搜索 + 卡 + 安装 → 审计 → 进度 → 已安装）。
   - **15 市场源管理**：`/api/skills/sources` CRUD **有数据源**→ 实现（源卡 + 开关 + 添加自定义源 + 内置/官方 tag）；「上次同步 N 分钟前」无数据源不画。
2. **作用域双通道**（spec §3.5 编号①/②）：skill 侧 `scope: "project" | "global"`（`InstalledSkill.scope`）+ MCP 侧 `McpScope: "user" | "project"`——两套命名（历史），UI 统一呈现为「全局 / 本项目」分段；「本项目 · <项目名> ▾」点 ▾ 复用 03l 切换器换项目；未选项目时本项目段空态引导（编号⑥）。
3. **深度页路由**（L2/L3）：09 = L1 插件 Tab（移动 4 Tab 之一，已有）；12/13/14/15/16/17/18 = push 子路由（`/plugins/skill/$name`、`/plugins/mcp/$name`、`/plugins/sources`、`/plugins/market`）；14/16 = sheet（复用 M5 `MobileSheet`，桌面 = Dialog）。
4. **技能更新流**（12）：「有更新」chips 来自 `/api/skills/updates`（手动触发，避 GitHub 限速）；更新确认 → `POST /api/skills/update`（202 + SSE task 流，`waitForSkillTask` 既有）；卸载 → `POST /api/skills/uninstall` 需确认。
5. **与工作台去重**（spec §3.5 规则）：项目工作台**不放**技能管理——M6 不新增工作台入口，只做 Tab + 深度页。
6. **桌面/iPad**：09m/17/18 桌面版归 M9（多端），本里程碑只做移动形态 + 数据层（与 M4 同口径）。

## §6.7 M6 收口补记（2026-09-21）

**落地清单**：
- **M6-a（09/18/15 + 体系）**：`pluginView` 路由维度（`WorkbenchRouteContext.pluginView: "home"|"market"|"sources"`，`/plugins/market`、`/plugins/sources` 派生非 home 值；无 focusId 不进保活 tab 体系；桌面 M9 前忽略）；09 主页（大标题 + `.segc` 作用域分段 + 搜索 + MCP 组 + 技能组 + 市场段）；18 技能市场；15 源管理；组件文件 `mobile-plugins-home.tsx` / `mobile-plugins-market.tsx`。
- **M6-b（12/13/14/16 + 接线）**：12 技能详情（`mobile-plugins-detail.tsx`）；13 MCP 详情；14 添加 MCP sheet；16 安装审计 sheet（替换 M6-a 的 v1 `InstallConfirmDialog` 过渡）；新路由 `/plugins/mcp/$`（focusId=`pluginmcp_${name}`，同 `/plugins/skill/$` 范式；桌面 update effect 提前 return 防误开 tab，M9 前桌面无入口）；09 接线：MCP 卡（global → 点击进 13；project → 静态卡记档）＋ 添加入口（14 sheet，scope 随段）；技能卡 project scope 分流 `/projects/$key/skill/$`（global 走 12）；`MobileSkillFocus` 旧浮窗删除换 12 形态。
- **CSS 消歧（M6-a 定，M6-b 修正）**：同名类冲突拆名——`.psect`（09 主页 13px）/ `.dsect`（12/13 详情 12px）/ `.mchips`（市场 chips）/ `.skrow`（sheet 键值行；M6-b 修正 `.skrow .v` 后代选择器 M6-a 漏改）/ `.stabseg`（14 sheet 内三段）/ `.kbtns .p.solid`（16 实底主钮）；M6-b 新增 `.kbtns .p.solid.danger`（确认 sheet 危险主钮）。M6 段 CSS 全部在 `@layer components` 内（第 1459 行起 M5 段内追加）。

**记档项（能力边界与实现取舍）**：
1. 09 搜索 = 本地过滤已装两组列表；市场远端搜索在 18 页内（原型编号③语义拆分）。
2. 技能卡 d2=path（`InstalledSkill` 无 description）；12 详情 ddesc 用 `preview.description`（frontmatter，有据）。
3. MCP 卡 d2=`类型 · command/args|url`（有据字段）；不画「● 已连接 / N 个工具」（§6.6）。
4. 「有更新」chip 仅手动「检查更新」出结果后显示（避 GitHub 限速）；09 `.r` 钮、12 chip + CTA 三处同源（updates 缓存；update 完成后 hook 乐观置 false，chip/CTA 消失）。
5. 12 不画 upcard changelog / arow「注入能力」/「已启用」chip / 版本号——均无数据源（`SkillUpdateStatus` 只有 hasUpdate/manageable/source*；skill 无 capabilities；npx skills 不回版本）；更新 CTA 文案不带版本号。
6. 12 的 SKILL.md 正文段为实现扩展（有据：`useSkillPreview` 读本地文件），原型 12 无此段——保留 v1 起的只读预览能力不删功能。
7. 13 env 脱敏：键名可见、值恒 `••••••（脱敏）`，真值不进 DOM（探针硬断言）；「编辑」入口不画（原型 ⋯ 菜单无移动容器，记档）。
8. 14 传输类型 `.stabseg` 画三段（原型两段 stdio/SSE——真实 `McpServerType` 有 http 第三值，字段同为 URL）；主钮 = `.p` 文字钮「添加 ›」（原型同），「自动连接并列出工具」不画（后端 spawn 时 `--mcp-config` 注入，无独立 connect 生命周期），snote 说明真实生效时机（新会话加载）。
9. 14/16 的信任确认为一段式（sheet 内 snote 保留桌面 Dialog 同款警告文案，表单提交即确认）——桌面为常驻表单才需二段确认；security-review 意见见下。
10. 16 只画名称/来源章/安装量/作用域行；sha256、权限声明、注入工具预览不画（§6.6）。
11. 15 不画源 toggle/「上次同步」/offcard/MCP Registry 卡（§6.6）；自定义源移除 = 卡内 danger 文字钮（原型无移除操作，但 `removeSource` 能力存在需出口）。
12. 03l 切换器在插件页点会话行降级为只切项目（插件页无会话上下文，激活会话是工作台语义）。
13. project scope MCP 卡暂无详情入口（`/plugins/mcp/$` 只承载 global；project scope 无 MCP 深度页历史缺口，扩张归 M8/M9 评估）。
14. 12/13 的卸载/移除确认最终形态 = `useConfirm()` Alert（spec §5：删除类确认走 Alert 不走 sheet；移动形态 = iOS action sheet 红字 destructive）——design-reviewer P2-3 修正初版 M5 sheet 确认卡（「sheet=表单/内容承载，Alert=确认」分工）；`.kbtns .p.solid.danger` CSS 保留（16 实底钮族备用）；失败 error 行渲染在 rmnote 下方可重试（与 12 的 update.error 行同模式）。
15. 18 安装进度 = pulse 动画无百分比（`SkillTaskFrame` 两态状态机）；原型 tabseg 双段不画（17 不实现，单段无意义）。
16. e2e `mobile-nav.spec.ts` plugins 断言改 h1 大标题（09 页无 MobilePageHeader）。

**验证**：探针 `scripts/probe-v2-m6-plugins.mjs` 59 断言全绿（6 Part：09 几何与过滤/12 详情与卸载确认 Alert/13 env 脱敏硬断言/14 stabseg 切换 + POST payload/18+16 安装全流/15 三态卡；reviewer 修复后复跑，新增 `.back` 可见文字断言）；四门禁 + CSS 落盘硬闸 + token 机检（基线 11 处存量零新增）；e2e 全套 29/29（reviewer 修复后终验）。

**reviewer 结果**（三份报告，全部「修复后通过」；P1 零）：

- **security-reviewer：通过**。信任确认为一段式（14/16 sheet 内 snote 保留桌面同款警告文案，表单提交即确认）评估可接受；2 P3 记录：① 12 SKILL.md 正文段是攻击面扩大（渲染安装技能的任意 markdown——`MarkdownString` 沿用 v1 既有的 sanitize 面，移动页与桌面同源，无新面）；② 13 env 脱敏为内存既有面（后端 API 本就回传 env 真值，移动端只是渲染层脱敏，真值不进 DOM 由探针硬断言）。
- **code-reviewer：1 P2 + 5 P3，全部已修并复验**。P2 = `MobileAddMcpSheet` busy 期 `onOpenChange` 无守卫（scrim/Esc 关闭会让迟到 settle 的 error 残留到下次打开）→ 加 `!addServer.isPending` 守卫。P3 = ① 技能卡 chip 收敛条件冗余（`{!projectName && hasUpdateNames.has(...)}`）；② 09 `describeMcpTarget` 与 detail 的 `mcpTypeLabel` 重复实现 → 复用单一实现；③ `PluginsRoute` 的 `InstallConfirmDialog` 过渡期 export 已失消费者 → 撤 export 回 `function`；④ 15 `removeSource.mutate` 失败静默 + unhandled rejection → 改 `mutateAsync` + error 渲染行 + `.catch` 留表单；⑤ 添加源表单 `.then` 无条件关表单 → 成功才清字段关表单。
- **design-reviewer：3 P2 + 6 P3，全部已修并复验**。P2-1 = M6 新文件混用 v1 过渡桥接 utility（`text-on-surface*`/`bg-surface*`/`border-neutral-line`）→ 全量清扫换 v2 语义（`text-ink-1/2`、`bg-elevated/elevated2`、`border-sep`），rg 机检零残留。P2-2 = `PluginNav` 返回键自绘图标钮偏离原型 `.back` 设计语言 → 重构为 `.back` 类 + `backLabel` 可见文字（12=「已安装技能」、13/15/18=「插件」；对齐 mobile-project-header 同款）。P2-3 = 12/13 删除类确认用 sheet 违反 spec §5「删除/关闭确认=Alert」→ 改 `useConfirm()`（confirm-dialog.tsx，移动形态 iOS action sheet 红字 destructive），记档项 14 同步改写，探针 Part 2 断言同步换 Alert 形态。P3-4 = 09 ＋ 钮改裸 ＋ 字形 + `aria-label`（mcp.add）。P3-5 = v2-primitives.css ~227 行零消费死码删除（`.pcard .live`/`.dchip.en`/`.upcard`/`.arow`/`.trow`/`.stcard`/`.scard .toggle`+散写 #fff/`.scard .tm`/`.offcard`/`.tabseg`/`.mcard .ver`/`.perm`/`.tools`/`.tool`/`.mrow .c`/`.scope .ar`/`.kfield .add`，14 块逐块 rg 机检零消费后 python 删；`.tree .trow` 是 tree 组件活代码不动；M8 补后端面时按需重落）。P3-6 = 09 segc ▾ 补 `tabIndex`+`aria-label`（plugins.switchProject）+ Enter/Space 键盘路径。P3-7 = `skills.installedTitle` 保留（P2-2 修复后作 12 backLabel 消费）；`plugins.backToPlugins` 失去消费者删除。P3-8 = 12 dtitle 名称包 `min-w-0 truncate`（长技能名防溢出）。P3-9 = `.psect .r`/`.mchips .mg`/`.segc .caret` 触区扩（负 margin 抵消 padding，视觉零变化；`.psect .r`/`.mchips .mg` 的 `margin-left:auto` 分写保留）。

**待定项汇总（M6 记档 + reviewer P3 记录）**：SKILL.md beacon 面（security P3①）、env 内存既有面（security P3②）、project scope MCP 详情入口（记档 13）、死码 CSS 按需重落（P3-5）——均已记入 M8 缺口清单跟踪。

## §6.8 M7 开工摊牌（2026-09-21）

M7 = 设置页重构 + 登录页完整态（原型 07/06；spec §3.1/§3.6）。基于现状盘点（`settings-dialog.tsx` SettingsContent 两层结构 root→claude/pi/acp/general + 移动 `SettingsRoute` + 桌面 `SettingsDialog` 共享；`AuthGate.tsx` 登录帧 M2 已基本完整；后端 settings API 全套 + auth login/me；**无 logout 端点**）逐条对齐：

1. **⚙ 入口已存在**（M3 落地）：`mobile-projects-home.tsx` 头部右侧 ⚙ → `/settings`（D21 裁定），本里程碑零改动；桌面入口 = Sidebar footnav（`SettingsDialog`），07m 对齐归 M9。
2. **SettingsRootView 按 07 五组重构**：通用（外观+语言两行，值 + ›→general detail）／RUNTIME 预设·新建实例时可选（Claude 模型预设/Pi Provider/Firecrawl API Key/ACP Agent 四行）／自动重试默认·会话 ℹ 可覆盖（3 静态行）／服务器（地址 mono + PWA 安装态）／退出登录（独立红钮）。root 组 = 纯移动 CSS（`.sgroup`/`.setrow`/`.logout` 入 v2-primitives.css `@layer components`；`.setrow` 避让 M5 03j `.srow`、`.crow` 已被 M4 wiki 占用；组标题复用 M4 `.sect`）。**桌面 SettingsDialog 同 Content 自动获得新分组**（决策 44+48 共享契约不变，07m 视觉对齐归 M9）。
3. **自动重试默认 = 真实值不伪造**：原型示意「3 次/45 秒（指数退避）/请继续」与实现不符——真实默认 `AUTO_RETRY_DEFAULT`（shared）= 3 次 / 60 秒延迟（固定间隔 + 30 分钟滚动窗口，无指数退避机制）/ 默认文案 i18n「刚刚网络错误，请继续」。设置页静态三行 import 常量显示真实值（`60 秒（窗口 30 分钟）`），禁编造 45 秒/指数退避字样。
4. **服务器组取舍**：地址 = `window.location.host`（mono，无 ›——多服务器历史不做，D 系摊牌延续）；PWA 行 = 安装态检测（standalone → 「已安装」ok 绿 / 浏览器 → 「浏览器中运行」）；「连接状态」行不画（auth 即连接，无独立状态源）；版本号不画（无数据源，web/package.json 0.0.0 无构建注入）。
5. **退出登录**：后端新增 `POST /api/auth/logout`（无鉴权幂等清 cookie：Set-Cookie Max-Age=0 + `{ok:true}`；HttpOnly cookie 前端清不掉，必须后端配合）；前端 = `useConfirm` danger 确认（「清 token 不清服务端数据」）→ 调 API → 清 `AUTH_OK_KEY` + invalidate auth query → 回登录帧。shared 增 `LogoutResponse`。
6. **语言三态（LanguagePref）**：i18n 现状 zh/en 二态 + `detectLanguage`（未存储时按 `navigator.language`）——「跟随系统」语义已存在但不可回选。引入 `LanguagePref = "system" | "zh" | "en"`：context 存 pref、`lang` = resolve 结果（system → navigator.language）；localStorage 已存 zh/en 视为显式选择（无缝迁移），无存储 = system；GeneralSection 增语言 SegmentedControl（跟随系统/中文/English）；AuthGate 底部快捷切换行为不变（写显式语言）。
7. **登录页完整态（spec §3.1 两缺口）**：① 密码错误 = 输入框描红（`loginMutation.error` → border-error）+ 行内提示（已有）；② 断网 = 按钮变「重试连接」——`auth.error`（网络层，getAuthStatus 401 返 false 不抛）时登录帧按钮变「重试连接」点击 refetch（现状是整页换错误帧无出口）。
8. **MobilePageHeader back 升级 `.back` 设计语言**（‹ + 可见文字，M6 P2-2 定稿延续）：当前全仓只有 SettingsRoute 传 back（零波及）；root 态新增 back=「项目」→ `/projects`（07 原型 ①），detail 态 back=「设置」。
9. **通用组交互记档**：原型外观/语言为纯值行；实现 = root 行值展示 + 点入 general detail 用 SegmentedControl（与现有实现一致，交互增强记档）。Firecrawl 行点入 pi detail（key 在 pi 段内，独立 detail 不新增）；行值 = 已设置/未设置（`firecrawlApiKeyMasked` 推导）。

## §6.8b M7 收口补记（2026-09-21）

**落地清单**：
- **后端**：`shared` 新增 `LogoutResponse`；`api/src/http-auth.ts` 新增 `handleLogout`（幂等清 cookie，注释记档 CSRF 防线 = SameSite=Strict）；`api/src/index.ts` 新增 `POST /api/auth/logout` 路由（无鉴权，位于鉴权中间件前）。
- **前端**：`web/src/api/client.ts` 新增 `logout()`（不走 fetchJson——避开 401 拦截器的重定向语义）；`web/src/lib/auth-storage.ts`（新，`auth_ok` 键读写）；`web/src/i18n/{types,translate,context,index}` 三态偏好改造（`LanguagePref`、`resolveLangPref`/`resolveLanguage`、`languagechange` + `storage` 双监听）；`web/src/styles/v2-primitives.css` M7 段（`.sgroup`/`.setrow`/`.logout`，`.setrow` 避让 M5 `.srow` 与 M4 `.crow`）；`settings-dialog.tsx` SettingsRootView 五组 + `GeneralSection` 语言三态 + `useLogout`；`AuthGate.tsx` 描红与断网态；`SettingsRoute.tsx` 原型 `.nav` header。

**reviewer 修复（design P1×2 + P2×5 + P3×3；security P2×1、P3 记档）**：
1. **design P1-1（真根因）**：滚动容器底原用 `bg-surface-raised`（= `--bg-elevated`），与 `.sgroup` 卡片**同色** → 卡片隐形只剩描边（硬数据修复前 浅 `rgb(255,255,255)` 双同、深 `rgb(28,28,30)` 双同）。改 `bg-surface-base`（07 原型舞台底：深 `#000` / 浅 `#F2F2F7`）；探针加「卡片底 ≠ 页面底」硬断言（修复后 白 vs `rgb(242,242,247)`）。
2. **design P1-2**：断网态原做成**独立错误帧**（密码框消失）→ 与 spec §3.1「断网 = 按钮变『重试连接』」不符。改为**保留登录帧**、仅主按钮换文案 + `refetch`（`offline` 分支内两个按钮形态）；探针 Part 4 改写为「密码框仍在 + 重试按钮 → 点击后回主按钮」。
3. **design P2-3**：`bg-error/10` → `bg-tint-red`（v2 语义 tint）；`border-error`/`text-error` 经核 `--color-error` 已映射 `--c-danger`，语义正确保留。
4. **design P2-6**：`.back` 触区补 `touch:px-2 touch:py-2`（与 `mobile-project-header` 同款；原几何 46×22.5 < 44）。
5. **design P2-7（ACP 孤儿裁决）**：原型 RUNTIME 只画 3 行，但 ACP 是真实 runtime（`AcpRuntimeSection` 存活），无入口则配置能力被割裂、且与 §6.8-2 自述「四行含 ACP」不一致 → **补第 4 行**「ACP Agent」（值 = 已配置 provider 数，有据 `hasApiKey` 计数；未配置 → 「未配置」）。
6. **design P2-8 / P3-9**：设置页「次数上限」原复用 `session.autoRetry.maxLabel`（「窗口内最多（次）」）→ 新增专属 `settings.retryMaxLabel`「次数上限」（对齐原型）；重试间隔值补真实窗口时长 `{{s}} 秒（{{m}} 分钟滚动窗口）` → 「60 秒（30 分钟滚动窗口）」。
7. **design P2-5 / P3-10 / P3-11（记档）**：`.setrow`/`.logout` 无 `focus-visible` 样式（暗底键盘焦点弱，桌面键盘面归 M9 多端）；`.ar` 12px/`--ink-3` 对比度偏低（**原型即此值，保持一致**）；`w-[52px]` 为原型示意占位值（真机惯例待 M9）。
8. **security P2-1**：登出失败原**完全静默**（弱网点确认 → 请求失败无反馈 → 用户误以为已登出，共享设备留有效凭证）→ `useLogout` 改 `onSuccess`（仅 `clearAuthOk`）+ `onSettled`（invalidate 对齐服务端真实态），`SettingsRootView` 加行内错误提示（`api.logoutFailed`，`mx-4 text-caption text-error`）；探针 Part 3 加失败路径三断言（提示可见 / 保留 auth_ok / 留在设置页）。
9. **security P3 记档**：① CSRF 防线 = `SameSite=Strict`（跨站不接受非 None Set-Cookie）——写入 `handleLogout` 注释防退化；② 登出 ≠ token 吊销（无状态 HMAC 30 天 TTL，无 denylist；已建 WS 升级后不复检）——单用户部署可接受，多设备威胁模型需引入吊销；③ cookie 未加 `Secure`（签发与清除成对一致，部署走 HTTPS tunnel 建议成对补）；④ 登出后 `workbench.lastProjectKey`（项目名元数据，非凭证）保留。

**验证**：探针 `scripts/probe-v2-m7-settings-auth.mjs` **68 断言全绿**（4 Part：07 root 五组结构与值行 + `.ar` 分布 + 几何/样式硬数据(radius/字号/字重/danger 色/卡片底≠页底) / detail 语言三态真实切换 / 退出登录含失败路径 / 06 描红与断网重试）；四门禁全绿（format / lint 0-0 / web+api+shared typecheck / test 798+670+9 = 1477 全 pass）；CSS 落盘硬闸 ✓；token 机检基线 11 处存量零新增；e2e 29/29。

**待定项汇总**：`focus-visible` 键盘面 / `.ar` 对比度 / `w-[52px]` 真机值 → M9 多端；security P3② token 吊销 → 多设备威胁模型时评估。

**code-reviewer：通过（P0/P1 零，2 P2 + 3 P3）**。核对确认无正确性缺陷：Q1 三态偏好无 bug（storage 事件只发其他窗口，`setLang("system")` 删 key 不重复处理；`e.newValue === null → system` 语义正确）、Q2 `useLogout` 时序方向正确无错误窗口（`authOk` 是挂载时读一次的 useState，回登录帧由 invalidate → 401 → `data=false` 驱动）、Q3 `.ar` 位置正确且静态 children 无 key 警告、Q4 重提交时 mutation 重置 error 故描红无残留。**P2 修复**：① `isStandaloneDisplay()` 在 AuthGate 与 settings-dialog 逐字重复 → 抽 `web/src/lib/display-mode.ts` 单一实现两处复用；② `STORAGE_KEY = "lang"` 在 translate.ts 与 context.tsx 各定义一份 → 改由 translate.ts 导出 `LANG_STORAGE_KEY` 单一来源。**P3 修复**：跨窗口 storage handler 回 system 时一并 `setSystemLang(resolveLanguage("system"))`（原仅刷 `pref`，另一窗口切回 system 未必伴随 `languagechange`）。**P3 记档**：单位换算裸数字（`/ 1000`、`60_000`）——仓库既有约定即内联写法（`utils.ts`/`hooks/*.ts` 同款），不新增 `MS_PER_*` 常量以免偏离周围代码。

**reviewer 三份齐（security 通过 / code 通过 / design 修复后通过）**：design 修完两项 P1（卡片同色隐形、断网态偏离 spec）+ 5 P2（tint-red/`.back` 触区/ACP 孤儿补行/「次数上限」专属键/窗口时长）后复验通过。

## §6.9 M8 开工摊牌（2026-09-21）

**范围（总纲 §6 M8 行）**：文件搜索 / 移动到 / 上传队列冲突三选 / 拖拽上传 / 采用项目自动 / 全局文件写边界（PROJECTS_ROOT 内）/ 子 agent 概览条；验收 = security-reviewer 必过。累积小项一并收口（⑤e）。

**七大缺口现状（开工盘点）**：
1. **文件搜索**：完全缺失——服务端无递归搜索端点（ProjectFilesService 只有目录级 listFiles/previewFile 等），03x 语义（工具行2 内容头变搜索框 + 项目内文件名子串过滤 + 相对路径结果）零实现。03x `.sfield` 与 `.wsearch` 同语义（h30/r15/bg-elevated）→ 单源收敛复用 `.wsearch`，聚焦描边用 focus-within（03x 注释原话「同 Wiki 样式」）。
2. **移动到…**：移动端 menuItems 有项但 `window.prompt` 手输路径（03w 应为位置选择）；桌面 FileEntryList 菜单只有 rename+delete。服务端 renameFile 已带 targetDir，能力在、UI 缺。
3. **上传**：单文件 input、无队列/进度/速度/取消；服务端 uploadFile 遇同名抛 `PROJECT_FILE_TARGET_EXISTS`（409 硬拒），无冲突三选；fetch FormData 无上传进度。上限 `UPLOAD_FILE_LIMIT_BYTES = 50MiB`（spec 写 100MB → **取真实上限 50MiB**，文案不虚标）。
4. **拖拽**：`handleFileDrop` 只取 `dataTransfer.files[0]`——单文件、无队列、无冲突处理。
5. **采用项目自动**：D11 已满足——listProjects readdir 自动发现 + createProject mkdir EEXIST 容错即采用；缺的是 08 原型 segc 二段 UI「新建目录 | 采用已有目录」+ pin②「采用=列出候选勾选纳管」。
6. **全局文件写边界**：根层 `readOnly = isRootListing` 全只读，根下散目录/文件无任何写端点；项目内写已齐。安全范式 = resolveProjectPath 的 realpath 双重校验（root-scope 端点同款加固）。
7. **子 agent 概览条**：现状 `bg-user/10 text-user` chips + animate-pulse——非 03e `.sub` 形态（绿 tint、整条可点、「▸ N 个子 agent 运行中 · 点按跳转 ›」）。`--tint-green`/`--color-tint-green` token 已备。

**批次范围**：
- **a. 文件工具完整化（03x/03w/03y/03z）**：新端点 `GET /api/projects/:name/files/search?q=`（递归 walk、跳 `.git`/`node_modules`、子串匹配、结果上限截断）+ 移动端搜索两态（复用 .wsearch 范式）；移动端 rename/move 弃 window.prompt 改 sheet 表单（03y kfield/krow 语义）；桌面菜单补「移动到…」；上传队列 hook + UploadQueueCard **双端单源**（桌面 FilesPanel 与移动 MobileFilesTool 共用）；拖拽多文件进队列。
- **b. 08 segc 二段**：项目创建 sheet 加「新建目录 | 采用已有目录」——新建 = 现行为；采用 = readdir 求 PROJECTS_ROOT 未纳管目录差集列出候选勾选（数据有据，纯前端分组）。
- **c. 全局文件写边界**：root-scope 新增 mkdir/upload 两写端点（`resolveProjectsRoot` + realpath 双重校验；新建目录名过 validateProjectName 同款语义）。**项目目录级 rename/delete 不做**：重命名破坏以项目名为键的会话状态（sessions/workbench atom/文件 cwd 记忆），删除已有项目级出口（项目删除流程）——记档。
- **d. 子 agent 概览条 v2 化**：改 03e `.sub` 绿 tint 形态，整条可点 `scrollToMessage`，多子 agent 逐条或聚合按数据形态定（有 parent_tool_use_id 可定位）。
- **e. 累积小项**：merged 分支置灰（project-git-diff.ts listBranches 补 `git branch --merged` 解析）；`.count` 取消（复用 cancelPending）+「立即重试」（新增 fireNow 走完整 canInject 校验 + injectionTimestamps 记账，公开方法）；03n `MobileSessionHistorySheet` 改 `useHistorySessions`（消灭 agent-sessions/agent-history 双管道，data-flow 铁律）；MobileSheet 补 Radix Description（`aria-describedby={undefined}` 显式声明）；`.sess .d2` 状态点改名 `.sess .sd`（`.d2` 双义消歧）；`.msheet` `76dvh` 改 `calc(var(--app-viewport-height)*0.76)` 派生。

**关键技术裁决**：
- 上传进度用 `XMLHttpRequest` `upload.onprogress`（fetch 无上传进度通道；仓库无 XHR 先例，**记档**）；队列 state 收敛共享 hook（单源），队列行 = 进度条 + 速度 + 百分比 + 取消（03z `.upcard`）。
- 冲突三选行内展开：入队时 HEAD 探测同名 → 队列行呈三选（覆盖 / 保留两者 / 取消）；服务端 uploadFile 加 `conflict=overwrite|keepBoth` 参数（缺省维持 409，兼容旧调用）；keepBoth 服务端派生 `name(1).ext`。
- 搜索输入即查（debounce），结果显示相对路径（mono）+ 点击进预览；清空 ✕ 回目录。
- 内容编辑不在工具内（spec §4.5 验收机检项）——M4 saveFile 是 Git diff 场景能力，文件工具不提供编辑入口。

**记档不做**：✦ 提交来源标注（D12）；wiki 服务端元数据化（D13 客户端 atom 已满足 spec 可见行为）；SKILL.md beacon / env 内存面（security 记档维持）；project scope MCP 详情入口（M9 评估）；M6 死码 CSS（无消费者不重落）；「>100MB 建议终端 rsync」阈值文案（真实上限 50MiB，按真实值走）。

## §6.9b M8 收口补记（2026-09-22）

**落地清单（a–e 批次全落）**：
- **a 文件工具**：服务端 `GET /api/projects/:name/files/search?q=`（递归 walk、跳 `.git`/`node_modules`、子串匹配、`FILE_SEARCH_LIMIT=200` 截断、Dirent 不跟随 symlink）；移动端搜索两态（复用 `.wsearch`，面包屑/搜索互斥，`.res` 计数 + `.xrow` 相对路径 + 点击进预览 + ✕ 清空）；移动端 rename/move 弃 `window.prompt` 改 `usePromptDialog`；`upload-queue.tsx`（新，双端单源）：串行 pump + `.upcard`（role=status）+ 409 行内三选（覆盖/保留两者/取消）+ 单行 ✕ + r1 清空 + 失败重试；服务端 `uploadFile` 加 `conflict=overwrite|keepBoth`（`normalizeUploadConflict` 白名单，缺省维持 409；keepBoth 派生 `name(1).ext`，999 上限）；拖拽多文件进队列（`file-browser.tsx`）。
- **b 08 采用**：`project-setup.tsx` `.segc` 二段（新建/采用）；采用候选 = `/api/root/files` 一级目录 − `/api/projects` 已纳管（客户端差集），勾选 + 计数按钮 + 逐个 `createProject` POST。
- **c 全局写边界**：`POST /api/root/files/upload`（`resolveProjectsRoot` + realpath 双重校验，index.ts:686 注释记档边界=上传仅此一路）；**root mkdir 未另立端点**——复用创建项目 `POST /api/projects`（偏离裁决，见下）。
- **d 子 agent 概览条**：`.subbar` 绿 tint（tint-green + c-success-text）整条可点 `scrollToMessage`；数据源 = claude-adapter 的 Agent tool_use + parent_tool_use_id 派生（hasAgentBody）。
- **e 累积小项**：merged 置灰（`listBranches --merged HEAD` 派生 `GitBranch.merged`，解析失败 undefined 不标；`.brow.merged .n` ink-2/400 + `.st.mg`「已合并」+ `.bsub.mg` ink-3）；`.count` 取消（复用 cancelPending）+ 立即重试（`fireNow` 走完整 canInject + injectionTimestamps 记账）；03n `MobileSessionHistorySheet` 改 `useHistorySessions` 单一管道（`enabled: open` gate——open 才拉）；MobileSheet `aria-describedby={undefined}` 显式声明；`.d2` → `.sess .sd` 消歧；`76dvh` → `calc(var(--app-viewport-height)*0.76)`。

**实现与裁决偏离（记档）**：
1. **上传进度**：裁决 XHR `upload.onprogress` 字节粒度 → 实现 fetch + **文件粒度**（prog = doneCount/(doneCount+items.length)，`.d` 行显示当前文件名/大小）。fetch 保持 abort/依赖单源；字节级进度无消费场景（单文件均 <50MiB、串行泵），不引 XHR 双通道。
2. **冲突三选触发**：裁决入队时 HEAD 探测同名 → 实现服务端 409（`PROJECT_FILE_TARGET_EXISTS`）触发行内三选。**无 TOCTOU 窗口**（探测与上传之间同名文件仍可出现），且少一次往返；代价是首传浪费一次上传请求体（可接受）。
3. **root mkdir**：裁决 root-scope 新增 mkdir/upload 两写端点 → mkdir 复用创建项目端点（`POST /api/projects` 自带 validateProjectName + 一级限制），根层「新建」语义 = 纳管新目录，两 UI 入口一个能力面，少一个端点少一分攻击面。

**探针发现的真 bug（修复记录）**：
1. **`?path=` vs `?q=`**（client.ts）：`withPathQuery` 生成 `?path=`，服务端读 `searchParams.get("q")` → 搜索恒空查询。改显式 `?q=`。
2. **`.sfield` 无 CSS**：组件用了不存在的类（实测 h38 ≠ 原型 30）→ §6.9 拍板单源 `.wsearch`，聚焦描边 `.wsearch:focus-within`（primary 55%，03x ①）。
3. **usePromptDialog holder 未挂载**：mobile-project-tools 三个 dialog holder 从未渲染 → 重命名/移动到/新建弹窗永不出现。补挂 ToolPanel 尾部。
4. **ActionMenu 长按路径双 bug**（action-menu.tsx，探针 fiber/dump 实证）：① menuitem（portal）click 按 **fiber 树冒泡**到行 onClick → 误导航进预览、行 pointerdown 又重置 suppressClick 使 guardClick 失效（frontend-notes §4 新实证：`{...lp.bind()}` 与 portal menu 组合）；② 长按 open 受控于 `contextMenuPoint`，`setOpen(false)` 关不掉 → sheet 残留与 onSelect 对话框层叠抢焦点。修：menuitem/取消 onClick 首行 `e.stopPropagation()` + `onContextMenuClose?.()` 先清受控 point 再 onSelect。
5. **jotai store 读写分裂**（main.tsx，upload 队列整体失效真根因）：无 prop `<Provider>` 私建 store，组件 `useAtomValue` 读私有 store，而 upload-queue 模块级 `getDefaultStore()` 写 default store → `.upcard` 永远空。修：`<JotaiProvider store={getDefaultStore()}>` 显式挂 default store（hook 与 imperative 写入同源）。
6. **pump 单行取消停整条泵**（code-reviewer P2）：两处 `aborted break` → `continue`（单行 ✕ 只跳过该行；清空靠 items 清空自然退出）。

**reviewer 结果**：
- **security：通过**（P1/P2 零）。逐项核对：search/rename.targetDir/upload/root upload 全走 `resolveProjectRelativePath`（`\0`/绝对路径拒绝 + isInsideOrSelf + realpath 二次校验拦越界 symlink）；conflict 白名单；root/files 只读一级 + blocklist + 不跟随 symlink；auto-retry status/cancel/fire 在统一鉴权后 + `getAgentRuntimeKey` 归属校验 + fireNow 不绕滚动窗口；argv 数组无拼接；错误文案不泄内部路径。**P3 记档**：① searchFiles 无遍历总量上限（limit 只限命中数，超大树慢查询——单用户自管低危）；② `resolveCreateTarget` 无 realpath（**既有代码**，M8 采用扩大使用面，后续补）；③ keepBoth `existsSync`→write TOCTOU（单用户低危，999 防死循环已到位）。
- **code：修复后通过**。P2-1 pump break→continue（已修，见上）；P3 已修：formatBytes 抽 `web/src/lib/format.ts` 解 upload-queue↔file-browser 循环 import、useHistorySessions 补 enabled gate（03n sheet 常驻挂载不再开场即拉）、ClaudeSessionDetailRoute 过时注释改写（「取消/立即重试不画」与 M8 新增 AutoRetryBanner 矛盾 → 改为 RetryIndicator 只读倒计时定位说明）；P3 记档：adopt for..of 部分成功不回滚（单用户低频、错误可见）。
- **design：修复后通过**。P1（reviewer 直接修）：`.btn.blue` 引用未定义变量 `--on-primary`（IACVT 回退继承 `.count .r1` 的 danger 红 → 「立即重试」蓝底红字）→ `var(--on-accent)`（03d 原型同款）+ 探针补 computed color 断言；P2 拍板**记档**：`.subbar` 取通栏 wrap 泛化形态（03e 原型 `.sub` 为单 chip 浮动圆角条，多子 agent 并行时浮动条溢出——颜色语义 tint-green/c-success-text 与原型一致，形态参数放弃记档于此）；P3 已修：移动端「移动到…」icon folder-plus → folder（与桌面一致）；P3 记档：files 搜索 input 13px（Wiki 同款，「同 Wiki」单源优先于原型 11.5px，M5 存量）。

**验证**：探针 `scripts/probe-v2-m8-gaps.mjs` **65 断言全绿**（7 Part：03x 搜索两态/几何/q 参数/计数/预览导航 + 03y 移动到 CDP 长按→prompt 预填→rename targetDir + 03z 队列三选/重传 conflict=overwrite/prog 前进 + 08 采用 segc/差集/逐个纳管/sheet 关闭 + 03d .count pending/fire/cancel + 03e .subbar 绿 tint/可点 + 03v merged 置灰主题无关 var 对比）；回归：M4 41/41、M5 46/46、M6 59/59、M7 68/68、e2e 29/29；四门禁（format/lint 0-0/typecheck/test 814+670+9）；CSS 硬闸 ✓；token 机检零新增。

## §6.10 M9 开工摊牌（2026-09-22）

**范围（总纲 §6 M9 行 + §7 待定项）**：iPad 三栏断点；Mac 分屏 + Inspector + 状态栏审批 + ⌘ 快捷键；触屏/hover 正交（frontend-notes §7）；桌面遗留收敛（M4 记档的桌面预览只读化、M6 记档的 09m/10m/07m 桌面版、security P3①②）。原「iPad/Mac 细节先与用户确认」**按 Q17 约定改为原型+最佳实践拍板并记档**（原型 04/05 系列即标尺，无需用户二次输入）。

**现状盘点（关键基础设施已在）**：
- 断点二档：`useIsMobile`（<640）+ `useIsDesktopViewport`（lg=1024，WorkbenchShell 三栏/单列分界）——**640–1023 中档（iPad 竖屏 820）当前落「非移动非桌面」空档**，行为待定义。
- 桌面三栏已在：左 ProjectLeftPanel（sidebar.tsx）+ 中 n 叉树 tab（WorkbenchLayoutV3：split/leaf/maximized，VSCode 式跨项目 tab）+ 右 RightPanelTabs（可折叠、rightCollapsed atom）。
- 分屏基础设施已在：WorkbenchLayoutV3 的 split/resize/maximized + onResizeSplit/ensureTabOpenLeaf 全套纯函数（含测试）——Mac 分屏 = 消费这些能力 + 补原型入口。

**拍板（原型 + 最佳实践）**：
1. **断点三档**：移动 <640（现有 4 Tab）；**中档 640–1023（iPad 竖屏）= 沿用移动布局拉宽**（4 Tab + 工作台内容区自适应，Apple 自家竖屏单列惯例；不另立一套）；**桌面 ≥1024 = 三栏**（iPad 横屏 1180 与 Mac 同构，04/05 差异只在列宽）。
2. **iPad 三栏列宽（04 原型值）**：side 260px / center 600px flex-none / inspector flex-1 min-width:0。Mac（05）：side 250 / pcenter 360 / pterm 300 / pinsp flex-1——**Mac 多一列终端窗格（分屏结果）**，基础态 = 三栏 + 终端经分屏开启。
3. **Mac 分屏入口（05 pin①）**：窗格 tab 条右侧分屏按钮（`rect+分隔线` icon）+ 分隔条拖拽手柄（grip ⋮⋮）——拖拽已有（onResizeSplit），补按钮与 grip 视觉。
4. **状态栏 sbar（05）**：底部固定条 = 连接点 + 「已连接 srv-01 · N 实例运行中」+ **「N 项待审批 ›」（warning 色，点击 → 审批中心 05f Popover）** + 右侧「今日 $X · N tok」。数据源：连接态（socket）+ 实例计数（refs）+ 待审批计数（M5 审批注册表）+ 费用/token（overview subtitle 同源）。
5. **快捷键全集（spec §10.2 原文，无增删）**：⌘N 新建实例 · ⌘1..9 切窗格/实例 · ⌘\ 分屏 · ⌘F 文件搜索（聚焦搜索框，10m pin④）· Esc 关浮层 · ⌘R 重连（断线时）。仅桌面（≥1024 + pointer:fine）绑定；输入框聚焦时 ⌘ 系仍可触发（Esc 交 Radix）。
6. **Inspector 四段（04/05）**：文件/Git/Wiki/历史 seg4——桌面现有 RightPanelTabs 的 tab 集对齐（rightTab 维度已有），补「历史」段（05c 历史 Sidebar 同数据：useHistorySessions）。**〔2026-09-24 复验拍板修订：右栏收敛为三段 文件/Git/Wiki，无「历史」——与 iPhone focus 工具同构（多端同构只是容器不同），历史由侧栏时钟态 05c + 中栏/移动 L3 承载；见 §6.12k 复验收口。〕**
7. **Sidebar 作用域（04/05 pin②）**：seg4 mini「项目/全部」——项目 = 本项目实例组；全部 = 跨项目分组列表（05g）。现桌面 Sidebar 已有 scope 概念（leftMode/global overview），对齐原型交互形态。
8. **桌面预览只读化（M4 记档落地）**：桌面 file tab 预览去编辑（saveFileContent API 保留，UI 入口移除）——03q 铁律 7「内容编辑器不存在」双端一致。
9. **桌面版页面**：09m 插件 / 10m 全局文件（含 ⌘F）/ 07m 设置（Mac 设置 = 07 同构宽版）/ 13 MCP 详情桌面入口（M6 记档「M9 评估」→ 做：pluginmcp_ focusId 开 tab）。
10. **触屏/hover 正交核对（frontend-notes §7）**：iPad 触屏 + 宽屏组合全量核对 hover-capable/touch 变体——hover 显隐功能在 iPad 上必须常显可达。
11. **安全/杂项收尾**：security P3② `resolveCreateTarget` 补 realpath（M8 采用扩大使用面）；P3① searchFiles 遍历总量上限；`.setrow`/`.logout` 等键盘 `focus-visible`；`w-[52px]` 真机值验证（真机项交用户，代码按原型保持）。

**批次**：a 断点三档 + iPad 列宽对齐 → b Mac 工作台（分屏按钮/状态栏/Inspector 分段〔当时四段，2026-09-24 拍板改三段〕/Sidebar 作用域）→ c 快捷键 + 05f 审批 Popover → d 桌面版页面（09m/10m/07m/13 入口/预览只读化）→ e 安全与键盘杂项。每批次探针断言 + 批次末 reviewer 三份 + 四门禁。

**批次 b 落地补记（2026-09-22，实现与拍板的差异 + 教训）**：
- **seg4 作用域落位**：拍板写「Sidebar 作用域」，实际落在左栏 InstanceLeftOverview 顶部（桌面左栏 = 项目/实例树两列结构，作用域分段属于实例总览区域而非 Sidebar 本体）——原型 04/05 的 side 区域在实现中由左侧两列共同承载。
  - seg4 mini 左右间距随左栏容器体系（px-2=8px）而非单源 margin 14px——与左栏 GroupHeader/卡片内容对齐优先，属落位差异自然子集（design review 2026-09-22）。
- **分屏语义**：05 原型分屏产物 = pterm（终端窗格），实现对齐「分屏并新建终端窗格」语义（POST terminal-sessions → dropIntoLeaf right），非空分屏。
- **sbar 数据源收敛**：费用/token 段不做（OverviewResponse 无费用字段，铁律不伪造数据）；服务器名无数据源 → 连接态简化为「已连接/连接中」。待审批 chip 批次 c 接 05f Popover（本批仅计数展示）。
- **seg 视图偏好不持久化**：作用域选择为组件内 state（默认「项目」），刷新回落默认——低价值状态不入 localStorage。
- **prune 时序教训**：create/resume navigate 先行 + `focusId` 保护已是既有约定（WorkbenchRoute prune effect 注释）；分屏新增第三条路径（POST → navigate → dropIntoLeaf）同样遵守。调试中真正的红因是**探针 mock 数据形状错**（overview candidate 用了 `id`，shared OverviewCandidate 实为 `sessionId`+`type`）→ globalRefs 派生出 `{undefined}` → prune 把非聚焦 tab 全判 stale。教训：**探针 mock 必须严格对齐 shared 类型字段名**（OverviewCandidate=sessionId / AgentSession=id 两套形状不可混用一个对象）。

**批次 c 落地补记（2026-09-22，实现与拍板的差异 + 教训）**：
- **快捷键六条落地形态**（spec §10.2）：⌘F 挪批次 d（10m 全局文件页接线时一并绑，不绑到尚不存在的入口）；Esc 关浮层 = Radix 内建（DropdownMenu/Dialog/Popover 的 onOpenChange 统一入口），无全局 handler；⌘N = 受控打开左栏创建菜单（ActionMenu 半受控化：可选 `open`/`onOpenChange`，受控值存 `workbenchCreateMenuOpenAtom`，移动 Dialog 分支不受影响）；⌘R = jotai 信号 atom（`workbenchReconnectRequestAtom`，`Record<sessionId, number>` 递增计数）→ SessionDetail 仅 `connectionStatus==="error"` 时消费 bump reconnectKey，**消费即清零**防后续 error 误触发自动重连。绑定条件 = `useIsDesktopViewport()`（≥1024）+ `(hover: hover) and (pointer: fine)`（frontend-notes §7 触屏/指针正交，Chromium 无法模拟、真机交用户）；hook 兼容 metaKey||ctrlKey（探针/非 Mac 平台用 Ctrl 系）。⌘1..9 = `collectLeaves(layout.root)[N-1]` → `onSelectTab(leaf.id, leaf.activeTabId)`（复用既有回调，零新导航管道）。
- **05f 审批 Popover 与移动同源**：同数据同逻辑（useApprovals 单订阅 ["approvals"] + respond 逐个 allSettled + 全部允许两段确认 + runtimeAlive 冻结），仅形态按 05f 紧凑单行（.ar1 行内 .abtns）；样式复用 .acard/.cnt/.all/.cmd 单源，新增 .apop/.ahd/.ar1/.abtns 四类。
- **⌘R 语义拍板（code review 2026-09-22）**：hook 层不知 connectionStatus，⌘R 在聚焦会话存在时无条件 preventDefault（含连接正常态）= 接受「工作台内 ⌘R = 重连聚焦会话」语义（spec「断线时」为推荐态）；正常态信号由 SessionDetail 消费端过期清零（非 error 态同样 delete），杜绝信号残留致后续自然 error 误触发自动重连。真机若反馈「⌘R 想刷新页面被劫持」再收窄。
- **05f Popover 视觉差异记档（design review 2026-09-22，均〔低〕）**：①圆角随 `ui/popover` 基类 `rounded-xl`=12px（原型 14px；基础组件一致性优先）；②无向下 caret（Radix Popover 无内建箭头，shadcn 标准形态不带）；③`.ar1` 内 projectName 用 `text-ink-2`（原型继承 ink-1；次级信息次级色的层级化）。字号已下沉 CSS 单源（.ahd 14px / .ar1 继承 12px），JSX 不散写任意值字号。
- **⌘N global scope 批次 d 确认项**：⌘N 在 global scope 静默不响应（spec 未限定 scope）；批次 d 落 10m 全局文件页时一并确认 global 创建入口形态。
- **⌘1..9 真机项**（并入 M9 遗留清单）：真实浏览器多 tab 场景 Ctrl/Meta+数字可能被 browser 层 tab 切换抢占，headless 单 tab 探针证不了，交用户真机验证。
- **探针 mock 铁律补两条**（与批次 b「形状对齐」同族）：① mock 须**完备覆盖 prune 依赖的数据源**——overview candidates 必须含分屏新建的终端（真实 overview 聚合必含运行中终端；缺它 → 切走焦点后 prune 判 stale 删 tab，⌘2 空窗，业务代码零责）；② 探针必须**隔离真实环境的 WS 推送**——m9b 曾漏 mock `/api/approvals/stream`，真实 api 的空快照经 `setQueryData` 整体覆盖 REST mock → 「待审批」chip 偶发消失（即批次 b 记录的「复跑绿」偶发真因，竞速：WS 帧先到则红、失败/慢则绿）。修法 = stream route abort，REST fallback 维持 mock 快照。另甄别一处**基线既有 flaky**（claude-auto-retry.test「pending 存在时重复 error」单跑稳定、全量偶发红，与 web 改动无关）。

**批次 d 落地补记（2026-09-22，实现与拍板的差异 + 教训）**：
- **07m 设置并入 mainPage 体系（IA 拍板）**：07-mac-settings.html 原型即标尺——side 恒定 sidewin + main 整页（mhead h1 17px/700 + .col max-w-[560px] 居中 + grplabel/scard/setrow/logout），footnav「设置」项 .on 激活。据此 M7 的居中 SettingsDialog 被 SettingsMainPage 取代（同文件复用 SettingsContent 单源），挂 desktopMainPage 的 settings 分支；删除的是壳（Dialog + Suspense lazy），设置内容零分叉。⌘N global scope 确认项闭环：**拍板不改**——mainPage 原型无创建语义，ghead plus 已是项目创建入口，project scope 开创建菜单、global 忽略。
- **mainPageActive 三条件（语义教训）**：`scope.kind==="global" && !focusId && (leftMode==="files" || leftMode==="plugins" || leftMode==="settings")`——必须**正面枚举**：leftMode 类型可选（undefined 语义 = auto），若写 `!== "auto"` 则 undefined 也判真，窄态被误判成 mainPage（TS2367 揪出的真 bug）。`!focusId` 保证 tab focus 优先：中栏焦点路由（/files/file/$ 等）继承 leftMode 透传也必须回工作台渲染 tab，不能落 mainPage。
- **导航闭环两坑**：① `/` 是纯跳板——indexRoute beforeLoad redirect 到 /projects/$key 或 /projects 且**丢 search**，footnav 设置必须 navigate to `/projects` + stickyWorkbenchSearch（to "/" 会静默丢 leftMode=settings）；② deriveWorkbenchRouteContext 的 /projects case 原本强制 leftMode:"auto"（活动栏 [项目] 防中栏 tab 透传污染左栏），会连 settings 一起抹掉——加例外 `s.leftMode === "settings" ? "settings" : "auto"`：URL 显式深链保留、[项目] 自然导航仍 auto。
- **移动端 leftMode=settings 投影**：MobileWorkbench effect 重定向 `navigate({ to: "/settings", replace: true })`——同一 URL 真相，两端 IA 各自正确呈现（桌面 main 整页 / 移动一级路由），replace 不在历史栈留壳。
- **⌘F 接线（10m pin④，批次 c 挪入项）**：`workbenchFilesSearchFocusRequestAtom` 计数器信号 → GlobalFilesOverview effect focus；gate = mainPageActive && leftMode==="files"（工作台内不劫持）。GlobalFilesOverview 同时内联 .wsearch 过滤框（filter state 本地，不进 URL）。
- **桌面预览只读化（§6.10-8 双端一致）**：FileTabPreview 去编辑链——saveToggle={null}、editValue 传 previewTextContent 但不传 onEditChange、保存按钮不渲；CodeEditor 加 `editable?: boolean`（默认 true）→ CodeMirror editable/readOnly；PreviewBody 以 `onEditChange !== undefined` 判可编辑。saveFileContent API 保留（移动 inspection 路径仍用），仅桌面 file tab UI 入口移除。
- **MCP 详情入口（13 pluginmcp）**：McpPanel ListRow 加 onOpenDetail 行点击 → `pluginmcp_${name}` tab 开 MobileMcpDetail（桌面中栏渲同一详情组件，与 13 原型「详情页」形态一致）；prune 跳过 pluginmcp（MCP 无 instance refs 对应物，不参与 globalRefs staleness 判定）。
- **.wsearch 复用取舍**：10m 全局文件搜索框复用 .wsearch 单源（30px）而非原型 .search 34px——与 /files 页同款组件单源收敛优先，同 seg4 mini「落位差异自然子集」逻辑。
- **探针 mock 铁律第④条**：preview mock 响应的 `name` 字段决定 md/html render 分支（name=README.md → render 模式不渲 CodeMirror）——探针断言 CodeMirror 必须 mock `.txt` 名。另记：**dist 半新半旧回归假红甄别**——m9b 复跑 16/1 红真因是 rebuild 时序（touch main.tsx + sleep 25-30s 不稳定），探针跑到半新半旧产物；甄别 = `rg -l "新符号" web/dist/assets/` + 源码恢复后复跑；**git stash 二分实验对探针无效**（探针跑 43012 的 dist，stash 源码不影响 dist 反而触发 rebuild 干扰）。

- **批次 d reviewer 三份处理（2026-09-22，code/design/perf 一次通过 → 1 高 3 中 6 低已闭环）**：
  - **〔高〕快捷键 deps stale closure（perf）**：use-workbench-shortcuts keydown effect deps 缺 `options.onFocusFilesSearch`——SPA 内 /projects→/files（leftMode auto→files）deps 全不变不重绑，闭包滞留 undefined → ⌘F 无响应；反向则 gate 失效劫持浏览器查找。探针 23/23 绿系 `page.goto` 整页加载掩盖（首绑即正确），SPA 转换路径未覆盖——**探针导航要含 SPA 内路由转换场景**。已修：deps 补回调。
  - **〔中〕三条已修**：① CodeEditor `onChange={onEditChange ?? (() => {})}` 每渲染新引用 → @uiw/react-codemirror reconfigure effect 全量重配（parse 树丢弃重解析）→ 模块级 `NOOP` 常量；② 09m/10m mainPage 缺 mhead h1（同批次 07m 已落，口径不一致）→ `MainPageShell` 壳补齐（与 SettingsMainPage header 同形态；mhead 内 seg4/plus 不还原——seg4「全局/本项目」语义由导航承载，plus 在 FilesPanel 工具行/ManageTab 承载）；③ 本补记 .wsearch 34/30px 方向写反 → 已按代码注释修正。
  - **〔低〕已修两条**：⌘F 计数器 atom remount 重放自动聚焦（effect 只判 `>0`，切页回来弹焦点）→ `lastFocusRequest` 只响应递增沿；leftPanel 末分支注释归因（实为 /files/file/$ 深链透传 leftMode=files + focusId 的可达路径，非不可达兜底）。
  - **〔低〕记档不修**：移动 leftMode=settings 深链首帧闪 MobileProjectsHome 再跳 /settings（仅深链可达，正常导航不产生该 URL）；filter 两次 trim/toLowerCase（列表量级小）；mainPage 切换卸载中栏 tab → xterm/WS 重挂数百 ms（§6.10-9 拍板语义：会话服务端不销毁、与移动切 Tab 同语义，高频切换成本已知取舍）；settings 模块并入主 chunk ~4-5KB gzip（SettingsRoute 本就静态 import 同模块，lazy 拆分早已低效）；10m 列表 pcard 分组 vs FilesPanel 扁平列表 + 工具行（M4/M8 既有组件承载）；09m main 三段分组 vs ManageTab 文字 tab（M6 已审形制）；sidewin 项目/实例树 + footnav 三项 vs 4 主导航 + footnav 设置（M2 D21 既定 IA）；MobileMcpDetail back 不带 sticky search（显式返回列表语义）；10m 搜索行内「⌘F」角标未还原。

**批次 e 落地补记（2026-09-22，安全与键盘杂项收尾）**：
- **resolveCreateTarget realpath 复核（security P3②）**：词法 relative 检查看不到 symlink 目标——PROJECTS_ROOT 顶层 symlink 目录在采用语义下会让后续 readdir/stat 带出根。realpath(target) 后 relative(rootPath, targetReal) 复核（rootPath 已由 resolveProjectsRoot realpath 化）；ENOENT = 全新目录放行（mkdir 语义），词法层已兜住。新增测试：顶层 symlink 指向根外 → PROJECT_PATH_OUTSIDE_ROOT。根内 symlink 放行（不逃逸，「采用 a 即 b 的内容」边界安全）。
- **searchFiles 遍历总量上限（security P3①）**：结果上限 FILE_SEARCH_LIMIT 只兜「命中多」，兜不住「匹配少但目录树巨大」（全树 walk 无上界）。新增 FILE_SEARCH_VISIT_LIMIT=20000，visited 计数达限置 truncated（语义一致：结果可能不完整）；options.visitLimit 供测试注入小上限。新增测试：visitLimit=2 + 3 文件 → truncated=true。
- **project-files.ts rg binary 附带修复**：751 行正则把控制字符写成**字面字节**（含 NUL）→ rg 判 binary 全文件检索失灵（须 -a）。改 \uXXXX 转义序列（语义等价）；oxlint no-control-regex 因此可见化——加 eslint-disable-next-line（该函数职责就是检测二进制控制字符，非输入校验）。教训：**字面控制字节写成转义序列，否则检索工具判 binary**；format hook 排版可能把箭头函数体换行，eslint-disable-next-line 要放在正则所在行的紧邻上一行。
- **focus-visible 统一环**：v2-primitives.css 新增 .setrow/.logout/.srow2/.footnav button/.seg4 span 五类 :focus-visible 规则（outline 2px solid --c-primary + offset -2px 内嵌防裁切）——浏览器默认 outline 深浅主题各一套、与 token 体系脱节。探针 I 段实测：Tab 激活键盘启发式 → el.focus() → matches(":focus-visible") + outline 2px solid。
- **.ar 对比度（M9 遗留收口）**：.setrow .ar「›」ink-3 深浅 1.86/1.68 < WCAG 3:1 UI 下限 → 提 ink-2（5.94/3.26 两态达标）。CSS 注释内嵌机检数据。
- **seg4 aria-controls**：作用域 seg4 span 补 aria-controls=instance-scope-panel + 内容容器 id/role=tabpanel——role="tab" 语义闭环（键盘 Enter/Space 批次 b 已有）。
- **w-[52px] 静态核对 ✓**：SettingsRoute 返回占位 w-[52px] = 原型 07 固定 52px 对齐居中标题（代码按原型保持）。**真机项交用户**（M10 总验收时一并验证）。
- **批次 e 验证**：探针 probe-v2-m9-e-focus-a11y 14/14 三连；api 816（+2 新测试）全过；四门禁 + CSS 硬闸 + token 机检（11 处既有零新增）过。reviewer：security/code/design 三份（perf 无渲染热路径改动跳过）。

- **批次 e reviewer 三份处理（2026-09-22，security/code/design 一次通过 → 0 高 0 中 9 低）**：security 确认三层防线闭环（词法 relative → realpath → real-relative；rootPath realpath 化假设成立；错误码零路径泄漏；visitLimit 用户不可达；TOCTOU 窗口毫秒级且在信任边界内记档——若加固 = mkdir EEXIST 分支二次 realpath 复验一行）；code 确认 real 层有意不做一级限制（symlink 指根内深层内容仍在根内）、visitLimit: 0 fail-closed 自洽、探针键盘启发式假设三连验证；design 确认 --c-primary 两态与 tokens.json 逐值一致、outline 随圆角、「值 ›」同灰阶为 iOS/macOS 惯例非倒挂。**已顺手修**：.ar 内嵌注释挪规则块上方（formatter 不再折行三行 value）。**记档不修**：TOCTOU 毫秒窗口；visitLimit NaN 未 clamp（路由层不透传，暴露时先数值校验）；ARIA tabs pattern 完整形态（tab id + aria-labelledby + roving tabindex）；focus-visible 环未覆盖 .pcard/.plus（默认 outline 仍在非缺口）；根内 symlink 放行对照测试；原生行 outline vs shadcn ring 两套焦点语言并存（分层形态不同，不强制合并）。

**记档不做**：iPad 竖屏专用布局（沿用移动拉宽）；iPad 竖屏分屏（触屏分屏交互成本高，桌面独占）；画中画/多窗口；PWA 桌面安装形态。

## §6.11 M10 总验收（2026-09-22）

> 形式：spec §9 验收清单 25 项逐项 ↔ 证据映射。证据物 = probe-v2 探针 ×11（M4–M9）+ v1 时代仍有效探针（M2/M3 证据）+ e2e ×13 spec（29 测试）+ 机检脚本三件（ar-verify-css / ar-verify-tokens / analyze-contrast）。标注 [真机] 的项按 Q17 约定交用户总验证。

**M10 过程记录**：

1. **e2e 基线甄别与对齐**：全套首跑 26 passed / 2 failed，失败两条（middle-tab-left「activity bar [Files]」）为**断言假设过时**——旧 IA 断言 /files = 左栏 aside 内 rootBrowse 文件树；批次 d 后 /files = main 整页 mainPage（GlobalFilesOverview），左栏保持 sidewin 项目总览（§6.10-9）。断言对齐 v2 IA（新定位 main 区文件树；「scope 优先」断言语义保持）后该 spec 9/9 绿。同 spec「<main> stays mounted」首跑即绿——佐证 mainPage 渲染在同一 WorkbenchShell `<main>` 内，保活语义未回归。同款第三处（file-nav「活动栏 [文件] 全局树」限定左栏 aside）一并修正；file-nav 上轮通过属 runners 时序差异，本轮恒挂复现后甄别同款修正。终态全套 **29 passed / 0 failed**。
2. **emoji 机检收口**：UI 渲染面扫描发现 ⚠/✓/✕/✎ 文本符号。⚠ 两处为原型偏差（原型 03 `.w` 行 = warning 三角 SVG，非文本符号）——已修：ClaudeSessionDetailRoute 审批托盘 mobile/desktop 两分支改 `<ShellIcon name="warning-triangle">` + flex 行，色走 `.tray .w` var(--c-warning-text)。✓/✕ 经对照为原型自有文本符号（03 `.ok` 状态、`.stat` 统计行、多页关闭钮）非偏差；✎ 三处（plan 面板反馈/选中标记）无原型对照页（plan UI 为 M3 实现侧补设计），记档保留。注释内 ⚠️ 非 UI 渲染不属机检面。
3. **静态核对**：字体 = system-ui 系栈（D15，dist 无捆绑字体文件、无 CJK webfont）；字号 rem 化 = M1 `--text-*` 语义档；路由深度证据引 M2（probe-ia-skeleton.mjs）。
4. **W4 形态偏差记档（M10 design review）**：spec 要求「运行摘要 chip 点开 = 运行配置 Popover」——实现为**静态摘要 chip**（mobile-project-header chips 行；同注释形态先例：terminal chip 因「1:1 绑 tmux 无切换」已记静态展示），运行配置切换能力在会话页 ModelSelector/PermissionModeSelector（▾ 按钮）。属 M3 范围遗留非 M10 新增缺口；是否补 chip-Popover 形态交用户总验证定。低项记档：托盘 warning SVG 14×14 vs 原型 14×13（viewBox 正方形等比无变形）；gap-1 4px vs 原型 5px（4px 为网格值）。

### §9 验收矩阵（25 项）

| # | 清单项 | 证据 |
| --- | --- | --- |
| A1 | 任意路径深度 ≤3；工作台内切换不加深度 | probe-ia-skeleton.mjs（M2 骨架）+ e2e mobile-nav / notfound-redirect；中栏 tab/leftMode 均为 search 维（workbench-model.ts），不加深 |
| A2 | 切 Tab/开 sheet/断线重连运行实例零丢失 | e2e middle-tab-left（InstanceArea stays mounted / `<main>` no WS reconnect）+ e2e claude-windowing（消息序号对拍） |
| A3 | 恢复后同一 Instance id | e2e terminal-session（resume 同 id）+ e2e claude-ask-question + §2 拍板「session 升格语义（closed 恢复复用同 id）」 |
| W1 | 工作台常驻仅 3 行；子 agent 条/托盘按需 | probe-mobile-workbench-states.mjs（M3 逐状态）+ probe-v2-m8-gaps（子 agent 概览条按需挂载）+ probe-v2-m5-approvals（托盘按需） |
| W2 | ＋ 常驻 pill 尾；标题 ▾ 切项目；上次项目记忆 | probe-v2-m5-sheets（03l 切换 sheet + pill 结构）+ e2e mobile-nav（landing create）+ workbenchLastProjectAtom（D4） |
| W3 | pill 状态点绿/灰/红与状态机一致；中断不改色 | probe-mobile-workbench-states.mjs（agent/idle/error/offline 逐态断言） |
| W4 | 运行摘要 chip = 运行配置（与 ℹ 同数据） | **数据同源半边成立**：probe-desktop-instance-info.mjs（ℹ 面板含 model/permissionMode/effort）。**chip 点开 Popover 未实现（M3 遗留偏差，见过程记录 4）**：摘要 chip 为静态展示，运行配置切换入口在会话页 ModelSelector/PermissionModeSelector（▾）；是否补 chip-Popover 形态交用户总验证拍板 |
| W5 | 工具图标原位高亮、再点返回；内容编辑器不存在 | probe-v2-m4-tools-l3（ticon .hl 高亮）+ probe-v2-m9-d（预览只读化 §6.10-8）+ e2e file-browser |
| W6 | 审批托盘聚合/逐条/批量/跳转；断线冻结 | probe-v2-m5-approvals（26 断言，REST+WS 双路径 + stream abort 隔离）+ probe-v2-m9-c（05f 审批 Popover）+ e2e claude-ask-question |
| W7 | 历史过滤三态、已结束恢复回放；✦ 来源 | probe-v2-m5-sheets（03n）+ probe-v2-m8-gaps（03n 单一管道）+ e2e claude-windowing；✦ 来源 = D12 已拍板不做 |
| G1 | 登录错误行内提示；token 免登直达上次位置 | probe-v2-m7-settings-auth（06 登录页完整态 + 错误行内）+ auth token 直达（e2e notfound-redirect 登录链） |
| G2 | 项目 Tab 全局活动列表 + 置顶紫标；项目行摘要 | probe-overview-pinned-nojump.mjs（置顶紫标不跳变）+ probe-overview-agent-subtitle.mjs（活动摘要）+ e2e mobile-nav（landing large title） |
| G3 | 插件作用域切换生效；更新需确认 | probe-v2-m6-plugins（作用域分段 + 更新确认流）+ probe-v2-m9-d（pluginmcp tab 桌面入口） |
| G4 | 文件 Tab 全局作用域；点项目文件夹进工作台 | probe-v2-m9-d（10m 全局文件 mainPage）+ e2e file-nav（全局树点文件全路径 tab）+ e2e mobile-nav [files] |
| D1 | iPhone Tab ×4 ↔ 桌面 Sidebar 一一对应 | e2e mobile-nav（four items）+ probe-v2-m9-multi-device（三档断点 nav 结构）+ probe-v2-m9-b（Mac Sidebar） |
| D2 | 未捆绑字体；无 CJK webfont；rem 化字号 | M10 静态核对（dist 无字体文件）+ M1 字体栈换底（D15）+ `--text-*` 语义档 |
| D3 | 界面零 emoji；iPad 常显大点击区；Mac hover 显隐 | M10 emoji 机检（⚠ 已修，见过程记录 2）+ probe-v2-m9-multi-device（iPad 常显）+ probe-pointer-variants.mjs（hover 正交，frontend-notes §7）[iPad/Mac 真机复核交用户] |
| D4 | 上传移动选择器、Mac 拖拽；冲突三选 | probe-v2-m8-gaps（03z 冲突三选 + 拖拽多文件）+ e2e file-browser（上传链） |
| D5 | 作用域切换生效；行带项目限定符；置顶最前；重名 tab 加后缀 | probe-v2-m6-plugins（作用域分段生效）+ probe-v2-m9-d（pluginmcp_${name} tab 后缀）+ probe-overview-pinned-nojump.mjs |
| D6 | footnav 文件/插件/设置仅遮盖主区；点会话行回工作台；零销毁 | probe-v2-m9-d（07m/09m/10m mainPage + sidewin 恒定 + 内容行点击回工作台）+ e2e middle-tab-left（`<main>` stays mounted） |
| D7 | Mac 页 07m/09m/10m 数据与 iPhone 同源 | probe-v2-m9-d（桌面 mainPage 与移动同 mock 数据源断言）+ probe-v2-m9-b（Inspector 分段同源；2026-09-24 起三段） |
| T1 | 业务代码无散落 HEX（机检） | `bun scripts/ar-verify-tokens.mjs`（report 模式：存活违例仅 SessionDetailRoute.tsx v1 遗留测试常量 9 处；v2 重写面零散落） |
| T2 | 双主题切换全屏正确（对比度抽查） | probe-theme-switch.mjs（双轨同步）+ `node scripts/analyze-contrast.mjs` + probe-v2-m9-e（G 段 .ar 对比度，批次 e 修复 1.86/1.68 → 5.94/3.26） |
| T3 | 深浅同名语义 token；SVG 示意值差异已备案 | tokens.json `$value` / `$extensions["mode.dark"]` 两态结构 + 本附录「浅色对比度已知限制」备案节 |

## §6.12 M10 用户反馈修复批次（2026-09-22）

> 用户 iPhone 总验证（Q17 兑现后第一轮真机反馈）报 8 问题，全部修复。证据：scripts/probe-m10-feedback-fixes.mjs（35 断言全绿，mobile 393×852 zh-CN，mock 会话 id 带 `agent_` 前缀过 inferSessionTypeFromId）+ 四门禁 + CSS 硬闸 + token 机检零新增 + e2e 29/29（globalCard 仅移动分化，桌面 viewport 不受影响）。

| # | 反馈 | 修复 | 证据（探针组） |
| --- | --- | --- | --- |
| ① | 全局活动置顶未真正置顶 | activityRows 排序链尾 `sort((a,b) => Number(b.pinned) - Number(a.pinned))` 稳定置顶——置顶组恒最前、组内保 rankGlobalInstances 序（agent 非跑/agent 跑/terminal/其他） | A：首行=置顶会话、组后 rank 序、紫标可见 |
| ② | 活动时间非实时（显示 1 小时前实则在跑） | 三层：relativeTime 移出 useMemo 改渲染时算 + 30s ticker 触发重渲染 + overview query `refetchInterval: 10_000`（服务端 recordActivity 本就分钟级截断 touch updatedAt，轮询不放大写盘） | 逻辑层保证 + 手动 checklist（节奏观感交用户） |
| ③ | 详情页右上 3 按钮应为「详情+更多」 | 删 nav 独立 ✕；moreMenu 收编「关闭会话…」；右上回归 ℹ+⋯ 两图标（082c/03k） | B：ℹ 可见、无独立「关闭」、⋯ 菜单含「关闭会话…」 |
| ④ | 文件工具版面未对齐 + 开发说明外漏 | 删 git.capToolReplace（见下方决策记档）；files.capBreadcrumb / wiki.readOnlyCap 保留（操作/边界提示非开发说明） | i18n 键删除 + 机检 |
| ⑤ | 会话信息浮层未对齐设计 | info-sheet 全量重写对齐 03k：grab 40×5 r3 / h2 text-title 17px 600 / 状态行 text-caption 600（● 状态 · formatAgeSuffix 时长后缀，TerminalSession 无 createdAt 不加后缀）/ krow 行分隔 divide-y sep-row / acts 三动作 text-subhead 600（重命名 primary · 置顶 pin · 关闭会话… danger）/ mono 字段（resumeId）/ footer 委托关闭（`closest("button")` 判断，动作已触发即收起） | C：grab/h2/状态行/分隔线/acts 三动作 5 断言 |
| ⑥ | 全局文件未对齐设计 | 对齐 10-tab：Large title 头 + gfcard 卡形态（项目行 = 徽章 30×30 r8 + 统计副行 files.projectMetaActive/Idle + live ● 徽章；散文件行 = mono 名 + relativeTime(mtime)） | E：7 断言（h1 30px/800、gfcard r16、徽章 30×30 r8、n 14.5px/600、副行统计、live ● N、无溢出） |
| ⑦ | 插件页内容溢出 | `.pcard .d2` 加 `overflow-wrap: anywhere`（真实 stdio 命令/技能路径长串；原型示意数据短，实现层防溢出非原型偏差） | D：长命令 fixture 下 scrollW ≤ innerW |
| ⑧ | 插件页未对齐设计 | 搜索框 `rounded-[12px]`（09 原型）；h1/segc/pcard/mrow/psect 此前已对齐 | D：h1 30px/800、搜索 38px r12、segc 32px |

**过程记录（review 闭环 + 一次探针挂诊断）**：

1. **code review**（1 中 1 低）：〔中〕globalCard 分支子目录层 rename 无编辑 UI（首版 rootLevel=false 简形态是原型不存在的自创形态且卡分支无行内 input）→ 修法 = 卡形态仅根层装配，子目录层退 ListRow（见决策记档）；〔低〕gfile onClick 死分支已删。
2. **design review**（1 中 3 低，无高）：〔中〕gfrow/gfile 容器补 `group` 类（行内 ⋯ 的 hover-capable 显隐载体，当前根层只读不渲染属预留）；〔低〕状态行后缀语义分叉（running「已 X」/其余「X 前」，见决策记档）；〔低〕gfile 数值微差与 projectMetaActive 副行重设计记档。
3. **探针 C 组挂诊断（vite 增量 build JS chunk 半新半旧实证）**：状态行语义分叉改动后探针恒挂 `TypeError: undefined.replace`——dist 实锤 `WorkbenchRoute` chunk 已含新调用点 `time.ranMinutes` 而 i18n 词典 chunk（icons-*.js）仍是旧 `time.age*` → t() 查无 key 返回 undefined → 插值 `.replace` 爆炸。ar-verify-css 硬闸只探 CSS 一致性，探不到 JS chunk 间不一致；处置同 §10 兜底（touch main.tsx 完整 rebuild 后 chunk 一致、35/35 绿）。**改 i18n 等跨 chunk 共享模块后，CSS 硬闸之外必要时对 dist 全量 rg 新旧 key 验证一致性。**

**决策记档**：

- **gf 前缀消歧**：10-tab 原型 `.frow`/`.fcard` 与既有 03o files 工具 `.frow`（17px 图标 + mono 路径行）同名不同物——新类 `.gfcard`/`.gfrow`/`.gfile`（`.psect`/`.dsect` 按页拆类先例）。`.gfrow`/`.gfile` 容器带 `group` 类（design review 2026-09-22）：为行内 ⋯（hover-capable 显隐，frontend-notes §7）预留 hover 载体——当前根层 readOnly 恒 true 时 actions 不渲染，属 M8 写边界演进时的预留。
- **10-tab 卡形态仅移动分化 + 仅根层**：globalCard 仅 useIsMobile 分支装配（移动 /files mainPage）且仅根层（`(currentPath ?? "") === ""`）——10-tab 卡形态只描述根层总览；子目录层与桌面保持 ListRow 通用行（行内 rename input 所在路径；首版 rootLevel=false「简形态」是原型不存在的自创形态且卡分支无编辑 UI，code review 2026-09-22 修 rename 回归）。
- **用户否决原型文案**：git.capToolReplace（「工具为内容去替换」）为原型内开发注释性质文案，用户裁定不入产品 UI——同类文案甄别标准：操作提示（capBreadcrumb）/ 边界提示（wiki.readOnlyCap）保留，开发说明删除。
- **03k 细节取舍**：~~krow chevron ›（行内编辑 affordance）未加~~——**第八轮批次 2b 已回退**：model/permission/effort 三设置行带 onSelect + › chevron（真实可点，见 §6.12h），其余纯展示行仍不加（语义同前）；kfoot「关闭需二次确认」未加——closeInstance 无确认流程，补确认流属独立功能项。
- **info-sheet footer 委托关闭**：03k `.acts` 操作行「动作即收起」语义下沉到 sheet 自身（footer 容器 onClick 判 `closest("button")` → onClose），调用方装配 footer 无需感知 close。
- **状态行时间后缀语义分叉**（design review 2026-09-22）：running = 「已 X」存续时长（time.ranMinutes/Hours/Days）；其余状态 = 「X 前」（relativeTime）。03k 原型「已 12 分钟」语义是运行时长，但 AgentSession 无 run-start 时间戳——running 用 createdAt 近似（中断恢复后读作自创建总时长），取舍记档。
- **gfile 数值微差**（design review 记档）：10-tab 原型 `.file` padding 10px 16px / 字号 13.5px / gap 12px，实现 `.gfile` padding 9px 0 / `.p` 12.5px / gap 10px——沿 03o `.frow .p` 12.5px 单源收敛取舍；原型 `.file` 左右 16px 叠加 fcard 16px 疑似原型自身冗余。视觉 ~1px 级。
- **projectMetaActive 副行重设计**（design review 记档）：10-tab 原型 active 副行「5 实例 · 项目根目录」（静态位置）→ 实现「N 实例 · 最近 X前」（时间）——更有用且呼应反馈②活动时间实时，属 i18n 层重设计非偏差回退点。

**真机复核项（交用户）**：②时间刷新节奏（30s ticker / 10s overview 轮询实际观感）、⑥gf 卡形态真机观感、iPad 触屏 hover 正交（frontend-notes §7 自动化不可达）。

### §6.12b 第二轮反馈修复（同日，commit `8cdc21b`）

用户复验追加 6 项：info sheet「关闭会话…」颜色（`text-error-text` 无物化无效类 → `text-error`，与原型 `var(--c-danger)` 逐值一致；「加粗」核实原型 `.acts span` 本就是 600，实现一致不动）、⑨工具态 chips 行隐藏（chips 渲染补 `!tool` gate——注释写了此语义但实现漏 gate）、⑩取消工具回原 tab（`onToolChange` 拆语义：工具打开不写 `rememberedMiddleTab`，退出 URL 去 tab 维度回退 remembered——remembered 语义收敛为「用户最后一次主动选的非工具 tab」；桌面左栏 middle tab 照旧）、⑪文件 L3 back = 完整父目录（03q 原型 `src/auth`；此前只取最后一段）、⑫浮层穿透（MobileFilesTool 文件行 onClick 首行 contains 判断，§4 fiber 冒泡；**全项目排查：其余调用点均已有防护**——ListRow primitive actions 容器 stopPropagation / chat-overview、shell-primitives 行卡片 contains / 桌面 popover outside 点击为「点到什么是什么」语义；ClaudeSessionDetailRoute 手写 scrim 低项无实害记档不动）、⑬ticon 间距 6px（视觉盒回原型 19×19，点击区改 after 伪元素 -inset-2 扩展 35×35 触屏可达不占布局）。探针扩至 37 断言（F 组 + C 组 danger 色双主题）。

**教训记档**：委托排查报告必须现场核对后采纳——本轮 fork 排查报告 6 项中 4 项误报（file-browser ListRow、chat-overview、shell-primitives、settings-dialog 均已有 contains/stopPropagation 防护，报告读取时漏看），真实缺口仅 1 处。

### §6.12c 第三轮反馈修复（同日，commit `e55da72`）

用户复验追加 4 项（⑭ + 历史 sheet 三项）：**⑭文件/Git 预览 back = 返回上一层**——`closeTransientFocus` 此前是 M4 旧设计「删 tab 回实例主体」，与 l3Transient backLabel 显示脱节；修为 file → 删 tab + `?tab=files` + cwd 同步父目录（03q back「src/auth」语义）、git → 删 tab + `?tab=git`（03r back「Git 检视」语义）。**历史 sheet 三项**（用户 mid-turn 补充，先看真实数据再修）：①无加载态——`isLoading` 骨架行（`[role=status]` + .hrow 几何灰条）区分加载与空态，与桌面 HistoryListSkeleton 同语义；②「标题除了最新的几个都不对」根因 = **CLI 空壳 session 文件**（启动即写 last-prompt/atis-latch、从未发消息，~207B，title/firstMessage/startedAt 三者全空）被历史管道照列——修在服务端 `extractEntry` 三者全空返 null 过滤（管道根因处，桌面/移动三消费点一起修好），单测补空壳 case；③不可下滑收起——MobileSheet 加 drag-dismiss：grab+shd 热区（`touch-none` 须在手势前生效故挂热区元素）、pointer 状态机 idle→pending→dragging（6px slop 保热区按钮 click 合成）、≥96px 或 ≥24px+0.5px/ms 惯性 → `onOpenChange(false)` 交 Radix exit 动画、否则 200ms 回弹；切换/新建/历史/审批全部 sheet 同享。探针扩 G 组 10 断言（47/47）。**方法论记档**：②类「显示不对」先跑真实管道看输出形态（`listAgentHistory` 直跑发现 12 条空壳）再定位根因，不猜；探针 G4 下拉两路径（距离收起/慢速回弹）断言手势状态机而非仅终态。

### §6.12d 第四轮反馈修复（同日，commit `2aa1672`）

用户复验 3 项，根因两类：**①Git 工具面板横向溢出（根因类）**——button 上 flex 原语行类 `.crow/.frow/.xrow/.hrow` 的 `width:auto` = **fit-content（非 block 的 fill）**，内容宽先撑开按钮，内部 `min-width:0` 的收缩/ellipsis 链（`.crow .m` 本有完整链）全部失效——修法 = CSS 单源 `max-width:100%` 护栏 ×4（不逐处补 w-full，护栏覆盖未来同族行）。**方法论记档**：诊断要区分 scrollWidth 假象（ticon after -inset-2 / psect .r margin-right:-8px 触区扩展）与真溢出；/plugins 页测到的 425px 溢出容器是保活层项目工作台的连带读数，源头在 Git 面板——修根因后「插件页溢出」即消失，不逐页打补丁。**②图标缺失（ShellIcon 未注册 = return null 渲染空白）**——「移动到…」菜单与桌面「移动到…」的 `name="folder"` 未注册，`project.svg` 本身就是 folder 形状（viewBox 带 tab 轮廓）→ 引用修正 `name="project"` 零新增资产；连带机检发现 `name="search"` 未注册 ×3（项目/插件/市场搜索框放大镜全空白）→ `name="magnifyingglass"`。**③预防性**：`.pcard .r1` 加 `overflow-wrap:anywhere`（长名无空格串防撑破，与 `.d2` 同款）。探针扩 H 组 10 断言（超长 commit message fixture 下 crow ≤393/ellipsis/截断生效/doc 溢出 0px；右键菜单「移动到…」svg；长名 http server 卡 anywhere；搜索框放大镜）→ 57/57；e2e 29/29。

### §6.12e 第五轮反馈修复（同日，commit `4bb596e`）

用户 iPhone 真机复验推翻上轮「插件页溢出系 Git 面板连带」结论：「搜索之下 MCP 服务开始超出右边」+「整个页面排版和原设计不一致」。根因实锤：**可点卡 button.pcard 带 w-full（width:100% 不扣 margin）叠 `.pcard` 横向 margin 0 16px → 右侧溢出 32px**；且溢出在内层滚动容器（overflow-y:auto 连带 overflow-x:auto）内部，doc 层探针测不到——**探针教训：横向溢出必须量滚动容器层，不能只测 documentElement**（H3 断言层已修正：卡右缘 ≤vw、卡宽 = vw−32、滚动容器 scrollWidth）。修法 = `.pcard/.mrow/.addsrc` width 三连渐进（-moz-available / -webkit-fill-available / stretch）——button 的 width:auto=fit-content 固有语义（同 §6.12d .crow 家族）在**卡片类**上的延伸：mrow/addsrc 此前无 width 呈 fit-content 窄条、button.pcard 靠 w-full 撑但叠 margin 即溢出；div 实例声明等价 fill 无害。连带对齐 09 原型：MCP 组 ＋ = 20×20 ShellIcon plus（原型 `.plus` 裸＋字形，非 `.psect .r` 的 11px 文字钮形态）。**对照方法论记档**：并排渲染原型 HTML 与实现页、逐元素量几何 + 逐类比对 CSS 规则——几何/CSS 数值全对齐后，剩余差异分三类：①真实移植偏差（＋形态，已修）②系统性基准差异待用户拍板：**行高**——原型无行高设定（浏览器 normal），我们被 Tailwind preflight 强制 1.5，v2-primitives 裸字号类（.r1 14.5px/.d2 11.5px 等）绕过 tokens.json 字号档（1.4 档只绑在 text-* 上），实测卡高 64 vs 原型 57；修法选项 A=裸字号类补 1.4（对齐 tokens 档）/ B=对齐 normal（像素还原）③能力边界摊牌项（§6.6：● 已连接 / mrow 计数列 / MCP 市场行 / d2 描述形态——无数据源不画，维持）。探针 63/63；e2e 29/29。

### §6.12f 第六轮：行高基准拍板落地（同日，commit `76ed3ab`）

行高系统性基准差异（§6.12e 差异②）用户拍板 **A = 对齐 tokens.json typography.line-height-ui = 1.4 档**（原型 normal 无数值可维护，tokens 1.4 是设计包唯一行高数值源；且 index.css 的 text-* 字号档本就绑定 1.4，裸 px 字号类对齐同档即全站一致）。落地：

- `index.css` @theme 物化 `--line-height-ui: 1.4`（token 变量，禁魔法数字）。
- `v2-primitives.css` 全量扫描（197 个含 font-size 的块）：188 个无行高块补 `line-height: var(--line-height-ui)`；**9 个已有明确行高意图的块不动**——终端/代码区 `.tterm` 22px / `.dcode` 18px / `.code` 20px / `.rocard .d` / `.ddesc`（紧凑列表行距惯例），单字符伪元素 `.send::before` / `.rtry` =1 等。
- 效果：`.r1` 行框 22→20.3px、`.d2` 17.25→16.1px，卡高 64→≈58（原型 57，差 1px 来自 padding 取整），整页垂直节奏收敛。
- 探针 H6 组（+4 断言）：`.r1`/`.d2`/`.psect` computed lineHeight = 字号×1.4 硬数据；9 个跳过块由 rg 机检保证未被覆盖。67/67；e2e 29/29。

**补丁脚本教训**：批量 CSS 补丁的「块内已有声明」判定必须以 `{` 到配对 `}` 的完整块文本为准——首版误用「上一个 `}` 到 `{` 之间的选择器段」判空，9 个已有行高块被双重插入（后声明覆盖原值）；git checkout 恢复重跑修正版，rg 总数复核（197 = 188+9）兜底。

### §6.12g 第七轮：MCP 官方市场接入 + 技能详情去重（2026-09-23，commit `a62bf2a`/`f6f8155`/`2e700e4`）

用户推翻 §6.6 摊牌 17 的「MCP 市场不画」裁定（「新设计里面是有包含这部分的」），指定数据源 = **registry.modelcontextprotocol.io 官方 Registry**（`GET /v0/servers?search=&version=latest`，公开无鉴权，只发元数据不分发）。三批次落地：

- **翻译裁定**（shared `mcpMarketEntryToInstallRequest` JSDoc 记档）：name = reverse-domain 末段（不满足 sanitizeMcpName 口径整条 skip）；remotes[0] 优先 → http/sse 直连；npm package → `npx -y <identifier>` stdio；pypi/oci/mcpb 不翻译（package=null → 禁装态「请在 MCP 服务器组手动添加」）；多 package 取第一个；表单值只并入实填键。
- **诚实口径**（registry 无这些字段，一律不画）：「✓ 认证」徽标、工具数、安装量、总量计数（09 市场行无 `.c` 列）、进度百分比——安装是同步 POST（`/api/mcp/add` 无 task 流），卡内降级「添加中…」disabled。新探针含 body 不含「认证/安装量/工具数/%」硬断言。
- **headers 链路闭环**（M6-b「首版表单不设 headers」记档）：`AddMcpServerRequest` += `headers?`；`buildAddArgs` http/sse 用 `claude mcp add -H "K: V"`（实测存在；全局 flag 必须在位置参数 url 之前，避 variadic 吞参）；手工表单仍不设，仅市场远程条目消费。
- **marketTab 命名裁定**：不能用 `tab`——撞 validateWorkbenchSearch 已有 `tab?: WorkbenchMiddleTab`（stickyWorkbenchSearch 全局 union 污染）；`marketTab?: "mcp"|"skill"` 路由特定维度不进 sticky 搜索（gitScope 同款口径）。
- **市场页单页双 tab**（原型 17/18 同页结构）：`.tabseg`「MCP 服务器｜技能」（数值源 17:18-20，span→button），navigate 整体替换 search（该路由无其他 search 维度）；tab 切换卸载另一 tab、搜索词不保留（不引 jotai）。缺省 skill 段。
- **registry 502 错误态**：列表行 text-error（页面不崩，可切 tab 恢复）；`ApiErrorCode` += `MCP_MARKET_FETCH_FAILED`。
- **12 详情去重三对**：name ×3 / description ×2 / 卸载文案 ×2。`FrontmatterCard` 加 `excludeKeys`（通用组件，消费方排查 = 唯一入口 MarkdownString，仅技能两处传）；dtitle 改 `hasUpdate ?` 才渲染且只剩 chip（**视觉变化：name 只在 nav h1 单点显示**）；rmnote 换 `skills.uninstallNote`（卸载前将弹出确认；卸载后活跃会话立即重载——有据 reloadAliveSessions）。
- 验证：新探针 `probe-v2-m6c-mcp-market.mjs` 53/53（含外域 mock 形态——UI 只见自家 `/api/mcp/search` 翻译后形态，翻译逻辑由 api 层 17 单测覆盖）；`probe-v2-m6-plugins.mjs` 修正后 66/66；e2e 29/29；四门禁 + CSS 硬闸。

**探针教训**：① Playwright route glob 不匹配带 query 的 URL——`**/api/mcp/search` 命不中 `/api/mcp/search?q=x`，须尾带 `*`（同 `**/api/skills/search*` 惯例）。② mock「翻译后形态」的数据必须按消费端契约构造——pypi 条目在翻译层 package=null，mock 里给它 package 对象会让 UI 显示可安装，测的不是真实链路。

### §6.12h 第八轮：插件详情退出 tab 体系 + 会话浮层置顶与运行配置选择面（2026-09-23，commit `762a9c5`/`bd14731`/批次 2b）

用户 iPhone 复验两问题：①「在插件中打开技能详情，工作台却多了几个 tab——在多个端都不成立，这是旧设计了」；②「会话详情浮层顶部应显示会话名称，还缺乏 effort，模型+权限+effort 理应带箭头可点设置」。

**批次 1 — 插件详情 pluginView 化**：根因 = `/plugins/skill/$`、`/plugins/mcp/$` 解析 focusId 写 layout **无 isDesktop gate**（移动端也写 localStorage），且 skill/pluginmcp tab 不参与 stale prune，多端累积只能手动 ✕。迁移对齐 market/sources 的 pluginView 范式：两条全局 URL 改 `focusId=undefined + pluginView "skill"/"mcp" + pluginName`（splat 名）+ leftMode 强制 plugins，URL 路径形态保留（deep link 兼容）；pluginmcp tab kind 全链退役（唯一来源即 /plugins/mcp/$）；**project scope `/projects/$key/skill/$` 保留 tab 机制**（移动项目 tab 带 pills 与桌面中栏 tab 是 2026-08-16 既成语义，与 file/git 同构，用户抱怨的是全局入口泄漏）；skill tab kind 保留。存量清洗双机制：skill tab 一次性剥离（迁移标记 `workbenchLayoutV4PluginTabCleaned` 防重入）；pluginmcp 存量由 `normalizeRef` session 兜底分支**防御剔除残缺 ref**（缺 projectName/sessionId → null——union 已删但运行时 JSON 仍含该 kind，不防御会产出无效 session tab）。探针 m9-d B3 改「恰 1 + .cfg 详情容器」（tab chip 消失）；probe-plugins-page.mjs（旧 IA）与 probe-mobile-focus-actions.mjs（v1 聚焦态结构）记档废弃删除——后者已被 m10 接棒。

**批次 2a — 浮层会话名置顶 + effort 行**：`useInstanceInfoActions` 标题改 displayName（terminal 无名回退 i18n title），name krow 删除（三入口一处改全生效）；effort 行进 krow（label「推理 effort」对齐 03k:67 原文，值原样不 i18n 与 EffortSelector 同口径，缺省 high）。死键 instanceInfo.name/.status 删除。

**批次 2b — 三设置行 chevron + 运行配置选择面**：`InfoField` += `onSelect`（行可点 + › 右 chevron affordance，对齐 03k:65-67——§6.12:519「chevron 未加」记档随之回退）；点开 `RuntimeConfigDialog`（单字段下钻面，双形态 sheet|modal 跟随 info sheet，Radix 嵌套 dialog 官方支持）。**架构点：per-session bridge registry**——ℹ 浮层由 tab 带/移动 header 装配，不在 ClaudeBridgeContext Provider 内，而切换协议只走 WS bridge（control_request / set_runtime_effort 无 REST 路由）：claude-adapter 加 module Map（`claudeBridgeKey/registerClaudeBridge/getClaudeBridge`），ClaudeChat 挂载注册/卸载注销（bridge 引用 useMemo 稳定），选择面打开时同步取用（非响应式，无需订阅）。选项数据零复制：detail 查询同 queryKey 缓存 + 共用映射函数（`modelDisplayLabel`/`PERMISSION_MODE_LABELS` 改 export，currentAlias 反查提取为 `resolveCurrentModelAlias`——ModelSelector 同步改用防双实现漂移；effort 用 shared EFFORT_LEVELS）。**诚实取舍记档**：选择面无会话页 selector 的 spinner/回滚状态机（modelSwitchVersion/currentResolved 联动）——切换即收起，值由 detail invalidate 重取回填（effort 同款语义）；effort running 切换复用 `claude.effort.restart*` danger confirm；bridge 未挂载显示不可用空态不伪装可点。i18n 仅新增 `session.runtimeConfig.unavailable`，行/标题复用 instanceInfo.* 键。

- 验证：workbench-model 单测 97（深度页派生断言重写+新增+残缺 ref 清洗）；m10 探针 C 段 +6 断言（h2=displayName / 无名称行 / effort 行 / 三行 role=button+chevron / 点模型行双层 dialog / Opus check 选中态 / 点选收起）全过；desktop-instance-info 复活（旧 login 选择器修新）ALL PASS；m6 66/66；e2e 29/29；四门禁 + CSS 硬闸。

### §6.12i 第九轮：技能详情溢出与行动钮塌宽（2026-09-23，commit `052832a`/`4bddc6c`）

用户 iPhone 复验两问题：①「技能详情有时横向溢出，内容里有超长 URL」；②「技能中的卸载按钮都集成一团了」。

**① 超长 URL 横向溢出**：`MARKDOWN_CLASS` 容器级 `[overflow-wrap:anywhere]`——overflow-wrap 可继承，一处声明覆盖全部后代（markdown 正文/代码/表格内 URL）；`anywhere` 把软换行点计入 min-content，比 `break-word` 在嵌套约束链下更稳；仅词超容器宽时介入（正常排版零影响）。`.dmeta`/`.ddesc` 同步补断词。10 个 markdown 消费方全站受益。m6 探针 +1 断言（mock 正文塞 200+ 字符 URL；量滚动容器层不只 doc——§6.12e 教训）。

**② 行动钮塌宽（button width:auto = fit-content 家族收官）**：根因与 .pcard/.addsrc（M10 第五轮）同族——`.rm`/`.cta` 自 M6（fb49dde）引入时即漏 width 三连，原型整宽行钮（.rm 描边卸载钮实测 41px，应 358px）移植成 `<button>` 后 width:auto 塌成 fit-content。修复 `.cta`/`.rm`/`.logout`/`.readbtn` 四类补 width 三连（注释口径同 .pcard）。**系统性扫描收官**：python 正则全量交集（button 宿主 × CSS 横向 margin 无 width，237 个 button 挂载类）仅 6 候选——`.loadmore`（`16px auto` + 无底无框 11px 小字，居中文字钮 fit-content + auto margin 居中即设计意图，不修）与 `.ap-row`（横向 margin 为 0 + 宿主 w-full，误报）排除。m6 探针 Part 2 +1 断言（.cta/.rm 整宽 = vw-32，修正前 rm=41 必挂）。

- 验证：m6 68/68（+2 断言）；四门禁全绿；CSS 硬闸 + content-type text/css。

### §6.12j 第十轮：移动底部导航恒显 + 多端整体对齐设计包（2026-09-23 起，批次 1 `79e68e7` / 批次 2 `052feda` / 批次 3 `848a04a` / 批次 4 `bf31c1b` / 批次 5 `1c99f26`）

用户 iPhone 复验两问题：①「工作台理应和原型一样显示底部导航」；②「其他端没有对齐到设计，差距蛮大的——目前 iPhone 对齐最好，其他端并没有」（用户澄清：非单指插件页，是**端级整体对齐**，全量修，除数据依赖项）。

**批次 1（移动 nav 恒显 + 通栏，`79e68e7`）**：原型规则 = 移动端除登录外恒显 tabbar（02/03 全系含 L3 与聚焦态共 22 页、仅 06-login 无）；旧实现只在 global 一级页显示。ShellMobileBottomNavigation 浮岛 → 通栏（对齐 components.css .tabbar 单源）；nav 恒显三分支 main 渲染；避让链（--composer-gap 注入 navH+4px−env，消息 spacer 自动跟随；键盘弹出盖 nav 属 iOS 原生同款预期）。新探针 m11 14 断言。详见 commit 正文。

**批次 2（桌面形制统一，`052feda`）**：
- **tabstrip（用户拍板「改向原型 tabstrip」）**：GroupHeader 胶囊 tab 条 → v2-primitives `.tabstrip` 单源形制（32px + bg-tabstrip + border-b sep + gap 16px）；WORKBENCH_TAB_BAR_PX 36→32 联动（flatten-layout 面板顶部 calc 下推）。TabChip → `.tb` 形态：胶囊底色/provider marker/font-bold 退役，12.5px 文本 + on 态 ink-1 600 + ::after 2.5px 主色下划线 + 6px 状态点（statusDotToneBg 单源，session/terminal 有、其余纯文本与原型非 session tab 一致）。条上「＋」= 新建实例入口（05d 锚点语义），与左栏 CreateSessionBar 共用 createSessionMenuItems 单源。DragSourceCard 拖动/右键菜单/ℹ RuntimeConfigDialog/AutoRetry 接线全保留（DragGhost 仍消费 marker）。
- **检视 seg4**：右栏 Inspector 胶囊 TabButton → glabel2「检视 · 只读」+ 标准 .seg4（32px 四段〔2026-09-24 起三段，见 §6.12k 复验收口〕，span role=tab 键盘可达）；TabButton 保留 export 给批次 3/4 收敛对象。
- m9-d 探针 +Part F 14 断言（tabstrip 几何/token bg/下划线 2.5px 主色/状态点 6px/＋/seg4 32px/glabel2）；m9-b 适配 seg4 选择器。

**批次 3（检视 IA 收敛，用户拍板「左栏只留实例+历史+插件」）**：ProjectLeftPanel middleTabs 按 LEFT_PANEL_TAB_IDS（overview/history/plugins）过滤 buildOverviewTabs（移动端共用源不动）；files/git/wiki/pages 分支与面板删除，相应 props（onOpenFile/onOpenGitFile/onOpenGitCompareFile/onCardDragStart）从 ProjectLeftPanel 卸下（WorkbenchRoute 注入同步删；onOpenGitFile/navigateToGitCompareFile 因移动/恢复链路仍消费保留）。URL ?tab=files 等旧直链落集合外回退 overview。**右栏 Inspector 四段成为唯一检视入口**；e2e middle-tab-left（Files/Git tests → Plugins）、drag-source（拖源换 /files 全局链路）、file-nav（删 middle tab 链路 test）同步适配。

**批次 4（桌面市场可达 + mainPage 重排 09m/10m）**：
- **市场可达**：/plugins/market、/plugins/sources 桌面 ≥1024 直达——mainPage pluginView 分支补 market/sources → MainPageShell 包 MobileMarket/MobileMarketSources（先例：SkillTabPreview/MobileMcpDetail 桌面复用移动组件）；旧实现 desktopMainPage plugins 分支不消费 pluginView，市场页桌面不可达。
- **插件页 09m 单页**：桌面 mainPage = MobilePluginsOverview（09 单页三段：MCP 服务器组 + 已安装技能组 + 市场组，作用域 segc + 本地搜索）替代 PluginsPanel skill/mcp 大段切；新增 hideTitle prop——标题由 MainPageShell 17px h1 承担（09m .mhead 形态），segc 限宽 290px 对齐 09m seg4。PluginsPanel 保留（项目内左栏 plugins tab，批次 3 拍板口径）。MCP 卡「● 已连接/N 工具」live 徽章数据依赖不画（McpServerEntry 无运行时状态，§6.6 摊牌同口径，D 批）。
- **文件页 10m**：GlobalFilesOverview 新增 variant="page"（桌面 mainPage）——seg4「全局/本项目 · <名>」作用域（=workbenchLastProjectAtom，页内切 rootBrowse cwd 不进 URL）+ .wsearch 补 ⌘F 角标（11px ink-3）+ 根层 gfcard 分组卡（与移动 10-tab 卡形态同源）；variant="panel"（默认）= 左栏粘性文件语境通用树不变，移动不传 variant 走 isMobile 卡形态分支。10m plus「新建/上传」不实现——语义已在 FilesPanel 工具行承载（MainPageShell 注释既有口径）。
- m9-d 探针扩展：A1 改 09m 结构断言（psect MCP 组 + segc）+ A3a-d 10m（seg4 恰 1/双段 tab/⌘F 恰 1/gfcard ≥1）+ B5-B7 market/sources 桌面可达；46 断言全绿。

**批次 5（05g「全部」分组列表 + iPad 项）**：
- **05g 分组列表**：`AllSessionsGroupedList`（instance-area.tsx，InstanceLeftOverview「全部」段与 GlobalProjectsOverview「全部」视图共用）——microlabel 置顶段（pin 图标 + 名 + `.live.off` 项目限定符）+ 项目分组（microlabel「{{NAME}} · {{N}}」uppercase + srow2.inst 行 dot2 状态点：running 实心 c-success/其余 1.4px 空心 ink-2，running 行 600 ink-1）+ 空项目组「暂无活跃会话」引导行。置顶段 settled gate 沿用 GlobalProjectsOverview 口径（pinned 后到不跳变）。**点行导航组件内化**（验证期发现并修复的实质 bug）：行点击 = 组件内 useWorkbenchNavigate，行自身 candidate.ref 构造 URL——project scope 下 WorkbenchRoute focusInstance 的 resolveProjectName 走 scope.key 捷径，跨项目行会生成错乱 URL（/projects/proj1/session/<proj2-id>，与 focusPanel 注释 :366 铁律同源）；sticky search 维（leftMode/rightTab/tab/mode）透传对齐 navigateSession。seg4 mini（项目/全部）仅 ≥lg 渲染（05g pin① iPad/Mac 专属，iPhone 维持层级）。行不可拖（05g 无拖放语义）。
- **aprow 审批橙行**：ProjectLeftPanel 根底部（04 原型「实例区下」语义，**非** sidebar.tsx——ProjectLeftPanel 是桌面左栏统一容器，project scope 恒显含三 tab）；project scope + approvals>0 才渲染，点击 = ApprovalPopover（05f 审批中心复用，卡片/应答/两段确认全同）；useApprovals 与 StatusBar 双订阅同 queryKey dedupe 零额外请求。`.aprow` 类入 v2-primitives.css（30px + tint-orange 衬底 + c-warning-text 前景，原型 04:12 数值原文）。
- **侧栏分档**：SIDEBAR_WIDTH_IPAD 260px（1024–1179，04:12）/ SIDEBAR_WIDTH_MAC 250px（≥1180，05）——`useMinViewport(1180)`（workbench-model，matchMedia）二档切换，--workbench-activity-col 注入。
- **i18n 插值语法**：本项目 translate 实现 = `{{count}}` 双花括号（home.nRunning 先例），批次 5 误写单花括号致插值失效（microlabel/aprow 原样输出模板）；探针 G9/G3/G4 断言拦住。
- m9-d 探针 +G1-G16（05g 分组结构/置顶限定符/跨项目激活/aprow tint-orange computed·30px·Popover/250-260 分档 + Part 2 1100×800 iPad 档）= 62 断言全绿；四门禁 + e2e 27/27。
- **教训：dist JS 半更新态**——CSS 落盘硬闸 ≠ JS chunk 落盘稳定：vite build --watch 增量改多个 chunk 时中途跑探针会载到新旧混合 chunk（错误边界 "Something went wrong" + asides=0 假象，二分 mock 误导向「approvals 非空即崩」）；同代码稳定 dist 下复跑即过。跑探针前 touch main.tsx 完整 rebuild 再等 16s 落稳。

**批次 6（零散补齐）**：
- **文件行菜单 05e 五项**（05e-mac-inspector-file-menu.html :68-72 原文序）：打开预览（file 图标，仅文件行——目录无预览语义）/ 重命名 / 移动到… / 上传文件…（plus 图标，`onUploadClick` 新 prop → FilesPanel fileInput，readOnly 不传——上传语义属编辑态）/ 删除。FileEntryList.renderActions items 重排，rootBrowse 根层只读口径不变（isRootListing → 无 ⋯）。
- **宽屏中栏 360px 评估后不做**：批次 2 tabstrip 落地时 WORKBENCH_TAB_BAR_PX 联动 flatten-layout 刚落，中栏宽度模型再动会牵动分屏树/拖放/resize 全链路回归面；宽屏信息密度收益低（中栏 flex-1 已自然占宽），多 tab 分屏时 360px 反而挤压工作区。
- **probe-files-tree-bugs IA 适配**（批次 3/4 重排欠账，本批补齐 ALL PASS）：①setupMocks 补 overview/subtitles/approvals 隔离 mock——桌面 sidewin 项目总览穿透真实 api 曾污染滚动容器查找（measureScroll 选到 sidewin 容器）与根层点击定位；②measureScroll 滚动容器限定 .wsearch 所在 section（桌面多 overflow-y-auto 容器全局首个匹配会选错）；③进入项目点击从 `[data-list-row-title]` 改 getByText("dir-00")（mainPage 根层卡形态无 ListRow）；④新增批次 6 断言：文件行菜单 05e 五项序（中英双语 + 过滤移动 sheet Cancel 项）。

### §6.12k 第十一轮：桌面 IA 对齐原型——会话实例合并进侧栏（4 列 → 3 列）（2026-09-24，批次 1 `4a0e61f` / 批次 2 `4cdf2ab` / 批次 3 `7f99411`）

**背景**：第十轮真机复验报两问题——①移动 terminal 聚焦态高度缺块（`4f82296`：聚焦态输入抽屉避让底部导航，高度链修复）；②「桌面端的实现很明显和设计不一致，会话实例是合并在侧边栏的」。调研实锤：原型 side 是跨页恒定单栏（05/04/05g/05c/07m/09m/10m 七页同构：ghead 项目+plus → srow2 项目行 live 徽章 → dsep → seg4 mini → 实例区 microlabel 分组 + srow2 inst → aprow → footnav 三项），实现却是 4 列过渡态（Sidebar 纯 4 目的地导航 + 左栏 ProjectLeftPanel middle tabs + 中栏 + 右栏）。

**关键裁定（按原型执行，不再询问）**：
- 4 目的地导航退役 → footnav 三项（全局文件/插件/设置）；
- 实例卡片网格与手风琴项目卡退役 → srow2 行列表，点行开 tab 替代拖放（05g pin⑤；side 行不可拖）；
- middle tabs 退役：历史 → side 实例组头时钟切 05c 列表态（再点返回）；插件 → footnav mainPage（09m 单页三段）；
- ProjectSwitcher ▾ / PanelHeader title / 左栏折叠 / 左栏 resize 整套退役（04 pin③ 标题无 ▾）；
- aprow 移入 side，gate 放开为**全局聚合**（04 pin④：任何桌面 scope approvals>0 渲染）；
- **项目行操作（重命名/删除/置顶）随手风琴退役——记档不做**，创建入口保留 ghead plus（重开需用户发起）。

**批次 1（`4a0e61f`，WorkbenchShell 3 列 + 合并 side 主体）**：grid 四轨道 → 三轨道；删 leftPanel/leftPanelTitle props、左 aside + 左 RailButton/ResizeGutter。side 分档沿用 260（1024–1179）/ 250（≥1180，`useMinViewport(1180)`）；中栏 `minmax(0,600px)` 机制不变；右栏收起态 aside 整个不渲染（grid 2 children、中栏吃满，非 0px 轨道）。WorkbenchSide 结构：项目组 → 项目 srow2 行（selrow + `aria-current="page"`；点行 = useWorkbenchNavigate project + sticky search 全维透传）→ dsep → seg4 mini（Project/All，仅 project scope，组件内 state 不持久化——§6.10 批次 b 口径）→ SessionModeTabs（global scope leftMode=auto 语境）→ 实例区 tabpanel：project「Project」= ghead「Instances · <名>」+ 时钟（切 05c HistoryList + HistoryRangeControl）+ plus（createSessionMenuItems 单源 + workbenchCreateMenuOpenAtom ⌘N 半受控）+ microlabel 分组（Agent sessions/Terminal；chat 会话是 global 资源不分组，不伪造 CHAT·PI）+ SideInstanceRow（dot2 状态点 + 点行 focus）；「All」/global = AllSessionsGroupedList（05g 单源复用）→ aprow（useApprovals WS + ApprovalPopover 05f）→ footnav 三项（All Files = navigateRoute /files；Plugins = /plugins；Settings = /projects + leftMode=settings；active 判定 = `global && leftMode==X` 的 .on class）。

**批次 2（`4cdf2ab`，退役清理）**：project-left-panel.tsx、InstanceLeftOverview/InstanceGrid 卡片网格拖源链、CreateSessionBar、GlobalProjectsOverview 桌面挂点 + GroupedProjectsList 手风琴（workbenchProjectGroupsCollapsedAtom 随删）、ProjectScopeHeaderTitle/ProjectSwitcher、workbenchLeftCollapsedAtom/workbenchMiddleLeftWidthAtom + 迁移 effect 全删；chatMode 左栏分支收敛（mode 中栏语境保留）；PluginsPanel 左栏挂点退役。

**批次 3（`7f99411`，探针/e2e 适配 + 实现修复）**——适配过程揪出并修复 **5 个真问题**（本批价值核心）：
1. `/projects/session/$id` derive 补 leftModeFallback（chat focus → "auto"）：URL 省略 = 默认语义，stickyWorkbenchSearch 不写 auto 键，derive 需兜底 SessionModeTabs 语境才成立；
2. WorkbenchSide 直读 context 补 `leftMode = "auto"` 解构默认（旧 WorkbenchRoute 解构默认层已删，直读组件需自带）；
3. §8 高度链两层断链：shell 右栏 body div 与 right-panel-tabs 的 inspector-tab-panel body 缺 flex——overflow 只裁不传约束，检视 FilesPanel/CodeMirror 0 高 hidden（save-scroll 探针实锤）；
4. MobileFilesTool 自实现丢 §13 受控模式 404 回退（listing.error → onPathChange("")）；
5. **WorkbenchSide 漏挂 create.promptHolder**：side plus 菜单选类型后 prompt 状态开但不渲染 → 桌面建会话入口全断（useCreateSession 契约「promptHolder 由调用方渲染」被批次 1 遗漏；terminal/drag-source e2e 复现后修复）。

探针侧：probe-chat-mode（占位 detail 时代断言）、probe-view-tabs（总览 ViewSwitcher 网格/分组/表格已整体退役 + pages 中间 tab 入口退役——Inspector 四段无 pages 段，§6.10-6）、probe-left-tab-overflow / probe-project-row-layout / probe-project-switcher-desktop（断言对象退役）删除；m9-b/c/d/multi-device 与 focus-header/ia-skeleton/cwd-memory/html-img-inline/save-scroll/tab-overlap 适配 aside 索引（`main > div > aside` 3→2：side=0/Inspector=1）与 side 结构断言。

e2e 侧：middle-tab-left 重写为 desktop-side（side 结构 + footnav 导航与 .on 跟随 + scope 优先级 + `<main>` 保活 marker）；drag-source 重写为 tabstrip tab 拖拽分屏——**文件树源与落点在 v2 不同屏**（GlobalFilesOverview 只在 mainPage 渲染，`desktopMainPage ?? instanceArea` 二选一；Inspector FilesPanel 不接拖源），且单 tab 拖自身 leaf 边缘 = drop-to-self no-op（§7.2）→ 建 2 tab 拖左 zone（deriveZone 边缘 15% 带垂直中部，上下优先于左右）断言 GroupCell +1；项目行定位统一 `nav.side .srow2[title="<名>"]`（可访问名 = 名 + live 徽章「demo —」，exact 不再命中；title 属性项目行独有）；terminal-session 入口 "+ Create" → side plus「New session」+ menuitem；prompt「Create」限定 `getByRole("dialog")`（防撞 side "Create or adopt Project"，getByRole name 默认 substring）；file-browser/git-diff nth(2)→nth(1)；file-nav 活动栏 [Files] → footnav All Files（+全套跑实测修正：根层 10m 卡形态项目行可访问名 = 名 + overview 统计副行，随同套前序 spec 泄漏实例浮动，断言禁 exact——单跑干净环境恰好命中是 order-dependent 假绿）。

**能力收窄与 IA 缺口记档**：①项目行操作（重命名/删除/置顶）随手风琴退役；②实例卡拖放源退役（点行开 tab 替代）；③文件树拖到中栏桌面不可达（mainPage 树点击开 tab 为主路径；onCardDragStart 代码链保留，需要时从 Inspector FilesPanel 接线，待产品拍板）；④**pages（静态根）桌面无入口**——Inspector 四段无 pages 段（原型无此页），当前仅移动聚焦态 tab 行可达；桌面 pages 归属（10m mainPage 段或 Inspector 第五段）等用户反馈再定。

**批次 4（review 修复，2026-09-24）**：门禁全绿 + 全套 e2e 23/23 后按用户「每里程碑必 review」惯例并行跑 code-reviewer（8 条）+ design-reviewer（14 条，对照原型逐类比对含 dist CSS 实测），消化后修复（`63c64bd` 为 file-nav 假绿修正 + §6.12k 初版记档）：

- **正确性**：①workbenchMiddleTabAtom 删除——写点 onTabChange 随批次 1 桌面左栏退役，只剩无写点读者（移动端 localStorage 残留值会错乱回退，如残留 "git" 使退出文件工具直接进 git 态）；URL `?tab` 唯一真相，省略 = overview；②WorkbenchSide seg4 与历史态互斥（否则历史态下点「全部」高亮切换而内容不变 = 控件失灵）；③历史态高度链 §8 同族断链修复（实例区容器 flex-col 化 + HistoryList 包 min-h-0 flex-1——纯 overflow 容器 + h-full 恒溢出组头高）；④derive leftModeFallback 删除（兜底值 = 渲染默认，物化 "auto" 会被 raw search 直传写回 URL 违背「URL 省略 = 默认」；chatFallback 兜 "chat" ≠ 默认保留）；⑤mainPage 文件拖源死线删除（落点 instanceArea 已被 `desktopMainPage ??` 互斥卸载，拖源激活无 zone 可落）。
- **原型形制（design review）**：⑥**side 恒定**（P2③）：mainPage 态 side 由 workbenchLastProjectAtom 驱动项目视图（07m/09m/10m「side 仅遮盖主区」），无记忆项目退 05g 会话视图；⑦global 会话页补「会话」ghead + seg4 mini（05g:32 原文「全部」on + 项目段回上次项目；时钟/plus 无 global 数据源不伪造）；⑧footnav flow 化 `.footnav--flow`（P1①：实例区 flex-1 通到列底后 absolute footnav 盖滚动行、aprow 必撞）+ `.footnav button` 行内布局（P2②：单源 span 选择器不命中 button 子元素，图标 0 间距 + UA 居中）；⑨实例组头时钟 text-primary（P2⑤：.dicon svg 直击 currentColor specificity 压过 .ghead .clk 继承，主色须经 color 传入）；⑩terminal 行形制对齐 05:42（P3⑦：dicon terminal 图标 + mono 12px ink-2、无状态点——dot 状态语言属 agent 会话状态机）；⑪Inspector seg4 双重缩进修复（P2⑥：删 wrapper px-3.5，.seg4 自带 margin 14px）；⑫footnav .on gate `!focusId`（P3⑪：/files/file/$ 等深链是工作台态，0 项 active）；⑬aprow 删 wrapper px-2 满宽贴边（P3⑨）；⑭SideInstanceRow active 补 aria-current（P3⑭）；⑮text-[12px] → text-caption ×2（P3⑫）。
- **死代码清理**：InstanceGrid 拖源链整链删除（批次 2 只退役了用途没删码：DragSourceAdapter/GridItemCallbacks/InstanceGrid/instanceToGridItem/candidateToGridItem/InstanceGridItem/MIN_CARD_WIDTH_PX + shell-primitives InstanceCard 连锁孤儿 ~350 行）；INSTANCE_GRID_STYLE 保留（CardGridSkeleton 活消费）；DragSourceCard 保留（中栏 tabstrip tab chip 源，曾误判零消费后恢复）；useApprovals「WS 单实例纪律」注释修正（实际 StatusBar + WorkbenchSide 双订阅，收敛 provider 待办）。
- **e2e order-dependence 教训**：file-nav 根层项目行断言 exact → substring（10m 卡形态可访问名 = 名 + overview 统计副行，同套前序 spec 泄漏实例使后缀浮动——单跑干净环境恰好命中是 order-dependent 假绿）；desktop-side 断言适配 side 恒定新语义（mainPage 态 seg4 Project 在）；m9-d G16 改断言 global seg4 在 + 新增 G17「全部」on（63/63）。
- **不修记档**：历史态头部形制与 05c 独立行差异（P3⑧，重构 seg4 顺序收益低等真机反馈）；右栏渐变底 v1 残留（P3⑬，M2 存量随 token 收敛批一并清）；useApprovals 双 WS 订阅收敛（改动面大，单独立项）。

### §6.12k 复验收口（2026-09-24，第十一轮真机复验问题⑤）

用户拍板两项（原话「右侧工具中，是没有历史的，它理应和 iPhone 一致」「多端同构，只是容器不同，减少重复代码」，已写入 `.claude/rules/frontend.md` 核心原则）：

1. **右栏删「历史」段，收敛三段 文件/Git/Wiki**：`RightPanelTabs` 删注册表外局部追加的 history 段（重复承载 + 重复代码——历史能力已由侧栏时钟态 05c 与中栏/移动 L3 承载），`visiblePlugins` 回归注册表单源（与移动 `MobileFocusBody` 同构）。`workbenchRightTabAtom` 残留 `"history"` 记忆由 `?? visiblePlugins[0]` 兜底。
2. **05e 同款行菜单推广到 Git/Wiki 段**：Files 段（`FileEntryList`）已有 5 项菜单（预览/重命名/移动/上传/删除）；Git 变更行 +「查看 diff/复制路径」、Wiki 页面行 +「打开页面/复制链接」（能力摊牌：只挂真实存在的动作，复制路径格式 `projectName/path` 与移动 03w 同构）。桌面右键 = `useRowContextMenu` 坐标 popover、触屏长按 = `useLongPressActions` 计时（`DraggableListRow` 由硬覆盖改 compose 调用方 onPointerDown，长按与拖动序列按 pointerType 分流互不干扰）。菜单在共享组件层单份实现，移动/桌面容器自动同享（多端同构）。`i18n` 新 key `git.menuViewDiff` / `wiki.menuOpen`（`files.menuCopyPath` / `wiki.copyLink` 复用；`git.menuViewDiff` 与 `files.menuViewDiff` 两语境措辞不同——文件行语境是「在 Git 中查看」，变更行语境已在 Git 列表内）。
3. **多端同构残余记档（跟进项，非本批引入）**：移动 git/wiki 工具行（`MobileGitTool`/`MobileWikiTool` `.frow`）未消费共享 GitFileList/WikiPanel，拿不到行菜单能力——后续移动工具行接入时直接换用共享列表，勿在 `.frow` 上再补菜单（design-review P3⑤）。
4. **探针**：新增 `probe-inspector-row-menus.mjs`（14 断言：三段/无历史、Files 右键 5 项、Git/Wiki 右键 2 项 + 复制路径剪贴板实值、打开页面进详情态、合成 pointerType:touch 长按开菜单）；m9-d 适配（`.wsearch`→`.psearch` 第十一轮漏适配 + F14 三段）、m9-b 同步三段断言。

### §6.12l 第十二轮复验：右栏宽度收敛 + 三件套多端同构单源（2026-09-24，批次 1 `bf95e05` / 批次 2 `aa93f48` / 批次 3 `70a5c07`）

用户报两问题（原话「多端情况下，具有以下问题 1 右栏的宽度过大 2 文件和git并没有符合设计，他们理应和iphone同构，重用代码」），中途澄清拍板：**同构 = 代码同一份**，只保留设备适配的表现细微差异；基准方向 = 右栏向 iPhone 对齐、一切对照原型；右栏点开 = 栏内详情态（04 insfoot「点文件 → 本栏预览 / diff」）。范围 = 文件/Git/Wiki 三段（不只文件和 git）。

1. **右栏宽度固定模型（批次 1）**：`--workbench-right-col` 展开态由 `minmax(${rightWidth}rem, 1fr)` 改固定 `${rightWidth}rem`（默认 22rem=352px，gutter 拖拽 clamp 16–40rem 保留）；中栏恒 `minmax(0, 1fr)` 吃剩余（原型 `.pinsp{flex:1}` 的弹性语义移交中栏）。根因：`minmax(atom,1fr)` 让默认 22rem 架空、1920 宽屏右栏膨胀 ~1060px；原型 `.pinsp{flex:1}` 在固定画布下掩盖无上限问题。`WORKBENCH_CENTER_MAX` 删除（唯一消费点）。CSS 机制坑记档：grid-template 裸引 `var()`，变量值必须是**完整轨道定义**——嵌套 `minmax(var())` 会整条声明非法被丢、退化为单列全宽（探针实测）。
2. **三件套单源收敛（批次 2+3，本批主体）**：`mobile-project-tools.tsx` 三组件泛化为双端共享并迁 `project-tool-panels.tsx`（git mv 保历史）——`FilesToolPanel`/`GitToolPanel`/`WikiToolPanel`（03o/03m/03p 形态 = 形态基准）。注册表（`workbench-tab-plugin.tsx`）files/git/wiki render 换三件套 + 三个 ToolTab 装配（FilesToolTab/GitToolTab/WikiToolTab，局部 selected state 栏内详情态不进 URL）：桌面右栏 RightPanelTabs 与移动 MobileFocusBody / MobileProjectHeader 工具 chip 同一 render 自动跟随（中栏 middle tab 已随 §6.12k 批次 2 三列化退役——批次 3 commit message 里「中栏 visibleTabs」表述系笔误，`buildOverviewTabs` 死代码已随批次 4 删）。**详情态组件零新增**：`DiffContent` 早已共享；`MobileL3FilePreview`/`MobileL3GitDiff`（meta+内容紧凑形态）与移动 L3 详情页同一份（右栏语境底部 16px padding 无害）；`WikiPageDetail` 从 WikiPanel 提取 export 后 WikiPanel 退役删除（05e 行菜单批次 2 已先迁共享组件）。
3. **05e 行菜单随三件套单源**：Files 菜单 = 03w ∪ 05e 并集（预览/复制路径/在 Git 查看 diff〔条件 dirty〕/重命名/移动/上传/删除，7 项）；Git 改动行 2 项（查看 diff/复制路径，02c 单一菜单容器）+ 04 githead 分支态势行（`main ↑N ↓N · 工作区 N`，恒渲染，数据 = diff 响应 branch 字段，`.githead` 物化进 v2-primitives.css）；Wiki wpg 行（分组树+搜索态）2 项（打开页面/复制链接）。移动端同步获得 Git/Wiki 行菜单（增强）。
4. **段装配规则（多端同构的装配语义，用户拍板「有承载页才装配」）**：回调式 props 条件渲染——传了 onOpenCommit/onOpenHistory/onOpenBranches 才渲染最近提交/links 段。~~右栏/移动 focus 态只渲染 githead + 工作区改动 + diff 详情态~~（**批次 4+ 用户复验推翻**：右栏 Git 缺三段与移动端不一致——见条 10，右栏现传齐全段 + GitToolTab 栈承载）。query key 统一 workbench-git-left/files path key（右栏与移动 gitchip/桌面左栏共享缓存）。
5. **保留语境记档（后续评估合并，不在本轮范围）**：`FilesPanel`/`GitDiffPanel` 保留——SessionDetailRoute agent-context（queryScope="agent-context"）+ 全局 /files 页 + 右栏全局作用域 files rootBrowse（PROJECTS_ROOT 只读浏览是 FilesPanel 独有能力）。
6. **探针适配**：`probe-inspector-row-menus.mjs` 断言对象随组件更新（行定位 `.frow`、Files 菜单并集 6 项断言〔mock 无 dirty〕、新增 G4/G5「查看 diff」→ 栏内 diff 详情态 + 返回，16/16）；m4-tools-l3 41/41（移动零变化 + 长按菜单打印可见上传项）、m9-b 16/16、m9-d 63/63、m9-multi-device 13/13（批次 1 列几何）、files-cwd-memory ALL。
7. **残余/跟进**：①`MobileL3FilePreview`/`MobileL3GitDiff` 等通用详情组件仍挂 Mobile 前缀 + mobile-l3.tsx 文件名（历史痕迹，双端复用语义以注释为准，改名波及装配点收益低）；②右栏 files cwd 为组件内部 state 无持久化（右栏语境无跨卸载保活诉求）；③移动 focus 态 files/git tab 从检视面板（FilesPanel/GitDiffPanel）换工具面板形态——git 的 scope chips 过滤/branches/commits 完整视图在 focus 态消失（项目工具态 links 承载仍在；用户反馈需要则 focus 态单独装配完整视图属容器适配）。
8. **批次 4 复验收口（design/code review + 验证）**：
   - **P1 右栏不铺满栏宽（reviewer 发现，已修）**：右栏承载链是 row 方向 flex（shell 右栏 body → RightPanelTabs 根 → tabpanel → 三件套），旧 FilesPanel/GitDiffPanel 根自带 `flex-1`（row 主轴 grow）承担铺满，换三件套后 grow 断链、子项收缩到 max-content（githead 169/frow 197px）。修 = grow 上移：RightPanelTabs 根补 `flex-1`、ToolPanel 根与三个 ToolTab 详情容器补 `w-full`（DOM 实测四态 351≈352 满宽，githead `.st` margin-left:auto 恢复推到行尾）。
   - **P2 修复**：DetailBackBar 弃 compact（移动端自动 `max-sm:min-h-11` 44px 触摸目标、桌面保持 30px 紧凑，§7 渐进增强）；FilesToolTab diff 态返回标签按来源动态（预览内「查看 diff ›」进 → 「返回预览」`files.backToPreview` 新 key，列表菜单进 → 「返回变更文件列表」）；githead「工作区 N」改 worktree 口径（diff 列表是 staged+worktree 合集，`filter(scope === "worktree")`）；右栏语境 log/branches query 按「有承载页才装配」门控（`enabled`，不白发请求）。
   - **P3 修复**：`gitBadgeVariant` 删除（与 `statusShortLabel` 同 switch 同返回，纯重复）；`buildOverviewTabs` 死代码删除（中栏 middle tab 已随 §6.12k 批次 2 三列化退役，函数零消费方）+ workbench-tab-plugin/workbench-model 注释漂移同步；mobile-workbench 工具态三处 wrapper 的 `data-mobile-tool` 删除（探针锚单源化到 ToolPanel 根）；ToolPanel `container` prop 删除（`container=false` 零调用方的投机 API——右栏装配实际也走滚动容器，桌面 16px 底 padding 无害、锚点无桌面消费者）。
   - **e2e 适配（真实回归兜底）**：file-browser/git-diff 两个 spec 锚点随三件套更新（`getByLabel("Project files"/"Git changed files")`→`.frow`；inline diff region → 栏内详情态 `data-role="l3-git-diff"` + 逐级返回流程；图片预览断言改 unsupported 文案——三件套详情态 = 移动 L3 同一份仅文本形态，图片预览归 FilesPanel 检视语境），13/13 绿。
   - **右栏详情态 cwd 丢失修复（e2e 兜底发现）**：右栏语境 FilesToolPanel 用内部 state，详情态卸载列表组件时 cwd 丢回根——修 = FilesToolTab 层持 path（`currentPath ?? tabPath` 受控传入），移动父级受控语义不变。
   - **code-reviewer 终审收口（批次 4 修复后全量复审）**：P1/P2 零。P3 六条消化——①log query key 注释如实化（三件套请求不带 branch 参数，与桌面 GitCommitList 显式 branch 维度 key 同形**不共享缓存**，消费点移动独有，不做跨语境对齐——对齐反而引入 diff 到达后 key 漂移双拉）；②FilesToolTab cwd 受控对「必须成对传」契约入 prop 注释；③`GitStatusBadge` 提取（statusShortLabel 三处行内 className/children 双调用收敛为 label 单次求值）+ `TabDiffDetail` 折叠（Files/Git 详情态同构 JSX 单源）；④probe-inspector-row-menus 五处死 sleep（4 右键后读菜单 + 1 返回后数行）换目标态 waitFor（`waitMenuOpen` helper，超时不抛走断言 FAIL 不崩探针）；⑤probe-project-plugins 头注释 buildOverviewTabs 引用更新（死代码已删）；⑥右栏 files 图片预览退役确认为有意取舍（三件套详情态 = 移动 L3 同一份仅文本形态，能力边界见上条）。终审后门禁复跑全绿 + 探针 16/16 + 受影响 e2e 13/13。
9. **存量探针欠账（非本批回归，单独跟进）**：全套 48 探针 21 FAIL，逐个归因四类——①**§6.12k 三列化删左栏 middle tab**（`4cdf2ab`）：files-cwd-refresh / project-plugins / three-optimizations / v2-m6-plugins / fab 等以「中栏 tab 按钮」为锚的探针目标结构已退役（基线 worktree 对照实证：`2c99f97` PASS / 当前 FAIL，回归点在上一轮批次）；②**M2 登录 label 漂移**（`2a4d9e1`，`密码`→`访问密码`、`解锁`→`登录`）：chat-live-ui / overview-agent-subtitle / overview-pinned-nojump / markdown-frontmatter / lightbox-center；③**M7 设置结构重构**（`1bddc9c`，root 两组值行）：theme-switch / settings-acp / settings-pi 的「General」行定位失效；**cssCodeSplit 文件名**（`style-*.css` ≠ `index-*.css`）：pointer-variants 探针自身假设过期；④**环境依赖**（推理网关当日 524）：chat-e2e / chat-firecrawl / omp-realchain 等 pi/LLM 真实调用域。处理原则：①类按现 IA 适配或退役（行为已被 files-cwd-memory 等覆盖的判退役）、②③类修定位器、④类依赖网关恢复重跑；不阻塞本批复验交付。

10. **批次 4+ 用户复验补齐：右栏 Git 同构三段（最近提交/全部历史/分支）**：用户复验指出右栏 Git 段缺三段与移动端不一致（条 4 原判「右栏无承载页不装配」被推翻——批次 3 已建栏内详情态承载机制，右栏完全能承载，只是当时装配保守）。修 = GitToolTab 升级**栏内详情栈**（`GitDetailState`：diff/history〔可带 branch〕/commit/branches，返回逐级弹栈——历史点 commit「返回历史」、分支页进历史「返回分支」，返回标签按栈下层动态）；GitToolPanel 装配回调补齐 → 三段自动渲染（与移动 L3 完全同组件：L3GitHistory/L3GitCommit/L3GitBranches，`data-role` 同锚）。新 i18n：`git.backToHistory`/`git.backToBranches`。验证：探针 inspector-row-menus 增 G6-G10（最近提交 crow/全部历史→历史→commit 逐级弹栈/分支 links）21/21、e2e git-diff 增历史+分支链路、单测 672+829+9 全绿。**教训记档**：探针 mock commit detail 端点 URL 是 `/git/commit?hash=…`（hash 走 query 无尾斜杠），mock 正则别带 `/` 锚；栏内详情栈断言要按栈态找元素（links 段只在列表态）。

11. **批次 4++ 用户复验修复：右栏详情态长行内容撑爆 seg4（tab 导航变形）**：用户复验「文件层层点进预览后 tab 导航只剩文件/文件+Git，Git 侧同病」。DOM 实证（mock 2000 字符长行）：RightPanelTabs 根被撑到 **13850px**、seg4 三 span 各 4605px——可视 352px 只见首个 span，与描述完全吻合。**根因 = min-content 沿 column 链上传**：预览 `.tx`（`white-space: pre` 不换行）→ `.ln` flex → `.code` → … → RightPanelTabs 根，而根作为 shell 右栏 body（row flex）的 flex item，`min-width:auto` = min-content 直接撑爆（批次 4 修 grow 补了 `flex-1` 没配 `min-w-0`）。**修 = 根补 `min-w-0` 一处断根**（automatic min size → 0，全链 stretch 回 22rem；`.code` 自带 overflow-x:auto 长行转栏内横向滚动，clientW 351/scrollW 13850 实证；DiffContent `.dcode` overflow:hidden 同截断语义，Git 侧同修）。复测四层 351px + span 106×3 均分。**知识沉淀**：row-flex item 双件套 `flex-1 + min-w-0`（§8 高度链同族横向版）；overflow 非 visible 只解除 flex item 的 automatic min size，**不改变容器 intrinsic min-content**——scroll 容器照样把 min-content 传给父链，唯一断点 = 沿链每个 flex item 的 min 主轴约束。

12. **批次 4++++ 用户复验修复：桌面左栏 seg4「项目/全部」切换高亮不跟随**：用户复验「左侧项目/全部切换时内容区有变化，但当前 tab 没有变化」。根因 = **高亮源与视图态源不一致**：seg4 两段 on/aria-selected 完全由 `sideProjectName`（scope 路由态，项目语境恒非 null）派生，而「全部」点击只写本地 `scopeSegment`（body 渲染分支的真源）——内容跟着 scopeSegment 变、高亮钉死在路由态。**修 = 视图态做唯一真相**：高亮改从 `projectSegOn = sideProjectName !== null && (historyOpen || scopeSegment === "project")` 派生（历史态是「项目」段的组头时钟子态，保持项目侧 on）；跨 scope 导航入口显式重置视图态（`enterProject` / `selectProjectSeg` 的 navigate 分支补 `setScopeSegment("project")`——组件不重挂，残留视图态会带进新 scope）。sessionPage（sideProjectName=null）语境 projectSegOn 恒 false =「全部」on，与原行为一致。验证：e2e desktop-side 新增「seg4 切换跟随」test（点 All → aria/.on 跟随 + 05g 分组 microlabel 出现；点 Project 反向）5/5 绿；四门禁 + CSS 硬闸全绿。

### §6.12m 深度优化：检视双轨退役 + 编辑能力下沉 + Wiki 归一（2026-09-25，批次 1 `f3482bb` / 批次 2 `13bc633`+`9dd796e`+`4d77a2d` / 批次 3 `77c24c3`+`06b2c7f`+`347dda2`+review `21111f1` / 批次 4 `2bf5e55`）

用户诉求「深层次优化，多端同构，减少冗余代码」+ 补充「big picture 眼光 + code review 技能做精简」。方法论：优先删除其次合并最后才提取；每批 code-reviewer 以精简为主标尺；批次 4 code-simplifier 热区终审。

1. **批次 1 死代码 + 顺手 bug（`f3482bb`）**：FilesLeftPanel/GitChangesList/PluginsRoute 死面板/workbenchMobileOverviewTabAtom 全删；chat 菜单 label 过 `t()`、formatRelativeTime 单源 relativeTime、chat 行补 useLongPressActions、TabContextMenu 换 ActionMenu；8 处 GlobalProjectsOverview 陈旧注释清；`files.menuOpenPreview/menuPreview`、`files.viewDiff/git.menuViewDiff` key 合一。
2. **批次 2 纯逻辑单源（`13bc633`+`9dd796e`+`4d77a2d`，零 UI 变化）**：useGlobalActivityRows / useComposerEnterPolicy+ComposerStopSend / useApprovalCenter（isHotTool+respondAll+两段确认）+ acard / formatAheadBehind（↑↓ 串 5 处） / LargeTitleRow / MOBILE_SHEET_CLASSES / instanceRowMenuItems / query key 工厂（gitFileDiffQueryKey 等，消双哨兵双拉）/ approvals-stream WS 单订阅（引用计数）。composer 探针 WS 全 mock 适配（fake WS 需 accessor 转发 on* IDL）。
3. **批次 3 检视退役 + 编辑下沉（`77c24c3`/`06b2c7f`/`347dda2`/`21111f1`）**：
   - **编辑链单源 useFileEditor**（preview query + 本地编辑态 + save mutation + ⌘S + dirty 派生；`initialRenderMode` 参数解决 L3 无 toggle 的 md/html canEdit gate）。三消费方：FilesPanel（editable）、FileTabPreview（只读薄壳）、MobileL3FilePreview（editable 随组件内 editing state）。
   - **L3 详情态编辑保存**（用户拍板「保留编辑：三件套补编辑保存」——右栏/移动同步获得）：meta 行「编辑」→ CodeEditor（lazy）+ FileSaveButton + 完成；dirty 丢弃确认走 useConfirm；image 分支 → ImageViewer、too_large → cap（三端分支同构增值）。**铁律 7 修订**：文件内容编辑从「工具不提供」改为「详情态编辑模式提供」（design_spec 铁律 7 + §4.5 + 验收项已同步修订并标注修订日期；Git 分支切换/合并/推送边界不变）。
   - **DetailWorkspace 换装 + GitDiffPanel 退役**：SessionDetailRoute detailView files/git 换 FilesToolTab/GitToolTab（queryScope "agent-context" 段消亡，缓存分片归一）；git-diff-viewer 1247→455 行（GitDiffPanel/GitViewSwitcher/GitView/GitBranchList/GitCommitList/GitAheadBehindPanel/GitBranchStatusRow/GitScopeChips/GitSummary/GitFileList/GitCompareFileList 全删），保留 query key 工厂五件套 + statusShortLabel/gitStatusTone/formatAheadBehind + GitFileDiffPanel/parseDiff/DiffContent（中栏 git tab + compare 语境）。
   - **review 修复轮（`21111f1`）**：code-reviewer 抓出 renderMode 重置 effect deps 含 editor 对象字面量（每渲染必跑，md/html 无法看源码——**教训：hook 返回对象永不进 deps，解构稳定成员**）；保存失效 key 硬编码 "files" 换 queryScope（rootBrowse 列表恢复刷新）；⌘S listener 按 editable 门控；31 个 GitDiffPanel 家族孤儿 i18n key（全扫补出 fileMarker/nextChange/status* 四件）。design-reviewer 抓出 **meta 行双 `.diff` = 两个 auto margin 平分剩余空间，首钮悬行中部**（修 = 双按钮包单个 `.diff` 容器；**教训：`.meta .diff` 的 margin-left:auto 语义是「每个 auto margin 平分」，多按钮必须单容器**）+ m4 探针补容器贴右缘几何断言（right=374 兜底）+ 裸文本钮 after 纵向隐形扩区。
4. **批次 4 Wiki 归一（`2bf5e55`）**：WikiToolTab 阅读态换 L3WikiReader（与移动同一份，rel 同组页 = setSlug 栈内换页），返回条统一 DetailBackBar；WikiPageDetail/wiki-panel.tsx 退役，wiki.loadFailed 孤儿 key 清。
5. **GitFileDiffPanel 中栏保留确认**（用户拍板 compare 专用语境）：query key 已工厂化（gitFileDiffQueryKey 单源），本轮删无人传的 queryScope/onClose props。
6. **评估不做**：GitScopeChips（compare 双选统计段）中栏保留不动；githead ahead/behind 展开不引入（右栏/移动无展开诉求，L3GitBranches 已承载 ahead/behind 态势）。
7. **单独立项（不在本轮）**：rootBrowse 下沉 FilesToolPanel（FilesPanel 全局根目录只读浏览语境，与全局 /files 页同记档）；i18n 动词级 key 全面收敛。
8. **✅ 用户拍板 A：SessionDetailHeader 死 UI 整片删除（2026-09-26 执行）**——SessionDetailHeaderProps/Header（~106 行）+ SessionDetailActionsMenuProps/Actions（~166 行）+ DetailWorkspaceProps/Workspace（~70 行）+ detailView state/DetailView type + closeSession/createTerminal mutation + useConfirm + detail.error 横幅简化 + SessionInputDrawer 无条件渲染 + sourceAgentSession prop + embeddedHeader 在 instance-panel/instance-area 的透传收缩（ChatPanel→ClaudeChat 链保留）；i18n 孤儿 9 key 删（854→845：backToAgent/backToStream/files/git/terminal/createTerminal/creating/actionsAria/section.terminal；backToProject/close/closing/closeConfirm/retry 仍活保留）。操作去向依据 §11（检视=注册表、close=tab ✕、开终端=左总览 CreateSessionBar、Retry=错误横幅 Notice）。**待拍板的两片同类死态已删（2026-09-26 用户拍板，`66f6b70`）**：① ClaudeSessionDetailRoute 的 ChatHeader 组件 + closeSession mutation + ShellLayout 壳（ClaudeChat 的 embedded/embeddedHeader prop 全链删，ChatPanel 调用点同步收缩）；② SessionDetail 的 `embedded` prop + ShellLayout 壳分支。i18n 孤儿再删 3 key（845→842：backToProject/closing/nav.back）。
9. **探针经验记档**：probe-file-save-scroll 语境迁移到 L3 编辑态（检视面板退役），mock preview 响应必带 `mtimeMs`（L3 meta 渲染 relative mtime，缺失抛 Invalid time value → error boundary）；code-simplifier 热区终审结论随 commit 附带。
10. **code-simplifier 终审清单消化（批次 4 收尾，全量 11 条 + 低优先 4 项）**：19 文件 +104/−478。①i18n 孤儿 key 139 个批量删（986→847；只读脚本生成零引用清单 + 无模板拼接判定 + TranslationKey/zh `Record<TranslationKey,string>` 双向类型护栏；en+zh 分行删除用确定性删行脚本——278 行逐 Edit 反而是注入风险点；**教训：i18n 多行 value 格式（key 单独一行）会让单行正则漏删，typecheck 报 missing 兜住后手工补 5 处**）②FilesPanel 单模式化——rootBrowse/projectName/onMobilePreviewChange 三 prop 删（非 rootBrowse 分支现存零调用方），`resolveRootBrowseTarget` 恒走、`joinRootBrowseDirectoryPath` 签名收窄 `RootBrowseTarget`，注释 rootBrowse 概念表述统一中文③WorkbenchTabPluginContext 死成员 focusId/sessionType 删（when/render 仅消费 projectKey/currentPath/onPathChange）④TabButton 死组件删⑤parentProjectPath 死导出删⑥ChatRow 8 props 收缩（archived/meta/title/deleteLabel/renameLabel/rowMenuAria 组件内 t()+session 派生，onRename 改可选；**顺手修 cancelLabel 误用**——ActionMenu cancelLabel 原传 rowMenuAria「对话操作」aria 文案，改 `t("cancel")`）⑦openCreatePrompt(parentPath) 参数化（03o 新建 prompt 两份合一）⑧ApprovalAllowAll 提取（05f Popover / 11 sheet 头部二联双容器共用，confirmAll 状态机仍单源 useApprovalCenter）⑨L3 commit 文件行 badge 三元链 → statusShortLabel 单次求值（同 GitStatusBadge 模式）⑩workbench-tab-plugin 孤儿 `/**` 残行删⑪四个仅本文件消费导出去 export（dateGroupOf/groupWikiPages/gitStatusTone/WORKBENCH_GIT_LEFT_QUERY_SCOPE）。验证：四门禁 + CSS 硬闸 + e2e 24/24 + 探针 m4 43/43、inspector、file-save-scroll、approvals 26/26、cwd-memory、m9-b 16/16、m9-d 63/63 全绿。

### §6.12n 移动 sheet 形态统一：三套实现收敛 MobileSheet 单源（2026-09-26，commit `39a8aca`，用户拍板「彻底统一」）

用户真机发现同为「底部弹出」浮层但样式不一（项目切换 vs 实例信息 ℹ）。盘点实为**三套**并存：① `MobileSheet`（`.msheet` 悬浮卡片原型单源：四周 10px、四角 20px 圆角、76dvh 内滚、滑入滑出动画、下拉收起手势）——03j/03l/03n/11 用；② `mobileSheetClasses`（ui/dialog.tsx 贴底面板：rounded-t-xl 顶角、无滑出、无手势）——ActionMenu/OptionMenu/prompt/confirm/pages-root 用；③ InfoSheetDialog 手写贴底（仅 fade 无滑动、自绘装饰 grab）。原型标尺上 `.msheet` 悬浮卡片是 03j/03k/03l/03n 共用容器（v2-primitives.css 注释），贴底是实现侧分化。

**收敛**：全部六处迁 MobileSheet——① MobileSheet 增强 `trigger?`（ActionMenu/OptionMenu 的 asChild 半受控场景）+ `title` 可选（菜单 sheet 无标题，sr-only Title 保 a11y）；② 六消费方迁移（ActionMenu/OptionMenu 菜单行原样进 body；prompt/confirm/pages-root 的标题上移 shd 对齐 03 原型、内部卡片消解；InfoSheetDialog sheet 分支迁入，modal 形态保留给桌面）；③ `mobileSheetClasses` 删除。副产品统一：scrim 全走 `bg-scrim`（原型 .dim 无 blur，reviewer P2-4 方向）、滑入滑出动画、下拉收起全 sheet 生效。桌面居中 modal（PromptDialog/ConfirmDialog/pages 的 desktop 分支）不动。

**review 消化（design-reviewer 7 条 + 自查 1 条，同日）**：
- **P1-1 第七处漏迁**：`runtime-config-dialog.tsx` sheet 分支（ℹ 下钻第二层：模型/权限/effort 选择面，与 InfoSheet 共用 variant 契约）迁 MobileSheet；内部 open 桥 + 延迟通知父级（父级按 `runtimeField` 条件渲染立即卸载会截断 exit 动画）。
- **P2-2 菜单 ariaLabel 误用**：ActionMenu/OptionMenu 曾 `ariaLabel={cancelLabel ?? …}`——cancelLabel 现全为「取消」，sr-only Title 读出「取消」当菜单名；解耦为固定「操作菜单」/「选择菜单」。
- **P2-3 status 行间距**：info-sheet status 行 `mt-2.5` → `mt-0.5`（03k:62 margin-top:2px）。
- **P2-4 pages 关闭路径**：pages-root-dialog 补 open 桥（照 info-sheet 模式），用户主动关闭（scrim/Esc/取消）走动画收起；**保存成功路径刻意保留立即收起**（父级 onSuccess 驱动卸载，无 DismissableLayer 竞态风险，仅剩 polish 级动画截断，为避免 ref 命令式通道复杂化接受）。
- **P2-5 无标题 sheet 下拉热区**：菜单类 sheet 仅 grab 40×5px 难命中——无标题分支渲染 12px 零视觉热区行（复用 `.shd` flex 行为，sr-only Title 在其内）。
- **P3-6 pages 按钮间距**：表单→按钮区 16px（mt-4）、保存→取消 8px（gap-2），对齐 08 原型 kbtns margin-top:16px。
- **P3-7 scrim 统一**：`ui/dialog.tsx` Overlay `bg-black/60 backdrop-blur-sm` → `bg-scrim`（删 blur）——drawer/reader/桌面 modal 的 scrim 一并对齐原型 .dim；**收敛边界=全部 Dialog 封装**（非仅移动 sheet）。
- **单源常量**：`SHEET_UNMOUNT_DELAY_MS`（300ms）提取至 mobile-sheet.tsx，info-sheet/prompt/confirm/runtime-config/pages 五处私有同值常量收敛；顺手修 info-sheet modal 分支漏绑 open state（defaultOpen 非 受控，桌面 fade-out 同被截断）。

### §6.12o 全站加载态体系（分层标准 + LoadingBlock 单源 + keepPreviousData 推广）（2026-09-26，commit `5dd1113`，用户拍板「完善所有页面的加载态」）

用户拍板完善全站加载态。盘点（三路 Explore + 逐处核对）出全仓 7 种加载态模式并存（shimmer 骨架 / ping 圆点 / 纯文案 / 空白 / 伪空态 / 保持上一屏 / scrim），本轮建立**加载态分层标准**（下表，成为后续所有加载态改动的设计标尺）并按层补缺收敛：

| 场景 | 形态 | 实现 |
| --- | --- | --- |
| 路由切换 | 保持上一屏 | 固化不动（全仓 0 个 pendingComponent，用户 2026-06 拍板） |
| 行/卡列表首载 | 同形骨架 | `ListRowSkeleton`（行）/`CardGridSkeleton`（卡）/`ChatSkeleton`（气泡）——已有，本轮补缺 11 处 |
| 详情/预览单内容块 | **ping 圆点 + 文案居中** | **新建 `LoadingBlock`**（shell-primitives.tsx，双端同构） |
| 同 query 参数切换 | 保持上一份数据 | `placeholderData: keepPreviousData`（本轮推广 2 处，参照 git-diff-viewer 先例） |
| 终端/agent 流首连 | scrim overlay | `TerminalStatusOverlay`（已有） |
| 确定进度 | `.prog` 进度条 | 已有（03z/17 标尺；安装进度 pulse 属此层，非骨架） |
| 加载 vs 空态 | **isPending 区分，禁止伪空态** | 本轮修复 5 处伪空态 |

**判定语义（TanStack Query v5）**：骨架/LoadingBlock 只在 `isPending`（无缓存数据首载）显；`isFetching`（后台刷新）不显——防陈旧缓存下闪骨架。**语义 pulse 点边界**：running/权限等待的 `animate-pulse` 状态点是语义动画非骨架，不属 shimmer 收敛对象。

**批次 1 伪空态修复（5 处，行为正确性优先）**：① GitToolPanel 工作区/最近提交段 isPending 门（防「无改动」+「分支 (0)」伪态）② WikiToolPanel 搜索/列表双段 ③ L3GitHistory（防「HEAD · 共 0 次提交」）④ EmptyInstanceArea `refsLoaded` gate（pending 期显 CardGridSkeleton，防闪「无活跃实例」）⑤ MobileProjectsHome 列表区骨架。

**批次 2 空白补骨架（3 处）**：⑥ 中栏 Agent/TerminalPanelRouter `detail.isLoading → return null`（最大空白点）→ LoadingBlock「加载会话…」（新 i18n key `workbench.sessionLoading`）⑦ ChatOverview chat 列表骨架 ⑧ FilesToolPanel 目录列表骨架（FilesPanel 同款）。

**批次 3 单源收敛**：新建 **`LoadingBlock`**（ping 双层圆 animate-ping 外圈 opacity-60 + 实心内圆 bg-primary + 12px/600 muted 文案，label 必填 + className 透传对齐差异），替换散写 git-diff-viewer / file-browser ×2 / plugins-shared SkillTabPreview + **移动 L3 四处纯文案早退**（file preview / git diff ×2 / branches，`min-h-0 flex-1` 撑满居中，与桌面同构）；mobile-sheets 历史 sheet 手写 animate-pulse 灰条 → ListRowSkeleton（shimmer 单源）；插件族 home/market pending 伪空态补骨架；删 NavItemSkeleton 死代码（零调用方）+ 注释历史名清理。**保留私有**：TerminalStatusSpinner（终端 scrim 大圆 spinner 双档尺寸，非同构形态）与 tool-head 私有 Spinner（流内任务单点），不为统一而扩面。

**批次 4 keepPreviousData 推广**：history-list `useHistorySessions`（range week↔all 切档，in-place key 变化）加 `placeholderData: keepPreviousData`——切换保持上一份列表显示不闪骨架；消费方 `isLoading` 改为 `isPending || isPlaceholderData`（防「上一份缓存为 [] 时切档」被 v5 当 placeholder → isPending/isLoading 双 false → 空白/伪空态回归）。**L3GitHistory 不加**（review 结论）：两个消费方换 branch 均重挂载，placeholder 按 observer 记忆对重挂载无效，只剩切项目时短暂跨项目陈旧列表的负作用——推广前提是「同 observer in-place 换 key」。搜索类 query（files/wiki 搜索、useSkillSearch/useMcpMarketSearch）同款推广：逐键换 key 不闪。

**review 消化（design-reviewer P2×5/P3×4 + code-reviewer P2×1/P3×6，同日）**：
- ✅ wiki 搜索 query 加 keepPreviousData（P2：逐键闪骨架，违反标准表第 4 行）
- ✅ useSkillSearch / useMcpMarketSearch 加 keepPreviousData（P2：市场搜索走外网更慢）
- ✅ McpMarketTab「…」漏迁 → ListRowSkeleton（P2：同文件双形态并存）
- ✅ LoadingBlock 加 role="status"（P3：读屏播报，与骨架外壳同约定）
- ✅ SkillTabPreview 父容器补 flex 链（P3：非 flex container 时 flex-1 死属性，frontend-notes §8）
- ✅ L3GitBranches LoadingBlock → ListRowSkeleton marker=false（P2：分支页是行列表，属「行列表首载」层，与同栈 L3GitHistory 同层同形）
- ✅ GitToolPanel branches 门 `!isPending` → `data != null`（P3：error 半边「分支 (0)」伪态）
- ✅ files 搜索 pending 纯文案 → ListRowSkeleton + keepPreviousData（P3：同文件同语义异形态收敛）
- ✅ 探针骨架断言 scope 收窄到面板锚点（P3：防同页他面板骨架假阳性）
- ⬜ 记档不修：refsLoaded gate 失败出路（overview refetchInterval 10s 自愈；失败显空态卡同样误导，EmptyInstanceArea 错误态属后续增强）；keepPreviousData 行为探针（history range 切档二次响应时序，代码层注释守护）；ListRowSkeleton 单行变体 lines 参数（最近提交 .crow 单行 vs 双行骨架跳变，单点不扩原语）。

**探针**：`scripts/probe-loading-states.mjs`（mock API 延迟 700ms，13 断言：git/wiki/历史/插件段 pending 骨架 + 无伪空态 + 数据到后真实渲染、中栏/L3 预览 LoadingBlock ping 圆点 + 文案 + 垂直居中几何；mock 基座 candidates 须含 focus 目标——global scope refs 由 candidates 派生，空则 focus 被 prune）。

### §6.12p 真机反馈修复：sheet 下拉收起回弹 + 历史 sheet prompt 连带卸载（2026-09-27，commit `0f3c882`）

**① 拖拽 dismiss 回弹（用户真机反馈）**：`endDrag` dismiss 分支曾先清 inline transform 再交 Radix exit 动画——sheet **瞬跳回原位**再从原位滑 16px+fade（「回弹后再消失」）。修复：**保留 inline transform 作为 exit 动画起点**（tw-animate-css 的 exit keyframes 只有 `to` 无 `from`，起始值 = 当前计算样式），inline 变量覆盖 exit 形态——`--tw-exit-translate-y` = 顶边推出视口底+40px 余量（`slide-out-to-bottom-4` 的 16px 不够出屏）、`--tw-exit-opacity: 1`（iOS dismiss 纯滑出不 fade）、200ms ease-in 贴合松手初速度。重开无残留（Radix closed 即 unmount，inline 样式随之消亡）。

**② 历史 sheet prompt 连带卸载（拖拽探针诊断中发现的结构 bug）**：`MobileSessionHistorySheet` 的 `renameDialog.holder` 曾嵌在 MobileSheet Content 子树内——closed 行点击同帧 `onOpenChange(false)` 关 sheet + 开命名 prompt，**Radix exit 动画播完即卸载 Content 子树 → 嵌套 Portal 的 prompt 被连带卸载**（input 消失、resolve 悬空），真机上 prompt 闪现即没。修复：holder 移至 Fragment 兄弟位（渲染在调用方 workbench 层，不随 sheet Content 卸载）——与 03j 新建实例 sheet「prompt 由 workbench 顶层 holder 承载」同因同解（03j 先例）。**排查全仓 holder 嵌套**：runtime-config 的 danger confirm 嵌在 RuntimeConfig sheet/Dialog 内，属从属语义（父关 = 放弃操作，confirm 连带消失合理）记档不修；其余 holder（ClaudeSessionDetailRoute / file-browser / chat-overview / mobile-l3 / mobile-plugins-detail / mobile-workbench info+close）均在页面/顶层 ✓。

**探针（m5-sheets 扩至 51 断言）**：新增 Part 5 拖拽 dismiss 几何 5 断言（松手后 top 保持拖拽位置不回弹 + 继续滑出 + 卸载 + 重开无 inline 残留；mouse pointer 序列驱动，拖 140px > 96px 阈值）；prompt 链断言恢复（holder 修复后 press Enter 不再 detached）；断言收窄两处（菜单 sheet exit 期双 sheet 共存窗口 → 等目标 sheet 标题；03j 关闭断言 `.msheet count===0` → 收窄到「新建实例」标题——prompt 自身也是 .msheet，宽断言必挂）。

**②' 拖不动/不跟手（同日第二轮真机反馈，commit `52af7aa`）**：`.msheet` 是 `overflow-y:auto` 滚动容器，**WebKit 对容器内触摸的 touch-action:none 判定不稳**——常把手势当滚动启动并 pointercancel。起步 6px 窗口被打断 = 手势死在 pending（「拖不动」）；拖拽中被打断 = 手指在滑 sheet 不动（「不跟手」）。修复：Content 挂 **non-passive touchmove 监听，手势期（非 idle）preventDefault** 阻断原生滚动判定——必须从第一个 touchmove 就拦，WebKit 才不会先启动滚动再 cancel。纯 tap 无 touchmove 不受影响（热区按钮 click 照常合成）；监听依赖 `open` 重绑（Radix closed 即卸载 Content，重开是新 DOM）。探针 Part 5 同步升级 mouse → **CDP touch 序列** + 逐步跟手断言 ×3（transform = 累计位移，54 断言全绿）；WebKit 手势判定在 Chromium touch 模拟下不复现 cancel，真机复验交用户。

**③ 绑定时机 bug——三轮「拖不动」的真根因（同日第三轮反馈「抓 grab 小横线完全拖不动」，commit `1c50d91`）**：用户第三轮仍报拖不动，诊断探针（CDP `getEventListeners` + 合成 dispatch + window 打点三重对照）实锤 **MobileSheet 的交互 effect 从未执行到绑定代码**——effect 依赖 `[open]`，但 **Radix Portal 的 Content DOM 挂载晚于本组件 useEffect**（open=true 的 commit 时 `contentRef.current` 仍为 null），effect 提前 return 后**再无 open 变化 = 永不重绑**。即：第二轮 preventDefault 修复（②'）在线上从未生效，探针全绿测的是 React 合成 pointer 路径、原生 listener 是空转——「探针与真机脱节」的根因在此。修复两件：
- **DOM 就绪信号改 state ref callback**（React 官方模式「measuring DOM nodes with state」）：`ref={setContentNode}`，Content 挂载时 setState → effect `[contentNode]` 重跑绑定；卸载时 React 先置 null → cleanup 先行，顺序安全。cleanup 里顺带把 dragRef 归位（防 DOM 卸载中断拖拽后状态残留）。
- **拖拽驱动从 pointer events 迁原生 touch events 直驱**：iOS WebKit 上 pointer events 是 touch 的派生兼容层，滚动容器内派生行为不可控（pointercancel/停发 pointermove）。touch events 是 touch-action 出现前 iOS 自定义手势的唯一可靠通道：non-passive touchmove preventDefault 直接取消滚动默认行为（滚动从未启动即无抢占），touch 事件本身照常派发——拖拽驱动不依赖任何派生层。touchstart 不 prevent（保热区 tap 的 click 合成）；touchcancel 视同松手；touch events 的 target 固定为 touchstart 命中元素，无需 capture。
- 探针修正：t0/t1 采样加 `isConnected` 守卫（exit 卸载瞬间 detached handle 的 `getBoundingClientRect()` 返回 0 而非抛错，误报「继续滑出」fail）。54 断言全绿；四门禁 + e2e 24/24。

**④ 驱动回退 pointer events——touch 直驱被真机否定（同日第四轮反馈「拖动依然毫无动静，之前虽有回弹但至少拖动有效」，commit `5e56d71`）**：第四轮反馈推翻 ③ 的 touch 直驱假设——**真机实证 pointer events 驱动有效（第一/二轮「拖动有效」）、原生 touch events 直驱完全无效**（机制未定论，**勿再走**）。四轮现象统一解释：真机「回弹/不跟手/拖不动」的来源**不是 dismiss 分支**（`0f3c882` 修的那个），而是 **WebKit 把手势当滚动启动并 pointercancel 中断拖拽**——cancel 时 dy/v 不够 dismiss 即走回弹分支（拖动有效但弹回 = 用户看到的「有回弹」）；探针 Chromium 不复现 cancel，故三轮都测不到。本版组合各就各位：**拖拽驱动恢复 pointer events（真机验证过的通道）+ state ref callback 绑定修复保留（③）+ non-passive touchmove preventDefault 保留**——它读 dragRef 手势期拦截，**绑定修好后第一次真正生效**，从第一个 touchmove 阻断滚动抢占（含 pending 起步窗口）= 消灭 pointercancel 中断 = 消灭回弹/不跟手。

## §6.13 v1.4 设计包对标（2026-09-27 起；9 批计划经 plan mode 批准，每批独立 commit + 双 reviewer）

> 设计包 v1.4 换代（`8f1da09`）后全量对标。四项拍板：① 全量分批；② 插件「停用」做（服务端补能力）；③ 无数据源项维持不做（✦ 提交来源 / 市场计数 / 写锁冲突，见各批记档）；④ 图标渐进换代（新图标走 Lucide 管线，存量 29 手绘 SVG 后迁）。

### 批1 图标管线 + composer 单源（commit `62cb980`）

- `lucide-static` + `scripts/build-icons.mjs` → 生成 `web/src/assets/icons.js`（注册表 + 水合器，24 网格 stroke2 圆头；生成物进 git、runtime 零依赖）；composer 家族 CSS 进 v2-primitives.css（components.css :108-166 1:1）；`composer-controls.tsx` 单源（窄端 3×.iicn + anchored OptionMenu / 宽端 3×.ipill，同一菜单数据）；chips 行退役（agent 无 chips 行——配置收敛 composer 控制行 + ℹ 实例信息；terminal tmux chip 保留）。
- composer 断点口径 = `COMPOSER_DESKTOP_MIN_WIDTH_PX = 1024`（iPad 竖屏 820 归窄端 iicn；「多端同构」的宽度口径与 useIsMobile 视口口径解耦，记档）。

### 批2 检视面板·状态层 + 移动 IA（2026-09-27）

**结构**：`workbench-model.ts` 加 `PanelTab`（discriminated union：files/git/wiki 基础标签不可关 + file 预览标签可 ✕，id = `file:<path>` 单点派生）+ 三 atom（panelTabs/panelActive per-projectKey localStorage、panelOpen 内存级不持久化）；新 `inspection-panel.tsx` = fixed 全屏常驻挂载、translate + visibility 开合零销毁；row2 ticon×3 退役为单「检视面板」ticon；旧 `?tab=` 深链渲染期一次性映射为面板 open+激活标签（不写回 URL）。

**双 reviewer 消化**（design：1 Major 系 + 6 Minor；perf：1 Major + 2 Minor；两项重叠）：

- **design M1 滑出动画失效**：`transition-transform` 的落盘 transition-property 不含 visibility，关闭时 `invisible` 瞬时生效 → 300ms 位移过渡在不可见元素上空转（滑出变硬切，违反 03o ⑥「滑入/滑出不销毁」）。修 = `transition-[transform,visibility]`（CSS visibility 离散插值特例：一端 visible 则整个过渡期按 visible，结束时才隐藏）。
- **design M2 panelOpen 不随路由卸载复位**：fixed 全屏层 open 时应用内无出口离开 workbench 路由，浏览器/系统返回后 atom 残留 true → 重进**任意**项目面板「不请自来」。修 = `useEffect(() => () => setPanelOpen(false), [])` 卸载复位（开面板是页面级显式动作，与 atom 注释语义对齐）；残留 `?tab=` 深链复开是拍板 f 固有代价，批3 链接直达接管 URL 时收敛。
- **perf M1 / design m5（同问题）首访多发不可见请求**：panelTabs/active 缺省回退 files → 面板从未打开时 FilesToolPanel 已挂载、invisible 只免 paint 不免渲染/布局/网络。修 = `panelEverOpened` 门控（内存 useState；三个 open 路径——ticon / handleToolChange / URL 映射 effect——统一走 `openInspectionPanel` 置位），首次 open 当帧挂载（滑入动画同 commit 不受影响）、关闭后不卸载（零销毁保持）。
- **perf m1 标签切换卸载重建**：renderPanelChildren 单激活形态，每次切换 = 5s staleTime 后台 refetch + 滚动位丢失。修 = **标签叠层保活**：panelTabs 全渲染、非激活 `invisible`（visibility:hidden 保布局保滚动位，absolute inset-0 叠层互不挤占），容器叠 `data-panel-tab-body={tab.id}` 供探针限定。顺带把 **L3 从互斥渲染改不透明覆盖层**（InspectionPanel 内容区 children 恒挂载 + `absolute inset-0 z-10 bg-surface-base` 覆盖层承载 l3Body；fab 移出覆盖）——此前 L3 打开时整个 children 卸载、返回标签条零重建被破坏；l3Transient（file/git 预览）分支同样包 `data-role="l3-page"`（覆盖层内内容根标记统一）。
- **perf m2 activatePanelTab 无条件 spread**：值未变也产生新引用 → 多余全组件重渲染 + localStorage 同步写。修 = `prev[scope.key] === id ? prev : ...` 早退守卫（与 ensurePanelTab 幂等守卫对齐）。
- **design m1/m2 ptabs 触点**：＋ 触发器 20×20 裸热区 → `after:-inset-2` 扩至 36×36（同 row2 检视 ticon 范式）；file ✕ 从「span role=button 嵌 button」（嵌套交互元素不合法 + tabIndex=-1 键盘不可达 + 热区 ~12px）重构为 **ptab 改 `div role="tab"` + ✕ 独立 button**（24×20 命中区、Enter/Space 键盘激活、aria-label/aria-selected 补齐）。
- **design m3 FAB 空桩诚实化**：label「新建文件夹」→ `files.add`「添加」（03o ③ 语义），批4 前先 `disabled`（`.fab:disabled opacity:.45`）不给无功能的可见 affordance。
- **design m4 fab 死 prop**：组件文档 fab prop 恒 undefined（调用方混进 children）→ 收敛回 fab prop 单入口。
- **design m6/n3/n4**：`.ptabs` 补横滚条隐藏（与 .pills 同款）；面板底色 `bg-surface`（canvas）→ `bg-surface-base`（贴 03o `.page`=bg-base；浅色 #FFF vs #F2F2F7 的胶囊质感差）；`.ticon.hl` 孤儿删除（ticon×3 退役制造的）。
- **探针适配**：叠层保活后 children 里非激活面板与覆盖层 L3 并存（文档序 children 在前）——m4 探针 9 处、m10 探针 2 处查询限定 `[data-role="l3-page"]` / `[data-panel-tab-body=…]`；ptab button→div 后 `[role="tab"][aria-label=…]` 两处。m4 62/0、header 25/0、cwd ALL PASS、m10 全过。

**diverge 记档（拍板/取舍，不作为偏差修复）**：① 面板态 nav 不渲染 ℹ/⋯（无聚焦实例上下文，原型编号说明未定义）；② 三基础标签不可关（原型示例 Git ✕ 视为展示语义）；③ iPad 竖屏（<1024）全屏中间态（批3 收敛）；④ FAB glyph 用 `--c-primary` 非原型 `--on-accent`（白 on 12% tint 浅色 ~1.2:1 不可读，「双主题硬约束 > 原型示意值」，批4 03oa 换菜单时复核）；⑤ 「文件」标签名保实现（原型「文件树」；铁律5 三端同名支持）；⑥ file/git 预览跨面板开关销毁重建（保活层让位过渡态，批3 链接直达收敛）；⑦ toolChip gap 8px vs 原型 6px、收缩搜索为 crumb 内联非独立 .obtn.srch（M4 既有形态整体迁入，批4 收敛）；⑧ 存量 29 手绘 SVG 未迁（拍板 ④ 渐进）。

**验证**：四门禁 + token strict + CSS 硬闸 + 单测 673/0 + e2e 24/24 + 探针 4 个（m4-tools-l3 62/0 全量面板语境重写：入口/ptabs/FAB 几何/toolChip 三态/面板内 history+commit+branches+file+wiki/长按菜单/零销毁 DOM 身份/深链映射）。

### 批3 检视面板·桌面 ptabs + 链接直达（2026-09-27）

**结构**：桌面右栏 seg4 三段退役 → `PanelTabBar` 单源标签条（与移动 InspectionPanel 同一组件/同一 panelTabsAtom·panelActiveAtom，多端同构只容器不同）；`workbenchPanelOpenAtom` 成两端面板开合单一真相——右栏折叠 atom（`workbenchRightCollapsed` localStorage）降级为 mount 恢复记忆，投影 effect 把「记忆=未折叠」镜像成 panelOpen=true，运行时写入走 open/close 包装镜像；`?rightTab=` 深链映射 effect = 打开右栏 + ensurePanelTabOpen/activate（幂等）；链接直达（03ab）：面板/树点文件 → `panelFileTab`（path 编码改 `${projectName}/${relPath}`，splitFilePath 可逆）+ 激活，移动面板 file 行点击同批收敛（transient focus L3 旧体系入口清零，仅剩深链/存量渲染路径）。

**三个真 bug（e2e/探针实战抓出，机制记档）**：

1. **StrictMode 双调用吃掉深链/恢复逻辑**（e2e vite dev 挂、prod 43012 好——dev 挂 prod 好即此 bug 指纹）：React dev mount→cleanup→mount 双调用下，卸载复位 cleanup 撤销首轮 effect 写入 + ref 幂等守卫吞掉次轮重执行 → 深链映射/记忆投影整体丢失。**修复范式 = 写入幂等则删 ref 守卫，让 remount 重执行自愈**（不与「panelOpen 卸载复位」批2 决策冲突——复位本身是幂等语义，问题只在守卫）。
2. **jotai `atomWithStorage` getOnInit 缺省 false 陷阱**：`baseAtom = atom(initialValue)`，storage 值在 `baseAtom.onMount` 才派发——effect 的 mount 闭包读到的**恒是 initialValue**（右栏折叠记忆恒 true → 投影永不触发）。**修复 = effect 依赖该 storage 派生值**，等 storage 落地后再投影（jotai/vanilla/utils.js:504-516 实证）。
3. **panelFileTab path 编码不匹配**：id/path 用 `:` 分隔 vs 消费端 splitFilePath 按 `/` 拆 → file 标签 body 收到含项目名前缀的 path → preview 404 → error 分支（无 l3-file-preview）。修复 = 单点改 `/` 分隔 + RightPanelTabs 拆 relPath。

**diverge 记档**：① 会话流 tool card 文件链接不可点击（03ab 直达覆盖树/面板入口，会话流内联卡留后续）；② stickyWorkbenchSearch 的 rightTab 透传保留（幂等无害）；③ html render iframe 语境归全局 /files 页 FilesPanel——检视面板 file 标签 = 03q 源码形态无 render toggle（批7 sandbox 收紧时一并处理）；④ iPad 竖屏 <1024 全屏中间态（批2 记档 ③ 延续，桌面 ptabs 只做 ≥1024）；⑤ 桌面右栏折叠 = 卸载（与移动零销毁不对称：滚动位/file 标签 cwd/diff 栈跨折叠丢失；保挂载是行为变更牵扯 RailButton/aside 渲染条件，留后续批次）；⑥ tabpanel id/aria-controls 关联未做（role=tablist 已补，读屏树待补全）。

**reviewer 消化**（design：2 Major + 6 Minor）：

- **M1 深链映射非一次性**：effect 依赖 `[rightTab, scope]` 且 rightTab 经 stickyWorkbenchSearch 永久透传、WorkbenchContent 是常驻 pathless layout——消费过一次 `?rightTab=` 后切项目即复开已手动收起的右栏并强设激活标签（批2 M2「开面板是显式动作」同款违背）。修 = 依赖收敛 `[rightTab]`（闭包读当轮 scope 即首次映射语义）；残留 `?rightTab=` 刷新复开仍是拍板 f 固有代价。
- **M2 桌面残留 panelOpen 穿透移动端**（批2 diverge ③「批3 收敛」兑现）：桌面开面板 → 视口 <1024 → MobileWorkbench 重挂，共享 panelOpen atom 残留 true 而 panelEverOpened=false → 空面板全屏渲染 + 主体隐藏。修 = `panelVisible = panelEverOpened && panelOpen` 派生，全部「面板可见性」消费点（open/l3/保活层让位/主体切换共 7 处）统一替换；写入路径不变。
- **m1 桌面槽距**：`.ptabs` 基础 margin 16px 是移动语境，桌面右栏 `.glabel2` 槽距 14px——`[data-desktop-inspector] .ptabs { margin-inline: 14px }` 上下文覆写（05:104 原型 margin 差异许可用法）。
- **m2 panelFileTab JSDoc 旧编码**：头注释仍写 `:` 分隔与实现 `/` 分隔矛盾——同步。
- **m3 tablist 语义**：PanelTabBar 容器补 `role="tablist"`（tabpanel id/aria-controls 关联 → diverge ⑥）。
- **m4 Space 激活滚动**：重写时丢的 `e.preventDefault()` 补回（Space 默认滚 .ptabs 横滚容器）。
- **m6 panelDiff 残留**：handleToolChange(null)/handlePanelClose 两条关闭路径补 `setPanelDiff(null)`——残留会让重开面板直落旧 diff 覆盖层。

**验证**：四门禁 + token strict + CSS 硬闸 + e2e 3 spec（file-browser/git-diff 改写 ptabs 断言 + desktop-side 回归）+ 全量 e2e 24/24 + 探针 7 个（m9-b 19/0 ptabs 重写、m4 Part5 面板 file 标签/diff 详情态重写、m9-d F11-F14、inspector-row-menus 全量、html-img-inline 迁 /files 页语境、file-save-scroll、m10 F3/G 段批3 语义改写）。

### 批4 文件操作补全（2026-09-28，`9b95466`；reviewer：design+security 自查）

**实现**：服务端 `createFile`（project-files.ts，校验骨架与 createFolder 同款：Project-safe resolver + 名称黑名单 `/`/`\`/`\0`/`.` 前缀 + **flag "wx"** 防默认 "w" 截断既有文件；重名 = PROJECT_FILE_TARGET_EXISTS 409 硬拒）。UI 四新组件（`web/src/components/files/` 单源）：03y `new-item-sheet`（文件|文件夹 segc + 重名即时行内校验 + 409 兜底同位红字；移动 MobileSheet / 桌面居中 Dialog）、03w2 `rename-dialog`（**两端同款居中 Alert 不分流**，pin④；预填全选 + ✓可用/重名红字行内提示）、03w3 `move-sheet`（根起树目录浏览 + 当前目录即选中 ✓ + 排除自身子树 + 就地新建文件夹 + 「移动到此处」originalDir 禁用；移动/桌面分流同 03y）、03oa `add-menu`（ActionMenu 薄封装两项）。入口接线三处：面板 FAB（mobile-workbench，批2 disabled 桩换真）、/files 页 h1 行 actions 槽（WorkbenchRoute MainPageShell 新增 `actions?: ReactNode`）、移动 overview 卡（GlobalFilesOverview）。`MoveSheet`/`RenameDialog` mutation 留调用方（复用 renameMutation targetDir 既有链路）。

**实战修复**（本批 e2e 诊断链）：① 三 Dialog 补 `DialogTitle`（裸 `<h2>` 触发 Radix a11y 警告；PromptDialog/ConfirmDialog 既有消费者同病史，欠账不动）；② **类名解撞 `.mrow` → `.mvrow`**：03w3 目录行与 M10 插件页市场入口行（09:41）撞名——原型体系静态分页 HTML 各页独立样式无妨，实现单文件 CSS 合并后后者 `width:stretch` 被前者 `width:100%` 覆盖 + margin 叠加 → 插件页溢出 32px（probe-m10 H3 实锤 393px）；原型忠实性与单文件现实冲突时解撞改名，子类 `.nm`/`.ck` 作用域随前缀受限不改；③ dev api `bun --watch` 未重载新路由（`POST /files/create` 404，dev-bun-watch-not-restarting 前科再犯）——`respawn-pane -k` 标准重启修复；④ **Radix modal `aria-hidden` 测量假象**：Dialog open 期间 app root 被标 `aria-hidden`，`getByRole("complementary")` 解析为空 → `evaluateAll` 得空数组，与「列表清空」表象完全一致但非真回归——诊断脚本在 dialog open 态量面板 DOM 必须换 css 定位或先关 dialog。e2e 定位器教训：`.frow` 行 textContent 带行内空白（图标 span 间 JSX 换行），锚定正则 `/^src$/` 不匹配——行定位用子串 `hasText: /src/` 或限定 `.p` 子元素。

**diverge 记档（拍板/取舍）**：① 桌面左栏 panel 态（Sidebar ghead plus）本批不接——标题槽跨 WorkbenchShell 改造 + 该语境有右栏 FilesToolPanel 写入口兜底；② 03w4 橙色警示条不渲染（`deleteDirtyWarn` 保留为文案警示，子树计数不可得时用可达措辞）；③ 03y 位置不可切换（原型仅默认当前目录只读 .skrow）；④ FilesToolPanel 保留「..」行（03o 编号① 保底；批2 crumb 只迁移动面板语境，右栏维持原状）；⑤ 重名即时校验子目录新建传 `[]` 跳过（调用方无同层名单，靠 409 兜底）。

**验证**：四门禁 + token strict + CSS 硬闸 + 单测 1517（api createFile 矩阵：重名/越界/合法/wx 截断防护）+ e2e file-browser 2 test（含批4 全流程：新建→重名即时校验→重命名→移动→删除确认）+ 探针 4 个（inspector-row-menus / files-cwd-memory / m10 全量 / m4-tools-l3 65/0）。security 自查：createFile 入参全过 Project-safe resolver、argv/路径无拼接、409 语义与 03z 上传同源；design 自查：全部类名复用原型单源（.segc/.klabel/.kfield/.skrow/.kbtns 既有 + .mvrow/.mnew 新增）、双主题 token 语义化、两端行为单源仅容器分化。

### 批5 Git 写操作（2026-09-28；reviewer：security 必过 + design）

**实现**：shared 5 类型（GitCommit/Discard Request/Response + 5 ApiErrorCode）。服务端 `api/src/project-git-write.ts`（ProjectGitWriteService）：**commit** = message trim 非空 ≤2000 → paths sanitize（拒 \0/绝对路径/`..` 段/`:` pathspec magic）→ resolveProject + **worktree root == project.path（show-toplevel realpath 相等，M1）** → 变更集成员校验（listDiff 现场复核，PROJECT_GIT_FILE_NOT_CHANGED）→ 执行前 realpath TOCTOU 复核（M2）→ `git add -- <paths>` 收编勾选行 → `git commit -m msg -- <pathspec>`（renamed 展开两端）→ rev-parse/symbolic-ref；**discard** = tracked（`ls-files --error-unmatch`）→ `restore --source=HEAD --staged --worktree --`（renamed 双端）；untracked → realpath 复核后 rm。index.ts POST gate（与 GET gate 同位鉴权、kind 分流、payload 校验 PROJECT_TARGET_INVALID）。UI（web/src/components/git/ 单源）：03m2 `commit-sheet`（勾选清单 .crow2/.cb〔M/A/D/R 默认勾、untracked 默认不勾防密钥误提交〕+ .cmsgin 必填 + .cbtn 动态计数 + aria-pressed + onError 行内红字 + 移动 MobileSheet aside 取消钮）、03m3 `discard-dialog`（居中 Alert 不分流 + .awarn 红警示块 + 红色放弃钮 + onError）。GitToolPanel 接线：links「提交…」（files.length>0 门控）+ 行菜单红项「放弃更改…」（variant destructive）+ holder 挂两组件——**装配点零改动**（mutations 收面板内部）。invalidates：gitDiffListQueryKey + gitLogQueryKey 前缀（slice(0,4) 覆盖全分支维度）。

**实战修复**：① **client.ts path builder 误删回归**（compact 期间引入）：`projectGitCommitPath` 重复声明清理时删反——保留新写 `/git/diff/commit` 删了原有 `/git/commit`，服务端 suffix 路由是 `/git/commit|/git/discard` → GET 提交详情 404（e2e test 1「Unable to open this diff」实锤），discard builder 同病；修 = 两 builder 对齐服务端 suffix。教训 = **改 path builder 前先查服务端 suffix 表**，重复声明清理要看清哪边是存量。② 生成损坏高发（discard-dialog Write 两次截断 + 多处 Edit 混入垃圾 token）按既定对策走：Read 实际内容 + 小段 Edit 拼回，不硬试第三次。③ e2e 断言两处按真实语义修正：untracked 不勾 = 保留未提交（非全清零）；信息空按钮恒禁用（toggle 不影响 enabled，改断言按钮计数文案）。

**security review 消化（2M+3L 全修，14 tests 全绿）**：M1 worktree root 相等性校验（嵌套外层仓库场景封死）；M2 ensureExistingPathInsideProject（变更集校验与执行间窗口的中间目录 symlink 穿透防护——rm/restore 写穿、add 读穿外带；不存在路径 ENOENT 跳过）；L1 sanitize 拒 `:` 开头（pathspec magic `:(top)x` 防错目标）；L2 POST payload 错误码 NAME_INVALID → TARGET_INVALID（语义归位）；L3 gitRaw try/catch 对齐 diff 服务先例（E2BIG/git 缺失 → PROJECT_GIT_UNAVAILABLE）。审查通过维度：argv 数组零 shell 拼接、鉴权与 GET 同位、stderr 不出服务、message 限长、变更集自复核无跨请求 TOCTOU。

**design review 消化（P1×1+P2×2+P3×3+P4×2）**：**P1+P2 容器家族性修复（批5 两件 + 批4 三件一次改齐）**：DialogContent 内层补 `shadow-2xl shadow-black/40 ${shellSurfaceClasses.workspace}`（此前桌面 Alert 无表面浮在 scrim 上——批4 同病家族放大）；宽度 `max-w-*` 被 DialogContent 基类 `sm:max-w-lg` 覆盖（twMerge 盖不掉 variant 基础类，frontend-notes §11 同族）→ caller 补 `sm:max-w-xs/sm:max-w-sm` 同 variant。**P2 mutation onError** 行内红字（role=alert，对齐 new-item-sheet 范式）。**P3** 勾选行 `aria-pressed`；.awarn margin `0 16px 14px`→`0 0 14px`（容器 p-5 内缩归位）+ font-weight 600 + 去 text-left；.cbtn:disabled 0.4→0.45（与 .kbtns 统一）。**P4 记 diverge**（下）。MobileSheet aside 槽挂「取消」（03m2 头部取消语义，触屏禁用态明确退出路径）。

**diverge 记档（拍板/取舍）**：① sheet 内不做 diff 复核（03m2 ③，L3 层级过深）；② 「提交…」入口 files.length>0 门控显隐（原型 gacts 恒显）；③ 提交成功不加 ✦ 来源标记（04d ✦ = Agent 提交语义）；④ untracked 行 badge 走 statusShortLabel 绿 A 非 `??` 原型形态（badge 体系统一；「防密钥误提交」语义由「默认不勾」承载）；⑤ 桌面 links 行沿用移动 `.links` 文本链（04d/05i 桌面 `.gacts` 等宽描边钮形制批2 起未落——批2 以 `.links` 双端统一在先，本批顺延）；⑥ 桌面 Dialog 无显式取消钮（Esc/scrim 惯例，Radix DialogContent 无 X）；⑦ Alert 圆角 rounded-2xl(16px) vs 原型 radius.menu 14px（与批4 家族一致）；⑧ rocard 文案改「检视仅开放本地提交与放弃更改」。

**验证**：四门禁 + token strict + CSS 硬闸（批5 新类 .crow2/.cb/.cmsgin/.cbtn/.awarn + sm:max-w-* 落盘逐一核对）+ 单测 1529（api 849 含 project-git-write 14：commit/discard/renamed/identity/嵌套仓库拒/pathspec magic 拒）+ e2e git-diff 2 test（新增 commit 全流程：默认勾选态→计数联动→提交→勾选行清零 untracked 保留→历史 +1）+ file-browser 2 test 回归 + 探针 m4-tools-l3 65/0 + m10 全量。

### 批6 插件重排 + 停用（2026-09-28；reviewer：design + security 自查）

**服务端（停用语义 = 状态即目录布局，零标记文件）**：`api/src/skill-disable.ts`——技能 disable = rename 激活区→停用区：全局 `~/.claude/skills/<name>` → `~/.agents/disabled-skills/<agent>/<name>`（**symlink 整体 rename 保留 canonical**，per-agent 子目录防 claude-code/codex 同名撞）；项目 `<root>/.<agentHome>/skills/<name>` → 同级 `skills.disabled/<name>`（非 skills CLI 约定目录，CLI 不再发现 = 停止注入）；enable 反向。防复活四点配套：scan 停用区（disabled:true）/ uninstall 停用条目直接 rm / checkUpdates+update 拒停用条目 / 成功后 reloadAliveSessions（活跃会话 slash 菜单即时刷新）。端点：POST /api/skills/disable|enable + 项目级 /api/projects/{name}/skills/disable|enable（matchProjectSkillPath action 复用）。MCP 停用（mcp-management.ts）= `claude mcp remove` + entry stash `~/.agents/mcp-disabled.json`（**remove 成功 stash 失败 → 回滚 add**）；enable = stash 取回重 add（buildAddArgs 复用）+ 删 stash；list 经 mergeDisabledMcpServers 合并（live 同名 shadow 丢弃 / projectName 过滤 / user stash 在 project scope 忽略）。

**前端（09 单页重排 + 09b 长按 + 12/13 toggle + 09mb Popover）**：mobile-plugins-home.tsx 段序 = 搜索（psearch，本地过滤已装+市场融合）→ segc 作用域分段 → 市场组顶部化（组头「市场」+「管理源 ›」仅全局 + .quick 两 chip 无计数 §6.12g）→ MCP 组（＋ 添加两段共有，scope 随段）→ 技能组（组头「n 个更新 ›」chip 橙色 = 状态指示点击重检测 / 无结果时「检查更新」钮 +「＋ 添加」仅全局）。卡从 button 改 div[role=button]+tabIndex（ActionMenu trigger 是 button 不能嵌套，chat-overview ListRow 先例）+ 首行 §4 contains 守卫 + onContextMenu + 长按（useLongPressActions/useRowContextMenu，09b 菜单 = 查看详情/停用（停止注入）/卸载·移除 destructive+confirm）。搜索市场融合（编号①）：useSkillSearch/useMcpMarketSearch ≥2 字符门控 + keepPreviousData + installedNames Set 去重，「市场 · 安装」.mrow 行插组尾 → 复用 InstallAuditSheet/McpInstallAuditSheet（后者 export 化）。技能详情（12）+ MCP 详情（13）各加「已启用」toggle（button role=switch + 双 span 轨道，settings-dialog enable1m 先例；停用中更新 CTA 隐藏）。09mb：hideTitle（桌面 mainPage/iPad）▾ = ScopeSwitchPopover 锚定 Popover（.spop 300px：ttl/全局行/项目组/newp ＋新建项目）；移动保持 MobileProjectSwitchSheet。CSS：.spop .row+row 边线 / .ar 尾箭头 / .sep。

**diverge 记档（拍板/取舍）**：① upd chip 位置 = 技能组头（原型 09 L82 为准）而非计划文字的 quick 区——quick 区只 2 chips；② 「16 更新清单页」不存在（16 实为 install-audit）→ 组头「n 个更新 ›」= 状态指示（点击 refetch），更新确认收敛在详情页，无更新时保留「检查更新」钮作检测入口；③ 搜索融合行仅全局 scope（市场安装恒全局语义）；④ 卡 div[role=button] 形态（语义 button 视觉 pcard）；⑤ ActionMenu trigger = aria-hidden hidden button（桌面非受控路径永不触发，仅 contextMenuPoint/长按路径工作）；⑥ project MCP 卡静态无菜单/详情（/plugins/mcp/$ 只承载 global，记档 M6-b 延续）；⑦ project 技能卡不带 hasUpdate chip（project 与全局同名撞名时 updates 缓存误报——chip 收敛全局段）；⑧ manageable/Local 徽标不进新 IA（旧 PluginsPanel 语义，随组件退役）。

**验证**：四门禁 + token strict + CSS 硬闸 + 单测（api 全量 865 pass，含 skill-disable 7：symlink lstat/realpath 保留/错误码/双 scope/停用区扫描 + mergeDisabledMcpServers 4 + mcp stash 闭环 3）+ 探针 m6 87/0（段序/长按菜单/停用闭环双端点/详情 toggle/搜索融合审计 sheet 复用/09mb Popover——**场景修正：docs-writer 在 Part 5 已装、Part 7 融合行换 code-style 验证（已装去重是正确行为）**）+ m6c 53/0（Part 1 适配 .quick chip 入口）+ project-plugins 重写 15/15（旧承载 nav Projects/PluginsPanel/drawer 已退役，新断言 = 项目级端点矩阵 + 项目段空态 + 项目卡停用 payload 闭环 + A3b 真实 disable 路由断言）+ e2e mobile-nav 6 / desktop-side 5 全绿（reviewer 消化改动后全量复跑）。

**security review 消化（6 修 + 2 记档）**：

1. **dot-segment 路径逃逸（高）**：SKILL_TOKEN_RE 对 `.`/`..` 返回 true → disable `..` = rename 整个 `~/.claude`、uninstall = rm -rf 目标目录——sanitizeSkillId/sanitizeSkillName 显式拒 bare dot/dotdot（skill-process.test 矩阵 +2 case）。
2. **项目级 disable/enable 端点 404 死代码（高）**：matchProjectSkillPath union 扩了 disable/enable action 但 tail 分发漏写 → 端点 404。**探针盲区教训：mock 探针（page.route）只断言前端发了请求，拦不住端点 404——project-plugins A3b 补真实路由断言（POST 真后端 → 400 业务错而非 404）**。
3. **headers 回填（中）**：entryToAddRequest 丢 headers → disable→enable 循环剥掉鉴权头，enable 后 server 认证失效——回填 + 单测断言 add argv 含 `-H`。
4. **stash 读改写并发丢条目（中）**：远程控制面双端并发是常态——withStashLock 模块级 promise 链串行化（失败不阻断后续排队）。
5. **stash 原子写 + 权限（低）**：tmp+rename 原子落盘（崩溃截断 = 解析失败静默丢全部停用条目）+ mode 0600（stash 条目含 env/headers 密钥，不落世界可读）。
6. **测试写真家目录（低，根治）**：bun test 全量并发下 `mock.module("node:os")` 时序不可靠 → homedir() 返回真值 → stash 写到真 `~/.agents/mcp-disabled.json`（实测发生过、已清）。治本 = **路径依赖注入优于进程级 mock**：read/write stash 加 home 参数、disable/enable context 加 `home?: string`（readScopeServers 同），测试 per-test mkdtemp 零接触真家目录。
7. 记档：rename 跨设备 EXDEV 错误信息裸路径回显——与既有错误处理风格一致，不另做归类层。
8. 记档：停用区 symlink 穿透（informational）——enable 时按 stash 记录 rename 停用条目，若停用区被投放恶意 symlink 理论上可移动系统目录；投放需 `~/.agents` 写权限 = 同 trust 边界内，且 symlink 整体 rename 保留 canonical 的语义是本设计核心（单测锁定），不引入 realpath 校验。

**design review 消化（13 项全修）**：① PopoverTrigger 无 asChild 渲染原生 button，嵌宿主分段 button = 无效 HTML、键盘焦点链断裂 → `asChild` + `span[role=button]`（键盘可达保持）；② home 两卡 div[role=button] 无 onKeyDown = WCAG 2.1.1 违例——**div 形态豁免口径修正：形态可豁免、键盘可达不可豁免**，两卡补 Enter/Space navigate；③ 组头双按钮在 fit-content 父内 margin-left:auto 解析为 0 → span 加 ml-auto（flex 内推）；④ 「＋ 添加」i18n 双 key 收敛 `plugins.add`（zh「＋ 添加」/en「＋ Add」）；⑤ MCP 组头 plus 图标钮 → `.r` 文字钮（原型 09 L72 组头形态，与技能组头同体系）；⑥ 管理源钮 isFetching 条件显隐致组头跳动 → 恒显；⑦ `.spop .row` div onClick → `button type=button`（CSS 补 UA reset：border/background/font/text-align）；⑧ 详情 toggle thumb 双 bg 类并存赌 Tailwind 生成顺序（frontend-notes §11 同族）→ 三元互斥；⑨ toggle on 态 primary 蓝 → success 绿对齐原型 12（`--color-on-success` 物化补齐，thumb 走 token）；⑩ 更新 CTA 缺 `!skillDisabled` 门控（服务端守卫拒停用技能更新，CTA 出来必败）→ 补；⑪ `.spop` 注释声称上箭头但 CSS 从未实现 → 补 `::before`（原型 09mb L126：top -6px / right 52px / 12×12 / rotate 45°；去 `overflow:hidden` 防裁切，`.row.on` 背景不贴容器边无圆角溢出）；⑫ 停用 chip 沿用「有更新」蓝 tint → `.upd.off` 中性变体（ink-2 + bg-elevated2，静止语义不抢注意力）；⑬ quick chips 补 bag 袋形图标（原型 09 L69，14px stroke c-primary）——新增 `ShellIcon` bag 件。

### 批7 预览矩阵收尾（2026-09-28；reviewer：design 抽查）

**实现**：① html render sandbox 收紧 `sandbox="allow-scripts"` → `sandbox=""`（design_spec L93 沙箱 = 不执行脚本、不发请求）——Files 预览（file-browser.tsx）与聊天流 render tab（instance-area.tsx HtmlRenderPanel）两处同收紧；render tab 注释同步。② ImageViewer 补「另存」（spec L93 图片查看器操作含另存）：工具条追加 `a[download]`（href = dataUrl/同源 URL 浏览器直接落盘）+ 新 `ShellIcon` download 件（upload 垂直翻转箭头）+ i18n `files.imageDownload`（zh「另存」/en "Save"）；`downloadName` prop 传真名（file-browser/mobile-l3），lightbox 无真名走 `suggestDownloadName`（dataUrl mime → `image.<ext>` 兜底）。

**diverge 记档（拍板/取舍）**：① **编辑态保持着色**——spec L93「代码……可编辑（编辑态为明文）」，实现编辑态保持语法着色：着色由 CodeMirror 增量维护（对齐明文反而降 UX：丢高亮辅助），不动；② **未知二进制 = 元信息 + 下载**——spec「元信息 + 系统应用打开」，Web 无「系统应用打开」通道，下载是可达的最近语义；③ 图片查看器 spec 操作清单「适应窗口/1:1」对应现有「重置」钮 + 双击 fit↔2x（既有实现，未改）。

**验证**：探针 probe-files-html-img-inline 扩展（sandbox="" 断言 + 另存钮 3 断言：download 建议名 = 文件名 / href = dataUrl / aria-label「另存」）+ probe-lightbox-center 回归；门禁同批6 基线。

### 批8 工作台密度（2026-09-28；reviewer：perf 必过 + design）

**实现**：① **03b 滚动收敛**——会话输出流上滚越过一屏（`scrollTop > clientHeight`，绑定 `upDelta > CHAT_SCROLL_UP_EPS` 上滚方向：点 ▾ 弹回后的布局钳制滚动不再触发）→ row2/pills+chips 与检视入口折叠为 `.mini` 单行胶囊（`● 会话名 · ⚠n · ▾`），回底 0.5 屏内 / 点 ▾ / 点回底浮球弹回；滞回死区（1 屏进 / 0.5 屏出）防折叠布局变化的来回抖动。② **托盘两态**（spec §4.2）——ApprovalTray 默认单行胶囊「⚠ n 项待审批 + 全部允许 ›」，首点「全部允许」只切确认态（文案 `approvals.confirmAll`「确认允许 N 项？」、零上行），再点执行 `allowAll`（循环 `bridge.respondToControlRequest`，payload 与逐条允许一致）；`allowAllSent` 锁 + `disabled` 防双击重复帧；⚠ 行点击 = 展开完整托盘（逐条 mono 摘要 + 允许/拒绝），展开态标题点击 = 审批中心入口保持。③ `.mini` 原语类提升进 v2-primitives.css（原型 03b L12-17 一比一：34px 胶囊 / gap 8px / r10 / bg-elevated / sep 边 / 12.5px 600 / `.wn` warning-text 700 / `.ex` ml-auto ink-2 11px），margin 由挂载点 utility 管；mini 状态语言用既有 `.dot` 原语（run=idle 两态，1:1 原型不加 pulse）；aria-label 拼合可见文本（WCAG 2.5.3）。

**perf review 消化**：P1 **atom 会话级 scoping**——`workbenchOutputCollapsedAtom = atom<Record<string, boolean>>({})` 按 sessionId 分桶（桌面对 hidden 面板保活、多面板同时挂载 VirtualizedThreadContent，全局单值跨面板串扰）；订阅侧 `selectAtom` 派生（jotai/utils，只在自身 key 变化时重渲），写侧 `useSetAtom` + 函数式幂等更新（同值不换引用），会话页卸载复位清本 key（残留 true 误伤项目页 row2）。P2 收敛判定全走 ref + passive onScroll（无逐帧 setState，MutationObserver 计数 = 0 翻转硬数据）。**atom scoping 隔离语义由 workbench-model 单测锁定**（桌面「点左栏第二个实例」会丢 leaf——存量问题、双面板并存在当前导航下不可构造，探针场景不可达）。

**design review 消化（13 项）**：#1 托盘两段确认（spec §4.2 红线，推翻初版「无确认直接执行」）；#2 **子 agent 条保留**——03b 原型 L45 mini 与 `.sub` 并存，推翻初版「一并折叠」（像素 + spec §4.1-4 胜出原注释①）；#7/8/9/13 `.mini` 从 utility 组合提升原语类；#4 dot 状态语言用既有 `.dot` 原语；#11 aria 拼合；#5 mini 的 key 用 sessionId；#12 调用点（Acp/Chat 路由）补 `sessionId`/`loading`/`retryInfo` props；#3 收敛态重试条保留（流瞬态非工具区）；#6 AllowAll 文案收敛既有 `approvals.allowAll`/`approvals.confirmAll` key（删 `claude.approval.allowAll` 重复 key）；#10 热区扩展 `-mx-1 -my-1 px-1 py-1`。

**diverge（对原型 03b 的取舍）**：① 桌面仅 subbar 段收敛断言（桌面无 row2；atom 已 Record scoping，多面板串扰防御就位）；② mini 的 ⚠ 采用紧凑 `⚠n` 格式（原型「⚠ 2」对齐）；③ 收敛绑定上滚方向（原型未指定，防点 ▾ 弹回后的钳制滚动误触发）。

**验证**：probe-claude-detail-perf 27/0（移动/桌面收敛、34px 几何、dot 7×7、滞回死区 30 帧零翻转、回底/点 ▾ 弹回、subbar 保留）+ probe-v2-m5-approvals 43/0（胶囊默认态、两段确认全链：首点确认态零上行 → 再点 control_response ×2（request_id 覆盖/behavior=allow/updatedInput 原样）→ 防重锁 → 展开托盘 → 审批中心入口）+ workbench-model.test atom scoping 单测；e2e chat-session 1/1 + mobile-nav 6/6；门禁同批6 基线（test 674/0）。

**顺带发现（存量问题记档，§6.13 尾收拢）**：桌面 workbench「点左栏第二个实例」后 leaf 区不重建（面板区空、`[data-drop-group]`=0），且面板 hidden→visible 后内容不自动恢复（remount + WS 重连，mock 场景永久骨架）——真实链路重连会重新回放恢复，但切 tab 体验有洞。真机复验清单项；修复立项待排。

### 批9 小项收尾 + 记档（2026-09-28）

**实现**：① **02 状态点橙 = 待审批**（原型 02 L80 act-row `dot=c-warning`）：`.dot` 原语补 `.warn` 变体（`--c-warning`）；`statusToV2DotClass` 加可选 `opts.needsApproval` 覆盖运行绿（待审批 = 等输入语义优先于运行态）；活动卡 dot 从 v1 `statusDotToneBg[statusToTone(...)]`（idle→琥珀 = **语义反转**：原型橙是待审批不是闲置）切到 `.dot` 原语 + `approvalSessionIds` Set 派生判定；probe-mobile-projects-home dot 选择器同步（`span.rounded-full` → `span.dot`）。② frontend-notes §15 图标双轨规格。③ 本节总 diverge 汇总：

| 批 | diverge / 拍板 |
| --- | --- |
| 1 | 发送键 r12 vs 原型方形（spec 视觉层级胜）；composer 断点 1024 纯宽度口径（iPad 竖屏归窄端 iicn）；存量 29 手绘 SVG 未迁（拍板④渐进换代） |
| 2 | ℹ/⋯ 不渲染进原语；三基础标签不可关；iPad 竖屏走移动全屏容器（中间态）；FAB disabled 桩灰（批4 启用）；「文件」命名；file/git 预览重建过渡态 |
| 3 | 桌面右栏折叠 = 卸载（与移动零销毁不对称，保挂载牵扯面广留后续）；panel id/aria-controls 关联未做；`?rightTab=` 深链残留刷新复开是拍板固有代价 |
| 4 | 桌面左栏 panel 态不接（右栏写入口兜底）；03w4 橙警示条不渲染（子树计数不可得时可达措辞）；03y 位置不可切换；右栏 FilesToolPanel 保留「..」行 |
| 5 | 提交 sheet 勾选默认：M/A/D/R 勾、untracked 不勾（防密钥误提交）；sheet 内不做 diff 复核；untracked badge 绿 A 非 `??`；桌面 Dialog 无显式取消钮 |
| 6 | skills.disabled 目录暴露为 git 噪音（记档接受）；update CTA 门控停用项；停用 chip 中性色；stash 语义「状态即目录布局」 |
| 7 | 编辑态保持着色（明文降 UX）；未知二进制 = 下载替代「系统应用打开」；图片查看器沿用重置/双击语义 |
| 8 | 桌面仅 subbar 收敛断言（row2 是移动专属）；mini ⚠ 紧凑 `⚠n` 格式；收敛绑定上滚方向 |
| 9 | 活动卡 dot 语义修正（idle 灰、橙=待审批）——v1 tone 映射残留反转 |

**验证**：probe-mobile-projects-home 回归（dot 7×7 几何断言保留，选择器换 `span.dot`）+ 门禁同批6 基线。

### 真机反馈修复：终端 chips 行 + 侧边栏图标规格 + 全局文件页（2026-09-28）

**用户三条真机反馈**：① 终端会话第三行（chips）多余；② agent 会话侧边栏与设计图有差距；③ 全局文件页与设计图差距较多。

**实现**：① **chips 行整体退役**——终端的 tmux chip 是纯静态展示（终端实例 1:1 绑定 tmux 会话，无切换能力），不值独占一行；`mobile-project-header` 删 chips 渲染块 + `focusedTerminal` props 派生链（mobile-workbench 的 type predicate 收窄一并删），`.chips/.chip` 原语类退役（插件页 `.dchips/.mchips` 独立命名不相关）。② **侧边栏图标规格对齐 v1.4 标杆**——`.dicon` 16px/2 → 20px/1.8（单源 L207-208「桌面图标规格 = 标杆（02 右上）」）；`.ghead .clk` 笔画 1.7→2；workbench-side 五处 ShellIcon span `h-3.5 w-3.5` → `size-full`（svg 恒 size-full 跟随容器，components 层 `.X svg` 宽高规则被 utilities 反超的既有教训）。③ **全局文件页对齐 10-tab/10m**——搜索框 `.psearch` → 新原语 `.sfield`（移动 30px/r15/bg-elevated/sep 边/12.5px 字；≥lg 34px/r10/13px，@media 分档单类；放大镜 ShellIcon span `size-[13px] lg:size-[14px]`）；`.gfile` 散文件行 gap 10→12、padding 9→10、加 `.ic` 17px ink-2 文件图标、`.p` flex:1；外层 pt-3→pt-2.5（原型 margin 10px）；文件页 ＋ 补 `size-5`。④ **v1.4 单源数值对齐（全量扫描收敛 4 条该修项）**——`.badge` 基类 → 22×19/r4/11px/700（单源 L270；`.badge.lg` 删 10.5px 回退行防特异性盖基类）；`.crumb` 字色 ink-2→ink-3；`.seg4 span` 补长名尾截断三连（单源 L215）；`.psearch` 15→14px（单源 .search L219）。文件头 `.sbar` 注释漂移顺手修正。

**全量差距扫描记档（v2-primitives.css vs 单源 317 行）**：真正该修的数值差距仅上列 4 条（已修）；`.tree` 段与 `.growrow`（= 单源 `.grow` 避 Tailwind 撞名改名）为「数值漂移 + 零消费」复合项——启用前须先修值（`.growrow` 缺 sep-row 分隔/`.ar`/`.p` 溢出三连）；零消费死代码族（浮层旧版 `.dim/.sheet`、iMessage 输入旧族 `.input/.field/.stop/.send`、`.stream/.card/.think`、`.tabbar/.lb`、`.pane/.icn/.tterm` 等）删除无损，留待清扫批次；命名隐患一则：自造 `.kfield.plain` 与单源 `.plain` 同名 token 靠层序+特异性恰好中和（暂无回归，静默耦合记档）。

**diverge（记档）**：① 10-mac 桌面全局文件的 grplabel/pcard 项目分组形态（组标签 + 项目卡）未实现——现用 gfcard 列表形态，桌面分组化立项待排；② 散文件行 `.ic` 图标移动 10-tab 有 / 桌面 10-m 无——两端按原型各自渲染；③ badge 消费全带 `.lg`，基类几何变化对消费方生效值零影响。

**验证**：受影响探针回归全绿——probe-mobile-workbench-states 22/0、probe-v2-m11-mobile-nav 14/0、probe-mobile-project-header 25/0、probe-v2-m9-d-desktop-pages 63/0（.sfield ×10）、probe-v2-m6-plugins 87/0、probe-v2-m4-tools-l3 65/0（crumb）、probe-mobile-projects-home 21/0、probe-loading-states 13/0、probe-files-tree-bugs 滚动/交互段全过；probe-m10-feedback-fixes 除 3 处基线失败外全过。e2e 零受影响断言。四门禁 + CSS 硬闸 + format 361 文件全过。

**基线失败记档（stash 实验实锤与本次无关，未硬修）**：① probe-m10-feedback-fixes H 段 3 处（`button.pcard`/`button.mrow`/MCP 组 ＋——插件页 mock 卡未渲染，疑似 mock 与页面实现既有偏差）；② probe-files-tree-bugs「05e 五项序」——断言期望 `Open Preview`（大写 P），i18n 实际 `Open preview`（M4 `1891a43` 起），文案与断言大小写既有不匹配。

### 真机反馈修复·第二批：全局文件页 + 插件浮层 + 蓝「'」+ 桌面右栏（2026-09-29）

**用户四条真机反馈**：① 全局文件页整页样式不对（边距/搜索超右边/地址栏/文件列表）；② 插件页切换项目浮层做成了切换会话；③ 侧边栏添加按钮图标错误 + 文件地址栏样式错误 + 最右标签右边多了个蓝色「'」；④（mid-turn 补充）桌面右侧侧边栏与设计差距非常大，且 iPhone 与桌面差距大 = 疑似违背同构前提。

**同构整改前提（用户 mid-turn 拍板）**：整改不得用「两套 DOM」——必须**同一 DOM + 分档**：右栏语境用 `[data-desktop-inspector]` 属性选择器（v2-primitives 既有先例 ptabs margin-inline），main 整页用 `@media (min-width:1024px)`；行为收敛共享组件单份实现，两端只容器不同。

**实现**：

- **反馈① 全局文件页**：双重缩进根因 = `.gfcard` 基类 margin 16px + FilesPanel 内层容器 px-3 → 卡片距屏 44px 而搜索框 16px。修 = `file-browser.tsx` 容器 className 模板化（`globalCard ? "" : "px-3"`）；`global-files-overview.tsx` scopeSeg/搜索容器 padding 对齐原型（`px-4 lg:px-5`），FilesPanel 移入搜索容器（lg gap-3 接管 gfcard 桌面档归零的 margin = mbody 语义）；桌面分组建群标签（`files.groupProjectRoots`/`files.groupRootFiles`，`hidden lg:block`——移动无分组）；第二卡 `style={{marginTop:10}}` 改 utility（inline style 会盖 lg 分档 margin:0）；尾行 cap 桌面档左对齐归零 margin。
- **反馈② 切换项目浮层**：`mobile-plugins-home.tsx` 项目作用域浮层从会话列表语义改回项目列表（projectOnly 门控）——浮层标题/条目/回调查项目而非会话。
- **反馈③ 蓝「'」根因 + 地址栏重构**：① **plus 伪元素冲突**——`.plus::before/::after` 是 CSS 笔画（components 层），Tailwind `after:-inset-2`（utilities 层）覆盖 ::after 的 left/top → 竖笔画游离成蓝色小撇。修复范式 = **容器式热区**：外层 button（h-7 w-7 热区）+ 内层 span.plus，workbench-side 两处（实例组头/项目组头）平移；项目组头加 `ml-auto` 补偿 `.ghead .tt + .plus` 相邻选择器被中间 button 断链。② **crumb 分隔符结构性 bug**——旧 `.crumb button:not(:last-child)::after` 因搜索钮占 last-child、前导 b 非 button → 首段无分隔 + 末段反多「/」（textContent 粘连「proj1src」）。修 = 分隔符改 `.crumb > * + *::before` + JSX 段按钮在前、当前段 `<b>` 收尾 + 搜索钮独立 `.obtn.srch` chip（对齐 03o 单源 L139-143：30×30 r9 tint-blue）。③ `.crumb` 改 `flex:1 1 auto; min-width:0` + `.crumb b` 溢出防护（ellipsis/max-width 140px）。
- **反馈④ 桌面右栏 10 项差距扫描消化**：已修 #1 头部 PanelHeader 44px 折叠钮 → glabel2 行内 clps「»」（05:103 原型；workbench-shell 删组件定义，RightPanelTabs 加 onCollapse）；#2 Files 标签缺工具行 → usePanelToolChip 装配（crumb+搜索，与移动同一份 hook）；#3 Git 链接行 → `.gacts` 段（单源 04d/05i 一致原型：gap8/margin14/等宽 32px 按钮，`[data-desktop-inspector]` margin-inline 14）；#4 行密度 → `.frow` padding 7px14px + `.frow .tm/.ar` 右栏隐藏 + `.sect`/`.crow` margin/padding/字号分档；#5 左缘统一 14px；#6 cap 分档（移动 capBreadcrumb lg:hidden / 桌面 capDesktop）；#8 Wiki 搜索 wsearch（03p）。**usePanelToolChip 装配单源**（新 hook 于 project-tool-panels）：移动 InspectionPanel 与桌面 RightPanelTabs 共用（crumb/gitchip/wsearch 四分支；git diff useQuery 同 key 缓存共享零额外网络；files/wiki 搜索 query 提升由调用方透传工具面板）。

**Agent 结论记档**：Agent C（移动端四差异 + plus）——crumb 四项全修；侧边栏 plus 渲染经 DOM 几何实锤**完全符合单源**（18×18 灰），用户所见「错误」最可能是 PWA 旧缓存 CSS（旧版 20×20 蓝裸 plus）+ 18px 无热区难点按 → 容器式热区平移，复验须清缓存。Agent D（桌面右栏）——10 项差距中 7 项修（见上），3 项 diverge。

**diverge（记档）**：④-#7 栏宽 352 vs 原型 320（现实现三栏布局口径，动栏宽牵动整体 grid，立项待排）；④-#9 「＋」28px 热区 vs 原型 20px 图标（触屏可达性刻意 diverge，非缺陷）；④-#10 diff 展示位置（原型右栏内嵌 vs 现 L3 预览栈，架构性，另立）；①桌面「＋ 加开终端实例」affordance 不做（桌面原型页私有，移动 Git 面板无此入口，做了即违反同构）；10m cap absolute 定位/长文不取；crumbrow 原语零实现（toolChip 槽已覆盖其职责）；05e 顶部「＋」入口未做；Files 底部 links 行 lg 隐藏后桌面新建/上传入口依赖 toolChip crumb FAB 链路（批4 03oa 已接）。

**验证**：探针回归全绿——m9-d 64/0（新增 F12b clps 断言）、m6-plugins 87/0（projectOnly）、m4-tools-l3 65/0（「历史列表」文案）、m9-b 19/0、mobile-project-header 25/0、mobile-workbench-states 22/0、m11-mobile-nav 14/0、mobile-projects-home 21/0、loading-states 13/0、files-tree-bugs 与基线一致（存量 2 处）。四门禁全绿（test api 865 + shared 9 + web 674）+ CSS 硬闸（183066 字节 text/css）+ tokens strict 0 违例。交付 checklist：stylesheet `Content-Type: text/css` 实测过。

### 真机反馈修复·第三批：卡片双重边距 + 检视面板三基础标签常驻 + 搜索框归一（2026-09-29，commit `a4e9e69`）

**用户三条反馈**：① iPhone 全局文件页列表两侧边距还是不对（没对齐）；② 工作台中的侧边栏（检视面板）缺了 wiki；③ 全局文件移动端搜索栏高度偏小，应与其他页面一致——但工具文件中的搜索确实应该紧凑，怎么处理。

**实现**：

- **反馈① 双重边距根因（DOM 几何实锤）**：搜索框容器 `px-4`（sfield 左缘 16px）+ 滚动容器无 padding + `.gfcard` 自带 `margin-left:16px` → **卡片左缘 32px vs 搜索框 16px**——上一批只归零了容器 px，忘了 gfcard 自身 margin 在新嵌套下叠加。修 = `.gfcard` margin `14px 16px 0` → `14px 0 0`（inline 归零，外层 px-4 提供边距与搜索框天然对齐；lg 分档 margin:0 不变）。复验：h1/搜索框/卡片/cap 左缘全部 16px。
- **反馈② 三基础标签常驻**：03m/03p 原型 ptabs = 文件树/Git/Wiki **三标签全在**，实现旧默认单 files 需手动「＋」开（用户开检视面板只见「文件」→「缺了 wiki」）。修 = `workbench-model.ts` 新增 `BASE_PANEL_TABS` 常量 + `withBasePanelTabs` 读侧 normalize（存量 localStorage 单 files 自动补齐，基础固定序前置、file 预览保序后置，幂等），移动/桌面消费点同构同一份。「＋」菜单保留（激活幂等语义不变）；✕ 仍仅 file 标签（三基础不可关）。
- **反馈③ 搜索框归一**：`.sfield` 页私 30px（上批照抄 10-tab 页内定义）退役，全局文件页搜索换 **`.psearch` 一级页单源**（38px/r12 移动 / 34px/r10 桌面，与插件页/项目页完全同款）。**语境分工方案（用户问「怎么处理」的答案）**：mainPage 整页语境搜索 = 与其他页面一致（38px 单源）；工具面板语境（检视面板 files 搜索 .wsearch 30px）保持紧凑——不同语境不同原语档位，同一 input 形态、零两套 DOM。diverge 记档：原型 10-tab 页私 .sfield 30px vs 实现 .psearch 38px，用户拍板跨页一致性优先于页私原型值。

**验证**：几何探针（diag-files-global-geometry.mjs 入库）：h1/搜索框/卡片/cap 左缘全 16px 对齐（修复前卡片 32）；m4-tools-l3 65/0（默认标签断言 1→3 适配）、m9-d 64/0（F14 三常驻 + psearch ×10）、m9-b 19/0（右栏 ptabs 三常驻）、mobile-workbench-states 22/0、mobile-projects-home 21/0、m6-plugins 87/0、files-tree-bugs 仅存量「05e 五项序」（基线在案）。四门禁全绿 + CSS 硬闸（182787 字节）+ tokens strict 0 违例。

### 真机反馈修复·第四批：三页搜索框对位 + Lucide 全量换代 + 侧栏间距 + 窗格圆角退役（2026-09-29，commit `f93b2b6`）

**用户四条反馈**：① iPhone 底部导航三页布局相似，搜索组件位置理应一致，切换时跳动——是哪个没遵守规范；② 图标理应都采用 Lucide 的标准和规范；③ 桌面左侧中部的「会话」区域距离分割线非常遥远；④ 桌面中间多 tab 会话用了圆角矩形，原型里没有。

**实现**：

- **反馈① 三页 psearch 对位**：「是哪个没有遵守规范」的答案 = **三页原型页私 margin 各异（8/12/10），实现忠实照抄页私值，页私值彼此不一致** → 跨页跳动。修法延续第三批拍板（跨页一致优先于页私原型值）：三页统一 `mt-2.5`（10px，文件页本就是 10）——mobile-projects-home（8→10）/ mobile-plugins-home（12→10）/ mobile-files-home（不动）。几何实锤：三页 psearch top 49.5/53.5/51.5 → 全 51.5。
- **反馈② Lucide 全量换代**（v1.4 spec §10.3 落地完成，frontend-notes §15 双轨并存收口）：37 个手绘 SVG（20 网格）删除；ShellIcon 保持 SF 名契约（调用点零改动），svgMap 换源 = `TO_LUCIDE` 映射（SF 名→lucide 名，35 项）+ `LUCIDE_ICONS` 生成物（build-icons.mjs 白名单 38 个 lucide 名，24 网格 stroke2 圆头）。anthropic/openai 品牌 fill 型保留手绘（Lucide 无对应物，政策不加品牌件）；menu/skills-nav 零消费删除；file/files-nav 手绘本就同形（同映射 maximize-2/minimize-2 配对）。
- **反馈③ 侧栏 dsep→seg4 间距**：26px vs 原型 18px——wrapper `pt-2` 是实现自加的多余一档（原型 = dsep mb 8 + .seg4 基类 mt 10），删除（workbench-side.tsx）。
- **反馈④ 窗格圆角退役**：GroupShell `rounded-lg` + `shellSurfaceClasses.workspace` 白卡 + 根容器 `p-1` 浮动缝 = VSCode 浮动卡片形制；原型 `.pane`（components.css:245）= 平面拼接 + `border-right: 1px solid var(--sep)`，无圆角无卡片。修 = 根容器去 p-1 满铺 + GroupShell 换 `border-r border-neutral-line`（几何实锤：radius 12→0、白卡→透明、窗格 rect y=0）。
- **⑤ 右栏「＋」缺口补齐**（第二批回归发现）：第二批 `.links` 行加 `lg:hidden` 后桌面右栏新建/上传入口断（toolChip 实际只有 crumb+srch）。修 = right-panel-tabs 装配 AddMenu 单源（03oa 两项）于 toolChip 行尾（05e:54 搜索行右端主色「＋」），NewItemSheet + upload picker 与移动面板 FAB 同构。

**验证**：probe-inspector-row-menus 23/23（S2/S5 三基础常驻 + G2 批5 放弃更改 3 项适配）；e2e 13 spec 全绿——file-browser.spec 三处适配（`.frow` 断言限定 `[data-panel-tab-body="files"]` 防 Git 面板变更行混入；「＋」入口改 toolChip AddMenu；深链就绪信号），git-diff.spec 两处（"All history"→"History"）。四门禁全绿 + CSS 硬闸 + tokens strict 过。存量在案：e2e pwa-installable 失败（manifest.short_name null，`git stash -u` 对照证实为存量基线，静态文件问题与本次无关）。

### 真机反馈修复·第五批：桌面三栏第一行同一水平线（2026-09-29，commit `73fd9fa`）

**用户反馈**：桌面左栏「项目」标题、右栏「检视」行理应与中栏 tab 同一高度，现在看起来偏低——为什么。

**根因（DOM 几何实锤）**：中栏 tabstrip 32px 顶格、文字中心 15.5~16；右栏 `.glabel2`「检视 · 只读」中心 15.8 **本已齐**（无需改，用户感知被左栏拉偏）；左栏「项目」ghead 中心 **30**——`.side` padding-top 8 + 首行 ghead margin-top 8 + 28px 容器式热区行高（plus 按钮可访问性增强，原型 .plus 仅 18px 字形）三层叠加。

**修法**（拍板「三栏第一行同一水平线」——原型三行本就不齐 25/16/18.5，原型自身粗糙处，用户对齐要求优先）：① `.side` padding `8px 10px` → `2px 10px 8px`（顶 2 + 首行行高 28/2 = 中心 16；`.side` 唯一消费点 = 桌面侧栏零外溢）；② 首行 ghead「项目」`mt-0` utility 覆写单源 margin-top 8（utilities > components 层序，v2-primitives 注释明示）。

**验证**：新探针 `probe-desktop-tri-column-firstline.mjs`（入库，mock session 触发 tabstrip）：F0-F5 全 PASS——tabstrip 32px 顶格 + 三行中心 side 16 / tab 15.5 / inspector 15.8 互差 ≤1px；m9-b 19/0、m9-d 64/0、desktop-instance-info ALL PASS、inspector-row-menus ALL PASS、states 22/0、tokens strict 0 违例、CSS 硬闸（182791 字节）。

### 真机反馈修复·第五批②③：dsep→内容间距 + 历史态改版 05c（2026-09-29，commit `98183fe`）

**用户反馈**：① 左栏第一个分割线距离会话实质内容仍然离谱地大；② 会话历史沿用旧方案（周/半月/全部分段），应改原型 05c 做法——展示最近的几个会话，更久的再依次展开。

**反馈①根因（探针实锤）**：dsep→实例行实现链比原型多两档——组头热区 28px 容器式（原型 `.dicon` 20px 即行高，+8）+ microlabel `mt-2.5` 10px（原型页私 AGENT 6px / TERMINAL 8px，+4/+2）。探查曾误判第三项「`.seg4.mini` 变体缺失」——实为早期批次已实现（v2-primitives :753）且已消费，作废。

**修法（反馈①）**：plus 容器式热区 `h-7→h-5`（项目组/实例组两处，20px = 原型 dicon 规格即组头行高，桌面指针语境够用）；`.side` padding-top 2→6（行高 28→20 后 6+20/2 = 中心 16，**第五批①第一行同线拍板不破**——tri-column 探针 F4 复测 side 16 vs tab 15.5）；microlabel AGENT `mt-1.5`（6px）/ TERMINAL `mt-2`（8px）。

**修法（反馈②历史态）**：退役 `HistoryRangeControl`（周/半月/全部）旧方案及其 4 个 i18n key；`HistoryList` 改 05c 做法——range 固定 `"all"` 一次拉全量（hook 参数保留，mobile-sheets 03n 仍用 "week"）+ 状态过滤 chips 全部/已结束（05c :42-45 形态：11.5px r12 胶囊 padding 3px 12px，on = 600 ink-1 bg-elevated3、ghost = ink-2 border sep-strong，on 态透明 border 防切换跳动；**复用 mobile-sheets 现成 key** `historyFilterAll/Closed`）+「最近 5 条 + 展开更早每次 +5」客户端折叠（用户拍板补充设计，原型无此控件；entries 服务端 `lastActivityAt` 倒序，slice 即「最近 N」；切过滤重置窗口）+ 尾注「再次点时钟返回活跃实例列表」（05c :50，microlabel 形态 shrink-0 常驻 HistoryList 之后）。`HistoryList` 根 `h-full→flex-1`：允许 wrapper 内兄弟尾注按内容占位。已结束 = `!hasActiveSession`（活跃中的历史 = 已 resume 为活跃实例，ActiveDot 同语义）；过滤空态显「无已结束会话」。

**验证**：tri-column 探针扩至 **14 断言**（F0-F5 三栏第一行回归 + 新 H1-H8：chips 两枚/折叠 5 行/展开更早/展开全显/尾注/seg4→组头 8px/切过滤重置窗口/已结束展开）ALL PASS——探针 locale 需 `locale: "zh-CN"`（resolveLang 走 navigator.language，默认 en 会让中文断言全挂）；五探针回归全绿；四门禁 + tokens strict + CSS 硬闸（182978 字节）。

### 真机反馈修复·第五批④：历史行字号对齐（2026-09-29，commit `4c7ab9e`）

**用户反馈**：历史列表样式不符原型，字体偏大。

**根因**：历史行走通用 `ListRow`，title 无字号类继承全局 16px、subtitle `text-xs` 12px；原型 `.srow2.inst` 侧栏行规格 = **13px + meta 10.5px**（05c 历史行即 `.srow2 inst` 形态）。同栏实例试点行走 `srow2 inst` 单源类已是 13px，唯历史行偏大，同栏对比强烈。

**修法**：`ListRow` 单源加 `size?: "sm"` 侧栏行档（行根 `text-[13px]` 由 title 继承 + subtitle 10.5px；默认档与其余 11 个消费方零变化），`HistorySessionNode` 传 `size="sm"`。后续文件树/git 等面板行如需侧栏档按需跟进。

**验证**：tri-column 探针扩至 **15 断言**（新增 H9 历史行 title 13px / subtitle 10.5px computed 实锤）ALL PASS；m9-b 19/0；web typecheck/test（674）/format/lint 全过。

### 真机反馈修复·第五批⑤：移动历史查询窗口对齐桌面（2026-09-30，commit `dd49a01`）

**用户反馈**：iPhone 端历史数量远少于桌面端。

**根因**：`MobileSessionHistorySheet` 调 `useHistorySessions(projectName, "week", open)`——同一 hook 同一 API，桌面第五批②改 "all"（全量 + 客户端折叠）时移动端仍锁 "week"；服务端 range 按**文件 mtime 窗口**滤除更早条目（agent-history / omp-history 同语义），iPhone 只显近 7 天。移动行字号无问题（`.hrow` 14px/11px 本就 03n 原文 1:1，与桌面 `srow2.inst` 13px 是各自容器的正常分档）。

**修法**：移动 sheet range `"week"` → `"all"`（多端同构 = 同一数据管道同一窗口；`listAgentHistory` 有 mtime+size 缓存，无新增性能负担）。03n sheet 保持全量平铺（模态列表原生滚动，折叠是桌面 05c 语境的拍板补充，移动不加）。

**验证**：m5-sheets（03n sheet 主探针）54/54；web typecheck/test（674）、CSS 硬闸全过。

### 真机反馈修复·第五批⑥：移动历史补「展开更早」折叠（2026-09-30，commit `1652a22`）

**用户反馈**：桌面历史有依次加载更多，iPhone 没有。

**根因**：折叠展开（第五批②拍板「展示最近的几个会话，更久的再依次展开」）只在桌面 HistoryList 实现，移动 sheet 全量平铺——行为没有按多端同构收敛到共享层。

**修法**：抽 `useHistoryRecentWindow` 共享 hook（窗口 5 / 步进 5 / 切过滤重置，行为单份），`HistoryList` 与 `MobileSessionHistorySheet` 共同消费；移动展开按钮 = 03n `.fc` 同数值胶囊（12px r15 p 5px 14px ghost）但 utility 拼写**不挂 `.fc`**（该类语义专属 filters chips，探针按 `.fc` 计数三态）。

**验证**：m5-sheets 扩至 **56 断言**（mock 扩 7 条：折叠 5 / 已结束重置 5 / 展开全显 7）56/56；tri-column 15/15（HistoryList hook 重构无回归）；web typecheck/test/format/lint、CSS 硬闸全过。

### 第五批②⑥ reviewer 双审（2026-09-30，修复 commit `bd7aedc`）

第五批②③④⑤⑥四 commit（`98183fe`/`4c7ab9e`/`dd49a01`/`1652a22`）经 code-reviewer + design-reviewer 并行审查，均无 P0。**当场修**（`bd7aedc`）：

**code-reviewer（P1×1 + P2 采纳×5）**
- P1 切项目历史 stale：`historyOpen` 跨项目保留 + `keepPreviousData` → 新项目组头下显示旧项目条目、旧 sessionId 可误操作。修 = `<HistoryList key={sideProjectName}>` 切项目重挂（filter/折叠窗口随组件 state 重建）。
- P2 折叠窗口 resetKey 化：`useHistoryRecentWindow(resetKey)` render 期 adjust（React 官方模式），替代「调用方 onClick 手动配对 resetWindow」；移动 sheet 传 `open ? filter : "gate:closed"`——关闭即重置、重开全新窗口（sheet 常驻挂载不卸载，防残留大窗口跨开合；`gate:closed` 刻意避开 filter 值域防恒等不触发）。
- P2 `useHistorySessions` 默认 range `"week"`→`"all"`（dd49a01 根因的默认值陷阱根治，防下一个消费方踩坑）。
- P2 `HistoryList` showLabel 死分支退役（唯一消费方传 false；中栏 history tab 消费方已不存在）+ chips 行提取骨架期共用（防数据到达 CLS 跳动）。
- P2 历史 key 兜底 `entryNativeId || title || firstMessage`（防损坏数据双空串 key 冲突）。
- P2 rows memo：**不做**（低收益，避免 useMemo 引用不稳定反模式）。

**design-reviewer（P1×2 + P2 采纳×3）**
- P1 px 任意值字号 → tokens utility（验收清单 rem 化 + 铁律 9 Dynamic Type）：`text-[13px]`→`text-footnote`、`text-[10.5px]`→`text-micro`、`text-[12px]`→`text-caption`；**11.5px 是字阶外 05c 页私档 → 回填 tokens.json 新增 `chip` 档**（0.71875rem）+ index.css 物化。每档自带 line-height 1.4（原 preflight 1.5 回落一并修正对齐 .srow2 单源）。fontSize 值零变化（tri-column H9 13px/10.5px 复测通过）。
- P1 组头时钟/plus 20px 热区无触屏扩区：iPad 横屏（≥1024 pointer coarse）走桌面 WorkbenchSide，低于 WCAG 2.5.8 24px 下限——frontend-notes §7「指针能力与视口宽度正交」正交铁律回归（第五批①收热区时未覆盖 iPad 路径）。修 = `touch:` variant 伪元素扩区 `touch:relative touch:after:-inset-1`（20→28px 热区，回到第四批前可用性档；**不撑行高**，「第一行同线」拍板不回退；桌面 hover-capable 零变化；Chromium 模拟不了 pointer media，iPad 真机项交用户）。
- P2 移动「展开更早」挂 `fc ghost` 回归组件单源（utility 拼写退役）；探针 filters 计数改 `.msheet .filters .fc` 限定。
- P2 桌面「无已结束会话」空态色 ink-3→ink-2（浅色 #C7C7CC 对比 1.6:1 过低，与移动空态统一）。
- P2 排序口径两端单份：`useHistorySessions` 出口 useMemo 统一 lastActivityAt 倒序（服务端顺序不构成契约；移动删客户端 sort，桌面「slice 即最近 N」前提不再依赖服务端顺序）。

**记档滚动（design P2×5，不动已验收形态）**：
1. chips 行纵向多一档——实现 ghead mb 8 + pt-2 = 16px vs 05c 原文 `margin:0 2px 8px` 上 0 下 8，历史态比原型节奏松 8px（真机已验收，收敛需用户发起）。
2. chips 左缘三值不齐——实现 14px（side 10 + px-1）vs 原型 12px vs 段内 seg4 渲染 18px（wrapper px-2 覆写基类 14）；注释「与 seg4 基类 14 同口径」引的是基类值非渲染值。
3. 「展开更早」外框两端不一——桌面 py-2（8/8）vs 移动 pb-2 pt-1（4/8）；同款行为控件宜同框间距。
4. 尾注复用 microlabel 带出 letter-spacing 0.3px（05c :50 是裸样式无字距；en 文案可感知，zh 弱）——可接受则注记页私豁免。
5. 浅色主题 chips on 态辨识弱（bg-elevated3 #E9E9EB vs bg-sidebar #F2F2F4 近融合，选中仅靠 600 字重）——token 两态取值正确、忠实原型，收紧属设计包层改动。

**审查确认无问题项**：双主题 token 语义两态全成立（diff 内零裸 HEX/裸色阶）、microlabel mt 页私值全对齐（AGENT 6px/TERMINAL 8px）、chips 形态本体与 05c :43-45 全等、ListRow size="sm" 对其余 11 消费方零影响、chips role=group + aria-pressed 语义在位、多端同构方向正确（hook 行为单份 + 铁律 3 容器分流成立）。

**验证**：全仓 typecheck + 865/9/674 单测 + 四门禁 + tokens strict 0 违例 + CSS 硬闸（183387 字节）+ tri-column 15/15 + m5-sheets 56/56。

### 真机反馈修复·第六批：md/html 文件预览优先（2026-09-30，commit `60dc9e3`）

**用户反馈**：「可以看预览的，优先展示预览效果；点击编辑后布局排版之类的也理应看起来风格一致，然而目前并没有。」

**根因**：`MobileL3FilePreview`（移动 L3 文件详情 **与** 检视面板 file 标签 `PanelFileTabBody` 共同消费的双端单源）对 md/html 强制 `initialRenderMode: "source"`——该取值来自「L3 无 render toggle，查看/编辑都是源码形态」的旧假设。而 `useFileEditor` 的默认值是 `defaultRenderMode()`（md/html/htm → render），桌面 `FilePreviewPanel` 消费该默认。结果：**同一份 md 在桌面右栏（含移动检视面板 file 标签）看是渲染排版，在移动 L3 看是源码**——同一能力两端形态分叉，违反「多端同构」。

**修法**（渲染能力复用单源，不新增渲染器）：

1. **默认渲染态**：删 `initialRenderMode: "source"`，回落 hook 默认 `"render"`。非 md/html 时 `showRenderToggle === false`，恒源码形态，本项零影响。
2. **meta 行补 toggle**：`showRenderToggle` 为真时，meta 左侧渲染 source/render 分段（与桌面 `FilePreviewPanel` header 同款形态：seg 容器 `rounded-lg border border-neutral-line/60 bg-surface-inset/60 p-0.5` + 两枚 `h-7 px-2.5 text-xs font-semibold` 按钮、on 态 `bg-primary/10 text-primary`）；非 md/html 仍是「行数 · 时间」span（行数在渲染态无意义，改由 toggle 占位；源码态行号本就自明）。
3. **渲染主体走 `PreviewBody` 单源**：`isRenderView = showRenderToggle && renderMode === "render"` 时用 `PreviewBody`（md → `MarkdownString`；html → `sandbox=""` iframe + 本地资源内联），`onEditChange` 不传 = 只读——与检视面板/中栏 file tab 同一渲染器，渲染实现单份。源码态保持 `CodeWithLineNumbers` 行号形态（唯一消费点即此处，未删）。
4. **编辑流转（预览优先闭环）**：点「编辑」= `onRenderModeChange("source")` + `setEditing(true)`（md/html render 态 `canEdit` gate 恒 false，保存会被 hook 拦，故进编辑前必须先切 source——gate 语义零改动）；「完成」两分支（clean / dirty 丢弃确认后）都 `onRenderModeChange("render")`——「完成」= 结束一次编辑动作、回到默认阅读形态，要看源码再点 toggle。
5. **根容器 overflow**：`isRenderView` 亦走 `overflow-hidden`（渲染内容自滚：MarkdownString 容器 `overflow-auto` / iframe 内文档滚动），meta 行常驻；源码态保持 `overflow-y-auto`。

**验证**：`probe-v2-m4-tools-l3` Part 5 扩断言链 6 项——md 打开即渲染态（h1 默认渲染）/ meta toggle「渲染」on 态 / 渲染态无行号源码（`.code .ln` 计数 0）/ toggle 源码 → 行号形态 / 编辑态 CodeEditor 在场 / 完成 → 回渲染态；**70/70 绿**（mock README 升为 markdown 语法以便 h1 渲染断言）。回归 `probe-file-save-scroll`（doc.md 编辑保存路径全过）、`probe-files-html-img-inline`（html 内联 + iframe 渲染全过）。四门禁 + tokens strict 0 违例 + CSS 硬闸（183387 字节）全绿。

**探针陷阱（本次踩到，已入注释）**：`.meta .diff` 是「编辑 + 查看 diff ›」两按钮的容器，`locator(..., { hasText: "编辑" }).click()` 落容器中心会误触「查看 diff」→ panelDiff 覆盖层打开、预览让位、`.cm-editor` 不在场（表现为后续断言 30s 超时）。按钮交互一律 `getByRole("button", { name })` 精确到按钮本体。

**自审补遗（commit `d807ccb`）**：design/code 双 reviewer 均因 API 故障早退，人工完成审查。发现真缺陷一处——`useFileEditor` 的 `renderMode` 是 useState 不随 `path` 重置，「换文件回默认渲染态」此前由桌面 `FilesPanel` 调用方 effect 补丁承担（file-browser.tsx :1131），`MobileL3FilePreview` 漏配：`renderPanelL3Body` 的 file 分支是**单实例复用**（无 key，同位置同类型），a.md 点「源码」→ 切 b.md 直接以源码态打开。旧实现 L3 恒 source 时残留无害；`60dc9e3` 改默认 render + toggle 后成为用户可见缺陷，恰是本批诉求的反面。修法**收敛 hook 单源**（多端同构铁律）：`defaultRenderMode` 下沉 use-file-editor.ts，hook 既有 path effect（清 editContent/savedFlash）加 `setRenderMode(default)`（basename 从 path 立即可得，不等 preview 返回防首帧沿用旧判定）；FilesPanel 调用方补丁退役（树模式 `enablePreview=false` 时 selectedFilePath 恒 undefined，新旧等价）；`initialRenderMode` 死参数退役；新增 `use-file-editor.test.tsx` 三个契约测试守回归。e2e file-browser 2/2、m4 70/70、file-save-scroll、files-html-img-inline 全绿。design 侧自查结论：meta toggle 与桌面 `FilePreviewPanel` header **逐字一致**（seg 容器 + 两枚按钮同 token 同字号同 on 态），`h-7` 28px 满足 WCAG 2.5.8，token 全语义无散写，双主题自动成立。

### 真机反馈修复·第七批：html 渲染支持 iframe 嵌套本地 html/svg（2026-09-30，commit `b62d9d2`）

**用户反馈**（第六批真机复验）：md 渲染没问题；html 渲染有问题——需要支持 iframe 嵌套另一个本地 html/svg。

**根因**：`PreviewBody` 的 `inlineLocalAssets` 只内联两类相对引用——`<link rel=stylesheet>` → `<style>`、`<img src>` → dataUrl。`<iframe src="chart.html">` / `<iframe src="diagram.svg">` 完全不在处理范围，而 srcDoc 渲染的文档**没有项目目录 base URL**，相对 src 解析不出 → 嵌套 frame 空白。与 2026-09-10 修 img 那次是同一根因（frontend-notes 家族：srcDoc 无 base URL），只是漏了 iframe 这一类标签。

**修法**（递归内联，sandbox 语义不变）：

1. **新增 `IFRAME_TAG_RE`**：`/<iframe\b[^>]*?\ssrc=["']([^"']+)["'][^>]*>/gi`（与 IMG_TAG_RE 同款 `\s` 防 data-src 误命中）。
2. **内联管道抽成可递归导出函数 `inlineLocalHtmlAssets(html, {dir, projectName, fetchPreview, depth})`**：`fetch` 细节由调用方注入（`PreviewBody` 传真 `fetch` 封装，单测传 fake），使递归可测、无网络依赖。三类 job 并行：stylesheet/img 行为不变，**新增 iframe job**——指向本地 html → 递归内联该文档自身资源后整体转 `srcdoc`（`&`/`"` 转义进属性值，见 `rewriteIframeSrcdoc`）；指向本地 svg 等图片 → src 换 dataUrl（`rewriteSrcAttr` 共用，原 `rewriteImgSrc` 改为它的别名）。
3. **相对基准修正**：嵌套文档内的相对引用按**嵌套文档自身所在目录**解析（不是外层文档目录），深度优先递归。
4. **深度上限 `INLINE_NESTED_HTML_MAX_DEPTH = 2`**：防自引用/环状 iframe 无限递归；超限的嵌套文档原样进 srcdoc（不内联、不阻塞）。
5. **失败容错**：单个引用 fetch 404/抛错保持原样，不阻塞其余引用；整体管道抛错则 `PreviewBody` 退回原文渲染。
6. **sandbox 语义不变**：外层 iframe 仍 `sandbox=""`；srcdoc 嵌套 frame 继承同一沙箱语义（同样不执行脚本、不发请求），与 v1.4 批7「纯静态预览」口径一致。

**验证**：单测 `file-browser.test.ts` 扩 6 项（嵌套 html 递归内联 + 相对基准按嵌套目录 + svg iframe 换 dataUrl + srcdoc 转义 + 深度上限不递归 + fetch 失败不阻塞），13→19 全绿；探针 `probe-files-html-img-inline` 扩 1b（srcDoc 层 5 项：src→srcdoc/内容内联/嵌套 css 按 nested/ 解析/外链 iframe 不误伤/svg iframe 换 dataUrl）+ 1c（嵌套 frame 内真实渲染 2 项：`#nested-marker` 可见 + 内层 svg 40×20 非零尺寸，修复前空白）——**全 PASS**。回归 `probe-v2-m4-tools-l3` 70/70、e2e file-browser 2/2 全绿；CSS 硬闸 183387 字节 + content-type text/css。

### 真机反馈修复·第八批：嵌套原型页 data-icon 图标静态水合（2026-09-30，commit `3665264`）

**用户反馈**（第七批真机复验）：html 嵌套 html 过程中，有些使用图标的地方看不到了。

**根因**：`docs/design` 原型页的图标走 v1.4 图标管线**运行时水合**——`assets/icons.js`（`build-icons.mjs` 生成物）首语句注册 `window.ICONS = {SF名→lucide path body}` 注册表 + 页面里 `<i data-icon="x"></i>`/`<span data-icon>` 空占位，icons.js 的 hydrate 在 DOMContentLoaded 后把占位替换成 svg。第七批内联后的嵌套文档在 `sandbox=""` 下**禁脚本**（v1.4 批7「纯静态预览」口径），水合永不发生 → 占位空白。`svg[data-symbol]` 自带手绘 path 兜底能显示，`data-icon` 占位不能——「有些图标看不到」精确对应。

**修法**（静态等效水合，进第七批的 `inlineLocalHtmlAssets` 管道）：

1. **`iconScriptJobs`**：文档引用的本地 `<script src>`（`ICON_SCRIPT_TAG_RE`，空标签体形态）→ fetch → 识别 `window.ICONS` 注册表 → 把文档内占位静态替换成 svg。认不得格式的脚本跳过、失败保持原样不阻塞。
2. **`parseWindowIcons`**：定位 `window.ICONS = {` 赋值语句（**允许头注释等前置内容**——真实生成物带 `/*! … */` 生成头，首版按 `startsWith` 判定被它挡住全部静默跳过，单测无注释输入故绿、真实链路失效，探针 mock 已复刻头注释形态锁死）；括号配对（字符串/转义感知）提取首个平衡对象后 `JSON.parse`——不 eval。纯读取型引用（`window.ICONS[x]` 无 `= {`）不命中。
3. **`rewriteIconPlaceholder` / `hydrateDataIconPlaceholders`**：复刻 icons.js 的 apply 规则——`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="stroke-width:2" [class继承] aria-hidden="true">body</svg>`；未知名保持原样不猜；`svg[data-symbol]` 手绘兜底不动。
4. **script 标签本身保留**（禁脚本下不执行、无害），只消费其注册表。

**验证**：真实链路诊断（`/tmp` 一次性脚本 + 真实 preview API + 真实 `docs/design/index.html` 78 嵌套页）：78 页真实占位残留 **0**（剥 `<style>` 后复核——CSS 注释文字里的 `<i data-icon="search">` 示例曾被诊断正则误报为残留）、静态水合 svg 80。单测 24（+头注释前缀提取/读取型引用不命中/class 继承）；探针 `probe-files-html-img-inline` 扩 1d 段 4 断言（mock icons.js 带头注释形态）+ 1c 水合 svg 真实渲染非零尺寸（284×284）——全 PASS；web 单测 688 全绿；CSS 硬闸 183387 字节。

**file tab 状态澄清**（用户 2026-09-30 拍板）：桌面中栏 file tab **后续规划要恢复发挥作用**，当前暂时保持没有——不是弃案，是暂缓。

### 真机反馈修复·第九批：全局文件预览返回目标（2026-09-30，commit `9bbf351`）

**用户反馈**：在全局文件中预览文件后，返回的却不是全局文件。

**根因**：`MobileFileFocus`（/files/file/$ 移动端浮窗预览）的 back/✕ 写死 `navigate({ to: "/projects/$key" })` 落项目工作台——附近注释声称「返回回全局文件树（/files）」但实现从未跟上（removeUnusedSrcArea 拆分后遗留）。

**修法**：纳入返回类导航统一范式（workbench-model.ts `useWorkbenchBack`）——pop 优先（有来路 `history.back()` 回来源：/files push 进来→回 /files；项目工作台跨项目打开→回该项目，栈不留死记录），深链直达无来路兜底 push /files。cwd 记忆（`workbenchMobileGlobalFilesPathAtom`）不经返回动作，返回后停在原目录。

**验证**：新探针 `probe-files-global-back`（移动 390×844，mock preview API + 真实登录加载构建产物）3 场景 6 断言全 PASS——①主路径 pop 回 /files 且列表在场；②cwd 记忆保持（返回后仍在 proj1 目录内）；③深链直达返回兜底 /files。

### 真机反馈修复·第十批：桌面右栏折叠唤出钮视觉不可见（2026-09-30，commit `5e06b5d`）

**用户反馈**（Mac 桌面浏览器）：右栏折叠后，展开按钮不见了（完全没有按钮）。

**诊断（排除法定性）**：装配点/panelOpen 写点/lg 断点（1024）均正确，headless DOM 全场景（4 视口 × 循环开合 × reload × 切 scope）RailButton 恒在场且 `elementFromPoint` 命中自身——不是 DOM 缺失，是**视觉不可发现性**：RailButton 原样式 `bg-surface-raised/60` 半透明白 + `text-on-surface-muted` 浅灰图标，浅色主题下与中栏背景几乎同色（getComputedStyle：按钮底 oklab(1.0/0.6) 白、图标 rgb(142,142,147) 14×14）≈ 人眼不可见。headless `visible=true` 只证 DOM 非隐藏，不证人眼可辨。

**修法**：实底 + 描边 + 实色图标 + 增大热区——`h-20 w-6 border-neutral-line bg-surface-raised text-on-surface-soft shadow-sm`（旧 `h-16 w-5 bg-surface-raised/60 text-on-surface-muted backdrop-blur`）。

**验证**：getComputedStyle 两主题复测——dark 底 rgb(28,28,30)/图标 rgb(242,242,247)、light 底 rgb(255,255,255)/图标 rgb(28,28,30)，24×80 热区；tokens 机检 0 违例；CSS 硬闸过；probe-v2-m9-multi-device 13 断言全绿（Part 2/3 均真实点击 RailButton 唤出后断言三列几何）。待真机复验。

**顺带发现（独立 bug，未处理待拍板）**：`workbench-shell.tsx` 中 `<ColumnResizeGutter/>` 的渲染条件 `rightOpen ? null : gutter` 位于仅 `rightPanel` 非空才渲染的 aside 内，而 rightPanel 非空 ⟹ panelOpen=true ⟹ rightOpen=true → gutter 恒不渲染 = 右栏宽度拖拽疑似失效（与「右栏栏宽 352 vs 320」欠账可能同源）。

### 真机反馈修复·第十一批：global 会话页右栏整体蒸发（2026-10-01，commit `e9e9c87`）

**用户反馈**（第十批视觉修复后的复盘澄清）：左栏从项目切到「全部」，右栏直接消失；折叠按钮出来后能看到（颜色修复已生效，非视觉问题）；消失的不只是面板，唤出钮也没了；不刷新页面、切回「项目」就回来；URL 没变。

**根因**：global 会话页（/projects）的 `rightPanelCollapsible = scope.kind === "project"` gate 把右栏 aside + RailButton 一起蒸发——项目页右栏展开态落到该页右栏直接消失。三个误导因素叠加让定位走了弯路：①左栏 seg4 在 global 页**恒「全部」高亮**（用户归因「切到全部导致」——实际 seg4 是 side 内视图态，探针矩阵实锤与右栏零因果）；②URL `/projects/xxx` vs `/projects` 仅差尾段，用户感知「没变」；③恢复动作（点 seg4「项目」段）恰好是「切回项目」的直觉表述。逐条吻合的复现 = 直达 /projects（浏览器历史/地址栏可达，代码无 UI 入口）。

**修法**（右栏全 scope 连续可唤出）：

1. `rightPanel = panelOpen ? <RightPanelTabs/> : null`（去 scope gate）；装配 `rightPanelCollapsible={!desktopMainPage}`（mainPage 整页态中栏吃满是 09m/10m 既定 IA，保留蒸发）；mount 投影 effect 去 scope gate（开合记忆全 scope 连续）。
2. RightPanelTabs 的 `!projectKey` 空态分支（「检视 · 只读」+「暂无内容」+ 折叠钮）本就是为 global 备的，首次被走到。
3. 配套 `usePanelToolChip` 的 gitDiffForChip query 加 `enabled: projectKey !== ""` gate——global 空态也装配该 hook，空 projectKey 会打出 `/api/projects//git` 脏请求。

**验证**：probe-v2-m9-multi-device 新 Part 4 六断言（global 折叠态唤出钮在场/唤出空态 352px/panelOpen 内存单例跨 scope 连续不蒸发/seg4「项目」段导航回项目右栏仍展开）全绿（19 pass）；probe-v2-m9-d 64 pass 回归；web 688 单测 + typecheck 绿；CSS 硬闸过。**待真机复验**。

**遗留**：global 右栏目前是空态占位，真内容（rootBrowse 全局文件树下沉到 FilesToolPanel）为存量欠账，后续批次。

### 真机反馈修复·第十二批：global 右栏跟随当前项目 + 右栏宽度拖拽修复（2026-10-01，commit `386533a`）

第十一批复验通过后用户对两个待拍板项给出决定，本批落地：

1. **global 右栏内容**（拍板「global 实际也有一个当前项目，一个项目都没有才完全空态」）：`rightPanelProjectKey = scope.kind === "project" ? scope.key : (lastProject || projectNames[0] || null)`——lastProject 记忆优先（与 side mainPage 同源 D4），无记忆回退项目列表首个，null（真无项目）才落 RightPanelTabs 空态分支。独立 `rightCtx` 不动 ctx（ctx 供 useCreateSession 等，global 下 create 不带 projectKey 的语义不变）。第十一批遗留的「空态占位等 rootBrowse 下沉」被此拍板覆盖：有项目的环境 global 右栏直接显示当前项目 files 标签。
2. **右栏宽度拖拽**（拍板「右栏宽度确实要有拖拽效果」）：ColumnResizeGutter 是死代码——原 `{rightOpen ? null : <ColumnResizeGutter/>}` 位于仅 rightPanel 非空才渲染的 aside 内，而 rightPanel 非空 ⟹ panelOpen=true ⟹ rightOpen=true → **恒 null，拖拽从未生效**。改 aside 在即渲染（收起态整个 aside 不渲染、唤出走 RailButton，gutter 随之消失是自然行为）。

**验证**：probe-v2-m9-multi-device 27 pass（Part 4 ② 断言改为非空态 `[data-desktop-inspector]` 在场；新增 Part 5 七断言：真空态 projectNames=[] mock → global 唤出「暂无内容」+ `data-desktop-inspector` 不在 + 零 `/api/projects/` 维度脏请求；project 页 gutter 向左拖 60px → 352→412 精确增宽）。m9-d 64 pass 回归；typecheck + 865/9/688 单测绿；CSS 硬闸 + tokens 机检过。**待真机复验**。

### reviewer 补审修复批（M13a–d，2026-10-01，commits `069704c`/`07572a4`/`5b3d527`/`b169aaa`）

API 恢复后对第六~十二批 8 个代码 commit（`60dc9e3`~`386533a`）补审：code-reviewer + design-reviewer 双审产出 **P1 五条 + P2 九条（P0 零）**，用户拍板「可以全修，用多个里程碑来修复」，四里程碑收口：

- **M13a 内联管道正确性**（`069704c`，C-P1-1/2/3 + C-P2-4/7）：①`$` 特殊序列——inlineLocalHtmlAssets 四类 job 的替换串全部改函数形式 `html.replace(tag, () => …)`（字符串替换串里的 `$&`/`` $` ``/`$'` 会被 String.replace 展开，html 内容含该序列即产损坏输出）；②剥 style/script 段再水合——STYLE_SCRIPT_SEGMENT_RE 把 `<style|script>` 段摘出，占位用私有使用区字符包裹序号（不用 NUL——lint no-control-regex 拦截），回填按序号还原，杜绝 data-icon 水合全文误匹配（第八批 33 处「残留」实为 CSS 注释内容误命中），iconScript 收集改从 segments 提取；③escapeSrcdoc 补 `<`（`& → &amp;` 最先、`<`、`"`；`>` 在双引号属性值内合法不转义）；④PreviewBody memo（inlinedRef 同 preview 引用复用 promise，source↔render 切换不重跑管道）+ fetchOnce per-call 去重（同树嵌套递归透传共享缓存，跨调用不缓存）。file-browser.test.ts 增 5 断言（`$&` 不展开/剥段不误伤/去重 calls===2/回填无损）。
- **M13b toggle 单源 + 03q3 对齐**（`07572a4`，D-P1-1/2 + D-P2-5/7 + C-P2-5/6）：抽 `RenderModeToggle` 共享组件（此前桌面/移动逐字复制非单源），按 03q3:13-15,51 `.mseg` 原型重写形态（24px 高 bg-elevated3 无描边轨、段 11.5px、on 态 `bg-segmented-thumb`+text-on-surface 600——`bg-primary/10` 绕开 token 退役、渲染段在前）；移动 meta 行元信息与 toggle 并存（渲染态行数无意义只留时间）；非 md/html 不写脏 renderMode（finishEditing gate）；use-file-editor effect deps 收敛 `[path]`；toggle 按钮 touch:after 触屏扩热区。
- **M13c shell 杂项**（`5b3d527`，D-P2-3/4/6）：①RailButton 手写 ChevronLeft/Right 16 网格 SVG 退役 → build-icons.mjs 白名单加 chevron-left/right 重跑生成、`<LucideIcon>` 直接消费（图标单轨 Lucide，spec §10.3）；②RailButton touch:after 左右各 +8px 扩热区（w-6=24px 恰压 WCAG 2.5.8）；③ColumnResizeGutter 键盘可达——原 aria-hidden 纯 pointer → role="separator" + aria-valuenow/min/max + ←/→ ±1rem 步进（方向随 side 翻转）+ focus-visible 高亮，i18n 加 `workbench.resizeRightPanel`。
- **M13d back 语义核实**（`b169aaa`，C-P2-8）：质疑「`__TSR_index > 0` 只证栈里有前条不证是 /files」——逐场景核实（冷深链 index=0 走 fallback/站内 push 落点=真实来源/reload 与会话恢复保留 state 跨文档回 SPA 前条/裸 pushState `?? 0` 落安全侧）**判定安全**：「前条不保证是 backLabel 声称的层级」恰是 pop 优先（第九批拍板）的设计意图；出站不可能（只有 index=0 才穿出站，而它走 fallback）。行为零改动，注释从过强的「0 = 首条无来路」修正为准确语义。

**reviewer premise 核实推翻两条（修复时逐条对照源码验证）**：D-P2-3「shadow-sm 全站唯一组件阴影」不成立（ClaudeSessionDetailRoute 另有 3 处，且 RailButton 的 shadow-sm 是第十批可发现性修复 `5e06b5d` 刻意加的——保留）；C-P2-4 的「HTML5 parse error」机制描述不准确（`<` 在属性值内合法），但补转义无损照做。**教训**：reviewer 报告的「全站唯一」「违反 spec」类断言先 grep 全量核实再动手。

**验证汇总**：四批均过全门禁（1565 单测）+ CSS 硬闸 + tokens 机检；探针回归 m4 70 pass（toggle 断言跟随新标尺）、probe-files-html-img-inline PASS（解码链补 `&lt;`）、m9 27 pass、m9-d 64 pass。**待真机复验**（清单见 handoff）。

### 第十三批②：文件预览扩展名判定——白名单反转二进制黑名单（2026-10-01，commit `2e9eac8`）

**用户反馈**：源码文件并非都能查看&编辑，例如 `.mjs` 不能预览。

**根因**：`previewFile` 的 `isSupportedTextPath` 是**文本扩展名白名单**（26 项，`api/src/project-files.ts`）——`.mjs`/`.cjs`/`.sql`/`.ini`/`.htm` 等大量源码/配置扩展名不在列，直接落 `unsupported_type`（非内容问题，是判定方式问题：白名单永远追不全）。

**修法（判定方向反转）**：改 `binaryExtensions` 二进制黑名单初筛（46 项：图片/音视频/归档/字体/二进制文档/编译产物/数据库/`bun.lockb`）；**黑名单外（含未知扩展名与无扩展名的 Dockerfile/Makefile/LICENSE）皆按文本尝试**。安全性不减——黑名单只做初筛，既有**内容级双闸**兜底不变：UTF-8 strict 解码失败（`decodeText → undefined`）与含控制字符（`containsBinaryControlCharacters` → `binary_text`）拦真二进制，黑名单漏网文件不会以乱码漏出；`TEXT/IMAGE_PREVIEW_LIMIT_BYTES` 大小闸仍先行。**编辑链零改动**（`canEdit` 依赖 `preview.type === "text"`，预览解锁即编辑解锁）。`.env` 类配置文件本就可见（`FILE_LIST_BLOCKLIST` 只挡 `.git`），无安全回退。

**验证**：`project-files.test` 47 pass——新增黑名单反转语义断言（`.mjs`/`.sql` 文本预览、无扩展名 `Dockerfile` 放行、`.wasm` 假文本内容仍被初筛拦），既有 `.zip` unsupported / `binary.txt` binary_text / `large` too_large 边界全保持；全门禁 866+9+691 绿。**dev api 重启后真实 API 实证**：`scripts/build-icons.mjs` → `text`（5138 字节可编辑）；顺带实测（`bun --watch` 未热重载本次改动，按 runbook `respawn-pane -k` 重启 ar-dev:api 后生效——「watch 偶发不重启」坑复发一次）。**待真机复验**（清单见 handoff）。

**②续：文本预览大小闸放宽 256KiB → 2MiB**（同日用户拍板，用户问值、推荐后采纳）：项目内真实大文本（`playwright-report/index.html` 533KB / `tsbuildinfo` 361–439KB / `ar-dev` daemon.log 365KB / `bun.lock` 355KB / `redesign-v2.md` 285KB）全被 256KiB 挡在预览外，恰是排查高价值文件；2MiB = 4 倍余量，移动端 JSON gzip 传输秒级、CodeMirror 虚拟渲染查看无感，数量级与 IMAGE 预览（5MiB）一致；上限真正挡的是「10MB sourcemap 不该在手机看」那类，留 raw 下载。测试 `large.txt` 断言用常量生成自动跟随（47 pass）；dev api 重启实证上述五文件全部 `text`。

### 第十三批③：模型链路污染——CLI echo 显示串进 state.model（2026-10-01，同日修复）

**用户反馈（两症状同源）**：①「不知道什么时候起，开始出现模型问题」；②「桌面端显示的模型，两侧多出反引号」。

**根因链（JSONL + API 日志 + 进程 cmdline 三处一手数据互证）**：
1. CLI 对 in-process set_model 的回应是 breadcrumb user message `<local-command-stdout>Set model to <display></local-command-stdout>`，其中 `<display>` 是 modelDisplayString 输出的**人类可读显示串**，实测形状为 markdown code span：反引号包裹的 `opus[1m] (claude-opus-4-8[1m])`（+ 尾部 (resolved) 注解）。
2. `extractModelFromStdoutLine`（`api/src/claude-runtime.ts`）旧解析按「token before ( 」假设设计——对 code span 形状失配：正则剥掉括号注解后尾部反引号收不了尾、回溯成整串进 group 1 → 脏值（反引号+alias+注解）进 state.model。
3. **放大器 = resume**：API 重启 ensureRunning 用 `--resume --model ${state.model}` 重拉 CLI（cmdline 实证 `--model `反引号opus[1m] (claude-opus-4-8[1m])`反引号`）→ CLI 拿显示串当模型名请求 → 网关 422 model not found（症状①「模型问题」）；init 帧 echo 脏值 → UI 原样显示（症状②反引号）。
4. 与用户怀疑的「agent 恢复动到逻辑」方向部分吻合（resume 是放大器），但 git 历史核实**近期无模型链路代码改动**——根因是 CLI echo 格式与解析假设失配，非代码回归。

**修法（同日收口）**：新增导出纯函数 `sanitizePersistedModel`（`api/src/claude-runtime.ts`）：① 剥 markdown code span 反引号 → ② 剥尾部 (resolved) 注解（保持旧语义）→ ③ 白名单闸 `[A-Za-z0-9._-]+([1m])?`——帮助文案/ANSI 样式文本/剥不出合法 token 的长尾文案一律拒绝返回 undefined，调用方跳过更新（宁可保守不让显示串进链路）。两处接入：`extractModelFromStdoutLine` 出口归一（防新增污染）；`spawnClaudeDirect` 的 `--model` 传参闸（**拦存量脏值**——恢复语义后传 `opus[1m]`，不丢 opusplan plan-mode 语义与 [1m] 后缀；恢复失败则不传 --model 回落 CLI 默认）。

**验证**：`claude-runtime.test` 50 pass（新增 7 条：code span 剥离含/不含 [1m]、`(id)` 与长尾文案拒绝、alias/具体 ID/[1m] 恒等、legacy `(resolved)` 形状兼容保持）；api 全量 872 pass；dev api 已按 runbook respawn，脏 CLI 进程已随 API 重启消亡（`claude --output-format` 进程零残留）。**待真机复验**：重开问题会话 → 模型 pill 无反引号、发消息不再 422。

### 第十三批④：编辑态画布对齐 03q2——bg-codeblock 全幅去「输入框」壳（2026-10-02，commit `0663ddd`）

**用户反馈**：CodeMirror 编辑模式的背景色/圆角矩形/边距与预览态差异过大，查看↔编辑切换观感跳变。

**对照标尺实锤偏离**：03q2 编辑态（`.ed`）与 03q 查看态（`.code`，`v2-primitives.css` 已实现的查看画布）是**同一规格**——`bg-codeblock` 全幅、无圆角无边框、`padding: 10px 0`。跳变真相 = 设计里两端都是全幅画布，唯独实现的编辑态被做成了嵌套「输入框」壳（`rounded-lg + border + surface-inset/80 + 外层 p-3`）。

**修法（四处，全在既有单源上）**：CodeEditor 根壳 → `bg-codeblock` 全幅（去 rounded/border/surface-inset），THEME 补 `.cm-content` padding `0 16px`（原型左缘留白由 34px 行号列充当，minimalSetup 无行号，以水平 padding 等效、对齐查看态 `.tx` padding-right）；PreviewBody source 分支 + mobile-l3 编辑分支外层 `p-3` → `py-2.5`（10px 0）；CodeEditorFallback 同步全幅——lazy 就位瞬间零跳变。**行号 diverge 保持**：03q2 原型有行号列（`.no` 34px），实现 minimalSetup 无行号（既有省体积取舍，非本次范围）。剩余色差（codeblock vs 页面底）= 03q2↔03q3 之间的设计预期切换。无关消费不动：markdown CodeBlock/工具条的 `surface-inset` 壳语义正确（内嵌卡 ≠ 全幅画布）。

**验证**：m4 探针 71 pass（新增画布硬数据断言：CodeEditor 根 `backgroundColor` 与 `--bg-codeblock` token 一致 + border 0 + radius 0）；CSS 硬闸过（`bg-codeblock` utility 首次消费、content-type text/css）；token 机检 strict 0 违例；e2e 无旧壳断言。**待真机复验**：任意文本文件 查看↔编辑 切换——画布形态（背景/边距/无框无角）不变，仅内容层变（等宽+着色），md/html 渲染↔源码同验。

**④续：排印/行号对齐 `.ed`——md 源码 toggle 与编辑同套**（同日第二轮反馈 `542686e`）：「md 的源码和编辑模式看起来不是同一套，边距问题仍在」。对照标尺：03q 查看态（`.code`）与 03q2 编辑态（`.ed`）原型**同规格**——11.5px/20px 等宽 + 行号列 + `padding: 10px 0`；查看态实现已对齐，上一轮只对了画布壳，编辑态排印仍偏离（0.875rem/1.6 + 无行号 + 顶格 16px）——字号行高与左缘（顶格 vs 行号列）就是「不是同一套」的观感来源。修法：CodeEditor THEME `fontSize: 11.5px` / `lineHeight: 20px`、extensions 加 `lineNumbers()`（@uiw re-export，零新增依赖）、行号色 `var(--ink-3)` 对齐原型 `.no`。移动「源码 toggle ↔ 编辑」与桌面（source 态本就同组件）现在同一套：同画布/同排印/同行号列/同边距。**剩余差异 = 语法着色**（编辑态有、查看态 `.code` 无——spec 既定「语法高亮随桌面编辑器收敛统一处理」+ 多端同构终局：查看态也收敛到 CodeEditor 只读、CodeWithLineNumbers 退役；因 CodeEditor lazy chunk 会引入查看态拉包/闪烁回退，另批做）。验证：m4 探针 72 pass（画布断言保持 + 新增排印/行号断言：fontSize 11.5px + lineHeight 20px + `.cm-lineNumbers` 在场）。

### 第十三批⑤：模型反引号存量根治——sanitize 全链路接入（2026-10-02，commit `6529c87`）

**用户复验反馈**：composer 模型 pill 两侧仍有反引号（13③ 修复后残留）。

**根因 = 存量**：13③ 只拦了解析出口（extractModelFromStdoutLine）与 CLI 传参（spawn --model）两个边界，未清洗**已持久化**的脏值——metadata.modelAlias 里整串存着 `` `opus[1m] (claude-opus-4-8[1m])` ``（实测 `/run/user/1000/agents-remote/sessions/agent_956fe157c8884411.json`），且 `model` 字段会被 system.init 覆盖成干净值、`modelAlias` 却无人再写；前端优先读 `modelAlias ?? model`（ClaudeSessionDetailRoute）→ 显示层直接透传脏值。

**三层修复（sanitize 单源下沉叶子模块 `api/src/model-id.ts`）**：
1. `parseMetadata` 读取归一：model/modelAlias 逐字段 sanitize——code span 剥出裸 alias（`opus[1m]`），剥不出 token 的抹掉字段让前端回落 model；与 claude2/acp provider 归一同一手法（内存层，不重写磁盘）。
2. 写边界闸：`setModel` / `setClaudeSessionId` / `createMetadata` 三条 model 入盘路径全部过闸——脏串宁可弃用也不落盘。
3. 前端显示层兜底：`resolveCurrentModelAlias`（`web/src/lib/model-labels.ts`）对 code span 显示串剥出 base 后命中 resolved key（开启 1m 时 key 本就是 `opus[1m]` 变体）或 value 才接受；形状闸外（`(id)` 帮助占位/文案尾巴）一律 undefined 触发 fallback——拦 relay 内存缓冲/历史 JSONL 里的存量脏帧。

**教训沉淀**：修数据污染类 bug，边界闸（parse/spawn）之外必须排查**存量数据**是否需要读取归一——前端有 fallback 字段（modelAlias ?? model）时，只修「以后不脏」不修「已经脏的」，用户复验必然复现。

**验证**：model-id 4 + session-registry 新 2 + model-labels 新 4 单测，受影响面 91 pass；真实脏文件经 sanitize 实证剥出 `opus[1m]`；dev api 已按 runbook respawn（parseMetadata 加载期归一即生效）。**待真机复验**：重开 22router 项目旧会话 → 模型 pill 显示 `Opus [1m]` 无反引号。真机复验通过（2026-10-02 用户确认「看起来没问题了」）。

### 第十三批⑥：composer 草稿持久化——未发送输入跨刷新/切会话保留（2026-10-02，commit `04478d5`）

**用户需求**：agent 输入框里输入的内容，只要没发送出去或者主动删除，就一直保留在输入框。

**单源 hook `web/src/lib/composer-draft.ts`**（三个 agent composer 全部 assistant-ui 同构，共用）：
1. **persist**：`useAuiState` 订阅 `ComposerState.text`，偏离基线即落 localStorage；「发送清空」（runtime 发送后自动 clear）与「手动删空」同为 text→""，落盘清档——两个语义由同一条数据流自然覆盖，无需额外状态。
2. **hydrate**：mount / key 变化时恢复该会话草稿。时序门闩（lastSavedRef）：persist 与 hydrate 两个 effect 同 commit 内按声明序执行——persist 先声明、基线未建跳过，mount 首帧不会抢在恢复前把空串写盘清掉已有草稿；hydrate 后基线记为 runtime 实际值，「恢复引发的 text 回显」与基线相等自然跳过。
3. **key 切换**（挂载槽位复用，如面板同槽换绑会话）：persist effect 先把 runtime 里的旧文本落回旧 key，hydrate effect 再无条件接管新 key——互不串档。
4. **key 命名** `composerDraft:<type>:<sessionId>`（claude:/pi:/acp: 前缀按 runtime 类型隔离）；localStorage 直读直写而非 atomWithLocalOnlyStorage——草稿值由 assistant-ui runtime 持有，React 层无需响应式读它，没有第二个读者。

**接入**：`ComposerWithInterrupt`（claude，内部组 key）+ `ComposerWithInterruptPi` / `ComposerWithInterruptAcp`（各新增 sessionId prop，调用方传入）。

**验证**：hook 单测 4 项（真实 AuiProvider + useExternalStoreRuntime 最小 adapter；**assistant-ui 的 aui state 投影走异步调度**——setText 后需 async flush/waitFor 断言，同步断言读不到回显）；浏览器探针 `probe-composer-draft` 5 项全绿（①输入落盘 ②reload 恢复 ③恢复后再改同步 ④清空清档 ⑤清空后 reload 保持空——**跨 reload 持久化是 jsdom remount mock 覆盖不了的**，探针补真浏览器证据）；composer-toolbar 回归 H1–H6 全 PASS；全仓 test 1586 pass 0 fail。

**待真机复验**（第 18 项）：任意会话输入框打字（不发送）→ 刷新 / 关 PWA 重开 → 草稿原样保留；发送后输入框空且重开不再恢复；手动删光同上。

### 重连增量回放：锚定 uuid delta 下发 + 新增 turn 淡入（2026-10-02，commit `d565ba4`）

**用户需求**：重连时大面积聊天内容刷新太重量级——很多时候仅几条消息变化，却走全量重放（rawMessages 清空 → skeleton 闪现 → 全部重渲染）。两部分优化：①数据结构层——客户端携带本地最后消息 id，服务端鉴别后只下发缺失部分；②体验层——减少重刷感。

**拍板**：①回退场景（锚找不到：API 重启 relay 重建 / compact 清缓冲 / live 缓冲 cap 截断）**维持 skeleton 现状**，不做旧内容保留；②范围 **claude 先行**——pi/acp 事件帧（open record）无稳定 uuid、锚不可靠，维持全量记档后续。

**全链路**：客户端锚 = cursorRef（最后一条带 uuid 消息，到达序 append 保证其严格是「最后已见行」）→ WS URL `?since=<uuid>`（encodeURIComponent，claudeStreamUrl 第三参）→ handleClaudeStreamUpgrade 解析（长度 ≤128 校验）→ ClaudeWebSocketData.replaySince → claudeRuntime.stream 第 4 参 → relay.addSubscriber opts `{ sinceUuid }` → locateReplayAnchor（**先倒序扫 liveLines 再 historyLines**——同 uuid 两处都有（compact 边界重叠）取 live 位置不重复下发；needle 字符集白名单 `/^[A-Za-z0-9_-]+$/` 防引号注入 + 命中后 topLevelUuidIs parse 确认**顶层** uuid，防子串命中更晚行的嵌套字段错锚）→ 命中 session_init 带 `replay:"delta"` 只发锚后行 / 未命中 `replay:"full"` 全量。**delta 下发矩阵**：锚在 history → history 后缀 + live 全部；锚在 live → 空 history batch + live 后缀；锚 = 最后行 → 两段空 batch。

**客户端 delta 分流（claude-adapter）**：session_init `replay==="delta" && cursorRef.current != null` → 不 resetSessionState、不置 isResumeRef、不注 batch_boundary divider；else 走原 full 路径。delta 模式 processBatch 过滤 `messageMapRef` 已有 uuid（防御服务端重复下发）；无 uuid 标量行重放幂等无需处理。**liveStart 修正**：delta 时 `liveStartRef = 断线前 raw 基线 + historyBatch.length`（replayCursorRef 同步累进——setRawMessages updater 延迟执行，同宏任务连续 batch 时 state.length 不可读，同步游标是唯一可靠读点）；不修正则 computeRunningCount 扫到补齐段悬空 assistant → 假 running。

**淡入动效（animate-msg-enter）**：delta 新增 turn 挂 opacity 淡入 200ms。判定范围用 **rendered 索引空间**（turn.startIndex 是 renderChatStream 投影索引，rawMessages.length 在有 HiddenDropped/合并的会话里偏大）：from = session_init 时 renderedMessages.length、to = 封口 effect 取最新 memo 长度；封口后 600ms 自动摘除动画 class，防虚拟列表滚出滚回重挂重播淡入。**两个 reviewer 实锤的坑**：①keyframes 必须纯 opacity——CSS animation cascade 高于 inline style 且 fill-mode both 永久生效，动画 transform 会覆盖虚拟列表 `translateY(virtualItem.start)` 定位，delta turn 全部堆叠容器顶；②封口 effect 的 per-run cleanup 会在 renderedMessages 变化重跑时清掉未触发的摘除 timer 且 early-return 不重建——timer 挂 ref 一次性调度、卸载清理独立成 effect。

**双向兼容**：老服务端 session_init 无 replay 字段 = full 路径；新服务端 + 老客户端（无 since query）→ anchor null → full，老客户端忽略未知字段。

**验证**：relay 锚定单测 6 项 + hook delta 单测（锚携带/状态保留/无 divider/封口摘除/假 running 防护）54 pass + 浏览器探针 8 项全绿（含 turn top 严格递增几何断言——P0 回归防护）；全仓 701 pass 0 fail。

**待真机复验**：长会话断网重连（Wifi 关/开）→ 内容不闪不重刷、offlineCap 消失、断线期间新消息补齐且淡入；API 重启后重连 → 全量回退正常（skeleton 现状）；pi/acp 重连行为不变。

### 全站动效体系：Apple 流体接口原则落地（2026-10-03，批A–E + reviewer 消化）

**用户需求**：为项目添加合适的动画使整体更出彩，按最佳实践选技术栈；实操前先 push 作回滚点。

**拍板**（AskUserQuestion 三问）：①范围 = **全站动效体系**；②弹层 = **换 spring**；③工作台布局变化 = **要 layout 动画**。**页面切换动效——决策：不做**。理由：与既有拍板「过渡保持上一屏，ready 直接切」（`router.tsx:385` + 记忆 `feedback-page-owns-loading`）直接冲突；Apple skill §1「响应优先」——导航路径上任何非必要延迟都是回归；工作台本身是「作用域常驻、同屏换面板」范式，无页面切换语义。替代 = 内容层交错入场。

**回滚点**：`98b12fa`（批A 前 push 的 main）；批次 commit 链 `acf2c15`（批A）→ `4683116`（批B）→ `dc8a2ff`（批C）→ `fbd789a`（批D+E）→ `e02ec70`（批E scale 机制修正 + frontend-notes §16–20）→ `4d4772c`（reviewer 消化）。

#### ⚠️ 关键技术决策：motion 库摘除（与拍板①的偏离，可回滚）

**用户拍板过「引入 motion 库」（批A 落 `motion@13.4.4` + LazyMotion + MotionConfig），但批B–E 实施后全部动效都走了纯 CSS，零 `m.` 消费方**。perf review P0-1 实锤：LazyMotion 的动态 `import()` 与静态 import **同属 `motion/react` 命名空间导出**（同一个 barrel）→ 树摇失效 → 115KB min（占 entry chunk **29%**）纯死重。摘除后 entry chunk **397KB → 292KB（-26%）**，全产物零 framer-motion/motion-dom 引用（sourcemap 归因实锤，同时消掉 perf P2-4：根 `overrides` 未被遵循、实际入包 framer-motion@13.5.1 全家）。

**为什么纯 CSS 够用**（不是凑合，是更合适）：

| 能力 | motion 库 | 本项目实际需要 | 结论 |
| --- | --- | --- | --- |
| 弹层 enter/exit | spring | Radix data-state + tw-animate keyframes，**曲线换 `linear()` 阻尼采样即可** | CSS 胜（零 JS 边界） |
| 列表交错入场 | variants 容器驱动 | `nth-child` + `calc()` delay，**声明式零 JS** | CSS 胜 |
| grid 轨道过渡 | layout 动画 | `transition: grid-template-columns`（grid 轨道原生可插值） | CSS 胜 |
| press 反馈 | whileTap | `:active` + 独立 `scale` 属性过渡 | CSS 胜（pointer-down 即触发，无 JS 延迟） |
| **手势中断续接**（skill §3 核心） | spring retarget + velocity | **无消费场景**——mobile-sheet 拖拽是四轮真机调优的既有 pointer 状态机（禁区），其余无手势驱动动画 | 不需要 |

即：motion 的核心价值（可中断 spring + 速度继承）在本项目**没有落点**，而它的体积全部要付。CSS `linear()` 阻尼采样提供了 spring 的**曲线形状**（静止场景足够）；**唯一** motion 能做得更好的场景是「用户抓住正在飞的元素」，本批无此交互。

**决策记录**：属「用户拍板范围内选最佳实践实现」。若未来要做手势中断续接（如卡片甩出、可抓取的 sheet），重新引入 motion 并在**消费点**动态 import（避开 barrel 树摇问题）即可——本批的 CSS 基建与之不冲突（token 与曲线可复用）。**回滚**：`git revert 4d4772c`（该 commit 含摘除全部改动）。

#### 批A：基建（`acf2c15`）

- `web/src/motion/tokens.ts` 落地 index.css 注释里**超前预留**的单源（`motion/tokens.ts` 曾从未存在，git 确认）+ 一致性单测。**该文件已随摘除删除**——现 motion 单源 = `web/src/styles/index.css` 的 `:root` 段（CSS 唯一）。
- 引入 `motion@13.4.4`（供应链：2026-09-25 发布，≥7 天；latest 14.0.0 / 13.5.1 均当日发布不合规，锁死 13.4.4）。
- **已摘除**（见上）。

#### 批B：弹层 spring 化（`4683116`）

弹层 enter/exit 曲线换 **CSS `linear()` 临界阻尼采样**（ζ=1，无过冲——Apple 默认）：

- `--spring-standard: linear(0 0%, 0.0802 5%, 0.2428 10%, 0.4129 15%, …)`（525ms）；`--spring-snappy: var(--spring-standard)`（**纯引用**——形状只由 ζ=1 决定，二者只差时长）。
- 时长 token 化（design review P1-3/P2-7）：`--spring-standard-duration: 525ms` / `--spring-snappy-duration: 375ms` / `--duration-exit: 150ms`（exit 此前靠 tw-animate 默认 150ms **隐式巧合**，现显式）。四个消费点（dialog/popover/dropdown/mobile-sheet）一律 `var()`，禁散写 ms。
- **机制要点**：tw-animate 的 `.animate-in` 是 animation **shorthand**，其中 `--tw-ease` / `--tw-animation-duration` 是**自定义属性**（不参与 shorthand 的长属性重置）——所以注入走 `data-[state=open]:[--tw-ease:var(--spring-standard)]` 这类 arbitrary 类，而非覆盖 `animation-timing-function`。**三处（popover/dropdown/mobile-sheet）写同一 arbitrary 串 → Tailwind 合并为一条共用规则**（探针 Part 0 断言 ≥1 条即覆盖全部）。
- dialog：`zoom-in-[0.96]` + opacity + **`blur-in-[4px]`**（skill §12 materialize：blur 与 scale 同动；perf review P1-2 从 8px 降 4px——`filter:blur` 非 compositor-only，每帧全对话框重栅格化，iOS WebKit 代价最高）。
- popover/dropdown 保留 `transform-origin: var(--radix-…-content-transform-origin)`（skill §7 锚定触发源，探针断言 `!== center`）。
- **mobile-sheet 只动 programmatic enter**；**拖拽路径与拖拽 dismiss 的 exit 完全不动**（exit 依赖「inline transform 作 from」机制，frontend-notes §14 四轮真机调优成果 = 禁区）。
- 不锁输入：Radix pointer-events 语义不动，动画纯视觉（skill §3）。

#### 批C：内容交错入场（`dc8a2ff`）

首屏列表（左栏会话分组行 / 文件树 ListGroup / instance-area 卡片）**首次挂载** stagger：`fade + rise 6px`，`--stagger-step: 28ms` 挂容器，delay 规则 `calc(var(--stagger-step) * n)`（design review P2-10 calc 化，改步进只动一处），第 9 行起 cap `calc(var(--stagger-step) * 8)`。

- **fill 必须是 `backwards` 不能 `both`**：`both` 会在播完后以动画终态持续压过 `transform`（拖拽行跟手位移被 `translateY(0)` 锁死）。探针 Part 1 专断言此项防回退。
- **铁律「只首次挂载」**：数据更新 / 流式追加不重播。**批C review P1 实锤的坑**：同 key 行 re-render 不重播，但 **React `insertBefore` 移动 keyed DOM = 脱离文档再插回 = CSS animation 从头重播**（含 backwards 填充的 `opacity:0` 闪烁）。故 **history-list 撤 stagger**（按 `lastActivityAt` 倒序动态重排，WS 活动让行前移 = 真实重播面）；stagger 只留**排序稳定**的列表——instance-area overview 候选排序 = 项目名 localeCompare → 类型 → createdAt 升序（服务端 `session-registry.ts:414` 全稳定字段），file-browser 名字序。
- 消息流 turn 入场已有 `msg-enter`（纯 opacity），不动。

#### 批D：工作台布局动画（`fbd789a`）

- **右栏折叠/展开**：`grid-template-columns` 轨道过渡（`.workbench-grid-animated`，`transition: grid-template-columns var(--duration-slow) var(--ease-standard)`）。
  - **变量承载列宽，模板裸引用**：`--workbench-right-col` = 完整轨道定义（`0px` 或 `${rightWidth}rem`），模板 `lg:grid-cols-[var(--workbench-side-col)_var(--workbench-center-col)_var(--workbench-right-col)]`。**若模板再包 `minmax(var(...))` 会嵌套非法 → 整条声明被丢 → 退化为单列全宽**（探针实抓）。
  - 同值轨道不插值、长度轨道插值；不支持 track 插值的旧引擎退化为离散切换（渐进增强）。
- **拖宽 / 键盘长按期间必须摘 transition**（`rightResizing` state 条件挂类，perf review P2-6 扩到键盘）：每帧改 `rightWidth` 的 1:1 手势带 280ms transition = 追指针 + 每帧全 grid 重排。仅**程序化开合**（唤出钮 / 折叠钮）带动画。
- **中栏 FLIP 搁置**：`flattenLayout` 绝对槽位 + 拖拽 1:1 互斥 + xterm/虚拟列表禁区 + plan 原目标 `InstanceGrid` 已退役。
- **存量 a11y 回归修复**（本批探针 Part 3.5 实抓）：`ColumnResizeGutter` 的 div **一直缺 `role="separator"` + `tabIndex={0}`** → M13c（`5b3d527`）补的键盘方向键通道自始**不可达**（不可聚焦）。补上后 handoff 复验清单第 10 项「gutter 键盘」才真正可用。

#### 批E：微交互（`e02ec70`）

- **button press**：`active:translate-y-px` → **`active:not-aria-[haspopup]:scale-[0.97]`**（skill §1 pointer-down 即反馈；`aria-haspopup` 的弹层 trigger 例外——锚点稳定，不缩）。`actionButtonClasses` 同步补（全站按压力度统一，design review P2-8）。
- **⚠️ Tailwind v4 独立 transform 属性（本批最硬的一课）**：`scale-*` / `translate-*` / `rotate-*` utility 生成**独立的 CSS `scale` / `translate` / `rotate` 属性**，不是 `transform`。**`transition-property: transform` 对独立 `scale` 零作用** → press 会退化为**瞬切**（诊断实锤：中间值 0.5 跳变、无插值）。必须显式写 `transition-[scale,background-color,box-shadow]`，断言也必须读 `getComputedStyle(el).scale`（读 `transform` 恒 `none`）。
- **twMerge 后传覆盖**（frontend-notes §11 同族）：`actionButtonClasses` base 串的**裸 `transition`**（= 23 属性大表）经 `cn` 后传会**覆盖** cva base 的收窄 arbitrary——组件定义与 helper 必须**同步收窄**。
- 验证：探针采**过渡中间值**（页面内 rAF 逐帧采样，实测 8 个中间帧、峰值 0.999025）+ `transitionrun` 事件双证据（只采终态则瞬切也能通过）。

#### 动画禁区（三件，全线未触碰）

1. **mobile-sheet 拖拽状态机与 exit 机制**（frontend-notes §14，四轮真机调优，逐行不动）。
2. **虚拟列表 turn 的 inline `transform`**（仅 `ClaudeSessionDetailRoute.tsx`，全仓唯一虚拟化）——任何动画不得碰 transform，`msg-enter` 为此改纯 opacity 的 P0 教训。
3. **路由级 pending / 页面切换动画**（拍板冲突，见上）。

拖拽 ghost（`instance-area.tsx`）是独立 portal + ref 直写 transform，不走 React render，与卡片本体互不干扰。

#### reviewer 三审消化（`4d4772c`）

perf：P0-1 motion 摘除 / P1-2 blur 4px / P1-3 history-list 撤 stagger / P2-4 overrides 失效（随摘除消失）/ P2-6 键盘摘类 / P2-7 enter 中断跳变窗口（记档 + 真机验收项）/ P2-8 两处 `transition-all` 存量（`badge.tsx` 可忽略；`ClaudeSessionDetailRoute.tsx` 承重不动）。design：P1-3 + P2-7 时长 token 化 / P2-6 mobile-sheet `getAnimations()` cancel / P2-8 actionButton press / P2-10 stagger calc 化；P2-9/11/12 记档。security：P2-1 override 维护义务（随摘除消失）。**P2-12（设计包 `tokens.json` 缺动效段）**：本批动效 token 只落在 `index.css`，未回写设计包——分叉记档，后续设计包升级时一并补。

#### 验证

探针四支全绿（`scripts/`）：`probe-grid-panel` 14（含键盘可达性 + transitionrun 事件断言）/ `probe-spring-overlays` 20 / `probe-button-press` 7 / `probe-stagger-entry` 11。门禁全绿（api 884 / shared 9 / web 701，0 fail）+ CSS 硬闸 + tokens 机检（0 违例）。

**探针消竞态（三处均为「Node↔页面往返慢于被观测动画窗口」的假 fail，非产品缺陷）**：① grid-panel Part 2/4 中间值采样 → `transitionrun` 事件断言（**只有真过渡才派发**）；② button-press Part 2 同因 → 页面内 rAF 逐帧采样；③ spring-overlays Part 1 exit 用 `locator.evaluate` 在「句柄解析 → 求值」间 React 已卸载（游离节点 computed 全空串）→ 改页面内 `waitForFunction` 轮询。另修两处夹具缺口：stagger-entry Part 1 `fill` 读 computed `animationFillMode`（无 forwards 的动画播完即从 `getAnimations()` 移除）、Part 2b 补 `agent-history` mock（entries 空时容器早退 null，断言读成 null 而非 false）。

**待真机复验**：弹层开合手感（含**连续快速开合**的中断跳变窗口——perf P2-7）/ mobile-sheet「打开即下拉」/ 列表入场 / 右栏折叠展开 / 拖宽跟手 / **gutter 键盘可达（Tab 聚焦 → ←/→ 步进 ±1rem，handoff 清单第 10 项本批修复后才真正可用）** / button press 手感 / iOS 减弱动效开关。

### 移动端动效加强批（2026-10-03，commit `eb5f62c`）

**背景**：五批可见面几乎全在桌面，用户反馈「移动端加的不多」→ 拍板两项（AskUserQuestion）：①sheet 升起 + 逐项入场；②触屏按压统一（行·卡片·nav 项 0.98，比按钮 0.97 轻——大面积元素缩放更可感）。页面切换动效仍不做。

**① sheet 全程升起 + 逐项入场**：mobile-sheet enter 位移 16px 浮起 → 屏幕底**全程升起**（`[--tw-enter-translate-y:100%]` 变量注入，机制同 §16 自定义属性注入），去 fade（iOS sheet 是纯位移，升起途中不透明，dim 交 scrim）；新 token `--spring-sheet-duration: 450ms`（100% 路程下 375ms 基础档偏陡，贴 iOS UISheetPresentationController 常见时长）。拖拽状态机 / exit keyframes（inline transform 作起点）/ fill-forwards 禁区一行未动；「打开即下拉」以 `getAnimations()` cancel 兜底（**后经真机证伪——WebKit 上 cancel 后动画实例被重建，见下方修复段**）。ActionMenu 移动 sheet `role="menu"` 容器挂 `.animate-stagger-rows`（Radix Portal 每次开 = 全新 DOM，animation 天然每次播放；菜单项静态无 insertBefore 重播面，§17 判定通过；fill=backwards 契约同批C）。

**② 触屏按压统一（0.98 行档 + 0.97 按钮档分层）**：`.srow2` CSS 单源加 `transition: scale var(--duration-fast) var(--ease-standard) + :active { scale: 0.98 }`（一处覆盖 workbench-side 项目行/实例试点行 + AllSessionsGroupedList 行三消费点——CSS 单源优于逐消费点 utility）；utility 侧（NavItemContent 含底 nav / listRowClasses / mobileSheetItemClasses / mobile-projects-home 活动行·项目行·审批行）= `active:scale-[0.98]` + `transition-[scale,background-color]`（§19 scale 独立属性须显式列出 / §20 裸 transition = 23 属性大表）+ `duration-[var(--duration-fast)]` 120ms 全档统一。**DragSourceCard 确认仅桌面 tabstrip 使用**（移动无拖放，MobileWorkbench 不渲染 InstanceArea），移动端无独立卡片面，行原语即全部交互面。

**探针**：新增 `probe-mobile-motion.mjs` **29 断言**（sheet stagger 5 + srow2/ListRow/nav/菜单项/首页活动行五个按压面各 4–6，全部 rAF 中段插值 + transitionrun 双证据）；`probe-spring-overlays` Part 3 更新（0.45s + `--tw-enter-translate-y` computed = 100%）→ **21/21**。门禁全绿（format/lint/typecheck/web 701）+ CSS 硬闸 + tokens 机检 0 违例。

**探针新教训（§18 同族）**：**全程升起后，sheet 内元素的几何/按压断言必须等 enter 播完**——`translateY(100%)` 起点整个 sheet 在视口下方（诊断实测 menuitem boundingBox y=845.8 > 视口 844），`mouse.down` 落屏外不命中任何元素 = 无 `:active` = scale 恒 none；enter 450ms + 余量 waitForTimeout 后恢复。此前 16px 浮起不会踩这坑（起点基本在位），批B 探针无此防护的根源。

**「打开即下拉」修复（2026-10-03，`6aa7c27` → `bdce488` 两轮）**：移动批收口当晚真机报障「sheet 刚打开下拉必然失败」，改了两轮才定位完整根因。**主根因（事件层，`bdce488`）**：拖拽热区 = grab 5px + shd ≈12–44px，要等 sheet 升到手指位置才可命中；「刚打开就下拉」的手指落点在时序上必然赶不上升起到位——按在升起中的 sheet 内容区，`closest(".grab, .shd")` 判定失败 → **pending 从未建立，拖拽从未启动**（前一轮动画层修复根本没机会执行；探针 boundingBox 精确按 grab 全绿、真人手指必失败，正是这个错位）。修复 = **热区分档**：enter 升起中（open 态 + Content 自身动画在播 = `getAnimations()` 非空，down 时查询——零魔数零新 state）整个 Content 可起拖；升起中内容无交互意义，宽热区无副作用；enter 播完或被接管摘类后 `getAnimations()` 归空自动收窄回 grab/shd（列表区原生滚动不受影响）；exit 期间（data-state=closed）不放宽。**次根因（动画层，`6aa7c27`）**：WebKit 上 `getAnimations().cancel()` 后 animation-name 仍匹配 → 样式更新立即重建动画实例、keyframes transform 重新压过 inline（CSS Animations 规范语义；Chromium 不重建——探针全绿掩盖了它）——`enterKilled` state 摘掉 animate-in 类串，样式失配 = 动画彻底死亡不可重建；保留 cancel（Chromium 即时生效）与 open=false 重置。否决 inline `animation: none`（回弹/dismiss/关闭三路径死结）。**探针教训追加**：验证「动画运行期手势接管」，自然时序窗口 = ~17px 热区 × spring 升速，Playwright boundingBox 往返必 race 输（首跑实锤 down 落点错过热区、inline 恒空）——**WAAPI `a.pause(); a.currentTime = 200` 定格 enter 于升起中段作确定性 fixture**（拖拽接管的 cancel+摘类对 paused 动画同样生效）。第三轮（`1fcadbe`）补**接管视觉续接**：cancel 让元素瞬回未变换位置，直接写 `translateY(dy)` = 从升起中段瞬跳到近终态再跟手——cancel 前记视觉顶、cancel 后取差作 base，inline 写 base+dy（animate from the presentation value）；探针断言升级为「手指移 40px 视觉移 40px」+ computed m42 ≈ inline。**真机诊断通道 `sheet-debug.ts`（一次性，证据到手即删）**：默认常开（PWA standalone 注入不了 URL 参数），左上角浮层打手势事件链（down 热区/pending/take base/chk inline-vs-视觉一致性——不一致 = 动画压制实锤/up·PCANCEL 判定），真机复现一次即可读出断点所在层。probe-mobile-motion **44 断言**。

**第四轮 = 真机取证定根因（`e1ae5a6`）**：用户回报 debug 日志「第一次下拉完美，后续全部 `down zone=content play=0 pend=NO`」——第一次成功 = 赶上升起动画 450ms 窗口（`play=1` 宽热区分支）；后续被拒 = 动画播完（`play=0`）+ 手指自然落在内容区 → 走「播完后窄热区拒绝」分支，而**人的「打开→看到→按下拖」反应必然超过 450ms = 必拒**——这才是「必然失败」的真根因，前两轮假设（摘类/升起期分档）均未触及此分支故全部无效。修复三件套：①播完后按 `hasScrollableContent` 分档——不可滚（菜单/确认框/prompt 等大多数 sheet）整面可下拖收起，可滚（历史/文件/实例信息列表）维持 grab/shd 窄热区护住列表原生滚动；②内容区上滑过阈值放弃手势（向上是滚动/选择方向，不劫持）；③**pending 失联清理**（`onPointerLeave`：capture 前指针移出 Content 即放弃——伴生回归，残留 pending 会把点击按钮的前置 move 判成拖拽起点把 sheet 瞬间拖走，探针 Part 1 实抓，frontend-notes §23）。probe-mobile-motion **46 断言**（1b3 断言反转 + 新增 1b4 可滚保护 / 1b5 上滑放弃）+ `hasScrollableContent` 单测 5 项。debug 通道完成使命，**真机复验通过后删除 sheet-debug.ts**。

**回弹速度继承（`f1f99ed`，用户反馈「无论什么速度回弹都一样、很假」）**：回弹从固定 `200ms ease-out` 换成**临界阻尼弹簧 rAF 积分**（response 300ms，半隐式欧拉，初速度 = 手指松手速度）——快甩带速下冲过冲再收回、慢拖平滑收回，回弹途中再抓住可即时接管。`springStep`/`simulateSpringBack` 导出纯函数，运行时与单测共用（CDP 输入节流做不出高 v0，速度继承数值验证在单测；probe 1b6 只断言收敛），**47 断言 + 弹簧单测 3 项全绿**。

**收起判定换 snap point 动量投影（`7c590b6`，用户反馈「慢拖也都有回弹，好奇怪」）**：固定 96px 绝对位移阈值下慢拖几乎不可达（40–80px 松手只能弹回）。换 iOS sheet 惯例：以「当前位移 + 速度 × 300ms 视野」预估松手后自然落点，越过 **max(64px, sheet 高度 × 25%)** 或纯甩动（≥24px 且 v ≥ 0.5px/ms）即收起——阈值随 sheet 高度自适应，慢拖过 1/4 也收。probe 48 断言（回弹 fixture 改 30px 慢拖压投影 + 新增 1b7 慢拖 70px 投影收起）。

**速度窗口 + velocity-first（`e7fb156` + `65fa654`，用户反馈「慢拖回弹好奇怪」「拉得快反而有回弹」）**：①松手速度从「最后一次 move 的瞬时值」改为**从松手时刻回看 100ms 的窗口净速度**（apple-design §2「track a short velocity/position history, not just the current point」）——停停走走的慢拖在停顿后松手，旧瞬时速度被注入弹簧 → 向下过冲；窗口语义让停顿自然计入分母（停住 300ms 松手 = 0）。判定与动画共用同一速度值。②去掉 24px 最小行程门（velocity-first：「reverse vs. commit 看速度不看位置」）——短距快甩不再被拦成猛回弹。probe 48 断言全绿。

**回弹越顶钳制（`7e9db59`，用户质疑「回弹后又继续往下走不符合物理规律」）**：往回收手再松手时窗口速度为负（向上），原样注入弹簧 → sheet 越过原位向上再垂落——越顶与拖拽期 `dy≥0` 的硬边界自相矛盾。修复 = 回弹初速钳 `max(0, v)`：向上残余速度（用户主动收手）钳 0 平滑归位，向下残余速度（惯性，已被投影判定限到 <1px）保留。

**motion 库回归，接管弹簧物理层（`a98e13b`，用户拍板「用库治本，编译有裁剪不担心体积」）**：手写半隐式欧拉积分退役，换 `motion@13.4.4` 命令式 `animate`（bounce 0 + duration 0.3 = 临界阻尼；velocity 单位 units/s，内部 px/ms ×1000；起点显式读 presentation value；中断走 `controls.stop()`，`finished.then` 以「ref 仍指向自己」判定自然收敛后才清 inline 交还 Radix）。**判定/测速层保留在本文件**（投影、velocity-first、窗口速度、越顶钳 0、起手面分档、可滚保护、pending 失联）——这几轮修对的成果不扔。**供应链记录**：Vaul 方案否决（作者 2025-10 README 官方声明 unmaintained + 22 个月无发版）；motion 14.0.0 昨日发布避开，锁 13.4.4（2026-09-25 ≥7 天）。**当年摘除决策的修正说明**：摘除前提「无手势驱动动画场景」在移动批后失效，本次按场景回归引入——仅命令式 `animate` 消费（无 LazyMotion/`m` 组件），entry 292886B 与摘除基线持平（tree-shaking 摇掉 React 绑定层）；未来再引入组件层消费须重估 barrel 树摇（§16 教训）。probe-mobile-motion 48 断言 + 单测 10 项全绿。

**手感出彩三件套（`c8bdbfc`，用户反馈「没有 bug 但不出彩」）**：迁移 motion 时参数原样搬运（运动等价），出彩差距在运用层。①**动量 bounce 分档**——v ≥ 0.3px/ms（动量释放）回弹带 bounce 0.2（Apple damping ~0.8 的映射；skill §4：bounce 只给带动量的手势），慢速松手 bounce 0 优雅；②**rubber-band 软边界**（§9）——上顶原位（constant 0.2，比正向硬）与拖过一屏（0.55）渐进阻力，界内 1:1 跟手，判定仍用原始位移（`visualDragY` 导出纯函数）；③**拖拽 dismiss 带速滑出**——motion 弹簧顺松手速度滑出屏外（原 CSS exit 无初速通道），finished 后注入出屏 exit 变量再 onOpenChange（Radix exit 无感），滑出期间 startDrag 早退不接管离场中的 sheet。probe 48 断言 + 单测 13 项全绿。

**待真机复验（移动批新项 + 修复）**：sheet 全程升起手感（450ms spring）/ 菜单逐项入场 / 触屏按压回缩分层手感（行 0.98 vs 按钮 0.97）/ **「打开即下拉」手指落在 sheet 任意位置（包括内容区）往下拖 → 立刻跟手（`bdce488` 热区分档 + `6aa7c27` 摘类双修复；WebKit 真机是唯一能复现原 bug 的环境，重点验）** / **iOS `:active` 按压缩放生效且滚动时无粘滞**（iOS Safari 滚动会清 ：active，需真机确认）+ PWA standalone 下生效。

### 弹层 enter 近瞬时档 + sheet enter motion 化收口（2026-10-04）

**背景与拍板**：用户反馈「弹出浮层显得好慢」（sheet-debug 诊断期的 450→1600ms 慢速倍率放大了观感）。经三轮对齐拍板：**保留弹簧曲线、时长压到 ~120ms 近瞬时观感**（曲线形状不变只缩时间轴）；调试浮层完成使命即删。**Part 2（Dialog/Popover/Dropdown 换 motion 可中断 spring）取消**：静态打开无中断场景，120ms 下 motion/CSS 无感差异——用户本意是「快」，CSS 提速即达。

**token 收敛**：三档 spring 时长收敛 120ms、保留分档结构备未来差异化——`--spring-standard-duration`（dialog）/`--spring-snappy-duration`（popover/dropdown）/`--spring-sheet-duration`（mobile-sheet）。`--duration-exit: 150ms` 与 scrim fade（默认 150ms ease）不动（关闭快速离开语义不变）。dialog 的 zoom/blur materialize 与 ActionMenu 菜单 stagger（28ms 递增）保留（与 120ms 升起叠加无冲突）。

**sheet enter 换 motion 驱动（Part 1 收口）**：CSS enter 类串（`[--tw-enter-translate-y:100%]` 变量注入）删除，换 `useLayoutEffect` + `animate(el, {y:[y0,0]}, {type:"spring", bounce:0.12})`——paint 前置起点防首帧闪终态；时长读 token（**JS/CSS 时长单源**，页内 `setProperty` 放慢即探针 fixture）；reduced-motion 直达终态（CSS 站点级兜底管不到 JS 驱动）；**§21 的 WebKit「cancel 后按样式匹配重建动画」防线退役**（motion 是 rAF 驱动 inline，不经样式匹配，stop 即死无重建面）。`enterKilled` state、`getAnimations()` cancel 兜底随之删除。

**探针 fixture 方案换代**：WAAPI 定格（`getAnimations().pause()`）对 motion rAF 动画拿不到实例——换代为**页内放慢 `--spring-sheet-duration`（1600ms）+ 跨起步阈值接管即定格**（stop 后 transform 纯 inline 驱动 = 静止基准）。`waitStillTop`（页内 rAF 帧差 <0.5px 判静止）消 CDP 事件派发 race；其「1 帧静止」可能是 enter 慢速尾段的误判，由 **visShift=30±0.5 硬容差断言兜底**（1:1 跟手是硬约束）。

**motion stop「最后一写」与本轮组件修复**：调试中实锤 motion 13.4.4 的行为——**`stop()` 时已在 rAF 队列中的回调仍会执行一次「最后一写」**，把接管写入的 `frozenY+dy` 覆盖回 motion 轨迹值（实测倒退 ~14px，探针 trail 逐帧实抓）。修复 = 接管分支 stop 后注册**同帧 rAF 矫正写入**（`translateY(base + visualDragY(最新dy))`，注册序晚于 motion 已排队回调 → paint 前最后写入生效，同帧矫正零跳变；phase 仍是 dragging 且无回弹/exit controls 才矫正）。**base 语义同步修正**：base = frozenY（motion stop 冻结的 inline 偏移），inline = base + dy =「动画偏移 + 手指全量位移」——与 CSS 时代 base+dy 语义一致；中途曾试 `frozenY - dy`（增量语义）被探针实锤错误（播完后接管丢失 8px 起步位移 → 22.5px），`frozenY` 直取正确。**用户禁止截图验证 UI 的纪律下，这轮的探针逐帧 trail（rAF 采样 inline/top）+ 组件埋点（page console 转发）是定位 motion stop 时序的唯一路径**。

**验证**：probe-mobile-motion **45 断言**全绿（三处 visShift 精确 30.0，容差收紧 ±0.5）/ probe-spring-overlays **19 断言**全绿（dropdown/dialog duration 0.12s + sheet motion 升起 rAF 采样 + reduced-motion 1e-05s）/ 全门禁绿 + CSS 硬闸（188771 字节）+ tokens 机检 0 违例。

### 技能列表对齐原型：副行「描述 · 来源」+ 详情 dmeta 对齐（2026-10-04）

**背景与拍板**：用户反馈插件技能列表「样式上和内容上都和原型设计有区别」。逐条对比结论 = **样式类（.pcard/.r1/.upd/.d2/.psect）与原型 09 逐条一致**，真正差异在内容：①列表副行 d2 显示**安装路径**（长串换行），原型 =「描述 · 来源:官方」；②详情页 dmeta 显示 preview.source = **realpath 文件路径**（探针 mock 一直写 slug，与真实行为脱节——探针绿但真机显示路径）。用户拍板：来源口径 = `来源: {slug}`（真实数据无官方/社区分类，**分类映射否决**——白名单维护脆弱、分类不准=伪造来源语义）；手写技能（无锁记录）= `来源: 本地`；范围 = 列表 + 详情页一并对齐。

**数据管道**：`InstalledSkill` 加 `description?`（SKILL.md frontmatter，scan 本就读已解析，零额外 IO）+ `source?`（skills 锁记录 slug）。锁读取下沉：`readSkillLock`/`SkillLockEntry`/`LOCK_FILE_RELATIVE` 从 skill-update.ts 移到 skill-market.ts 并导出（依赖方向 skill-update → skill-market 既有，反向成环）；scanInstalledSkillsFromFs 循环外读一次锁（全局锁损坏 list 容错降级空记录 = 来源退化「本地」，不让列表整体失败；项目锁本就容错）；项目锁函数 `readProjectSkillLockNames`（name 集合）→ `readProjectSkillLock`（完整 map，manageable 判定语义不变）。`SkillPreviewResponse.source`（realpath）语义保留，仅详情页改消费口。

**展示规则**：d2 = `[description, source ? 来源: {slug} : 来源: 本地].join(" · ")`（最少「来源: 本地」，path 不再上列表——字段保留调试/深度页）；详情 dmeta = `[来源行, 全局作用域].join(" · ")`，与列表同源（installed.source），不再用 preview.source。桌面端消费同一 MobilePluginsOverview（hideTitle 复用），一次改动两端生效。

**验证**：skill 单测 67 pass（新增 description/source 全局锁 case + 锁损坏容错 case + 项目锁 source 断言）/ web 714 pass / probe-v2-m6-plugins **90** + probe-project-plugins **17** 全绿（mock 补 description/source + **d2 断言 3+2 条**——主交付面此前零断言，code review P2 补齐；dmeta 断言锚「来源:」前缀防回归）/ CSS 硬闸 + tokens 机检绿 / 真实环境抽查实抓技能卡 d2 =「来源: 本地」（新代码路径生效）。

**reviewer 消化（双审，2×P2 + 8×P3）**：①详情页 dmeta 加载窗闪变（installed 缓存冷时 skillEntry 未检出 ≠ 本地，来源段不渲染防「先本地后跳变 slug」）——已修；②zh 冒号形态拍板**半角冒号无空格「来源:本地」**（逐字符对齐原型「来源:官方」；仓内全角惯例让位原型标尺）+ 探针 dmeta 断言锚前缀——已修；③探针 d2 断言补齐（上）——已修；④`name in lock` → `Object.hasOwn`（技能名恰为 toString/constructor 时原型链误判 manageable）——已修；⑤readSkillLock/readProjectSkillLock 归一化抽 `normalizeLockSkills` 共用 + 项目锁 manageable 畸形 entry 口径注释声明（比旧 Set 略严，非对象 entry 不再视为有源）——已修；⑥preview mock source 拟真 realpath（防未来误消费 preview.source 被探针放过）——已修；⑦过时注释「全局 scope 不读锁」修正——已修。

**真实数据收口（api 重启 + line-clamp 采纳，2026-10-04 晚）**：用户追问「除了来源，不是应该还有其他东西吗」→ 实锤 **dev api 进程跑旧代码**（`ps etime` 1 天 17 小时 > 源码 mtime，bun --watch 偶发不重启坑复发；列表响应无 description/source 字段，前端全 fallback「来源:本地」）——按 runbook `respawn-pane -k` 重启后真实数据全线生效。重启后真实数据**否证了 reviewer P3 不采纳的两个前提**：市场技能的 frontmatter description 是 200+ 字符多句长文（「惯例一句话」不成立），无钳制卡片被撑到 8+ 行（「撑高」观感与 d2 曾显示路径长串同族）。**采纳 line-clamp 2**：`.pcard .d2` 补 `display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden`（MCP 卡共用本类但 url/命令短句一行内无感；textContent 断言不受影响——钳制是视觉截断非 DOM 裁剪）。验证：CSS 硬闸 188856 字节 + tokens 机检 0 违例 + 双探针 90/17 全绿 + 真实环境几何验证（21 张 d2 高度 max=32px 恰 2 行 @lineHeight 16.1px；computed `-webkit-line-clamp=2`；产物 CSS 四条声明完整）。

**来源挪右上角 chip（同日二次演化，`07b3ae5`）**：用户拍板「技能列表卡片右上角标注来源」——line-clamp 2 下长描述占满副行会截掉「描述 · 来源」里的来源段，右上角 chip 位始终可见。展示规则演化：**r1 尾部（已停用 chip 之后）来源 chip + d2 回归纯描述**（无描述不渲染空副行）；chip 走 `.upd off` 中性灰变体（元信息不与「有更新」蓝 tint 抢注意力），复用现有 i18n key（「来源:{{source}}」/「来源:本地」零新 key）；`.pcard .upd` 补防溢出三连（`max-width:60% + nowrap + ellipsis`——slug 可达 20+ 字符，短词 chip 无感）。详情页 dmeta 不动（用户指令仅指列表卡）。探针同步演化：d2 断言改纯描述 + r1 来源 chip 断言（probe 92 pass / project 19 ALL PASS）。

### 浮层打开不自动聚焦输入框（2026-10-04，`8a474be`）

**拍板与原则**：用户观察「有些浮层带搜索，默认聚焦输入框，导致浮层&键盘唤起同时发生」→ 拍板**「输入是低频且理应是用户的行为」**：浮层（sheet/dialog）打开时不自动聚焦输入框——sheet 升起动画与软键盘同时唤起互相打架（键盘推挤视口打断动画），聚焦应发生在用户点击输入框之后。

**两段修（命中面全查清）**：
- **MobileSheet 基座**统一 `onOpenAutoFocus` preventDefault——一次覆盖两类命中面：①Radix DialogContent 默认 initial focus（内容首 focusable 恰为输入框：切换 sheet 搜索框、MCP 手动添加名称框）；②消费方显式 `autoFocus`（基座拦不住 React autoFocus，必须逐处删）。
- **删显式 autoFocus 4 处**：prompt-dialog 移动面（桌面面保留显式 autoFocus）、new-item-sheet、pages-root-dialog 共用 formBody（桌面靠 Radix 默认聚焦同一 input 等效）、rename-dialog（双端同款居中 Alert，`isMobile` 条件 preventDefault——桌面保持聚焦惯例）。
- **桌面零代码改动**：居中 Dialog（ui/dialog.tsx）无键盘推挤问题，Radix 默认聚焦（首 focusable = 该 input）保留表单惯例与键盘导航 a11y。
- **行内渐进披露保留 autoFocus**（不在「浮层打开即聚焦」语义内）：files/wiki 搜索框、重命名行内输入、新建文件夹行、move-sheet 新建行——输入框出现本身就是用户点击的直接反馈。

**验证**：新探针 `probe-sheet-focus-policy`（4 断言：切换 sheet + 文件新建 sheet 两面，打开后 activeElement 非 INPUT，对照断言锚输入框在场防空转）/ probe-mobile-motion 45（首跑 1 fail 为高负载采样 flake，复跑全绿）/ probe-spring-overlays 19 / probe-v2-m6-plugins 92 / probe-project-plugins 19 全绿 / 全门禁绿。桌面面零代码改动不做浏览器断言（路径深），交桌面抽查。

### composer 发图——+ 菜单（图片 / 相机 / 文件）（2026-10-04，`68b030c`）

**用户需求与拍板**：「为 claude agent 输入框增加发图功能，能够发送图片或者拍照发送，在左侧出现一个加号按钮，点击出现菜单，包含 图片 相机 文件。」AskUserQuestion 拍板：①图片送达 = **stream-json 图片块**（base64 内联 WS 帧 → api 原样透传 stdin → CLI 直达模型；JSONL 同样以 base64 落盘 → 历史回放天然携带）；②「文件」= **项目内 uploads/ 目录**（CLI cwd 内可见可 Read，权限零摩擦；复用 writeUpload 校验/50MiB/keepBoth）。

**链路**：pick/拍照 → 客户端归一化（达标 jpeg/png/webp 且 ≤1568px **原样透传**保 PNG 锐度；否则 canvas 重编码 JPEG q0.8，GIF 取首帧）→ WS user 帧 `content=[图片块…, 文本块]`；文件 pick → 立即 `uploadFile(projectName,"uploads",file,"keepBoth")` → chip 上传中→就绪 → 发送时并入提及行「附件：{path}」。发送接线 = route 顶层 `useComposerAttachments` 持草稿 → 第 5 参 options 经 ref 进 `useClaudeSession` → onNew 发送瞬间 `takeSnapshot` 组帧；**纯附件无文本走 `api.thread().append(" ")` 兜底**（assistant-ui 空文本 send 不可靠；占位空格被 onNew trim，纯图成 image-only content）。多端同构：同一 composer 两端生效，相机项显隐按 pointer media（`hover-capable:hidden`，默认常显 = 触屏/未知方向无害，§7）。

**渲染链（真管道）**：`ChatStreamItem` user-prompt 增 `images?`；`normalizeChatStream` user 分支用 `extractUserBubbleContent` 单源提取（纯图不丢气泡）；`renderChatStream` 映射 image parts；`UserChatBubble` 配 `UserImageView`（气泡+全屏阅读器同源）。**教训记档**：本批首版把渲染改动接在 `convertContentToBubble` 上——该函数是**无生产调用者的存量死函数**（仅测试引用），探针 Part5「下行气泡」抓包暴露（组帧绿但渲染链未接），改接真链后才通。改渲染语义先核真实调用链，别信名字像的函数。

**探针**：`probe-composer-attach` 15 断言全绿（菜单/相机两端显隐/组帧精确比对 base64/纯附件兜底/提及行/下行气泡 img/× 移除；routeWebSocket 上行捕获 + mock 上传端点）。**探针实战价值实锤**：首跑抓到 `pick`/`addFiles` 占位 id 错位真 bug（addFiles 重复 ++idRef，chip 状态永停「上传中」——mock 单测覆盖不到的接线 bug）。回归 probe-claude-detail-perf 27 pass。dev 真实环境抽查（真实后端会话页 + 按钮在场 + 相机 display=none）。

**security review 消化（`675255b`，1×Medium-Low + 1 加固全采纳）**：①**单图 5MiB 上限**——原实现只限张数（4），透传分支尺寸达标 ≠ 体积达标（1×1 带 MB 级 tEXt 块的 PNG、1568px 噪声 PNG），放行会撑爆 WS 帧 → api stdin → JSONL 永久落盘 + relay 常驻重放；现三出口过 `IMAGE_MAX_BYTES` 闸（透传超限落重编码、无法重编码的兜底与重编码产物超限即 chip 报失败），与 Anthropic API 单图 5MB 对齐。②`extractUserBubbleContent` 增 media_type 白名单 `image/(jpeg|png|webp|gif)`（唯一消费点 `<img src>` 本就无可触发注入，加固收紧 data: URL 拼接面）。③文件上传链 / shared 类型扩宽 / ProjectName / 鉴权 / 命令执行各面 reviewer 确认未发现。

**真机反馈①：附件图标隐形（`5e15ef3`）**：PWA 里「＋」按钮占位可点（权限/模型/深度让位、点击菜单照常弹出）但图形看不见，桌面正常。根因 = `LucideIcon` 裸用无尺寸类——svg 无 width/height 属性时 **Chromium flex 收缩给非零默认值、WebKit 收缩到 0×0**（引擎分歧，Chromium 探针全绿测不出）。全仓其它 plus/x 消费点均带尺寸类，唯本批裸用。修复：两处补 `size-4`；探针补「图标显式尺寸 16×16」断言锁契约；沉淀 frontend-notes §15⑤（svg 必须显式定尺寸）。

**粘贴入口（2026-10-05，同日批）**：桌面粘贴图片直进附件 chips（用户需求「直接复制粘贴图片，并且可以增删已复制的」——增 = 继续粘贴或菜单加，删 = chip ×，均已存在，本批只补入口）。**对齐 pi composer 先例**（ChatSessionDetailRoute onPaste 已长期在跑）：`ComposerPrimitive.Input` 透传 onPaste，`clipboardData.items` 筛 `kind==="file"` + `type.startsWith("image/")`，有图 `preventDefault()` 交 `attachments.pick`（压图/5MiB 闸/cap 4/chip 状态机全复用）；纯文本/混合里的文本照常走默认（preventDefault 是事件级的，有图才拦）；无端分支（移动长按粘贴同效）。探针 Part7：合成 ClipboardEvent 触发同一 React handler 路径（untrusted 事件无默认插入行为，文本锚走 `defaultPrevented` 层验证「有图才拦」）——20 断言全绿。拖拽（drag & drop）与非图片文件粘贴未要求不做（文件走「＋」菜单上传入口）。

## §7 待定项跟踪

| 项 | 决策点 | 摊牌时点 |
| --- | --- | --- |
| Wiki「让 Agent 读这篇」注入协议 | ~~stdin 指令 vs attachment/引用卡；引用卡状态归属~~ ✅ 已摊牌（D13，§6.2）：stdin prompt + 客户端 per-session 引用 atom | ~~M4 开工前~~ 2026-09-21 |
| iPad 三栏细节 | ✅ 已拍板（§6.10-1/2）：三档断点（<640 移动 / 640–1023 移动拉宽 / ≥1024 三栏），iPad 列宽 side 260 / center 600 / inspector flex-1 | 2026-09-22（Q17：原型+最佳实践拍板） |
| Mac 专属件取舍 | ✅ 已拍板（§6.10-3..9）：分屏复用 V3 树 + tabstrip 按钮；Inspector 四段（文件/Git/Wiki/历史；〔2026-09-24 拍板改三段〕）；快捷键 = spec §10.2 原文六条 | 2026-09-22（Q17：spec 原文即全集，无增删） |
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

### 主题切换机制（M1 实况记录，含对附录计划的偏离记档）

- `<html>` 挂 `data-theme="light" | "dark"`（`:root` = dark 基准，`html[data-theme="light"]` = 浅色覆盖）；**两通道**：localStorage → 系统偏好（`prefers-color-scheme`），theme.ts `applyResolvedTheme` 同时落 `data-theme` 属性。
- **偏离 1 — localStorage key 沿用 `"theme"`**（附录原计划 `adr-theme`）：v1 用户偏好无缝迁移，改 key 会让现存用户主题设置清零；语义无损失，不值得破坏迁移。
- **偏离 2 — 保留 `.dark` class 双轨**（附录原计划 `@custom-variant dark` 改纯属性选择器）：shadcn 组件内部 `dark:` variant 与存量代码依赖 `.dark` 基（`@custom-variant dark (&:is(.dark *))` 未动）；`data-theme` 承载 v2 语义 token、`.dark` 承载 shadcn `dark:` variant，两轨由同一函数同步落，探针验证双轨一致。等存量 `dark:` 用法在 M2–M9 页面重写中清零后可收单轨。
- **偏离 3 — URL `?theme=` 通道不引入**（附录原计划 theme.js 三通道）：分享链接/嵌入场景在本产品不存在，多一通道多一攻击面（URL 可伪造首帧主题）；两通道已覆盖全部真实场景。postMessage 通道同理不引入。
- PWA `theme_color` 安装定格 = 已知限制（D18，不处理）；manifest 静态值取 dark 基准 `#000000`（产品主主题）。

### 浅色对比度已知限制（上游 tokens.json 取值）

浅色档 `--c-warning-text: #e08600`（对 #fff ≈ 2.77:1）与 `--c-success-text: #28a745`（≈ 3.13:1）低于 WCAG AA 4.5:1——上游 tokens.json `$value` 即此值，深色档达标。短期约束：这两色仅用于 ≥600 字重的小型标签（badge/tray/otherlbl，设计包样式已是粗体），不做正文色。加深取值留 M3 主页对齐时与设计包一起校订（tokens.json 是唯一数值源，实现侧不私改）。
