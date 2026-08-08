# 插件（Plugin）扩展体系：skill + mcp × 全局 + 项目

> 调研日期 2026-08-08。目标：把 agents-remote 的扩展能力从「只有 skill、只有全局层」演进为统一的**插件（plugin）入口**——插件 = skill + mcp 两类扩展 × **全局 + 项目**两层作用域。agent 实例消费全局+项目合并结果（CLI 原生合并，不做管理）。
>
> 状态：**方案蓝图已对齐**（用户拍板 7 项决策），**实现前两项调研已闭环**（`claude mcp` 命令行为、`npx skills` 更新机制，见 §实现前调研结论）。下一步可据此出分阶段实现计划。本文是决策 + 设计蓝图沉淀，承接 [skill-marketplace.md](./skill-marketplace.md)（skill 市场调研）与 [mcp-hub-positioning.md](./inbox/mcp-hub-positioning.md)（MCP hub 定位）。

## TL;DR（结论先行）

- **统一模型**：扩展 = **插件**，插件内分 **skill**（知识/行为）与 **mcp**（能力/工具）两类；作用域分 **全局（user scope）** 与 **项目（project scope）** 两层。agent 实例 = 全局 + 项目合并生效（Claude Code CLI 原生就合并 skill 与 mcp 的两层 scope，agents-remote 只补「管理入口」）。
- **全局插件入口**：现有 `/skills` 页演进为「插件」页，顶部 Skill / MCP 两个子区。Skill 子区增强版本化（可更新徽标 + 一键更新）+ 源管理扩展 local/git 源；MCP 子区新增全局 MCP server 增删改。
- **项目插件入口**：项目工作区新增「插件」tab（与 Files/Git/Terminal 平级），同样 Skill / MCP 两个子区，管理项目级配置。
- **MCP 管理机制（已拍板）**：wrap `claude mcp` CLI（user/project scope），对称于 skills 的 wrap `npx skills`。未来加新 runtime 再评估自研注册表 + `--mcp-config` 注入。
- **MCP 来源/发现（已拍板）**：第一版只做增删管理，架构上留发现扩展点；不做市场发现。
- **内部/官方 skill/mcp（已拍板）**：agents-remote 官方能力（如 ar-hub 的 wiki）等本蓝图做完后再考虑如何呈现。
- **技能版本化（已拍板）**：第三方技能显示来源 + 「有新版」徽标 + 一键更新；**手写技能也要可更新**——通过给本地技能挂源（local 目录 / git 仓库即源），同一套版本/更新机制覆盖。

## 决策记录（已对齐，勿重开）

以下决策经 AskUserQuestion 与用户确认，实现时作为约束：

| # | 决策点 | 结论 |
|---|--------|------|
| D1 | 全局 MCP 管理机制 | **wrap `claude mcp` CLI**（user/project scope）。未来新增 runtime 时再评估自研注册表 + `--mcp-config` 注入（方案 2） |
| D2 | MCP 来源/发现 | **管理 + 预留发现扩展点**。第一版只做增删管理，架构上留发现源接口，后续再接 MCP 目录 API（glama/mcp.so 等） |
| D3 | 内部技能管理 | 指**全局技能版本化**：新开项目即共享（全局锁清单）。agents-remote 官方 skill/mcp 等本蓝图做完后再思考 |
| D4 | 入口层级 | **全局 + 项目两处管理入口**。agent 实例只消费合并结果，不管理 |
| D5 | 技能版本化可见形态 | 第三方技能：来源 + 「有新版」徽标 + 一键更新；手写技能标「本地」、无更新按钮 |
| D6 | 手写技能可更新 | 给手写技能**挂源**（local 目录即源 / git 仓库即源，两类都支持），统一一套版本/更新机制 |
| D7 | 项目插件入口位置 | **项目工作区 tab**（与 Files/Git/Terminal 平级） |

## 现状盘点（为什么需要这个蓝图）

### Skill —— 只有全局层，无更新、无项目层

