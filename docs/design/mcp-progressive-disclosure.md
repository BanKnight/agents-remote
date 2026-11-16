# MCP 渐进式披露与能力状态（ar-hub 契约单源）

> created: 2026-11-16 / updated: 2026-11-16
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
| L0 功能菜单 | 常驻（MCP `instructions`，每请求动态拼装） | initialize 响应 → host 拼进 system prompt | 5 域各一行：名称 + 一句话作用 + 当前开关状态 + Operating rules |
| L1 域指南 | agent 按需读 | `guide://<domain>` 资源（恒注册） | 该域完整使用说明（这是什么/工具清单/典型场景/如何开启/关闭时会怎样） |
| L2 状态管理 | 工具恒注册 | `capability_list` / `capability_set` | 实时状态查询与设置（admin 变更走审批） |
| L3 操作工具 | wiki：恒注册+运行时门控；其余域：按开关注册 | 各域工具面 | wiki_list/read/search/write、git_status、session_overview… |

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
| `admin` | ar-hub 管理面（project/session 管理，变更经审批） |

每域条目：`{ name: McpCapability, oneLiner: string, guide: string /* markdown */ }`。L0 菜单与 L1 指南都从这张表渲染。

## 4. 两种门控模式

| 模式 | 域 | 语义 |
| --- | --- | --- |
| **运行时门控** | wiki（本批单域示范） | 四工具**恒在 tools/list**；关闭态调用 handler 首行返回引导错误（指向 `capability_set` + `guide://wiki`），开启后重试即成功 |
| **注册面门控** | ui / skills / admin / gen-ui | 开关决定工具/资源是否注册（行为与旧版一致），数据源换内部状态 |

运行时门控的价值：agent 在 tools/list 就能看到 wiki 工具签名（配合 L0 菜单），关闭态尝试调用得到可自愈的引导而非「工具不存在」。后续批次按需推广到其余域。

`capabilities` 声明恒为 `tools: { listChanged: false }` + `resources: { subscribe: false }`（guide:// 恒注册的前提）；extensions 仅在 ui/skills 开时声明（照旧）。

## 5. 审批分档（capability_set）

- **wiki / ui / skills / gen-ui**：直接 `store.set` 生效，返回全量状态 + note「Changes apply to subsequent tool calls immediately」。
- **admin**：经既有 `McpAdminApprovalService` 审批（`requestManageApproval`，peekMetadata 解析 origin → 审批卡 → allow/deny/120s timeout）——agent 无法自我提权。无 adminDeps（审批链路不可用）→ isError `[ADMIN_APPROVAL_UNAVAILABLE]`。

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

## 8. 行为变更清单

1. capabilities 真相源：`.agents-remote/mcp.json` → `~/.agents-remote/mcp-capabilities.json`（存量惰性导入一次）。
2. wiki 四工具恒注册；关闭态调用返回引导错误（而非工具不存在）。
3. MCP 工具改名（去 pages）+ 新增 `wiki_search`；旧名在 web 渲染与 HUB_APP_TOOLS 保留兼容。
4. 每个 agent 会话 system prompt 增加 ~15 行功能菜单（instructions）；resources 列表恒含 5 条 `guide://`。
5. admin 域开关变更进入审批管道（其余域直接生效）。

## 9. 不做清单

- web capabilities 管理 UI（规格 v1 明确不做；`project_settings` 预览卡已反映状态）。
- ui/skills/admin/gen-ui 域运行时门控化（本批 wiki 单域示范，后续批次按需推广）。
- wiki 索引资源（`wiki_list` 工具即索引，单一数据管道）。
- wiki 查询面扩展（tag 检索/相关页/链接图——归 wiki Quartz 批次）。
- omp/ACP/pi 的 hub 接入（现状即不接，无 spawn argv 注入通道）。
