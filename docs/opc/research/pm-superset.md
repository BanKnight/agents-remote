# Superset 产品调研（PM 视角）

> **状态**：调研完成。本文是 Superset（`superset-sh/superset`）从 PM 视角的独立产品分析，作为 agents-remote OPC 方向的**对照参考**——代表「worktree 并行路线」（每个 agent 一个 git worktree、并行跑同任务不同方案）的实现哲学。
> **用途**：与主选「组织化协作路线」（角色/任务/房间/看板/记忆）对照，回答「worktree 并行 vs 组织化协作，哪个更符合 OPC 心智」。
> **证据分级**：✅ 第一手（仓库 README / 官方 docs 源码 / GitHub API 元数据）/ 🔍 deepwiki（AI 从代码库生成，强二手）/ 🟡 二手（第三方文章、官方 compare 营销页）/ ⚠️ 推断。每条事实末尾标注。
> **关联文档**：[multi-agent-orchestration.md](./multi-agent-orchestration.md) §3.5（对照路线，记录薄）· [multi-agent-prd.md](../design/multi-agent-prd.md)（OPC PRD）。

---

## 1. 一句话定位

**Superset = 一个让开发者像「开车间」一样同时跑 10+ 个 AI 编码 agent 的桌面工作台**：每个任务一个 git worktree + 独立分支 + 独立常驻终端，agent 各自在隔离环境里改代码，用户像审同事的 PR 一样对比 diff、挑赢家、合并。它不做「团队管理」，做「并行工人管理」。✅

---

## 2. A. 根本使用场景

### 核心场景：同任务、多方案、并行赛跑（Race Agents on One Task）

这是 Superset 官方 recipes 的旗舰场景，一句话：**你拿不准哪个方案/哪个 agent 能做对，与其串行试错，不如并行跑三份，审三份 diff，挑赢家。** ✅

完整用户旅程：

1. **一个开发者，一个仓库，几件并行的活**：一个 feature、一个 bugfix、一个 PR review。传统做法是 `stash-checkout-rebuild` 来回切分支（每次切都丢上下文、烧时间），或者对着一个 agent 串行 `prompt → review → 发现问题 → 再 prompt`（烧 token、烧耐心）。✅
2. **⌘N 三下建三个 workspace**：每个 workspace 就是一个隔离 git worktree（独立目录 + 独立分支 + 独立终端 + 独立端口）。同一个 prompt 原样复制三份，分别派给 Claude Code / Codex / OpenCode——**或者同一个 agent 跑三次也行，纯靠 agent 输出的方差就值得赛**。开着 Auto-run，每个 agent 立即开跑。✅
3. **人去干别的**：侧边栏 activity strip 显示每个 workspace 谁在跑、端口开没开、分支领先/落后多少；agent 干完响一声，dock 图标亮个角标。**节奏是「撒出去、离开 app、有事才叫你」**，不是盯着终端看。✅
4. **挑赢家**：先读每个 agent 的最终自报消息（prompt 结尾就要求 agent「列出改过的文件和取舍」），把误解任务的直接淘汰；再看 diff——**优先挑「最小且完整」的 diff**；在赢家终端里跑一遍测试再 push。✅
5. **收尾**：赢家 commit + push + Create PR；删掉败者 workspace 前**快速 skim 它们的 diff，把赢家漏掉的好点子手工抄走**，再删除。✅

### 场景变体（同一个模型的不同摆法）

- **Two approaches（同 agent 两个方向）**：拿不准用 middleware 还是 decorator，就 prompt 一个 agent 朝一个方向各跑一个 workspace。✅
- **Fan-out 大重构**：moment → date-fns 这种 200 文件的重构，先让一个 agent 做「切片规划」（3-6 个能独立合入的 slice），再**每个 slice 一个 workspace 并行跑**，各自开小 PR——「大分支等着烂」变成「小 PR 快速合」。✅
- **Parallel workstreams（日常并行）**：功能 + bugfix + review 三件不相关的事，各占一个 workspace，切换是一下点击而非切分支。✅
- **Best-of-N 难 bug**：一个 bug 卡住一个 agent 时，三个全新尝试优于继续一个卡住的 session。✅
- **Nightly audit（定时跑）**：Automations 让 agent 凌晨 3 点做依赖安全审计，输出一个真实 workspace，用户早上起来只审一份 diff。✅

**一句话心智模型**（官方原话）：*delegate in workspaces, integrate through branches and PRs*——在 workspace 里派活，通过分支和 PR 收活。✅

---

## 3. B. 解决的痛点

每条 = 症状 + 为什么痛。

