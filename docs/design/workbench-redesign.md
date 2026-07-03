# 三栏工作台重设计（WIP 草案）

> 状态：**已落地**：桌面三栏 + 移动两层主体已实现于 app（`WorkbenchShell` 桌面三栏 grid + 栏折叠/resize、`InstanceArea`/`SplitLayout` 中栏自由 split、`RightPanelTabs`/`FIRST_PARTY_PLUGINS` 右栏 files/git/prototype、`mobile-workbench` 移动两层 + ‹› 切实例、`WorkbenchRoute` URL 模型 `/projects/$key`、`/global`、`/projects/$key/session/$id`）。本文是新导航模型的权威设计记录。剩余待定项见 §9（原型 tab、marketplace）。
>
> **演进（2026-07）**：本文「左栏=项目+实例树 / 中栏=自由 split 铺开」的导航模型，已被 [`workbench-views.md`](./workbench-views.md) 进一步演进——左栏收敛为导航条目列表、中栏新增二级导航 5 tab + 视图切换、split 重构为「聚焦展开+其余缩略+底部 dock」的特殊工作视图。新 IA 以 workbench-views.md 为准，实施计划见 [`workbench-views-plan.md`](./workbench-views-plan.md)。本文的桌面三栏 grid / 移动两层 / 右栏 inspection / URL 模型**仍有效**。
>
> 协商方式：ASCII 草图 + 逐点决策。本文保留关键 ASCII 以承载设计意图。

## 1. 背景与走向

现有桌面端是「严格三层单列 + chrome」：Home（项目列表）→ Project workspace（单 section 切换）→ Session detail（换页）。每层换页，上层信息消失。

本次重设计的核心走向已定为：

> **全工作台常驻（IDE 化）** —— 桌面端抛弃 Home→Project→detail 的换页模型，进入工作台后即为常驻三栏。项目切换、实例切换、inspection 都在同一屏内完成。

这是导航模型的走向转变，不是 CSS 调整。路由模型见 §7（桌面工作台 + 移动两层，URL 编码语义核心、localStorage 编码布局）。

## 2. 桌面三栏总图

```
┌────────────┬───────────────────────────────┬──────────────────┐
│ 项目/设置   │  中部 = 自由 split 实例区        │ 右栏 = tab 式      │
├────────────┼───────────────────────────────┼──────────────────┤
│ 全局       │ ┌─────────────┐ ┌─────────────┐│ ◉文件  Git 原型 ⊕ │
│ ────       │ │ agent1 ●    │ │ agent2      ││                  │
│ ▼ projA    │ │ (聚焦/宽)   │ │ ...         ││  (tab 内容随激活) │
│  ├ Agents  │ │             │ ├─────────────┤│                  │
│  │ ├ a1    │ │             │ │ term1       ││                  │
│  │ └ a2    │ └─────────────┘ └─────────────┘│                  │
│  ├ Terminal│                                 │                  │
│  ├ 历史session│ $ input → agent1 (聚焦面板)   │                  │
│  └ +新建▾  │                                 │                  │
│ ▶ projB    │                                 │                  │
│ ────       │                                 │                  │
│ ⚙ 设置     │                                 │                  │
└────────────┴───────────────────────────────┴──────────────────┘
  左栏            中栏(无上限自由split)            右栏(插件可扩)
```

- **左栏** = 跨项目切换器（VSCode explorer 式：全局节点 + 项目+实例树）+ 底部设置浮窗入口。
- **中栏** = 自由 split 实例区，承载活跃实例（agent/终端）；有项目实例区 / 全局实例区两种作用域（见 §4）。
- **右栏** = tab 式附加区（文件/Git/原型/插件），可扩展插件槽。

**左右栏可收起**：两栏都能收起，把空间让给中栏实例区（中栏是工作台主体，不可收起）。收起按钮在各栏顶部；收起后该侧消失，在中栏对应边缘出现展开按钮（左 ◂ 唤左栏 / 右 ▸ 唤右栏），点击恢复记忆宽度。**收起态与展开宽度都持久化**（复用 `atomWithStorage`，同 `inputDrawerCollapsedAtom` 模式）。唤出方式暂定「中栏边缘按钮」（最简，无新固定实体）；若将来要 VSCode 式「收起后留窄活动条放 icon」可再升级。

## 3. 左栏：项目 + 实例树