| 能力 | 现状 | 缺口 |
|------|------|------|
| 市场发现 | `/skills` discover tab → skills.sh `/api/search` | ✅ 已有 |
| 已装列表 | `/skills` manage tab → 自扫 `~/.claude/skills/`（FS 直读 SKILL.md frontmatter，~0.1s，混合路线） | ✅ 已有 |
| 安装/卸载 | wrap `npx skills add/remove --global`（exit code 判成败 + `list --json` 回读） | ✅ 已有 |
| 装后生效 | 遍历活跃 session 发 `/reload-skills` → CLI reload → 广播 `skill_catalog_changed` | ✅ 已有 |
| 源管理 | `/skills` sources tab → GitHub repo 源（`SkillSource {repo, branch?, label?}`，存 settings.yaml） | ✅ 已有 |
| **更新** | ❌ 未接（`npx skills update` 未 wrap） | **待补（D5/D6）** |
| **项目级 skill** | ❌ 未接（npx skills 支持 project scope，但 UI/API 无） | **待补（D4/D7）** |
| 手写技能管理 | 已装列表能列出，但无编辑/删除/版本化 | **待补（D6）** |

关键复用点（skill-marketplace.md §5.3/§6 已确认）：
- 装进 `~/.claude/skills/<name>/` 即被现有 slash 菜单 catalog 看到；装后发 `/reload-skills` 触发闭环。**无需新写扫描逻辑**。
- `parseFrontmatter`、Markdown 预览组件、PROJECTS_ROOT 安全模型均有现成范式。

### MCP —— 只有内部 hub，无外部管理、无管理 UI

| 能力 | 现状 | 缺口 |
|------|------|------|
| 内部 hub | 自研 MCP server（`mcp-hub-server.ts`，绑 127.0.0.1:43013，无状态 Streamable HTTP），唯一能力域 `wiki` | ✅ 已有（定位见 mcp-hub-positioning.md） |
| 注入管线 | `mcp-injector.ts` 按 provider 构造 `--mcp-config` inline JSON（`ar-hub` HTTP），spawn 时注入 | ✅ 已有 |
| 项目级能力开关 | 项目 `.agents-remote/mcp.json` 的 `capabilities`（wiki on/off） | ✅ 已有 |
| **外部 MCP 管理** | ❌ 无。Claude Code 原生 user/project MCP 由 CLI 自己管，agents-remote 刻意不加 `--strict-mcp-config` 让其并存 | **待补（D1/D2）** |
| **MCP 管理 UI** | ❌ 无 | **待补（D1/D2）** |

关键事实（mcp-hub-positioning.md 已确认）：
- **「外部 MCP 对接」= 配置管理者**：用户填外部 server URL/命令，agents-remote 管理配置。用户拍的 wrap `claude mcp` 正是这个角色的落地。
- **不加 `--strict-mcp-config`**：hub 与 agent 现有 MCP 配置并存，工具列表是合集。wrap `claude mcp` 管理的配置就是 agent 原生配置，天然兼容。
- **内部 hub vs 外部 MCP 不冲突**：内部 hub（ar-hub，wiki/browser）继续走注入管线；外部 MCP 走 `claude mcp` 原生配置。两者并存。

### agent 实例 —— 合并是 CLI 原生，非 agents-remote 要做的

- **skill**：Claude Code 自动合并 `~/.claude/skills/`（user）+ 项目 `.claude/skills/`（project）+ plugins + builtin（`claude2-slash-commands.ts` `resolveSkillSlashCatalog` 扫 4 源）。
- **mcp**：Claude Code 自动合并 user scope（`~/.claude.json`）+ project scope（项目 `.mcp.json`）+ enterprise。
- 结论：**「全局+项目合并」是 CLI 原生能力**，agents-remote 只需保证「配置落在 CLI 会读的地方」，不需要自建合并逻辑。

## 核心模型

```
插件（Plugin）= 扩展入口
├── skill（知识 / 行为）
│   ├── 全局（user scope）：~/.claude/skills/    ← 现有 /skills 演进
│   └── 项目（project scope）：项目 .claude/skills/   ← 新增
└── mcp（能力 / 工具）
    ├── 全局（user scope）：~/.claude.json       ← 新增（wrap claude mcp user）
    └── 项目（project scope）：项目 .mcp.json     ← 新增（wrap claude mcp project）
        ↑
agent 实例 = 全局 + 项目合并生效（CLI 原生，不管理）
```

### 作用域对照表