1. **一个仓库一次只能在一个分支上干活**（🔍）：切分支 = stash + checkout + rebuild，来回切丢上下文、每次都要重装依赖。痛点：上下文切换成本高到人宁可不并行。worktree 让 N 个 checkout 同时存在，切换变点击。
2. **agent 输出方差大，一次做不对**（✅）：同一个任务不同尝试、不同 agent 结果差很多。痛点：对着一个 agent 串行「prompt→review→发现错→再 prompt」既烧时间又烧 token。**并行跑 N 个尝试、审 N 份 diff，比串行迭代一个便宜**——官方 recipe 明说「reviewing three diffs is cheaper than iterating on one」。
3. **多个 agent 会互相踩**（✅）：两个 agent 改同一份工作副本，一个覆盖另一个。痛点：多 agent 并行不安全，人得盯死。worktree 隔离 = 每个 agent 有自己的目录和分支，物理上不可能冲突。
4. **关掉 app 就杀掉所有 agent**（🔍）：普通终端里跑的进程随窗口关闭而死。痛点：agent 要跑很久，人不能一直守着；关窗 = 白干。常驻 daemon 让终端会话活过 app 重启。
5. **agent 干完了没人知道**（✅）：同时跑 5 个 agent，谁停了、谁在等输入，靠人轮询终端才知道。痛点：并行规模被「注意力」卡死。生命周期钩子 + 完成提示音 + dock 角标把人从盯盘里解放出来。
6. **审 agent 的改动很费劲**（✅）：agent 改了什么，要另外 diff。痛点：没有内建审阅流，人得去终端 `git diff` 手工看。内置 diff viewer + 逐文件 focus mode 让「审一份 agent 产出」接近「审一个 PR」。
7. **worktree 命令行记忆负担**（🔍）：`git worktree add/list/remove` 是体力活，分支多了记不住。痛点：隔离的价值大，但操作摩擦让人不常用。⌘N 一键建、删 workspace 即删分支。
8. **定时维护没人做**（✅）：依赖更新、安全审计、TODO triage 白天永远排不上。痛点：人肉记着、手动跑，全靠自觉。Automations 让 agent 凌晨跑完，人只审结果。
9. **agent 之间没有协作通道**（⚠️ 推断，基于无 ACP/Nostr/消息总线）：多 agent 并行没问题，但要让一个 agent 接另一个的活，只能人手工或靠协调者 agent 读终端转发。痛点：需要团队协作的工作流（接力、依赖）落不了地——这是 Superset 有意留白，也是和 OPC 组织化路线的最大分野。

---

## 4. C. Feature list

分维度全列。每条一行，具体可点。

### 入口 / 产品面
- 桌面 app（Electron，macOS 为主，Linux 实验性 AppImage，Windows 未支持）✅
- CLI：单一 `superset` 二进制，管 workspaces / agents / terminals / automations / hosts ✅
- TypeScript SDK（`@superset_sh/sdk`，Node/Bun/Deno）✅
- MCP server：让 Claude Code/Codex/Cursor 等 agent 自己建 workspace 管任务 ✅
- iOS app 即将上线（手机上查 agent 状态）✅
- Remote workspaces：查看/操作另一台设备（Mac mini、VPS、共享沙箱）的 workspace，支持离线唤醒自定义命令 ✅

### 任务发起
- ⌘N 新建 workspace（从新分支 / 现有分支 / PR 三种来源）✅
- prompt-first 创建流程：写 prompt 即建 workspace，prompt 自动生成 workspace 名 ✅
- 可搜索的 prompt 历史，一键复用 ✅
- 分支名从 workspace 名自动 slugify（kebab-case）✅
- Auto-run command 开关：开 = agent 立即跑；关 = 暂存命令待确认（跨会话记忆）✅
- 从 Task 启动 agent：任务内容经 per-agent Task Prompt Template 变成 prompt ✅
- Slack / Linear 集成：从 Slack 消息、Linear issue 一键起 workspace ✅
- prompt 支持 markdown / `@file/path` 引用（限项目作用域）/ `:emoji:` / `/` 斜杠命令 ✅
- 从 CLI 批量创建（race / fan-out 一个 for 循环贴完）✅
- Import 已有 git worktree（单个 / 全量 import all）✅

### 并行方案
- 多 workspace 并行，官方称 10+ 无压力，repo 描述称 100+ ✅
- Race Agents：同 prompt 多 agent 并行，挑赢家 ✅
- Two approaches：同 agent 两个 prompt 方向（设计取向）✅
- Best-of-N：难 bug 三份全新尝试 ✅
- Fan-out：大重构按 slice 切片，一个 slice 一个 workspace，每片独立 PR 合入 ✅
- Rolling fan-out：保持 2-3 个活跃 slice，PR 合入后再起下一个 ✅
- 优先级调度：当前聚焦的 workspace 拿满资源，后台 workspace 逐步 hydrate（PrioritySemaphore）🔍
- 同 agent 多次跑，靠输出方差本身制造多样性 ✅

