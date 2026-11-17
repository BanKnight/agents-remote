# MCP 渐进式披露与能力状态（ar-hub 契约单源）

> created: 2026-11-16 / updated: 2026-11-17
>
> ar-hub 功能域的渐进式披露结构、能力开关的内部状态语义、两种门控模式与审批分档的契约单源。实现锚点：`api/src/mcp-domains.ts`（域注册表）、`api/src/mcp-capabilities-store.ts`（内部状态）、`api/src/mcp-hub-server.ts`（四层装配）。

## 1. 背景与动机

改造前三点缺陷（用户拍板方向）：

1. **agent 对功能域没有整体认知**：capabilities 开关只决定「注册哪些工具」——wiki 关闭时 agent 连 wiki 是什么都不知道；开着也只有工具，不知道里面有啥、何时该用。
2. **真相源在错误的位置**：开关状态锚在项目 `.agents-remote/mcp.json` 文件，agent 要「告知状态/帮用户设置」就得读写文件；应归 ar-hub 服务端内部状态，管理通道走工具。
3. **查询面残缺 + 命名混淆**：服务端 `searchPages` 全文搜索已实现但 MCP 工具面没暴露；`wiki_*_page(s)` 的「page」与 Gen UI 页/网页混淆。

核心目标：**渐进式披露四层结构**——agent 在功能关闭时也能正确介绍作用、报告状态、引导并代为开启；开启后本会话立即可用。wiki 类功能要提供丰富查询能力（否则 agent 没法正确检索）。

## 2. 四层模型

| 层 | 进上下文时机 | 载体 | 内容 |
| --- | --- | --- | --- |
| L0 功能菜单 | 常驻（MCP `instructions`，每请求动态拼装） | initialize 响应 → host 拼进 system prompt | 6 域各一行：名称 + 一句话作用 + 当前开关状态 + Operating rules |
| L1 域指南 | agent 按需读 | `guide://<domain>` 资源（恒注册） | 该域完整使用说明（这是什么/工具清单/典型场景/如何开启/关闭时会怎样） |
| L2 状态管理 | 工具恒注册 | `capability_list` / `capability_set` | 实时状态查询与设置（admin / pages 变更走审批） |
| L3 操作工具 | wiki / pages：恒注册+运行时门控；其余域：按开关注册 | 各域工具面 | wiki_list/read/search/write、pages_list/set_roots、git_status、session_overview… |

关键推论（hub 无状态架构）：单 `Bun.serve` 长驻 + 每 HTTP 请求新建 transport/McpServer，capabilities 每请求重读 → `capability_set` 后**同一会话下一条请求立即可用**。

`instructions` 通过 `new McpServer(serverInfo, { instructions })` 传入（SDK 1.32.1 `ServerOptions.instructions`），initialize 返回给 host。`buildArHubInstructions(capabilities)` 在 `mcp-domains.ts`，每请求按实时状态拼装。

## 3. 域注册表（单源）

`api/src/mcp-domains.ts` 的 `MCP_DOMAINS` 表是域文案单源（仿 `HUB_UI_RESOURCES` 表驱动，「新增域只改表」）：

| 域 | oneLiner 要点 |
| --- | --- |
| `wiki` | project knowledge base：search / read / write wiki entries |
| `ui` | MCP Apps 卡片渲染（wiki 卡 display、git/session/file/画布工具） |
| `skills` | SEP-2640 skills 分发（skills/list / skills/get） |
| `gen-ui` | agent 生成式 UI（HTML widget + 状态桥） |
| `pages` | 项目静态站点发布（roots 配置查询；变更经审批） |
| `admin` | ar-hub 管理面（project/session 管理 + 外部 MCP server 管理，变更经审批） |

每域条目：`{ name: McpCapability, oneLiner: string, guide: string /* markdown */ }`。L0 菜单与 L1 指南都从这张表渲染。

## 4. 两种门控模式

| 模式 | 域 | 语义 |
| --- | --- | --- |
| **运行时门控** | wiki / pages | 工具**恒在 tools/list**；关闭态调用 handler 首行返回引导错误（指向 `capability_set` + `guide://<domain>`），开启后重试即成功 |
| **注册面门控** | ui / skills / admin / gen-ui | 开关决定工具/资源是否注册（行为与旧版一致），数据源换内部状态 |