```
全局                       ← 全局实例区入口(跨项目 split 监控)
项目
├─ ▼ projA       [⋯]        ← 项目行：点选=切该项目实例区，[⋯]=项目菜单
│   ├─ Agents
│   │   ├─ agent1 ●  running     ← 活跃实例（状态徽章）
│   │   └─ agent2 ◻  idle
│   ├─ Terminals
│   │   └─ term1             ← terminal 无状态徽章（恒活跃）
│   ├─ 历史 session (2)
│   │   └─ agent0 (已结束)        ← 历史 session，点开 = resume 成实例
│   └─ + 新建 ▾               ← 新建 agent / terminal
├─ ▶ projB                   ← 折叠
└─ + 新建项目
─────────────────
⚙ 设置                        ← 触发独立浮窗
```

实例状态徽章：`●` running / `◻` idle / `⚠` 需要交互（agent 三态）；terminal 无徽章（恒活跃 shell）。**活跃实例 = 实例区里的面板，一一对应**；历史 session 段列已结束会话，点开 = resume 成实例。

操作归属：

| 操作 | 归属 | 说明 |
|---|---|---|
| 进入全局实例区 | 左栏顶部「全局」 | 实例区切跨项目作用域，可 split 任意项目的实例并排监控 |
| 切换项目 | 点项目行 | 展开/折叠 + 选中 → 实例区切到该项目 |
| 新建项目 | 左栏底部「+ 新建项目」 | |
| 新建 agent/终端 | 项目下「+ 新建 ▾」 | 创建后默认 split 进实例区 |
| 打开/聚焦实例 | 点活跃实例 → 实例区聚焦其面板 | 可拖拽调宽 / 最大化 / 关闭（关闭 = 结束实例，成历史 session） |
| 打开历史 session | 点历史 session 某条 → resume 成实例 | **= 现在 `--resume` 行为**：作为可继续的 agent 实例打开，与活跃实例同模型，不是只读回放 |
| 设置 | 左栏底部「⚙ 设置」 → 独立浮窗 | 应用级配置（PROJECTS_ROOT/密码/API/外观等） |

### 项目列表呈现

- **排序**：按「最近实例活动」降序（最近有 agent/terminal 活动的项目排顶），同活动时间内按字母序——与实例区「关注程度」排序同哲学。
- **展开**：最近活动的项目默认展开，其余折叠；可手动展开多个（全局监控需要多项目实例并见）。
- **搜索**：项目数超阈值（如 >8）才显示搜索框，少量项目时不占左栏宽度。
- 不做分组（项目数有限，扁平 + 排序足够）。

### 设置 = 独立浮窗

点击「⚙ 设置」弹出**可拖拽的独立浮窗**，浮在工作台之上，不挤占任何栏，关闭即收起。设置是应用级、低频全局操作，性质不同于实例工作区，故不进中栏也不进右栏。

## 4. 中栏：自由 split 实例区（两种作用域）

核心模型：**中栏是用户自由布置的 split 实例区，无上限、无固定 grid 形状。** 实例区有且仅有两种「作用域」，区别只在实例来源池，实例区操作能力（split / resize / 输入 / 放大）完全相同：

| 作用域 | 实例来源 | 入口 |
|---|---|---|
| 项目实例区 | 仅该项目 | 左栏点项目 |
| 全局实例区 | 所有项目（跨项目混排） | 左栏顶部「全局」节点 |

每种作用域的 split 布局各自记忆，切换作用域 = 换实例来源池 + 恢复该作用域布局。这统一了「项目隔离专注」与「跨项目全局监控」——是同一个实例区引擎的两个作用域，不矛盾。

**项目实例区**（专注模式，实例来源 = 该项目）：

```
┌──────────────────┬───────────┐
│ agent1 (聚焦/宽)  │ agent2    │
│                   ├───────────┤
│                   │ term1     │
└──────────────────┴───────────┘
$ input → (聚焦面板)
```

**全局实例区**（跨项目监控，面板带项目前缀）：

```
┌──────────────┬──────────────┐
│ projA/agent1 │ projB/agent3 │
│ ● running    │ ● running    │
│ 任务 12/20   │ 改登录页      │
├──────────────┴──────────────┤
│ projB/term1 ●               │
└─────────────────────────────┘
```

要点：