### worktree 管理
- workspace = git worktree + 独立分支 + 独立目录 + 独立终端 + 独立端口 ✅
- workspace 类型两种：`worktree` / `branch` 🔍
- 从 PR URL 起 workspace（解析 owner/repo/number，按标题/号搜索）✅
- 侧边栏 ahead/behind 状态（↑N 未 push / ↓N 落后需 pull）✅
- PR workspace 显示 review 状态、CI checks、部署预览链接 ✅
- 批量选择 workspace（⌘/Shift 多选）→ Move / Ungroup / Delete / Clear ✅
- 批量删除预览：标出 dirty / unpushed 才确认 ✅
- 每 workspace setup / teardown / run 脚本（`.superset/config.json`）✅
- 每 workspace 独立端口检测 + 内建浏览器预览 dev server ✅
- workspace 分组（sidebar 按 project 分组，可再建自定义分组）✅
- 删除 workspace = 删分支（触发 teardown script）✅

### 对比选择
- 内置 diff viewer：审 / 评论 / 编辑 agent 改动，不离开 app ✅
- Focus mode（target 图标）：逐文件快速过 diff ✅
- 最终消息先读，剔除误解任务的 agent，再进 diff ✅
- 「最小且完整」优先的挑赢家启发 ✅
- 赢家终端跑测试后再 push ✅
- 败者 diff skim + 选中复制好点子，再删 workspace ✅
- 侧边栏 activity strip：running agent / open ports 内联显示，持久跨重启 ✅

### 审批介入
- 内建 chat pane：agent 暂停提问、请求工具审批、请求 plan review 全部 inline ✅
- 消息类型一等渲染：PendingApproval / PendingPlanApproval / PendingQuestion ✅
- Sandbox access 审批：agent 要访问 workspace 外文件时 inline 批/拒 ✅
- 通知：agent finish / waiting for input 触发（声音可配）✅
- macOS dock 角标：未读活动 / 需注意的 workspace ✅
- 用户是唯一 merge 决策者，无自动合入 ✅
- commit / push / Create PR 从 diff viewer 直接发起 ✅
- 冲突处理建议：把 main 合进 agent 分支而非反向；可派 agent 规划 merge conflict 解法 ✅

### 集成
- 任意 CLI agent（"If it runs in a terminal, it runs on Superset"）✅
- 14+ 内置 agent presets：Claude Code / Codex / Amp / Gemini / OpenCode / Copilot / Grok / Kimi Code / Mistral Vibe / Pi / Polygraph / Cursor Agent / Droid / Mastra Code ✅
- GitHub：`gh` 可选（解锁 PR 工作流），自动探测 githubOwner ✅
- IDE 一键交接：Cursor / VS Code / JetBrains / Xcode ✅
- Providers：OpenRouter / Bedrock / Vertex / Vercel AI Gateway（BYOK）✅
- Slack 集成：Slack 消息 → workspace ✅
- Linear 集成：issue 同步进 Tasks 视图 ✅
- 内置 chat：模型选择器 + thinking level（Off/Low/Medium/High/Max）✅
- 模型选择器 + reasoning effort 在 launch agent 时选 ✅

### 配置
- Settings → Agents：per-agent command（无 prompt）/ command（有 prompt）/ prompt suffix / task prompt template / model override / enabled 开关 / reset ✅
- Settings → Keyboard Shortcuts：全部动作可重映射（⌘/）✅
- 自定义主题文件 ✅
- Terminal presets：保存 agent/shell 布局一键开 ✅
- 全局 / 项目级分支前缀（防命名冲突）✅
- 项目级配置覆盖（setup scripts 可 override/skip）✅
- Automations 配置：RRule 定时 + 目标 device + 目标 project + agent ✅

### 观察 / 调度
- Agent 状态检测：安装 lifecycle hooks + command wrappers 进 agent 配置（`~/.superset/bin`、`superset-hooks`）✅
- 状态检测局限：只有经 Superset 启动的 agent 才有状态；不同 agent 支持度不同（Claude Code 报 finished + waiting，部分 agent 只有完成）✅
- Automations：定时跑 agent，输出 = 真实 live workspace，可打开继续交互 ✅
- Automation run 状态：dispatched / skipped(offline) / dispatch failed，可 Retry / Run now ✅
- Automation 局限：at-least-once（prompt 要幂等）、v1 无完成追踪、离线 host 静默跳过 ✅
- `superset:standup` skill：扫 workspaces/tasks/agent 终端成 digest（谁需要你 / 在跑 / 卡住）✅
- `superset:orchestrate` skill：把当前 agent 变成并行 worker 的协调者（见 §7）✅
- Tasks 视图：Linear / GitHub Issues 同步 + 语义搜索 + 表格过滤排序 ✅
- Pull requests 视图：列出各 repo PR + 过滤 + 详情 ✅
- Command palette（⌘K）：搜 workspace / action / setting ✅

