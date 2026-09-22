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
6. **Inspector 四段（04/05）**：文件/Git/Wiki/历史 seg4——桌面现有 RightPanelTabs 的 tab 集对齐（rightTab 维度已有），补「历史」段（05c 历史 Sidebar 同数据：useHistorySessions）。
7. **Sidebar 作用域（04/05 pin②）**：seg4 mini「项目/全部」——项目 = 本项目实例组；全部 = 跨项目分组列表（05g）。现桌面 Sidebar 已有 scope 概念（leftMode/global overview），对齐原型交互形态。
8. **桌面预览只读化（M4 记档落地）**：桌面 file tab 预览去编辑（saveFileContent API 保留，UI 入口移除）——03q 铁律 7「内容编辑器不存在」双端一致。
9. **桌面版页面**：09m 插件 / 10m 全局文件（含 ⌘F）/ 07m 设置（Mac 设置 = 07 同构宽版）/ 13 MCP 详情桌面入口（M6 记档「M9 评估」→ 做：pluginmcp_ focusId 开 tab）。
10. **触屏/hover 正交核对（frontend-notes §7）**：iPad 触屏 + 宽屏组合全量核对 hover-capable/touch 变体——hover 显隐功能在 iPad 上必须常显可达。
11. **安全/杂项收尾**：security P3② `resolveCreateTarget` 补 realpath（M8 采用扩大使用面）；P3① searchFiles 遍历总量上限；`.setrow`/`.logout` 等键盘 `focus-visible`；`w-[52px]` 真机值验证（真机项交用户，代码按原型保持）。

**批次**：a 断点三档 + iPad 列宽对齐 → b Mac 工作台（分屏按钮/状态栏/Inspector 四段/Sidebar 作用域）→ c 快捷键 + 05f 审批 Popover → d 桌面版页面（09m/10m/07m/13 入口/预览只读化）→ e 安全与键盘杂项。每批次探针断言 + 批次末 reviewer 三份 + 四门禁。

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
| D7 | Mac 页 07m/09m/10m 数据与 iPhone 同源 | probe-v2-m9-d（桌面 mainPage 与移动同 mock 数据源断言）+ probe-v2-m9-b（Inspector 四段同源） |
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

## §7 待定项跟踪

| 项 | 决策点 | 摊牌时点 |
| --- | --- | --- |
| Wiki「让 Agent 读这篇」注入协议 | ~~stdin 指令 vs attachment/引用卡；引用卡状态归属~~ ✅ 已摊牌（D13，§6.2）：stdin prompt + 客户端 per-session 引用 atom | ~~M4 开工前~~ 2026-09-21 |
| iPad 三栏细节 | ✅ 已拍板（§6.10-1/2）：三档断点（<640 移动 / 640–1023 移动拉宽 / ≥1024 三栏），iPad 列宽 side 260 / center 600 / inspector flex-1 | 2026-09-22（Q17：原型+最佳实践拍板） |
| Mac 专属件取舍 | ✅ 已拍板（§6.10-3..9）：分屏复用 V3 树 + tabstrip 按钮；Inspector 四段（文件/Git/Wiki/历史）；快捷键 = spec §10.2 原文六条 | 2026-09-22（Q17：spec 原文即全集，无增删） |
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