- **打开/新建实例 → 默认 split 进当前作用域实例区**（tmux 式）。新实例只影响被分割的面板，其它不动，避免全局重排跳变。
- **split 方向**：自动铺开按行水平排列、铺满换行（flex-wrap，少量并排、多了成网格）；手动 split 给 `split-right`（左右切）/ `split-down`（上下切）两个动作，用户自选（满足「全宽底部 terminal」等需求）。
- **面板操作**：拖 gutter 调宽 / ⛶ 最大化（占满，其它缩成边缘 thumb，可恢复）/ ✕ 关闭（结束实例，成历史 session）。
- **实例 = 面板，一一对应**：活跃实例就是实例区里的一个面板，不存在「后台运行未显示」的实例；要让实例消失只能关闭（结束成历史 session）。实例多了挤不下，靠 resize / 最大化 / 关闭管理密度。
- **无密度上限**：不预设固定 grid。面板可自由调宽，密度由用户负责（tmux / 监控 dashboard 范式）。
- **输入作用于聚焦面板**：点某面板聚焦（视觉高亮），底部输入区发给该面板的实例。

### 不设顶部 tab 条（已定）

split 实例区模型下 tab 是冗余：tab 属「单视图多切换」模型，split 实例区属「多视图并排」模型；实例区上面板可见即「已打开」，tab 再表示一遍「打开」多余。实例全集由左栏树（项目内）+ 全局实例区（跨项目）覆盖所有切换场景。

### 实例状态与自动铺开排序

agent 实例有三态（**terminal 无此区分**，恒为活跃 shell，不显示状态徽章）：

| 状态 | 含义 |
|---|---|
| 运行中（running） | AI 正在回应 |
| idle | AI 回答完毕，等待用户输入 |
| 需要交互（needs-input） | 有挂起的 permission 请求等待用户审批（= `pendingInteraction`） |

**全局实例区初次展开 = 自动铺开所有活跃实例**（不只运行中），按「需要用户关注的程度」降序铺开；之后布局记忆用户调整。排序定为：**需要交互 > 运行中 > terminal > idle**（terminal 作为活跃 shell 排在 idle agent 之前）；同档之内按项目分组、再按最近活动时间。

### 空状态

实例区按场景给不同空状态 + 唯一主操作：

- **无项目**（未选作用域 = 没有任何项目）：标题「还没有项目」+ 主按钮「+ 新建项目」。
- **项目无实例**（有项目、无活跃实例、无历史 session）：「这个项目还没有会话」+「+ 新建 Claude」「+ 新建 Terminal」。

## 5. 右栏：tab 式附加区 + 插件槽

右栏是 **tab 式**（文件/Git/原型/插件…），一次只显示一个 tab；正因是 tab 结构，才能作为「插件预留位」——未来新功能以新 tab 形式挂入。

- **文件 / Git**：只读 inspection，作为右栏 tab 呈现，**不进实例区**（实例区专留给活跃实例）。
- **原型 tab**：项目原型设计，**具体功能待定**（见 §9）。
- **插件 tab（⊕）**：预留扩展位，契约见 §6。

右栏 tab 切换 = 切换「当前想看的辅助视图」，与实例区聚焦实例正交。

**默认激活 Files tab**（最通用的被动 inspection）；聚焦 agent 实例最近触发 git 操作时，可由 `when` 给不强制的小提示建议切 Git。

## 6. 插件槽设计依据与契约

### 6.1 业界结论：agent 产品不做 UI 插件

研究 OpenAI Codex（与 Claude CLI 对称）的扩展机制，核心结论：

> **Codex（和 Claude CLI）的「插件/扩展」全是工具/能力层（MCP servers + Skills + Hooks），完全没有 UI 面板层扩展。** 这是 agent CLI 业界的共识，不是 Codex 缺陷。

判定一个系统有无「UI 插件」的根本判据：**第三方代码有没有获得一块「自己负责渲染的矩形区域」**。Codex 没有。

易错点：Codex `plugin.json` 的 `interface` 块（`displayName`/`logo`/`screenshots`/`brandColor`/`composerIcon`...）字段名像 UI 扩展，但**只是 marketplace 列表的展示元数据（海报），不是渲染契约**。真正注入系统的是 `mcpServers`/`skills`/`hooks`/`apps` 这些能力字段。本项目 [claude-cli-stream-protocol.md](../research/claude-cli-stream-protocol.md) 中 `plugins: string[]` + `reload_plugins` 返回 commands/agents/plugins 完全对称——都是能力清单，无 UI 描述符。

### 6.2 右栏属 UI 面板层，参考 VSCode