---

## 5. 核心概念

- **Project**：注册进 Superset 的一个 git 仓库（本地目录或 Git URL 克隆）。一切发生在 project 内。✅
- **Workspace**：隔离的 git worktree + 自己分支 + 自己目录 + 自己终端 + 自己端口。**「任务」没有独立实体，一个 workspace 就当一个任务用**；workspace 便宜、一次性——⌘N 建、合完删。✅
- **Worktree**：git 的原生能力（同一仓库的多个 checkout），Superset 把它变成一等用户概念，替你管了所有 `git worktree` 的簿记。✅
- **Terminals**：每 workspace 常驻终端，session 活过 app 重启——这是能安全跑 5 个 agent 的前提。✅
- **Agents**：任意 CLI 编码 agent（Claude Code/Codex/OpenCode/…），Superset 不碰模型流量，prompt/token 直连你自己的 provider 账号。✅
- **Devices**：workspace 实际落在哪台机器上跑（本机 / 远程 host / VPS）。Remote workspaces + Automations 都围绕 device 概念。✅
- **Parallel / Variant / Compare**：⚠️ 这三个词**都不是一等数据实体**。Parallel 是「多 agent 各自独立 worktree 同时跑」这一能力的名字 🔍；Variant 是用户用 N 个 workspace 跑同任务不同方案的**产物**（官方把它当 recipe 模式而非类型）✅；Compare 就是内置 diff viewer + 侧边栏状态 ✅。**没有「方案」实体、没有「对比」视图的专门抽象**——对比发生在 git 层，靠用户审 diff。

---

## 6. 状态哲学（重点章节）

### 状态焊在哪：git worktree + 分支 + 常驻终端进程，三者叠加

Superset 的状态哲学可以用一句话概括：**没有集中式任务状态机，状态 = git 分支 + 终端进程 + 数据库元数据 三件事拼出来的。** 🔍

- **每个 agent 的「产出」= 一个分支上的 diff**（✅）。worktree 是 git 原生隔离，agent 改动的全部状态就落在「这个 workspace 的分支 vs main」的差异里。审查、合并、丢弃都是 git 操作。
- **每个 agent 的「执行」= 该 workspace 的常驻终端进程**（🔍）。daemon 持有活跃 session 的权威态，app 重启时 reconcile：活的保留、孤儿（workspace 已删）杀掉。终端 scrollback 落盘 `scrollback.bin` + `meta.json`（冷恢复：unclean shutdown 后读回只读模式，可「Start Shell」续上）。🔍
- **「元数据」= 本地 SQLite + PostgreSQL（ElectricSQL 同步层）**（🔍）。projects/workspaces/worktrees/settings 等元数据落库；tasks/githubPullRequests/agentCommands/chatSessions 等经 ElectricSQL 实时同步。权威源在 PostgreSQL，tRPC 写、Electric 推回客户端。🔍

### 换方案 / 换任务 / 换 agent 各意味着什么

这是理解它哲学的关键——**所有「切换」都在 workspace 层发生，且互不干扰**：

- **换方案** = 切 workspace/tab（✅）。每个 workspace 保留自己的进度，切换不丢任何东西。同一个任务的两个方案就是两个 workspace 两个分支，切过去看那个 agent 的 diff 即可。没有「当前方案」这种全局态。
- **换任务** = ⌘N 建新 workspace（✅）。旧 workspace 原样保留，agent 继续跑或暂停。任务与任务之间物理隔离（不同目录/分支），天然不串。
- **换 agent** = 通常是建新 workspace 派给另一个 agent（⚠️ 推断）。因为每个 workspace 跑一个 agent，agent 不是「可重新接线的资源」，而是绑在 workspace 生命周期上的。想换 agent 继续同一任务 = 新建 workspace 用 `--resume`/现有分支续（worktree 从现有分支建就是这个语义）。✅
- **删 workspace** = 杀 agent + 删分支 + 触发 teardown script（✅🔍）。state 是否保留完全取决于 teardown 脚本——容器卷删不删、环境清不清。**没有「归档」抽象**，删除即决策终局。

### 深挖：这套哲学的长处与边界

**长处**：
- **上下文污染免疫**（✅）。每个 agent 的上下文（CLI session 文件、终端 scrollback、工作目录）天然隔离在各自 worktree/终端里。并行 N 个 agent 零协调成本，不存在「A 看到 B 的中间状态」问题。这是组织化协作路线要花大力气解决的（共享白板、串行 turn 队列），在这里是物理上免费送的。
- **产出即 git**（✅）。每份 agent 产出天然是可审、可合、可弃的分支 diff。验收语义 = git 合入，不需要额外抽象。