运行时门控的价值：agent 在 tools/list 就能看到工具签名（配合 L0 菜单），关闭态尝试调用得到可自愈的引导而非「工具不存在」。wiki 示范后被 pages 沿用（2026-11-17）；其余域按需推广。

`capabilities` 声明恒为 `tools: { listChanged: false }` + `resources: { subscribe: false }`（guide:// 恒注册的前提）；extensions 仅在 ui/skills 开时声明（照旧）。

## 5. 审批分档

审批管道 = 既有 `McpAdminApprovalService`（`requestManageApproval`：`?origin=` + `peekMetadata` 解析发起会话 → 审批卡 `provider="mcp-admin"`（web 卡 / PWA push / 快照复用）→ allow / deny / 120s timeout）；无 adminDeps → isError `[ADMIN_APPROVAL_UNAVAILABLE]`（fail-closed）。

| 档 | 工具 | 语义 |
| --- | --- | --- |
| **免审批（观察）** | `capability_list`、`project_list`、`session_list`、`session_read`、`mcp_list`、`pages_list` | 只读，不改外部状态 |
| **免审批（自域开关）** | `capability_set`（wiki/ui/skills/gen-ui） | 直接 `store.set`，返回全量状态 + note「Changes apply to subsequent tool calls immediately」 |
| **审批（提权）** | `capability_set`（admin） | agent 不能自我提权 |
| **审批（外发/管理面）** | `project_create` / `project_delete` / `session_create` / `session_close` / `session_send`、`pages_set_roots`、`mcp_add` / `mcp_remove` / `mcp_update` / `mcp_enable` / `mcp_disable` | 每次调用登记审批中心 |

全审批工具名单单源 = shared `MCP_ADMIN_MANAGE_TOOLS`（api 注册面与 web `isHotTool` 红色高亮共用）。

## 6. 内部状态与惰性导入

**真相源**：`~/.agents-remote/mcp-capabilities.json`（仿 settings.yaml / push-subscriptions.json 同族：单文件 JSON、0o600、原子写 temp+rename、容错读空、0o700 目录）。**不放 runDir**——那是运行态目录，持久配置不归它。

文件结构：

```json
{ "projects": { "<目录名>": { "capabilities": { "wiki": true }, "imported": true } } }
```

- `McpCapabilitiesStore` API：`get` / `set` / `removeProject` / `renameProject`。
- **惰性导入**：无记录且项目有存量 `.agents-remote/mcp.json` → 用 `readProjectMcpConfig` 导入并落盘 `imported: true`，此后 mcp.json **不再参与判定**；无文件/非法 → 全关落盘。
- `set` 先 `await get()` 确保导入完成再合并，避免把「导入前的初始状态」覆盖成只剩一个键。
- **项目级联**：`deleteProject` → `removeProject`；`renameProject` → `renameProject`（key = 目录名，不迁会静默全关）。
- `readProjectMcpConfig`（mcp-config.ts）降级为「仅导入源」，唯一调用方 = `McpCapabilitiesStore.importFromLegacy`。

## 7. 工具面（L3）与改名

wiki 域四工具（恒注册）：

| 工具 | 说明 |
| --- | --- |
| `wiki_list` | 页面列表（原 `wiki_list_pages`） |
| `wiki_read` | 读单页 + ui 开时 display `_meta`（原 `wiki_read_page`） |
| `wiki_search` | 全文搜索（复用 `ProjectWikiService.searchPages`，新增——否则 agent 没法正确检索） |
| `wiki_write` | 写单页（原 `wiki_write_page`） |

参数 `slug` 保留；structuredContent `kind: "wiki-page"` 不变（web 卡片按 kind 匹配，不随工具名）。

**旧名兼容三层**：web 渲染注册表双键（`mcp__ar-hub__wiki_read` + `mcp__ar-hub__wiki_read_page` 同 renderer，历史会话卡片不降级）；`HUB_APP_TOOLS` 双键（历史卡片反向刷新）；i18n badge key `claude.tool.wikiReadPage` 名保留文案改「Wiki」。模板构建期只烧新名。

