# 插件（Plugin）扩展体系：skill + mcp × 全局 + 项目

> 调研日期 2026-08-08。目标：把 agents-remote 的扩展能力从「只有 skill、只有全局层」演进为统一的**插件（plugin）入口**——插件 = skill + mcp 两类扩展 × **全局 + 项目**两层作用域。agent 实例消费全局+项目合并结果（CLI 原生合并，不做管理）。
>
> 状态：**方案蓝图已对齐**（用户拍板 4 组决策），**实现前需先调研** `claude mcp` 命令行为与 `npx skills` 更新机制（见 §7 待调研）。本文是决策 + 设计蓝图沉淀，承接 [skill-marketplace.md](./skill-marketplace.md)（skill 市场调研）与 [mcp-hub-positioning.md](./inbox/mcp-hub-positioning.md)（MCP hub 定位）。

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
  - 更新检测机制：**待调研**（§7）——倾向自读锁文件 + 源 hash 比对，而非解析 `npx skills check` 输出。
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

## 待调研（实现前必做，影响设计）

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
- **待调研**（§7 两项，实现前必做）。

## 承接

- [skill-marketplace.md](./skill-marketplace.md)（skill 市场调研，本蓝图承接其更新/源扩展的未决部分）。
- [mcp-hub-positioning.md](./inbox/mcp-hub-positioning.md)（MCP hub 定位，本蓝图是其「外部 MCP 对接」的落地实现）。
- 与 [provider-config-comparison.md](./provider-config-comparison.md) 的关联：provider 体系（preset 耦合四层）与插件体系（skill/mcp 扩展）是正交维度——provider 管「连哪个端点」，插件管「agent 会做什么/怎么做」。