**边界**：
- **没有任务级状态机**（✅🔍）。Task 实体存在（tasks 表），但它主要是「从 issue 同步来的工作项 + 启动 agent 的入口」，没有依赖图、没有状态流转审批门控、没有 parent/child。一个「团队协作工作流」（A 的产出喂给 B、前置任务完成才唤醒后置）落不了地。⚠️ 推断。
- **没有 agent 间通信**（✅🔍）。无 ACP/Nostr/消息总线。agent 之间零连接，唯一的「协作」通道是 coordinator agent 通过 CLI 读终端 + 发 follow-up（见 §7）——这是临时协调，不是持久结构。
- **agent 身份不跨 workspace**（⚠️ 推断）。没有统一的 agent registry / 角色抽象。agent 是「跑在终端里的 CLI」，不是「带记忆和身份的员工」。

---

## 7. 派活与编排交互

### 用户怎么下达任务

最直接的派活 = 在 workspace 终端里跑 `claude "Add error handling to fetchUser"`，或 ⌘N 弹出 prompt-first 流程：写 prompt 即建 workspace 即派活（✅）。从 Task 视图点一个 issue 也能启动 agent，任务内容变成 prompt（✅）。

### 多 agent 并行怎么协调：两个层次

**层次一：用户当协调者（手工）**。用户建 N 个 workspace、派 N 个 prompt、看状态、逐个审。这是默认用法，官方 recipes（race / workstreams / fan-out）全是这个模式。**协调发生在用户大脑里，工具只保证隔离和可见性**。✅

**层次二：一个 agent 当协调者（`superset:orchestrate` skill）**。这是 Superset 唯一的结构化编排：把用户正在对话的那个 agent 变成「coordinator」，由它通过 Superset CLI 协调一堆 worker：✅
- `superset workspaces create`：每 worker 一个隔离分支；
- `superset agents create`：每个 worker 起一个「有界 prompt」的 agent；
- `superset terminals read/send`：协调者监控 worker 输出、投递 follow-up 或依赖结果；
- worker 结束时回传结构化 completed / blocked 消息，协调者验证后再集成。

**适用边界**（官方明说）：fan-out 是机械的（许多相似 slice、清晰验收标准、结果可被测试验证）才适合交给协调者；**要逐步审的工作，用上面的手工 recipes**。✅ 协调者可以是 Claude Code 或 Codex，worker 可以是任何 agent 混搭。✅

### 有没有 agent 间通信

**没有直接的 agent-to-agent 通信**（✅🔍）。唯一的「协作」是 coordinator 经 CLI 读/写 worker 终端——单向、串行、临时。**没有共享消息总线、没有事件广播、没有共享状态源**。agent 间传递上下文只能靠：coordinator 转发、或用户手工（race 败者 skim + 抄 diff）。⚠️ 推断（基于无消息总线架构）。

### 定时派活

Automations：建一个「prompt + RRule 定时 + 目标 device + 目标 project + agent」，到点在一个真实 workspace 里跑 agent，输出可打开继续。这是「agent 自主推进」的雏形，但**只到「跑一次」为止——没有依赖链、没有跨 run 状态、没有完成追踪**（v1 只到 dispatched，开 workspace 才知道结果）。✅

---

## 8. 记忆与上下文

- **并行 agent 的上下文互相隔离**（✅）：每个 agent 的 CLI session（对话记忆）+ 终端 scrollback + 工作目录全在各自 workspace 里，物理隔离。
- **没有跨 agent 共享记忆**（✅🔍）：无共享白板、无共享消息日志、无中央上下文源。这和组织化路线的「单一共享状态源 + 串行轮次 + 检查点压缩」三件套**正好相反**——Superset 靠物理隔离避免共享，组织化路线靠共享源 + 串行化避免冲突。
- **没有跨任务记忆的产品化抽象**（⚠️ 推断）：没有向量检索、没有检查点压缩、没有记忆层。跨 workspace 的「记住上次的结论」只能靠 git 本身（分支携带历史）+ 手工。terminal scrollback 的持久化是「冷恢复」不是「记忆」——它是防崩溃，不是上下文累积。🔍
- **平台能力注入**（✅）：agent 启动时被装进 `superset:*` skills（orchestrate / automate / standup / doctor / feedback…），由 app 在 launch 时写进 `~/.claude/skills/` 等发现路径、自动更新、不碰用户自己写的文件。这是「平台能力契约」注入——类似组织化路线里「[Base] 平台层」的定位，是唯一跨 workspace 统一的「记忆」（它不在每个 workspace 内，在 agent 环境配置里）。

---

## 9. 审批与介入