我们要做的右栏插件槽给**用户**多一个可看 tab，由**我们自己渲染**，属 UI 面板层。Codex 借鉴不了渲染模型，只能借鉴 marketplace 卡片元数据字段。真正该参考的是 **VSCode `viewsContainers` → `views` + `WebviewViewProvider` + `when` 可见性 + `onView` 激活**。

### 6.3 V1 最小契约

不照搬 Codex `plugin.json`（工具层 bundle，字段大半无用），也不一上来做 webview 沙箱：

```ts
type RightPanelPlugin = {
  id: string;                    // "files" | "git" | "prototype" | ...
  title: string;                 // i18n key，tab 标题
  icon: string;                  // 复用本项目 ShellIcon 图标系统
  order?: number;                // tab 排序
  render: React.ComponentType<PluginContext>;  // 渲染入口（非 webview URL）
  when?: (ctx: PluginContext) => boolean;       // 可见性，类比 VSCode "when"
  capability?: "files" | "git" | "terminal" | "agent";  // 复用已有 capability 词汇
};

type PluginContext = {
  projectKey: string;            // 当前 Project（Project-safe 边界）
  runtimeKey?: string;           // 当前聚焦的 agent/terminal session
};
```

设计取舍：
- `render` 用同进程 React 组件（非 webview），复用 ShellLayout 设计语言、无 iframe 开销；只有将来真要跑不可信第三方才升级沙箱。
- **第一方编译期注册**，V1 不做 marketplace/运行时安装（Codex 的 `interface` 元数据字段留作未来「插件卡片样式」参考）。
- `when` 让「Agent detail 才显示 Files」「Terminal 隐藏 Git」这类规则集中表达，不散落 `if`（呼应项目「页面 owns loading / 不堆平行分支」原则）。
- `capability` 复用已有词汇，让插件声明消费哪类能力，权限/路径安全收口在 Project-safe resolver。

来源：Codex（deepwiki openai/codex §5.11 Plugins System、§4.1.3/§4.1.5 host-fixed overlay、§6.1 MCP）；VSCode（deepwiki microsoft/vscode，`viewsContainers`/`views`/`WebviewViewProvider`）；本项目 `docs/research/agent-access-options.md`、`docs/research/claude-cli-stream-protocol.md`。

## 7. 移动端：两层导航

桌面三栏在手机竖屏不可行（并排 split 不可读）。移动端是桌面三栏的**投影**：左栏顶层 → 一级导航；项目内（实例区 + 右栏 inspection）→ 二级导航；桌面 split 并排 → 移动「单实例聚焦 + ‹ › 顺序切换」。

### 一级导航（底部 tab，常驻）

对应桌面左栏顶层，3 项可扩展：

- **项目**：项目列表（默认），点项目进入二级。
- **全局**：跨项目活跃实例聚合列表（按项目分组 + 关注程度排序），点实例进单实例聚焦。**全局列表只读监控，不可创建实例**（创建需先进项目指定作用域）。
- **设置**：应用级设置页。

底部 tab 在「单实例聚焦」时让位给输出 + 输入；要回一级导航，靠 ◄ 逐级返回（聚焦 → 总览 → 项目列表）。

### 二级导航（header + tab 行，仅项目内）

进入项目后，header 块自带 tab 行（返回 + 项目名 + tab 同 surface）：

```
┌─────────────────────┐
│ ◄  projA        [⋯] │
│〔总览〕 文件 git 原型 │
├─────────────────────┤
│ 实例                 │
│  ⚠ agent1  需要审批   │
│  ● agent2  running    │
│  ▸ term1             │
│ 历史 session         │
│  ✓ agent0 (已结束)    │
│〔+ Claude〕〔+ Term〕 │
└─────────────────────┘
```

- **总览** = 活跃实例 + 历史 session 两段，创建入口（+Claude / +Terminal）；点活跃实例进单实例聚焦，点历史 session = resume 成实例。新建实例后直接进单实例聚焦。
- **文件 / git** = 该项目只读 inspection（同桌面右栏 tab 内容）。
- **原型** = 项目原型设计，具体功能待定（见 §9）。

### 单实例聚焦

```
┌─────────────────────┐
│ ◄  agent1       ⚠   │
│〔输出〕 文件 git 原型 │
├─┬─────────────────┬─┤
│‹│  agent 输出流    │›│
│ │                 │ │
├─┴─────────────────┴─┤
│ $ input → agent1     │
└─────────────────────┘
```