| | 全局（user scope） | 项目（project scope） |
|---|---|---|
| **Skill** | `~/.claude/skills/`（现有 skills.sh/npx skills） | 项目 `.claude/skills/` |
| **MCP** | `~/.claude.json`（wrap `claude mcp` user scope） | 项目 `.mcp.json`（wrap `claude mcp` project scope） |

### 与 ar-hub（内部 hub）的关系

- ar-hub = agents-remote **自建**内部 MCP server（wiki/browser），走注入管线。不属于「插件管理」管理对象（不能增删改它本身）。
- 插件体系的 MCP 区管理的是**外部 MCP server**（用户配的第三方工具）。两者并存、不冲突（见 §现状盘点 MCP）。

## 全局插件入口设计（`/skills` → `/plugins`）

- 一级 nav「技能」→「插件」，路由 `/skills` → `/plugins`（或保持 `/skills` 兼容，见 §8 开放问题）。
- 页内 **Skill / MCP** 两个子区。

### Skill 子区（现有 discover/manage/sources 增强）

- **discover**：不变（skills.sh 搜索）。
- **manage（版本化，D5/D6）**：
  - 每项显示：来源 repo + **「有新版」徽标** + 一键更新按钮（第三方技能）。
  - 手写技能标「本地」，可编辑/删除（D6：通过挂源 local/git 纳入版本追踪）。
  - 更新检测机制：读锁文件 git SHA + GitHub Trees API 比对（见 §实现前调研结论）。
- **sources（源管理扩展，D6）**：GitHub repo + **local 目录 + git 仓库**三类源，统一一套版本/更新机制（`npx skills` 本就支持 local 与 git 两类源类型，见 skill-marketplace.md §3.4）。

### MCP 子区（新增，D1/D2）

- 全局 MCP server 增删改（stdio/sse/http 三类型），数据源 = `claude mcp` 管理的 user scope。
- **预留发现扩展点**：接口设计上留「来源」维度，后续接 MCP 目录 API 时扩展，第一版不实现。

## 项目插件入口设计（项目工作区新 tab，D7）

- 位置：项目工作区 tab，与 Files/Git/Terminal 平级。
- Skill / MCP 两个子区：项目级 skill 增删（`.claude/skills/`）+ 项目级 MCP 增删（`.mcp.json`）。

## 后端能力增量

| 能力 | 说明 |
|------|------|
| MCP 管理 API | wrap `claude mcp` list/add/remove，user/project 两 scope（D1） |
| 技能更新 API | 版本检测 + 更新动作，第三方 + local/git 源（D5/D6） |
| 技能源扩展 | sources 支持 local/git 类型（D6） |

## 实现前调研结论（已闭环）

> **2026-08-08 已实测**：MCP 与 skill 更新两项均已闭环（见下）。`claude mcp` 2.1.212、`npx skills` 1.5.22，本机。

### MCP 实测结论（已闭环）

实测 `claude mcp`（CLI 2.1.212，本机）结论：

| 事实 | 实测 | 设计影响 |
|------|------|---------|
| **无 `--json`/`--output`** | `claude mcp list --json` → `error: unknown option '--json'` | ⚠️ UI 数据源不能靠 `list` 文本解析 |
| **`list` 做 health-check** | `list` 耗时 4.075s；失败 server 标 `✘ Failed to connect`；pending approval 的 `.mcp.json` server 显示 `⏸` | list 慢且含状态，只适合「当前生效+健康」只读视图 |
| **底层配置结构** | `~/.claude.json` 的 `mcpServers`：`{name: {type, command?, url?, env}}`；project scope 写 `.mcp.json`（同结构） | ✅ **直接读底层文件**是正解（结构化、无网络、秒级） |
| **project scope 落点** | `claude mcp add --scope project <name> <cmdOrUrl>` 写当前目录 `.mcp.json` | ✅ 项目插件入口管理它 |
| **user scope 落点** | `--scope user` 写 `~/.claude.json` | ✅ 全局插件入口管理它 |
| **add/remove 非交互** | 非 TTY 直接执行，exit 0，无 prompt | ✅ 可 wrap（只信 exit code） |
| **scope 语义** | `local`(默认)/`user`/`project` 三档 | 用 `user` + `project` 两档即可 |
| **多 server 合并** | `list` 输出合并所有 scope（含 project 的 pending approval 语义） | agent 实例「生效的 MCP」= CLI 原生合并，agents-remote 只管理不合并 |
| **add-json** | 存在，`--scope` 同 add | 结构化 add 的后备 |