- **用户是最终审稿人，没有自动 merge**（✅）。流程：agent 完成 → 通知 → 打开 Changes tab → diff viewer 审 → commit/push/Create PR → 合入或删 workspace。**「审批」没有专门的状态机**，就是「人看 diff + 决定合不合」。✅
- **中途介入是实时的**（🔍）：用户对每个 workspace 有直接终端访问——可实时观察、打断、重定向、发反馈。介入发生在终端层，不在「卡片层」（没有看板卡片可操作）。🔍
- **Inline 审批在 chat pane 内**（✅）：agent 暂停提问 / 请求工具审批 / 请求 plan review，都在聊天面板内完成，有专门消息类型渲染。这是「agent 提案 + 人审批」循环的最细粒度。✅
- **Sandbox access 审批**（✅）：agent 要访问 workspace 外文件时，inline 请求授权，批/拒都在 chat 里。
- **挑赢家启发**（✅）：先读最终自报消息剔除误解任务的 → 最小且完整的 diff → 赢家跑测试 → 败者 skim 抄好点子。这套「启发」是产品文档级别的选型方法论，不是工具强制。
- **无配置化的审批门控**（⚠️ 推断）：没有「合入前必须 N 人审批」「强制 review 阶段」这类 policy 配置。审批粒度 = 用户在 diff viewer 里做决定。

---

## 10. 执行与持久

- **worktree 跑在哪**：本机（默认）或远程 host（Mac mini / VPS / 共享沙箱），通过 Remote workspaces 从任意设备查看操作。✅
- **每个 agent 的环境形态**：CLI agent 在 workspace 终端（PTY）里跑，完全用你自己的账号/订阅，Superset 不碰模型流量。✅
- **setup 脚本**：每建新 workspace 跑 `.superset/config.json` 的 setup（装依赖、拷 env、起 dev server）——**只有 git-tracked 文件被 worktree 复制，其余环境全靠 setup 脚本**。✅
- **状态持久三件套**：终端进程由常驻 Terminal Host Daemon 持有（Unix socket `~/.superset/terminal-host.sock`，NDJSON 通信）🔍；scrollback 落盘（5MB cap）冷恢复🔍；元数据落 SQLite + PostgreSQL/ElectricSQL 🔍。
- **app 重启不杀 agent**（✅）：daemon 独立于 app 进程，重启后 reconcile，活的 session 重新挂上。这是「跑 5 个 agent 时关 app 也安全」的保证。
- **agent 生命周期 = workspace 生命周期**（✅）：删 workspace 杀 agent；workspace 不删 agent 常在。agent 不是按需起停的池，是「绑在环境上的常驻工人」。

---

## 11. 商业模式与定位

- **开源形态**：Elastic License 2.0（source-available）——完整源码在 GitHub，可用/改/自托管，**唯一禁止是把 Superset 重新打包成服务卖给别人**。✅
- **价格承诺**：桌面 app **永久免费**，「在自己机器上并行跑 agent 永不收费」，收费只会是可选增值服务。✅
- **面向谁**：个人开发者 / 小团队，本地优先（"local-first: your code never leaves your machine unless you say so"），macOS 为主。✅
- **与 Orca 的关系（重点澄清）**：
  - **不是同源**：`superset-sh/orca` 不存在（GitHub 404）✅；Superset 仓库内与 docs 中无任何 Orca 提及（deepwiki 全库搜不到）🔍。Orca 是另一家公司的独立项目——`stablyai/orca`（Stably AI），MIT 协议，2026-03-17 创建，GitHub 42,960 stars。✅
  - **两者是同一赛道的直接竞争者**：都做「agent-agnostic + worktree-per-task 的并行 agent 工作台」（ADE / agent workspace）。🟡 官方 compare 页把 Orca 列为同类：「Free desktop workspace for parallel agents — Agent-agnostic (25+) — Git worktree per task — Fewer remote/automation surfaces」。🟡
  - **时间线**：Superset 更早（2025-10-21 创建，12,868 stars），Orca 更晚（2026-03）但星数 3.3 倍。✅
  - **产品侧重差异**：Superset 卖「更全的 surface」——automations、remote workspaces、skills、MCP、CLI/SDK、内建 diff viewer；Orca 卖「免费 + 更轻 + mobile app + Computer Use（agent 可操作桌面 app）+ 25+ agent」。🟡
  - **对既有调研的校正**：`multi-agent-orchestration.md` §3.5 把「Orca / Superset」并作一条路线（worktree 并行）——**哲学同构是对的，但它们是竞争产品而非同源继承**。做对照时两者可以合并视为「worktree 并行路线」的两个代表，但商业关系上互不隶属。

---

## 12. 对 OPC 多 agent 编排的启示