### pages 域（恒注册 + 运行时门控，2026-11-17）

| 工具 | 审批 | 说明 |
| --- | --- | --- |
| `pages_list` | 免 | 读生效视图：`{ config, servePrefix: "/p/<project>" }`；无配置文件 → 默认根 `site/ → /`（public）；显式 `roots: []` = 关闭发布 |
| `pages_set_roots` | **每次变更挂审批** | 整体替换 roots（`urlPath` / `fsDir` / `auth: public|token`）；服务端校验：fsDir 必须项目相对目录且无 `..`、urlPath 冲突拒绝 |

- 直接复用 `ProjectPagesService.readConfig/writeConfig`（原子写 0o600），工具层不重复校验。
- **serve 面独立于 capability 开关**：开关只管 MCP 工具面；`/p/<project><urlPath>` 照配置服务，public 根无鉴权可达——所以变更配置 = 外发面变更，必须审批。
- 未注入 `pagesService` 的 hub 实例不注册两工具（测试可只测既有面）。

### admin 域的外部 MCP server 管理（注册面门控，2026-11-17）

admin 域工具面 = 观察 4（`project_list` / `session_list` / `session_read` / `mcp_list`）+ 管理 10（project/session 五 + mcp 五）。mcp_* 工具直接复用 `api/src/mcp-management.ts` 模块函数（保留名、argv 数组、CLI wrap、update 回滚、stash 锁均在服务层，工具层不重复）：

| 工具 | 审批 | 说明 |
| --- | --- | --- |
| `mcp_list` | 免 | `scope` 缺省 = user + project 合并视图（条目带 `scope` 字段）；project scope 读 hub 所属项目的 `.mcp.json`，user scope 读 `~/.claude.json`；停用条目带 `disabled: true` |
| `mcp_add` / `mcp_update` | 审批 | `scope` 必填；本地先 `sanitizeMcpName` + 保留名（`ar-` 前缀）快速失败——坏参数不打扰审批卡 |
| `mcp_remove` / `mcp_enable` / `mcp_disable` | 审批 | 本地只校验名字合法性，**不拦保留名**（历史同名条目要能清理） |

- `McpAdminDeps` 新增 `projectsRoot`（必选，project scope 路径解析与审批前 fail-closed）与 `home?`（停用区 stash 注入，测试隔离）。
- user scope 操作写全局 `~/.claude.json`——审批卡 input 含 `scope`，用户可据此裁决。

## 8. 行为变更清单

1. capabilities 真相源：`.agents-remote/mcp.json` → `~/.agents-remote/mcp-capabilities.json`（存量惰性导入一次）。
2. wiki 四工具恒注册；关闭态调用返回引导错误（而非工具不存在）。
3. MCP 工具改名（去 pages）+ 新增 `wiki_search`；旧名在 web 渲染与 HUB_APP_TOOLS 保留兼容。
4. 每个 agent 会话 system prompt 增加 ~15 行功能菜单（instructions）；resources 列表恒含 6 条 `guide://`。
5. admin 域开关变更进入审批管道（其余域直接生效）。
6. 新增 pages 域：`pages_list` / `pages_set_roots` 恒注册 + 运行时门控；`pages_set_roots` 每次变更走审批（2026-11-17）。
7. admin 域新增 `mcp_list` + mcp 五管理工具；五个管理工具每次调用走审批（2026-11-17）。

## 9. 不做清单

- web capabilities 管理 UI（规格 v1 明确不做；`project_settings` 预览卡已反映状态）。
- ui/skills/admin/gen-ui 域运行时门控化（wiki 示范 + pages 沿用；其余域按需推广）。
- 跨项目 `.mcp.json` 操作（mcp_* 的 project scope 只针对 hub 所属项目）。
- git 写面（commit/discard）、files 写/删/列目录——挂账 inbox。
- wiki 索引资源（`wiki_list` 工具即索引，单一数据管道）。
- wiki 查询面扩展（tag 检索/相关页/链接图——归 wiki Quartz 批次）。
- omp/ACP/pi 的 hub 接入（现状即不接，无 spawn argv 注入通道）。