**决策落点（MCP 管理）**：
- **清单（读）**：直接读 `~/.claude.json`（全局）与项目 `.mcp.json`（项目），结构化、无网络、秒级。**不解析 `claude mcp list` 文本**（无 json、4s+ health-check）。
- **增删改（写）**：wrap `claude mcp add/remove --scope user|project`（可靠、非交互、处理 OAuth/审批等 CLI 边缘逻辑），只信 exit code + 事后回读文件。
- **「当前生效」只读视图（可选）**：`claude mcp list`（含 health-check 状态），对齐 CLI 原生合并（user+project）语义。
- **与 skill 混合路线同构**：管理 wrap 命令、清单自读存储。两个子系统共用同一「wrap + 自读」架构模式。

### `npx skills` 更新机制实测结论

> **2026-08-08 已实测**：更新检测机制已闭环（见下）。`update` 执行未深挖（结论已够支撑设计）。

**`npx skills` 更新机制实测结论**（CLI 1.5.22，本机）：

| 事实 | 实测 | 设计影响 |
|------|------|---------|
| **`update` 存在且非交互可驱动** | `npx skills update [names...] -g\|-p -y`（skip scope prompt）；exit code 表成败 | 增删改 wrap 模式可复用，但**更新检测不该 wrap `update`** |
| **`update` 输出 TUI 文本** | 输出带 ANSI 颜色码（`Updating…` / `✓ All global skills are up to date`），难解析 | ⚠️ **不能解析 `update` 文本判断「有无新版」** |
| **`skills list --json` 丢失来源** | `source`/`sourceUrl`/`sourceType` 全 `null`（裁剪版输出） | ⚠️ **不能靠 `list --json` 做更新检测**（无来源无 hash） |
| **锁文件有完整版本/来源** | `~/.agents/.skill-lock.json` v3：`skills[name] = {sourceType, sourceUrl, skillFolderHash, skillPath, installedAt, updatedAt}` | ✅ **更新检测读锁文件** |
| **`skillFolderHash` = 40 位 git SHA** | 配合 `sourceUrl`（git repo）+ `skillPath`，可直接 GitHub Trees API 比对远端最新 tree SHA | ✅ **无需执行 `update`**，纯比对判「有无新版」 |
| **手写 skill = 无锁记录** | 本机 19 目录 / 锁文件 16 条，多出的 3 个（`agent-browser`/`context7-mcp`/`find-skills`）无锁记录（非 `npx skills add` 装的） | 锁文件 key = skill 目录名；**有锁记录 = 第三方可更新，无锁记录 = 手写无源** |
| **手写 skill 挂源（D6）** | `npx skills add` 支持 local（`./path`、绝对路径）+ git 源（skill-marketplace.md §3.4） | 手写 skill 经 `npx skills add <local-dir>` 重装即获得锁记录 → 纳入版本/更新机制 |

**决策落点（skill 更新检测）**：
- **「有新版」判断**：读锁文件 `skillFolderHash`（git SHA）+ `sourceUrl`/`skillPath` → 调 GitHub Trees API 取远端最新 tree SHA → 比对。**不执行 `npx skills update`**（无副作用、无 blob 限速、可批量并发）。
- **执行更新**：wrap `npx skills update <name> -g -y`（exit code 判成败），更新后重读锁文件刷新 hash + updatedAt。
- **手写 skill 可更新（D6）**：引导用户用 `npx skills add <local-dir>`（local 源）或 git repo 重装，使其获得锁记录 → 走同一套 hash 比对更新机制。UI 上手写 skill 标「本地，尚未纳入版本管理」+「纳入管理」按钮。
- **GitHub API 限速**：未认证 60 req/h，可注入 `GITHUB_TOKEN`/`GH_TOKEN`（skill-marketplace.md §3.7 已记录）。批量检测需并发控制 + token。
- **与 MCP 同构**：skill 与 MCP 都是「读结构化存储 + wrap 命令执行」混合路线。锁文件 ↔ `~/.claude.json`/`.mcp.json`；`update` ↔ `claude mcp add/remove`；hash 比对 ↔ 读配置。