对照 `../design/multi-agent-prd.md`（角色 / 任务 / 房间 / 看板 / 记忆）逐个看 Superset 印证了什么、挑战了什么、漏了什么。

### 印证（Superset 替我们验证了正确的东西）

1. **「结果物 = 可合入的 git diff」是最强的验收语义**（✅）。Superset 每个 agent 的产出都是一份分支 diff，天然可审、可合、可弃。**OPC 的「任务输出」应该落成「分支 / PR」**——比看板卡片更接近「真正能合入代码」。组织化路线容易把「任务完成」做成卡片状态流转，Superset 提醒我们：**完成的判据应该是 git 合入，不是状态翻转**。⚠️ 推断（对我们产品的迁移）。
2. **并行规模的上限是「注意力」不是工具**（✅）。官方 recipe 反复讲「撒出去、有事叫你」——侧边栏状态、完成通知、dock 角标把人的注意力从「盯进程」解放到「只审产出」。**OPC 的看板/通知设计应以「不盯着也能放心」为标准**。
3. **用户要「挑赢家」这个决策模式**（✅）。Race agents 证明「多方案并行 → 快速挑赢家」是开发者真实高频需求。**OPC 看板可以吸收「多方案并行」作为一种高级任务类型**（一个 goal 下 N 个 agent 出 N 份方案，人挑一个进 review），这是组织化路线里没显式覆盖的决策模式。⚠️ 推断。

### 挑战（worktree 并行路线的天花板 = 组织化路线要解决的问题）

1. **「并行」和「协作」是两件事**。Superset 把并行做到极致（物理隔离、零协调成本），但**协作完全留白**：无 agent 间通信、无共享上下文、无依赖图、无角色、无审批门控。它的协作只靠两个临时通道——人（手工转达）和 coordinator agent（CLI 转发终端输出）。**OPC 要的是「管一个团队」，Superset 是「管一群互不认识的工人」**——工人之间唯一的连接是老板。⚠️ 推断（基于无消息总线的架构）。
2. **状态焊在机器物理状态上，不可搬**。worktree + 终端进程 + daemon 是本地优先的答案；「任务状态」「agent 身份」都不是一等实体。OPC 若选这条路，等于把「团队管理」全部做成 git 操作 + 终端进程管理——没有看板、没有角色、没有记忆，**扩到「高管团 + 执行团队」的心智模型无处安放**。✅
3. **agent 是消耗品不是员工**。agent 绑 workspace 生命周期、无跨任务身份/记忆。OPC 的「角色」（CTO / 研究员）需要一个有记忆、可复用的身份资源，而 Superset 的 agent 每次都是新起一个 CLI。✅

### 盲点（Superset 暴露、OPC 要补的设计）

1. **coordinator agent 是组织化路线的「最小编排」雏形**。`superset:orchestrate` 证明「一个 agent 当协调者、经工具驱动一批 worker、读回结构化完成/阻塞消息」是可行的——这正是 Paperclip「leader 带团队」的轻量版。**OPC 可以借这个形态：先做「协调者 agent + 工具集」，再升级成正式的任务/角色实体**。✅
2. **fan-out 切片规划是「拆任务」的具体方法论**。大重构先让 agent 做「3-6 个可独立合入的 slice」再并行——这是 OPC「拆任务下发」的可复用配方：**切片边界 = 文件边界，切片可独立合入，重叠就合并**。✅
3. **自动化的「输出 = 可打开的真实 workspace」**。Superset 的 automations 不给「任务完成」的结果报告，而是给一个「能打开继续交互的 workspace」——**把「结果」做成「可继续的现场」** 是很强的产品选择，OPC 的定时任务可借鉴（不是汇报完成，是留一个活现场）。✅

### 对照结论：worktree 并行 vs 组织化协作

| 维度 | worktree 并行（Superset/Orca） | 组织化协作（OPC 主选） |
|------|------|------|
| 并行的成本 | 物理隔离，零协调成本 | 需共享状态源 + 串行化防冲突 |
| 协作能力 | 无 agent 间通信，靠人/coordinator 转达 | 角色 / 任务 / 房间 / 看板 / 记忆全有 |
| 状态 | 焊在 git 分支 + 终端进程（机器态） | 焊在任务 / 角色 / 房间（业务态） |
| 心智 | 管一群工人（并行 + 审 diff） | 管一个团队（方向 + 派活 + 盯进度 + 拍板） |
| 产出 | 可合入的 git diff（天然强验收） | 卡片 + 状态流转（需补 git 验收语义） |
| 上限 | 卡在「用户注意力」——方案多了审不过来 | 卡在「编排复杂度」——需要把协作做对 |