- header 块 tab 切换为实例维度：`输出 / 文件 / git / 原型`。
- **输出 tab = agent 实例本身**（输出流 + 输入区一体，输入区是实例的组成，不独立）。
- **文件 / git / 原型 = 项目级 inspection**（跟随当前聚焦实例所属项目；与桌面右栏、全局实例区统一项目级语义）。
- 切 tab = 切视图，非「隐藏输入区」：inspection 视图本无输入区，回输出才有。

### ‹ › 悬浮切实例

输出区左右边缘悬浮 ‹ ›（absolute overlay，不占布局、半透明）：

- **语义**：切「当前聚焦实例」，tab 不重置（保持维度）。‹ › = 沿列表移动，tab = 关心维度，两者正交。
- **范围** = 进入实例前的列表里的**活跃实例**（项目总览进 = 该项目活跃实例；全局进 = 全局聚合活跃实例）；**不切历史 session**（历史 session 要点开 resume 成实例，是另一条路径）。顺序沿用列表排序（关注程度）。首尾 disabled。
- **inspection 跟随**：项目内切实例 = 同项目，inspection 不变；全局跨项目切 = inspection 换项目。
- **配横滑（辅助）**：输出区安全区横向滑切实例；按钮为主（发现性 + 避开 iOS 边缘返回 / 代码块横向滚冲突）。tab 切换只用点（不滑，避免与切实例手势冲突）。

### 路由模型（桌面 + 移动统一）

URL 编码语义核心，localStorage 编码个人布局：

- **桌面**：`/workbench/:scope/:focusId?`（scope = 项目 key 或 `global`，focusId = 聚焦面板实例）。栏收起 / 宽度 / panel 布局 / 右栏 tab 靠 `atomWithStorage` 进 localStorage。
- **移动**：两层路由
  - 一级：`/projects`（项目列表）/ `/global` / `/settings`
  - 二级：`/projects/:key`（默认总览）/ `/projects/:key/files|git|prototype`
  - 实例：`/projects/:key/session/:id`（单实例聚焦，含输出/文件/git/原型 tab）；全局进 = `/global/session/:id`
- **数据模型统一**：桌面与移动共享同一 Project / Session / inspection state（TanStack Query + shared DTO），仅 URL 形态与布局呈现不同。

### 与桌面的映射

| 桌面 | 移动 |
|---|---|
| 左栏顶层（项目/全局/设置） | 一级底部 tab |
| 项目内实例区 + 右栏 inspection | 二级 header tab（总览/文件/git/原型） |
| split 并排多实例 | 单实例聚焦 + ‹ › 顺序切 |
| 右栏 inspection tab | 单实例 header tab 的文件/git/原型（项目级同内容） |

## 8. 与现有文档的关系

- 本文档**演进** [frontend-ui-architecture.md](./frontend-ui-architecture.md) 与 [console-shell.md](./console-shell.md) 的**桌面部分**：单列三层 → 三栏工作台。
- 移动端从三层单列演化为两层导航（见 §7）；[mobile-session-interaction.md](./mobile-session-interaction.md) 的 session detail 基线（非遮挡输入区、quick key）由 §7 单实例聚焦承接。
- [message-replay.md](./message-replay.md)、[claude2-provider-protocol.md](./claude2-provider-protocol.md) 等运行态/协议设计**不受布局重设计影响**，实例面板内部的消息渲染、回放管线沿用。
- 设计契约（配色/间距/圆角/safe-area/surface 角色 token）延续 [prototype/guidelines.md](./prototype/guidelines.md) 与 `shellSurfaceClasses`，重设计复用既有 primitive，不另起设计语言。
- 设计系统的唯一权威源已沉淀为 [DESIGN.md](./DESIGN.md)（Google DESIGN.md 格式）：配色/间距/圆角/safe-area/surface 角色 token 与 component variant 以其为标尺；本节的 primitive 复用约定对应 DESIGN.md 的 variants（`surface-*` / `nav-item-*` / `button-*`），Phase 3 起据此收敛。
- [prototype/guidelines.md](./prototype/guidelines.md) 的 token 已由 DESIGN.md 接管为权威，prototype HTML 本身（旧三层单列模型）已归档（见 [prototype/index.md](./prototype/index.md)），不再维护。

## 9. 待定项汇总（WIP）

布局重设计（桌面 + 移动）的剩余决策点，定型后从此处移除并补进对应章节：

- [ ] 原型 tab 功能（项目原型设计，具体功能待定）
- [ ] 插件槽 V1 是否引入 marketplace（倾向不做）