1. **`claude mcp` 命令行为**（D1 的落地前提）：
   - scope 语义：`local` vs `project` vs `user` 各写哪、`--global`/`--local` 的区别。
   - `list` 是否可机读（有无 `--output json` / `--json`）——决定 UI 数据来源与「合并视图」。
   - `add`/`remove` 的退出码与交互 prompt（能否非 TTY 驱动，对齐 wrap `npx skills` 的「只信 exit code + 回读真相」模式）。
   - 各类 server 的 add 语法（stdio：command+args+env；sse/http：url）。
2. **`npx skills` 更新机制**（D5/D6 的落地前提）：
   - `check`/`update` 的实际输出与行为（skill-marketplace.md 已提示 check 输出难解析，倾向自读锁文件）。
   - `local` 源安装后的锁文件记录（全局锁 `~/.agents/.skill-lock.json`）——能否据此做更新检测（hash 比对）。
   - 更新检测是自读锁 + 源 hash 比对，还是 wrap 命令。

## 安全边界（复用 skill-marketplace.md §7 结论）

- **路径穿越**：写 `~/.claude/skills`、项目 `.claude/skills`、`~/.claude.json`、项目 `.mcp.json` 都在 PROJECTS_ROOT 外/内混合。全局目录写是独立 permission domain，复刻 `isPathSafe` + `sanitizeName` + `realpath`；白名单根目录硬编码。
- **执行信任**：装第三方 skill = 信任作者（skill 可影响 agent 行为）；MCP 同理（外部 server 可访问本机资源）。UI 应有明确确认。这是产品决策，非纯技术（未决，见 §8）。

## 开放问题 / 未决

1. `/skills` 路由迁移：改 `/plugins` 还是保持 `/skills` 兼容（PWA precache、E2E 选择器影响）。
2. 执行信任模型（skill-marketplace.md §7.2 / mcp-hub-positioning「trust 门」）：UI 确认/权限设计，本轮未定。
3. 全局 MCP 的**合并视图**：agent 实例「当前生效」的 MCP 列表（user+project 合并）是否需要只读展示（D4 拍了不做管理，但未拍是否做只读视图）。
4. 发现扩展点：MCP 目录 API（glama/mcp.so）接入时机，本轮不实现。
5. 项目级 skill 更新：第三方 skill 装了 project scope 后，更新机制与全局是否同源（待 §7 调研后定）。

## 来源 / 证据

- **强**（本仓库源码 / 已沉淀调研）：
  - `api/src/skill-market.ts`（skill 安装/卸载/list/预览/sources，混合路线）。
  - `api/src/mcp-injector.ts` + `api/src/mcp-hub-server.ts` + `api/src/mcp-config.ts`（内部 hub + 注入管线 + 项目能力开关）。
  - `api/src/claude2-runtime.ts` `buildMcpArgs`/`resolveSpawnInputs`（spawn 时注入 MCP）。
  - `web/src/routes/SkillsRoute.tsx`（Skill 三 tab）+ `web/src/components/shell/activity-bar.tsx`（全局 nav）。
  - [skill-marketplace.md](./skill-marketplace.md) §3.4（npx skills 源类型 local/git）、§3.6（锁文件 + 更新）、§8（混合路线落地）、§7（安全边界）。
  - [mcp-hub-positioning.md](./inbox/mcp-hub-positioning.md)（内部 hub 定位 + 外部 MCP = 配置管理者 + 不加 --strict-mcp-config）。
- **实测**（2026-08-08，本机）：`claude mcp` 2.1.212 + `npx skills` 1.5.22，见 §实现前调研结论。
- **待调研**（实现期）：执行信任模型 UI（§开放问题 2）、`/skills`→`/plugins` 路由迁移影响、项目级 skill 更新机制。

## 承接

- [skill-marketplace.md](./skill-marketplace.md)（skill 市场调研，本蓝图承接其更新/源扩展的未决部分）。
- [mcp-hub-positioning.md](./inbox/mcp-hub-positioning.md)（MCP hub 定位，本蓝图是其「外部 MCP 对接」的落地实现）。
- 与 [provider-config-comparison.md](./provider-config-comparison.md) 的关联：provider 体系（preset 耦合四层）与插件体系（skill/mcp 扩展）是正交维度——provider 管「连哪个端点」，插件管「agent 会做什么/怎么做」。