**结论**：**组织化协作更符合 OPC 心智**（一个人像管团队一样管 agent，需要角色/任务/看板/审批门控/共享记忆——Superset 全没有）；但 **worktree 并行不是要抛弃的，而是组织化协作的「执行层」最优隔离机制**。两者不是二选一，是两层：OPC 的任务下发落地成「一个任务 = 一个隔离执行环境（worktree 或等价的隔离目录）+ 一个 agent」，用 worktree 的隔离免费获得「上下文不污染」；组织化协作负责「谁做什么、做完了没有、给谁审批、记忆怎么共享」。**Superset 证明的是隔离层，组织化路线要补的是协调层**。⚠️ 推断（综合以上证据的判断）。

**对 agents-remote 的直接落点建议**：
1. 任务输出语义对齐「分支/PR」——OPC 的 `OrchestrationTask` 完成判据 = 可审的 diff，不是状态机翻转。⚠️
2. 吸收「多方案并行（race）」为看板的一种任务类型（goal 下 N 个 agent 各出方案 → 人挑赢家）。⚠️
3. 组织化路线的执行环境用隔离目录/workspace 语义（复用现有 Project-scoped 隔离），把「上下文隔离」从「靠串行化协调」里解耦出来——这是 Superset 最便宜也最值得抄的资产。✅

---

## 13. 证据分级与来源

**图例**：✅ 第一手（仓库 README / 官方 docs 源码 / GitHub API 元数据）/ 🔍 deepwiki（AI 从代码库生成，强二手）/ 🟡 二手（第三方文章、官方 compare 营销页）/ ⚠️ 推断。

| 事实 | 级别 | 来源 |
|------|------|------|
| Superset 定位、features、支持 agent 列表、license、价格承诺 | ✅ | 仓库 `README.md`（raw.githubusercontent） |
| 五概念模型（Project/Workspace/Terminals/Agents/Devices）、心智模型 | ✅ | `apps/docs/content/docs/superset-model.mdx` |
| 一句话定位、local-first、「永不收并行费」 | ✅ | `apps/docs/content/docs/overview.mdx` |
| Race / workstreams / fan-out / nightly-audit / agent-driven recipes 全文 | ✅ | `apps/docs/content/docs/recipes/*.mdx`（含挑赢家启发、切片规划、幂等 prompt 规则） |
| Automations 机制（RRule、run 状态、at-least-once、无完成追踪） | ✅ | `apps/docs/content/docs/automations.mdx` |
| Agent 状态检测（hooks/wrappers）、通知、dock badge、sandbox access | ✅ | `apps/docs/content/docs/agent-integration.mdx`、`agent-status.mdx` |
| Skills 系统（superset:* skills、自动注入、不碰用户文件） | ✅ | `apps/docs/content/docs/skills.mdx` |
| Agent Orchestration（coordinator 经 CLI 协调 workers） | ✅ | `apps/docs/content/docs/orchestration.mdx` |
| Tasks & PRs、diff viewer、workspace 管理、setup scripts | ✅ | `apps/docs/content/docs/tasks.mdx`、`workspaces.mdx` 等 |
| workspace = worktree + branch + 终端 + 端口；Import worktree；批量删除 | ✅ | `apps/docs/content/docs/workspaces.mdx` |
| daemon（Unix socket、Terminal Host Daemon、PrioritySemaphore、冷恢复 scrollback.bin/meta.json 5MB） | 🔍 | deepwiki（`superset-sh/superset`，Terminal System / DaemonTerminalManager） |
| ElectricSQL + SQLite + PostgreSQL 权威源、同步 collections | 🔍 | deepwiki（Data Synchronization / ElectricSQL Collections） |
| tasks/githubPullRequests/agentCommands 表、chat 消息类型（PendingApproval 等） | 🔍 | deepwiki（Tasks & PRs / AI Chat Integration） |
| 「parallel」= 能力非实体；「variant」非一等概念 | 🔍⚠️ | deepwiki core concepts + recipes（recipe 把 variant 当模式） |
| 无 agent 间通信 / 无消息总线 | 🔍⚠️ | deepwiki 全库无 ACP/Nostr 提及 + 架构一致性推断 |
| 仓库元数据（stars/创建时间/license/描述） | ✅ | `gh repo view` GitHub API |
| Orca 元数据（stablyai/orca，MIT，42.9k stars，2026-03） | ✅ | `gh repo view` GitHub API |
| Superset 与 Orca 是竞争关系非同源 | 🟡 | 官方 compare 页 `superset.sh/compare/best-agentic-ide` + GitHub API（superset-sh/orca 404） |
| Orca 产品细节（worktree-per-task、computer use、agent 可驱动 Orca） | 🟡 | Top AI Product 文章（标注 AI 生成）+ 知乎/CSDN 文章 |
| OPC 启示与对照结论 | ⚠️ | 综合以上证据的 PM 判断 |
