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
| M4 | 工具与深度页 | Git/文件/Wiki 原位高亮切换；L3 详情（preview/diff/wiki reader/git history/commit/branches）；Wiki 注入协议落地（D13） | 只读边界成立 | ⬜ |
| M5 | 浮层与审批 | sheet/popover 体系；审批中心服务端聚合（D8/D23） | security-reviewer 必过 | ⬜ |
| M6 | 插件与市场 | 插件 Tab（作用域分段+MCP 组+技能+市场四页） | 对照 09/12/13/14/15/16/17/18 | ⬜ |
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

## §7 待定项跟踪

| 项 | 决策点 | 摊牌时点 |
| --- | --- | --- |
| Wiki「让 Agent 读这篇」注入协议 | ~~stdin 指令 vs attachment/引用卡；引用卡状态归属~~ ✅ 已摊牌（D13，§6.2）：stdin prompt + 客户端 per-session 引用 atom | ~~M4 开工前~~ 2026-09-21 |
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

### 主题切换机制（M1 实况记录，含对附录计划的偏离记档）

- `<html>` 挂 `data-theme="light" | "dark"`（`:root` = dark 基准，`html[data-theme="light"]` = 浅色覆盖）；**两通道**：localStorage → 系统偏好（`prefers-color-scheme`），theme.ts `applyResolvedTheme` 同时落 `data-theme` 属性。
- **偏离 1 — localStorage key 沿用 `"theme"`**（附录原计划 `adr-theme`）：v1 用户偏好无缝迁移，改 key 会让现存用户主题设置清零；语义无损失，不值得破坏迁移。
- **偏离 2 — 保留 `.dark` class 双轨**（附录原计划 `@custom-variant dark` 改纯属性选择器）：shadcn 组件内部 `dark:` variant 与存量代码依赖 `.dark` 基（`@custom-variant dark (&:is(.dark *))` 未动）；`data-theme` 承载 v2 语义 token、`.dark` 承载 shadcn `dark:` variant，两轨由同一函数同步落，探针验证双轨一致。等存量 `dark:` 用法在 M2–M9 页面重写中清零后可收单轨。
- **偏离 3 — URL `?theme=` 通道不引入**（附录原计划 theme.js 三通道）：分享链接/嵌入场景在本产品不存在，多一通道多一攻击面（URL 可伪造首帧主题）；两通道已覆盖全部真实场景。postMessage 通道同理不引入。
- PWA `theme_color` 安装定格 = 已知限制（D18，不处理）；manifest 静态值取 dark 基准 `#000000`（产品主主题）。

### 浅色对比度已知限制（上游 tokens.json 取值）

浅色档 `--c-warning-text: #e08600`（对 #fff ≈ 2.77:1）与 `--c-success-text: #28a745`（≈ 3.13:1）低于 WCAG AA 4.5:1——上游 tokens.json `$value` 即此值，深色档达标。短期约束：这两色仅用于 ≥600 字重的小型标签（badge/tray/otherlbl，设计包样式已是粗体），不做正文色。加深取值留 M3 主页对齐时与设计包一起校订（tokens.json 是唯一数值源，实现侧不私改）。
