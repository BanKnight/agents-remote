# MCP Hub 竞品调研:Agent 能力/工具层如何实现

> 状态:竞品调研草稿(2026-07-31),位于 `docs/research/inbox/`(未定型区,非沉淀结论)。
> 本文只做**竞品事实 + 对照我们 hub 定位的可借鉴/规避点**;定位本身见 [mcp-hub-positioning.md](./mcp-hub-positioning.md)(不改动)。
> 证据分级:**[源码]** = 读到行级源码 / **[官方文档]** = 厂商 docs / **[弱证据]** = 社区(Reddit/forum/issue 讨论等非官方源)。

## 我们的定位(对照标尺,一句话)

MCP Hub = 给 agent 装「能力/工具」的统一层,采纳 MCP(spec 2025-11-25)。两类:**内部 hub**(自建,暴露 wiki/browser 等能力域)+ **外部 MCP 对接**(转发第三方 server)。**核心决策:内外统一用 Streamable HTTP 最新版、无状态,不用 stdio。** 配置在 spawn CLI 时注入。

本文要回答的**核心问题**:竞品在「传输:stdio vs Streamable HTTP + 无状态性」上怎么抉择?我们的「统一 Streamable HTTP 无状态」是被验证的方向,还是孤例?

---

## TL;DR(先看结论)

1. **「统一 Streamable HTTP 无状态」被多方验证为前瞻方向**,但**我们是全场最激进的一个**。spec(SEP-2575,Final)和 2025-12 MCP transport blog 都把 stateless-by-default 定为目标;Claude Code 与 Codex CLI 的 MCP client 都原生支持 `type:"http"` 无状态。
2. **所有 MCP 网关(Smithery/Glama/Composio)的 stdio→HTTP 桥都是 stateful**;Smithery 员工亲口承认 stateful stdio-bridge **单实例并发上限 ~50 用户**——这正是我们「不用 stdio」要规避的扩展天花板。
3. **所有 5 个编辑器的内置工具(文件/终端/搜索)都是进程内函数调用,不走任何 MCP transport**;local 外部 MCP 一律 stdio stateful 长驻子进程;Streamable HTTP **只用于 remote**。没有任何编辑器对 local 工具用 stateless HTTP。
4. **hapi(我们的参考实现)已经走在我们定的路上**:`StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`(显式无状态),源码注释写明 Claude SDK 在带 session id 时会 spawn 失败;并为只能说 stdio 的 agent 提供了 `hapi mcp --url` 的 stdio→HTTP 桥。
5. **强制 stateful 的两股力量** = stdio 子进程(本质是长驻有状态进程)+ per-user 鉴权/上下文(Composio session、Glama per-profile token)。我们拒绝 stdio,就拆掉了第一股;内部 hub 走进程内信任(不 OAuth)就拆掉了第二股 → 无状态内核自洽。
6. **唯一要正视的取舍**:无状态 HTTP 损失了 stdio 子进程白给的东西(warm state、零网络/auth 面、env 注入 secret、OS 进程隔离、冷启动只付一次)。我们的辩护点是**服务端多租户 / 按需 spawn agent / 需水平扩展**——这正是我们与桌面 IDE 的差异点,偏离可辩护,但应记为显式决策而非偶然。

---

## 一、参考实现:hapi(tiann/hapi,`~/repos/hapi`)[源码]

hapi 是本项目的参考实现(已 clone 到 `~/repos/hapi`,commit ~2025-05)。它的 MCP 实现就是我们要走的路的最小样本。

### 实现要点

- **一个 HTTP MCP server,暴露极小工具面**:`cli/src/claude/utils/startHappyServer.ts` 用 `@modelcontextprotocol/sdk` 的 `StreamableHTTPServerTransport`,绑 `127.0.0.1:0`(随机端口),**只注册一个工具 `change_title`**。
- **显式无状态,源码注释是铁证**[源码 `startHappyServer.ts`]:
  ```ts
  const transport = new StreamableHTTPServerTransport({
    // NOTE: Returning session id here will result in claude
    // sdk spawn to fail with `Invalid Request: Server already initialized`
    sessionIdGenerator: undefined
  });
  ```
  → **Claude Code SDK 在 HTTP MCP server 返回 session id 时 spawn 失败**;无状态(`sessionIdGenerator: undefined`)是与 Claude 兼容的必要条件。
- **stdio→HTTP 桥(为只能说 stdio 的 agent 准备)**:`cli/src/codex/happyMcpStdioBridge.ts` 实现 `hapi mcp --url <http-url>`——起一个 stdio MCP server(`StdioServerTransport`),把 `tools/call` 用 `StreamableHTTPClientTransport` 转发给 HTTP server。lazy connect(首次 call 才建 HTTP client)。这是**因 agent 端只能说 stdio 而存在的适配层**,不是 hapi 的 canonical transport。
- **配置注入 = spawn 时带 `--mcp-config`**[源码 `cli/src/claude/utils/mcpConfig.ts`]:`appendMcpConfigArg()` 把 `{mcpServers}` JSON 推进 Claude CLI args(unix 走 inline JSON,Windows 写临时文件)。Codex 走 `-c mcp_servers.hapi.args=['mcp','--url','http://...']`(TOML,`cli/src/codex/utils/codexMcpConfig.ts`)。
- **mcpServers 始终只含自己的桥**:`runAgentSession.ts:74` / `buildHapiMcpBridge()` 构造 `{name:'hapi', command, args:['mcp','--url',...]}` 注入各 agent backend(Claude/Codex/Gemini/OpenCode/Kimi 全走这条)。
- **内置工具不重复造**:hapi **不**通过 MCP 重新暴露文件读写/终端/搜索——那些是 agent 自带的原生工具。MCP 只用于 agent 原生没有的、hapi 特有的跨 agent 能力(改 chat title)。→ MCP 是「agent 扩展通道」,不是「替换全部 agent 工具」。
- **只做内部 hub,不做外部转发**:grep 全仓 `mcpServers` 仅含 hapi 自己的桥 server,**没有**转发用户配置的第三方 MCP server 的路径。

### 对照我们 hub 定位

- **可借鉴**:① HTTP server `sessionIdGenerator: undefined` 无状态——这是 Claude 兼容的硬约束,直接抄;② spawn 时 `--mcp-config` 注入(inline JSON / 临时文件双形态)贴合我们「直拉 CLI + stdin 转发」的现有架构;③ MCP 只放「agent 原生没有的能力」,不重新暴露文件读写——与定位文档「基线文件读写复用 Project-safe resolver、wiki_/browser_ 是语义增强」一致;④ stdio 桥作为「只能说 stdio 的 agent」的适配层保留,但不作 canonical。
- **需规避/补足**:① hapi 的工具面太小(只 `change_title`),我们的 hub 要支撑 wiki/browser 等多能力域——需要 `tools/list` 动态裁剪(per-project 可见性),hapi 没做;② hapi 不做外部 MCP 转发,我们要补「外部 server URL/鉴权 → 注入 CLI spawn」这条;③ hapi 单进程 per-session 起 HTTP server(`startHappyServer` 每会话一个随机端口)——无状态后其实可以**共享一个 hub server 进程**(定位文档「hub 进程模型」待深化项,研究倾向共享)。
- **证据强度**:[源码] 行级,最强。

---

## 二、Claude Code(我们 spawn 的目标 CLI)[源码 + 官方文档]

源码来自 `~/repos/claude-code-sourcemap`(claude-code 2.1.88 restored TS),deepwiki `modelcontextprotocol/typescript-sdk`,context7 拉官方 spec。

### 内置工具系统

- **文件系统即注册表**:每个内置工具是一个目录 `src/tools/<ToolName>/`(`<ToolName>.ts` + `UI.tsx` + `prompt.ts`),约 44 个(FileReadTool/FileWriteTool/FileEditTool/BashTool/GrepTool/GlobTool/WebSearchTool/AgentTool(=Task)/MCPTool/SkillTool/TodoWriteTool/...)。**静态聚合**,非运行时 `register()`。
- **`buildTool()` 工厂**(`src/Tool.ts`):每个工具 `satisfies ToolDef`,必填 `name/description/prompt/inputSchema/call` + 能力探针(`isEnabled/isReadOnly/isConcurrencySafe/isDestructive/checkPermissions`)。`TOOL_DEFAULTS` fail-closed。
- **可见性 = 按执行上下文的工具集合**(`src/constants/tools.ts`):`ALL_AGENT_DISALLOWED_TOOLS`/`ASYNC_AGENT_ALLOWED_TOOLS`/`COORDINATOR_MODE_ALLOWED_TOOLS` 等 + CLI flag:`--tools <names>`(白名单,`""` 全禁)、`--allowedTools`/`--disallowedTools`(支持 pattern 如 `Bash(git:*)`)、`--permission-mode`。

### MCP client(关键)

- **配置格式**:`.mcp.json`(项目根,scope 恒为 `project`)/ `~/.claude.json`(user)/ `.claude/settings.local.json`(local)。schema `{mcpServers: Record<string, McpServerConfig>}`。
- **`--mcp-config <configs...>`**:接受**文件路径或 inline JSON 字符串**(空格分隔多个)。配套 `--strict-mcp-config`(忽略 user/project/enterprise 配置,只用 flag 里的——**我们 spawn 时应用此,保证 hub 是唯一 MCP 源、不泄漏操作者个人 MCP server**)。
- **per-server 配置 discriminated union on `type`**[源码 `services/mcp/types.ts`]:
  - `stdio`(默认):`{command, args, env}`,注入 `CLAUDE_PROJECT_DIR`。
  - `sse`(旧 HTTP+SSE):**已废弃**,建议改 `http`。
  - `http`(**Streamable HTTP**):`{type:'http', url, headers?, headersHelper?, oauth?}`。**注意:literal 是 `"http"`,不是 `"streamable-http"`(schema 不接受后者)**。
  - `ws`;以及内部用的 `sse-ide`/`ws-ide`/`sdk`(进程内 SDK server)/`claudeai-proxy`。
- **传输(关键章节,详)**[源码 `services/mcp/client.ts` `connectToServer()` L619-960]:
  - 三种 transport 全来自 `@modelcontextprotocol/sdk`,`if/else` 按 `serverRef.type` 选。`http` → `StreamableHTTPClientTransport`(L784-864)。
  - **Streamable HTTP 是完全一等公民**(1.0.27 起加入)。构造 transport 时**只传** `authProvider` + 包了 timeout/step-up 的 `fetch` + `requestInit`(代理 + headers: `User-Agent`、无 OAuth 时 `Authorization: Bearer <ingress>`、静态/动态 headers 合并)。**没传 `sessionId`、没传 `disableReconnect`、没传任何 session 管理 option。**
  - **无状态支持 = 肯定**。session 行为是**server 驱动**:server 的 `InitializeResult` 不带 `Mcp-Session-Id` header → SDK transport 不存 session id、后续 POST 不带 session header、每个请求独立(spec 2025-11-25:server「MAY」assign session id)。Claude Code **不强制** session。
  - `initialize` 在 `client.connect()` 时**发一次**(即使对无状态 server);之后每个 `tools/call` 自包含。**无状态 ≠ 不握手,而是无亲和性**。
  - **已知 stateful 坑**[弱证据 issue #27142]:server 若返回 session id 且重启,client 不会自动 reinitialize,工具调用报 invalid session——这是 stateful server 的 bug,**无状态 server 不受影响**,再次说明无状态是更安全的目标。
- **鉴权**:`services/mcp/auth.ts` 完整 OAuth 2.1 + PKCE + Dynamic Client Registration;或**静态 bearer header**(`headers: {"Authorization": "Bearer ${API_TOKEN}"}`)。动态 header 走 `headersHelper`(shell 命令,stdout 注入)。

### 内置 vs MCP 统一

- **对模型是单一名空间**:MCP 工具加前缀 `mcp__<serverName>__<toolName>`(`buildMcpToolName()`)。每个远端工具 = `MCPTool` builtTool 克隆 + 覆盖 name/desc/schema/call。`isMcp: true` + `mcpInfo: {serverName, toolName}` 路由。
- **MCP 工具能否覆盖内置**:仅 `type: "sdk"` + `CLAUDE_AGENT_SDK_MCP_NO_PREFIX=1` 时 MCP 工具用原名可覆盖内置;`http`/`stdio`/`sse` 一律带 `mcp__` 前缀,不会撞内置。要替换内置得 `--disallowed-tools` 禁掉内置再以 `mcp__hub__Read` 暴露(模型见带前缀名)。
- 权限统一:MCP 工具走同一 `checkPermissions` → 权限规则系统;suggestion UX 按 `mcp__server__tool` 全名写 allow-rule。

### 对照我们 hub 定位

- **可借鉴**:① spawn 时发 `--mcp-config '<inline-json>' --strict-mcp-config`,config 形如 `{mcpServers:{<hubName>:{type:"http", url:"http://127.0.0.1:PORT/mcp", headers:{"Authorization":"Bearer <token>"}}}}`;② **无状态 = 不要返回 `Mcp-Session-Id`**(省事且可水平扩展,无 CLI flag、无特殊握手,只需答 `initialize` 一次);③ `hubName` 要短稳 ASCII(它成为 `mcp__hubName__*` 前缀,有长度校验);④ 外部 MCP 转发可「每个上游一个 `mcpServers` entry」(保留原生命名 + 各自鉴权),或「聚合在一个 hubName 下」(我们控命名)。
- **需规避**:① 别用 `type:"sse"`(废弃,旧 HTTP+SSE 自动重连脆弱);② **别返回 `Mcp-Session-Id` 除非真要 stateful**(返回了 Claude Code 会 pin,重启/再平衡就崩);③ 内置工具列表 client 端会缓存,`tools/list` 演进后 client 不重连不重 list——工具集要按 hub 版本稳定;④ 不要靠 transport session 传 per-session 上下文(Claude Code 今天不给 MCP server 发稳定 session/conversation id[弱证据 issue #41836]);⑤ `--strict-mcp-config` 在有 enterprise MCP 配置时会拒跑——非严格模式要兜底。
- **证据强度**:[源码] 行级(transport if/else、schema、auth)+ spec + 官方 docs;弱证据仅两条 issue。

---

## 三、Codex CLI(我们 spawn 的另一目标)[官方文档 + 弱证据]

- **传输**:早期只支持 stdio(openai/codex issue #2129 请求加 SSE);**现在支持 stdio + Streamable HTTP**(RMCP = Rust MCP client)[官方文档 netdata/inventivehq/verdent]。
- **配置**:`~/.codex/config.toml` 的 `[mcp_servers]`,或 inline `-c mcp_servers.<name>.args=[...]` / `.args`(hapi 的 codexMcpConfig 走 inline TOML)[源码 hapi `codexMcpConfig.ts` 交叉证实]。
- **对照**:① 我们 spawn Codex 时可同样注入 `type:"http"` 的 Streamable HTTP server(Codex 现原生支持)——与 Claude 对称,统一无状态 HTTP 可行;② 老版本 Codex 只懂 stdio 时,退化用 stdio 桥(hapi 已验证)。
- **证据强度**:[官方文档](多份第三方配置指南一致)+ hapi 源码交叉证实 inline TOML;transport 版本演化为[弱证据](社区/issue)。

---

## 四、编辑器 agent 集成(Cursor / Windsurf / Cline / Continue / Zed)[源码 + 官方文档]

### 横切结论(先看)

- **内置工具(文件/终端/搜索)一律进程内函数调用,不走任何 transport**——全场一致。Cursor `functions.*`、Windsurf Cascade 原生函数、Cline `AgentTool` 对象、Continue `*Impl` switch、Zed Rust `AgentTool` trait。MCP/wire 协议**严格只用于第三方扩展边界**。「unification」(Cline 扁平名空间、Continue 共享 `Tool` schema、Zed `AnyAgentTool` trait)只是**注册表层/装饰性**——dispatch 仍分叉(内置直调 vs MCP wire)。**没人给文件读付 JSON-RPC 税**。
- **local 外部 MCP = stdio stateful 长驻子进程**——全场一致。spawn 一次、整会话持有、从不 per-request 重启、也不把 local 工具桥到 HTTP。驱动因素:warm state(auth session/index/open handle)跨 turn 复用、冷启动只付一次、零网络/auth 面、env 注 secret、OS 隔离。
- **remote = 偏好 Streamable HTTP,SSE 作 legacy fallback**——全场一致。Cursor/Windsurf/Continue/Cline 都偏好 Streamable HTTP,URL 无 `type` 时 Continue 自动 streamable-http→SSE 兜底、Cline 新加 remote server 默认 `streamableHttp`。但**连 Zed 的 Streamable HTTP 实现也是逻辑有状态**(pin `Mcp-Session-Id`/`MCP-Protocol-Version`)——没人追求 per-request 无状态。
- **「统一 Streamable HTTP 无状态 hub」是行业异类**——没有竞品对 local 工具选它。可借鉴的是**两层切分**(进程内热路径 + 仅扩展边界走协议),不是 transport。

### 各家差异(聚焦 5 维度)

#### Cursor[官方文档 + 弱证据]
- **内置工具**:硬编码进 agent loop 的 `functions.*`(`codebase_search`/`edit_file`/`read_file`/`run_terminal_cmd`/`read_lints`/`todo_write`/`update_memory`),**非 MCP**。内置工具集**按模型不同而不同**(GPT-5.1 vs Claude 暴露不同 `functions.*`)——只可能是 per-model 硬编码。
- **外部 MCP**:`.cursor/mcp.json`(项目)+ `~/.cursor/mcp.json`(全局)合并。stdio `{command,args,env}`,HTTP/SSE `{url,headers}` + `${env:VAR}`。UI + Marketplace 一键 OAuth。**无 `--mcp-config` CLI 注入**(社区在要)。
- **传输**:三选,按「执行环境 / 部署 / 用户数 / 鉴权」显式分:local 单用户 = stdio(无端口/无 auth、env secret);shared/remote = 部署的 server + OAuth(Streamable HTTP 偏好,连不上 fallback SSE)。**无 stdio→HTTP 桥**。
- **可见性**:per-server enable/disable(绿/需批准/禁用);新 server 默认「未批准」。**无 per-tool 开关**(社区在要,员工已认未做)。
- **可借鉴**:按部署上下文分 transport(local=stdio stateful / remote=HTTP+OAuth),tradeoff 显式可读;MCP Apps(工具驱动的渐进增强 UI)。
- **需规避**:两套并行工具系统 → 内置集 per-model 漂移、不可经 MCP 裁剪;静默全量作废(cursor-agent CLI 遇 `type:"streamable-http"` 直接丢整个 `mcp.json`,IDE 接受、CLI 拒);缺 headless `--mcp-config`。

#### Windsurf(Codeium/Devin)[官方文档 + 弱证据]
- **内置工具**:Cascade 引擎里一组固定硬编码原生工具(Search/Analyze/Web Search/Terminal/file r/w/edit),进程内特权函数,**非 MCP**。MCP 定位纯为扩展边界。
- **外部 MCP**:单全局 `~/.codeium/windsurf/mcp_config.json`。**无 `--mcp-config` flag**(IDE)。stdio `{command,args,env}` + remote `{serverUrl/url, headers}`。`${VAR}` 插值。**仅全局,无项目级文件**;per-project 靠 enterprise allowlist regex。
- **传输**:内置工具零 transport(进程内直调,热路径免税);stdio(本地默认,stateful 长驻子进程,Windsurf 拥有生命周期,config 变即重启);Streamable HTTP + SSE(remote 原生,`serverUrl`,`type:"streamable-http"`,原生 OAuth 2.1 per transport)。**无 host 端 stdio→HTTP 桥**——桥推给用户侧 shim(`npx mcp-remote <url>`)。macOS 沙箱只允许 localhost 或公网地址(LAN IP 失败)。
- **可见性**:**100 工具硬上限**(超出静默丢);per-tool 开关(保持 server 连接、禁特定工具);enterprise allowlist(regex)。
- **可借鉴**:热路径保持原生(每次文件读不上 JSON-RPC);per-tool 细粒度 toggle 是廉价高价值安全杠杆。
- **需规避**:全局配置 + 100 工具上限 → 手动倒腾 + 跨项目名空间污染;stateful stdio 子进程作默认 = 脆(崩、重启风暴);OAuth/HTTP 边缘 case 推给用户侧 `mcp-remote` shim 是泄漏抽象。

#### Cline[源码]
- **内置工具**:硬编码一等 `AgentTool` 对象(`sdk/packages/core/src/extensions/tools/definitions.ts` 的工厂 `createReadFilesTool`/`createSearchTool`/`createShellTool`/`createEditorTool`/`createApplyPatchTool`...),每个 `{name,description,inputSchema}` Zod→JSON Schema。`createDefaultTools(options)` 单装配点。当前名:`read_files`/`search_codebase`/`run_commands`/`fetch_web_content`/`apply_patch`/`editor`/`skills`/`ask_question`/`submit_and_exit`。
- **外部 MCP**:单全局 `cline_mcp_settings.json`(`~/.cline/data/settings/`),`{mcpServers:{<name>:{type:"stdio|sse|streamableHttp", command/args/env/cwd | url/headers, disabled, autoApprove:[...], timeout}}}`。**仅全局,无项目级**。`chokidar` 监听文件变化(`McpHub.ts`),`updateServerConnections` reconcile,原子写。**无 `--mcp-config` 注入**。
- **传输**(全 3 种在 `McpHub.ts` `connectToServer()` L441-597 接好):stdio → `StdioClientTransport`,`start()` spawn 子进程一次后**自废 `start()`(L503)→ 长驻**;sse → `SSEClientTransport` + ReconnectingEventSource + OAuth fetch;streamableHttp → `StreamableHTTPClientTransport`(404→405 归一化 + 重连 handler),**新加 remote 默认 `streamableHttp`**。`McpHub` 即注册表(`connections: McpConnection[]`),每 `{server,client,transport}` 持久复用。**无 stdio→HTTP 桥**。
- **可见性**:per-server `disabled`;per-tool `autoApprove`(免批准,可变);per-server `timeout`;per-model/mode 路由(`model-tool-routing.ts`,如 openai/codex/gpt 在 act 模式启 `apply_patch` 禁 `editor`)。无工具数上限(仅 64 字符**名**上限,OpenAI 函数名限,sha1 后缀兜底)。
- **可借鉴**:扁平统一名空间 + 确定性长度受限命名(`server__tool` + sha1 兜底)与内置并存不撞/不破 provider 限;单一 `McpHub` 拥有注册表 + 文件 watch + reconcile;disabled server = 无连接 stub(「已配置」vs「已连接」清晰)。
- **需规避**:仅全局配置(无项目级)→ server 集耦合用户而非 repo,队友无法从 repo 复现;长驻 stdio 子进程每 server 一个 = 激活时冷启动 + 生命周期/孤儿管理(对按需 spawn agent 的服务端控制面,stateless HTTP-per-request 更好扩展)。

#### Continue[源码]
- **内置工具**:进程内函数调用,**不**走 MCP transport。注册表 `core/tools/index.ts`:`getBaseToolDefinitions()`(常驻 ~9)+ `getConfigDependentToolDefinitions()`(按模型 cap / 实验开关 / 是否 remote 动态组)。dispatch = `callTool` 里 `switch`(`callBuiltInTool`)。注册表由**函数而非 const 数组**生成(源码注释自承「重写过 3 次,config reload 会出重复 tool 定义」)。
- **外部 MCP**:`~/.continue/config.yaml` 顶层 `mcpServers:`;也吃别家 JSON(Claude Desktop/Cursor/Cline)丢进 `.continue/mcpServers/`。CLI `--mcp <slug>` 解析但是**死代码**(`loadMcpFromHub` 恒拒「Hub package loading has been removed」)。**无 `--mcp-config <file>`**,只有 `--config <path>`(整个 assistant 配置)。
- **传输**(4 种,`core/context/mcp/MCPConnection.ts:10-16` 全 import):stdio(`constructStdioTransport`,stateful 长驻子进程,SDK `Client` 作字段连一次、跨 turn 持有、`disconnect` 才拆);streamableHttp(`constructHttpTransport`,`new StreamableHTTPClientTransport(new URL(url), {requestInit})`);sse;websocket。URL 无 `type` → **先试 streamable-http,失败 fallback SSE**。Streamable HTTP **仅 remote**。**无 stdio→HTTP hub/代理**。**无 stdio 子进程崩溃自动重启**(只能手动 `restartServer` / config 变刷新)。OAuth 怪招:remote HTTP 401 在 CLI 里 **shell 出 `npx -y mcp-remote <url>` 当 stdio 子进程**做 OAuth 桥。
- **可见性**:per mode(chat 全关 / plan 只读子集 / agent 全开);per-tool policy(「Ask First」默认 / Automatic / Excluded);注册期能力裁剪(`multiEdit` 仅推荐模型否则降级 `editFile`,`grepSearch` remote 时丢,实验工具 gate)。
- **可借鉴**:统一 `Tool` schema + 异构 dispatch(`tool.uri ? callToolFromUri : callBuiltInTool`)——共享模型面但不强迫原生工具走 transport;`mcp://<serverId>/<toolName>` URI 作稳定关联 key;URL 无 type 自动 streamable-http→SSE 兜底是好 remote UX。
- **需规避**:长驻 stdio 子进程无崩溃检测/自动重启(死了得手动);**装饰性统一**(内置经 `switch` 旁路 transport)违反「单管道」铁律;死 `--mcp <slug>` flag 解析后恒拒——误导性遗留面。

#### Zed AI[源码]
- **内置工具**:Rust struct 实现 `AgentTool` trait,**编译期**经 `tools!` macro 注册(`crates/agent/src/tools.rs`,扩成 `const ALL_TOOL_NAMES`,重名 panic)。每工具一个模块(~25 个:`read_file_tool`/`edit_file_tool`/`terminal_tool`/`grep_tool`/`fetch_tool`/`web_search_tool`/`spawn_agent_tool`/`skill_tool`...)。`Thread` 用 `HashMap` `add_default_tools`/`add_tool` 装填。trait 带 `Input/Output` serde 类型、`NAME`、`description`、`input_schema`、`run`、`supports_provider`、`allow_in_restricted_mode`。进程内直调。
- **外部 MCP**:项目设置 `context_servers`(`crates/project/src/project_settings.rs`,`HashMap<Arc<str>, ContextServerSettings>`)+ 全局 `context_server_timeout`(默认 60s)+ `enable_all_context_servers` gate。设置 UI「Local Server」(Stdio)/「Remote Server」(Http)。stdio `{command,args,env,timeout}`,Http = URL + headers + OAuth client id。**无 `--mcp-config`**(配置在 `.zed/settings.json`)。
- **传输**(两种,`ContextServerTransport` enum):stdio(`transport/stdio_transport.rs`,`Child::spawn` 持有 `Child` handle 字段,3 个 detached GPUI task pump 管线,**stateful 长驻**);HTTP(`transport/http.rs`,**Streamable HTTP spec 2025-06-18,非旧 HTTP+SSE**,单端点 POST,`Accept: application/json, text/event-stream`,`Mcp-Session-Id`+`MCP-Protocol-Version` 存 `parking_lot::Mutex`,按 content-type 分流 json 立即 / SSE 流,OAuth bearer + 401 `www-authenticate` refresh-retry。**逻辑有状态**——pin session id,即使 wire 是无状态 HTTP)。生命周期:worktree 出现时**重启 Stdio**(子进程接新 cwd);config 变重启。`ContextServerStatus::{Starting,Running,Stopped}`。
- **可见性**:多层(`supports_provider` per LLM 过滤内置;`allow_in_restricted_mode`;`tool_permissions.rs` + 设置 UI 维护 `EXCLUDED_TOOLS`;profiles 选工具子集如 `WRITE_TOOLS`;`enable_all_context_servers` + per-server enable;`context_server_timeout`)。
- **可借鉴**:`AnyAgentTool` trait 统一——内置 + MCP 共享一个注册表 + 一个 `enabled_tools` 投影,agent loop 对来源无感(干净单管道);内置/local 工具留进程内(免 IPC/序列化税),wire 协议只给外部 server。
- **需规避**:**local server 用 stateful 子进程**——无状态 hub 最该拒的决策。Zed 每 server 每 project pin 一个长驻进程,worktree/cwd/config 变即重启,生命周期耦合进项目状态(孤儿、重启风暴、per-project 乘积);命名遗留债(代码 `context_server`/`ContextServer*` vs 面向用户/协议模块叫 MCP,改名没落地)。

> **编辑器证据强度**:Cline/Continue/Zed = [源码] 行级(2026-07-31 main);Cursor/Windsurf = [官方文档](transport 表/schema),forum/社区论断标[弱证据]。核心结论(local=stdio stateful、内置=进程内、HTTP=仅 remote)对 3 个 OSS 编辑器达源码级、对 2 个闭源达官方文档级,无维度仅靠弱证据。

---

## 五、MCP 网关 / 聚合 / registry(Smithery / Glama / Composio / mcp.so)[源码 + 官方文档]

### 横切结论(先看)

- **stdio→HTTP 桥在 Smithery/Glama 商业跑通,但都 stateful**。Smithery `createStatefulServer` 包 stdio npm/Python 模块挂 Express + Streamable HTTP;Glama「stdio 写的 server 自动包」。「可行」=能出货,不=能水平扩展。
- **强制 stateful 的力量 = 桥接 stdio 子进程**(stdio server 本质长驻有状态进程,忠实桥接必持 session)+ **per-user 鉴权/上下文**(Composio session、Glama per-profile token)。我们拒绝 stdio + 内部进程内信任 = 拆掉两股 → 无状态内核自洽。
- **外部第三方 MCP 转发(我们的「外部」类)**:Glama 最像(托管社区/GitHub repo 来的第三方 server,网关前置);Smithery 同(托管 registry server);Composio 是围墙花园(只自家 OpenAPI 生成工具,**不**转发任意外部 MCP server);mcp.so 只链接出,不转发。

### 各家

#### Smithery(smithery.ai,smithery-ai/cli)[源码 + 官方声明]
- **聚合模型**:Registry + 双模 proxy,**不是**合并 `tools/list`。每 server 独立,agent 一次连一个。`smithery run` 是**per-server proxy**。
- **传输 in→out**:`src/commands/run/` 两 runner——stdio-runner(stdio in → stdio out,无 HTTP 转换);streamable-http-runner(连远端 `StreamableHTTPClientTransport`,心跳/空闲超时/指数退避重连)。**stdio→HTTP 桥只在 Smithery 云**:云 runtime `shttp-bootstrap.ts` 起 Express,用 `@smithery/sdk/server/stateful.js` 的 **`createStatefulServer`**(名字明说)包用户的(常 stdio)MCP server 模块。**全程 stateful**(local 持子进程 / 云用 `createStatefulServer`+心跳+`Mcp-Session-Id`)。CHANGELOG 显示迁移 **WebSocket → Streamable HTTP**。
- **决定性证据**(Smithery 员工,context7 issue #232,2025-05):*"Currently your STDIO server is hosted and served via HTTP for end users of our platform, but this limits the maximum concurrent connections to 50 users. We recommend converting this to a native HTTP server to scale this up much higher…"* → **Smithery 自己把 stateful stdio-桥框定为扩展天花板,native(无状态)HTTP 是升级路径**。
- **可借鉴**:① 云侧 `shttp-bootstrap` 包模式(npm/PyPI 模块 → Express 包 → Streamable HTTP);② 「建议作者转 native HTTP」姿态 = **目录分层**:native-HTTP server 一等公民(无状态、可水平扩展),stdio-包的 server 二等(有状态、并发受限)——干净映射我们「内部域 + 外部转发」切分。
- **需规避**:stateful stdio-桥是 50 并发瓶颈(正是我们「不用 stdio」规避的);per-server proxy = 无合并 `tools/list`,agent 仍 N×1 连。

#### Glama(glama.ai,glama-ai)[官方文档]
- **聚合模型**:Registry + 托管网关,**不是**合并 hub。64k+ server 索引;每部署一个独立「Gateway URL」。一 server 一端点。registry/索引开源(github.com/glama-ai),网关/托管闭源。
- **传输 in→out**:stdio→HTTP 桥**显式自动**。托管 FAQ:*"The public endpoint speaks Streamable HTTP… Servers written for stdio are wrapped automatically, so you do not have to rewrite the transport layer yourself."* 接受三种部署源(registry server / GitHub repo 从源码 build image / container Dockerfile/npm/PyPI)。**stateful,带 LB-stickiness 意识**(*"session handling that does not break behind a load balancer"*——是绕开 statefulness,不是消除)。client 面只有 Streamable HTTP。每部署独立机器(无 noisy-neighbour),`/ping` 健康检查,可选持久卷 `/data`。
- **鉴权**:OAuth 2.1 + **网关托管自动 token refresh**,access token scope 到「connection profile」,env 加密静态,token 哈希(UI 指纹)。**token-vault 模式**——Glama 持上游凭证。
- **可见性**:**per-tool 访问控制**(每部署启/禁单个工具);每 JSON-RPC call 全 payload 记日志;默认私有,可翻公开。
- **可借鉴**:① per-tool gating + per-connection-profile token = 本组最干净的可见性模型(映射我们 per-API-key/per-session 工具裁剪);② token-vault + auto-refresh + secret 静态加密 = 「外部转发」hub 的正确鉴权原语;③ 「自动包、零改写」DX = 若哪天放开 stdio 的 stdio 摄取基准。
- **需规避**:stateful + 「LB 后 session 处理」= 粘性会话运维负担(我们无状态设计规避的);独立机器-per-部署不能像无状态 proxy 那样水平扩展。

#### Composio(composio.dev,ComposioHQ/composio)[官方文档 + 源码]
- **聚合模型**:**一个合并 MCP 端点,后坐 1000+ app/tool**——本组最真的「多工具一入口」。博客:*"connecting to 30+ MCP servers for a single project is a pain… You connect it once and use 1K+ tools directly."* agent 见合并 `tools/list`。
- **传输 in→out**:只暴露 Streamable HTTP(配置全 `type:"http"`)。**无 stdio→HTTP 桥**——它暴露**自家托管工具**(OpenAPI spec 生成 + Connected Accounts),**不**包任意社区 stdio MCP server。**stateful,per-session**(session = 绑 `user_id` 的临时配置;`composio.create(userId)` 返回唯一 `sessionId`;session 不可变,上下文变→新 session)。MCP URL 带 `?user_id=`,需 `x-api-key` header。
- **鉴权**:Connected Accounts + Auth Configs = 完整 token-vault。Auth Config 声明方法(OAuth2/OAuth1/API Key/Bearer/Basic)+ scope;Connected Accounts 存用户实际 token。托管「Connect Link」UI 走 OAuth;Composio 存并**自动 refresh**。*"Connections persist across sessions."*
- **可见性**:**本组最强**。`composio.mcp.create(toolkits=[...], allowed_tools=[...])`——per MCP server 配置白名单精确工具;`allowed_tools` 可 `update()` 变。动态 `tools/list` 由 session + allowed_tools 驱动。per-user 经 `user_id`。
- **可借鉴**:① 合并端点 + `allowed_tools` 白名单 + per-user session 三件套 = 「一个 hub、per-tenant 工具可见性」的参考设计;② Connected Accounts token-vault + auto-refresh = 上游 API 集成的鉴权模型(「外部转发」要 OAuth 时);③ session-scoped 动态 `tools/list`(非静态全局目录)。
- **需规避**:per-session statefulness(`?user_id=`、不可变 session、「上下文我们管」)与无状态设计相反,逼出粘性语义;围墙花园只 Composio 策展工具,不收任意 MCP server——若要收任意第三方 MCP,模型不迁移。

#### mcp.so[官方站点]
- **聚合模型**:**纯目录/市场——不是网关、不是 host、不是聚合器**。自述*"community-driven platform that collects and organizes third-party MCP Servers… a central directory."* 23k+ server。**agent 不连 mcp.so**——复制 server 配置(npx 命令或第三方 Streaming-HTTP URL)直连该 server 自家端点。
- **传输**:不承载 MCP 流量。展示 per-server 配置片段(stdio `command`/`args` 或 remote Streaming-HTTP `url`,由作者自托管)。
- **可借鉴**:只作**发现 UX** 基准(分类搜索、per-server 配置片段、「装前试用」检查器——Glama 也有)。不 relevant 作网关/架构参考。
- **需规避**:别把 registry 和 gateway 混了。mcp.so 证明目录廉价但不解任何 transport/auth/可见性问题。

> **网关证据强度**:Smithery/Composio = [源码](deepwiki)+ 官方员工声明(issue #232);Glama = [官方文档](hosting 页);Composio = [官方文档]+[源码];mcp.so = [官方站点]。

---

## 六、MCP 协议事实(spec 2025-11-25 + SEP-2575)[官方 spec]

> 用于「采纳成熟抽象」和「无状态决策」的权威依据。来源:context7 拉 `/websites/modelcontextprotocol_io_specification_2025-11-25` + SEP-2575 页。

- **会话管理是可选的**[spec transports]:*"Servers **may** assign a cryptographically secure, unique session ID during the initialization phase"* → **不分配 session id(无状态)是 spec 合法的**。client 仅在 server 返回了 `Mcp-Session-Id` 时才必须带它。
- **POST 可返回纯 JSON(无 SSE)**[spec transports]:POST `/mcp` 的 200 响应 `Content-Type` 可以是 `application/json`(简单 request-response)**或** `text/event-stream`(流)。→ 无状态 server 可不实现 SSE,每个 `tools/call` 一次 JSON 来回即可。官方「App Server」示例:`StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })` + 每请求新 transport。
- **安全**[spec transports]:Streamable HTTP server **必须**校验 `Origin`、本地绑 `127.0.0.1`、实现鉴权;DNS rebinding 防护。stdio 进程内信任。
- **local server + 鉴权**[spec security]:local MCP server 用 stdio **或** HTTP+auth token/IPC;OAuth 设计给 **remote** HTTP server。→ 我们内部 hub(本地、进程内信任)走 Streamable HTTP 绑 127.0.0.1 + bearer/static token 即可,无需 OAuth(与定位文档「进程内信任」一致)。
- **SEP-2575 "Make MCP Stateless"(Final,Standards Track,2025-06-18)**[spec SEP]:*"A truly stateless protocol, where every request is self-contained… is highly desirable for its inherent simplicity, scalability, and reliability."* *"the state-establishing initialization handshake… makes it difficult to run MCP at scale. Placing an MCP server behind a standard load balancer… is challenging because a client's session is coupled to the specific server instance."* 提案:**移除初始化握手的状态建立**,代之以离散无状态替代;「pay as you go」——无状态默认,有状态仅功能需要时。→ **MCP 项目自身把无状态定为目标方向**,我们走在 spec 前瞻上。
- **跨传输无状态不变量**(SEP FAQ「为何 stdio 也要无状态?」):*"to ensure transport is an implementation detail… Statelessness simplifies switching transports, reduces confusion, and improves compatibility."* → 印证我们「内外统一无状态」让传输退化为实现细节。

---

## 七、综合:对照我们 hub 定位的可借鉴 / 规避点

### 直接验证我们核心决策(「统一 Streamable HTTP 无状态,不用 stdio」)

| 维度 | 竞品事实 | 对我们决策的含义 |
|---|---|---|
| **方向** | SEP-2575(Final)定 stateless-by-default;2025-12 MCP transport blog 把 stateful 连接框定为托管/负载均衡瓶颈 | **前瞻方向被验证**。我们走在 spec 路上 |
| **CLI 支持** | Claude Code `type:"http"` 无状态原生支持(不返 session id 即可,返了反而崩);Codex CLI 现支持 stdio+Streamable HTTP | **两端 CLI 都支持**,统一无状态 HTTP 对 Claude+Codex 都可行 |
| **hapi 验证** | hapi HTTP server `sessionIdGenerator: undefined`,注释明说带 session id 会让 Claude SDK spawn 失败 | **参考实现已实证**无状态是与 Claude 兼容的必要条件 |
| **激进程度** | 全场 5 编辑器 + 3 网关,**无一对 local 工具用 stateless HTTP**;网关的 stdio→HTTP 桥全 stateful | **我们是全场最严格**。需把取舍记为显式决策 |
| **stateful 的强制力** | stdio 子进程(本质长驻有状态)+ per-user 鉴权/上下文 | 我们拒 stdio + 内部进程内信任 = 拆掉两股,无状态内核自洽 |

### 可借鉴(按优先级)

1. **Claude Code spawn 配置形态**(直接抄):`--mcp-config '<json>' --strict-mcp-config`,`{mcpServers:{<hubName>:{type:"http", url, headers:{Authorization}}}}`;不返 `Mcp-Session-Id`;`initialize` 答一次但无亲和性。
2. **hapi 的 HTTP server 无状态模式**:`StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` 绑 `127.0.0.1`;MCP 只放 agent 原生没有的能力,不重暴露文件读写。
3. **stdio 桥作适配层(非 canonical)**:hapi `hapi mcp --url` 模式——为只能说 stdio 的 agent(老 Codex 等)保留一个 stdio→HTTP 桥二进制,但不作 canonical transport。
4. **可见性裁剪**:Composio `allowed_tools` 白名单 + per-user 动态 `tools/list`(最贴合我们 per-project 能力域开关);Claude Code `--allowed-tools "mcp__hub__wiki mcp__hub__browser"` 精确 scope;Cline 扁平名空间 + 长度受限命名 + disabled=无连接 stub。
5. **外部转发鉴权**:Glama/Composio 的 token-vault + OAuth auto-refresh + secret 静态加密(「外部 MCP 转发」类要透传 OAuth 时)。
6. **两层切分**(编辑器共识):进程内热路径(内置/基线工具)免 transport 税,wire 协议只给扩展/外部边界。我们基线文件读写复用 Project-safe resolver(进程内),wiki_/browser_ 走 MCP——符合此范式。

### 需规避(按优先级)

1. **stateful stdio 子进程**:Smithery 实证单实例 ~50 并发天花板;编辑器 stateful 子进程的崩、重启风暴、孤儿管理、冷启动。我们「不用 stdio」正规避此。
2. **返回 `Mcp-Session-Id`**:Claude Code 会 pin,hub 重启/再平衡即崩(issue #27142)。无状态 = 完全不发。
3. **`type:"sse"`**:已废弃,旧 HTTP+SSE 自动重连脆弱。只用 `type:"http"`。
4. **两套并行工具系统**:Cursor 内置 `functions.*` per-model 漂移、不可经 MCP 裁剪;Continue 装饰性统一(内置旁路 transport)违反单管道。我们基线 + 域都应走同一 MCP 管道(hub 内部),渲染层另算。
5. **全局配置无项目级**(Cline/Windsurf):server 集耦合用户而非 repo。我们按项目配置开能力域(定位文档「能力域可见性 = `tools/list` 动态裁剪」)。
6. **靠 transport session 传 per-session 上下文**:Claude Code 今天不给 MCP server 发稳定 session/conversation id(issue #41836)。per-session 上下文走 tool args 或我们控的 header。
7. **把 registry 当 gateway**(mcp.so 误区):目录廉价但不解 transport/auth/可见性。我们 hub 是 gateway,不是目录。
8. **围墙花园**(Composio):只收自家工具不收任意 MCP。我们要支持任意第三方外部 MCP server 转发。

### 待定位文档整合时建议消解的内部张力(我未改 positioning.md,留给整合者)

- positioning.md 表格已写「内外统一 Streamable HTTP 无状态」,但「待深化」又写「内部 hub 倾向 stdio,需确认 CLI 的 MCP client 支持哪种」。**本次调研消解**:
  - 「CLI 的 MCP client 支持哪种」→ **Claude Code 与 Codex CLI 都原生支持 Streamable HTTP 无状态**,内部 hub 不必 stdio。
  - 「hub 进程模型:每 session 一个 server vs 共享」→ **无状态后可共享一个 hub server 进程**(不必每 session spawn,降低资源 + 崩溃隔离靠 hub 内部按 project/session 分隔)。
  - 「接入方式」→ **确认 `--mcp-config` 注入**(Claude `--mcp-config <json|file>`、Codex `-c mcp_servers.<name>...`),hapi 已实证。

---

## 来源汇总

### 源码(行级)
- hapi(`~/repos/hapi`):`cli/src/claude/utils/startHappyServer.ts`、`cli/src/codex/happyMcpStdioBridge.ts`、`cli/src/claude/utils/mcpConfig.ts`、`cli/src/codex/utils/codexMcpConfig.ts`、`cli/src/codex/utils/buildHapiMcpBridge.ts`、`cli/src/agent/runners/runAgentSession.ts`。
- Claude Code 2.1.88(`~/repos/claude-code-sourcemap`):`services/mcp/{client,types,config,auth,mcpStringUtils}.ts`、`tools/MCPTool/MCPTool.ts`、`Tool.ts`、`constants/tools.ts`、`main.tsx`。
- Cline(gh main):`apps/vscode/src/services/mcp/McpHub.ts`、`sdk/packages/core/src/extensions/tools/definitions.ts`、`model-tool-routing.ts`、`name-transform.ts`。
- Continue(`~/repos/continue` main):`core/context/mcp/MCPConnection.ts`、`core/tools/{callTool,index}.ts`、`extensions/cli/src/services/MCPService.ts`。
- Zed(gh):`crates/context_server/src/{context_server.rs,transport/{stdio_transport,http}.rs}`、`crates/agent/src/tools.rs`、`crates/project/src/project_settings.rs`。
- Smithery / Composio:deepwiki(`smithery-ai/cli`、`ComposioHQ/composio`)。

### 官方 spec / docs
- MCP spec 2025-11-25 transports(经 context7 `/websites/modelcontextprotocol_io_specification_2025-11-25`):https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- SEP-2575 "Make MCP Stateless"(Final):https://modelcontextprotocol.io/seps/2575-stateless-mcp
- MCP transport blog 2025-12-19:https://blog.modelcontextprotocol.io/posts/2025-12-19-mcp-transport-future
- Claude Code MCP docs(code.claude.com "Connect to external tools with MCP",经 tvly)
- Cursor:https://cursor.com/docs/mcp.md
- Windsurf:https://docs.devin.ai/desktop-app/cascade-mcp-integration ;https://github.com/github/github-mcp-server `docs/installation-guides/install-windsurf.md`
- Glama:https://glama.ai/mcp/hosting 、https://glama.ai/mcp/methodology
- Composio:https://docs.composio.dev/mcp/welcome
- mcp.so:https://mcp.so
- Codex CLI MCP:https://github.com/netdata/netdata `docs/.../codex-cli.md` ;https://github.com/openai/codex issue #2129

### 弱证据(社区/issue,非官方)
- Smithery 员工 stdio-桥 50 并发上限:https://github.com/upstash/context7/issues/232 (2025-05,员工声明——虽在 issue 里但属官方人员,证据偏强)
- Claude Code Streamable HTTP 服务器 session 失效不重连:https://github.com/anthropics/claude-code issue #27142
- Claude Code 不向 MCP server 发 session/conversation id:https://github.com/anthropics/claude-code issue #41836
- Cursor `--mcp-config` 缺失:https://github.com/multica-ai/multica/issues/1601
- Cursor forum:transport log bug、streamable-http 分歧、per-model `functions.*`、per-tool 配置请求
- Windsurf:Reddit r/windsurf、r/Codeium(macOS 沙箱、重启不稳)
- Codex CLI SSE 支持:openai/codex issue #2129

---

## 二轮补充:orca / proma / codex app / 扣子(Coze) / workbuddy

> 状态:二轮补充调研(2026-07-31)。新增 5 个竞品,逐一核对「服务端 stateless HTTP 给 agent 装 local 工具」判断是否仍成立。
> 消歧先做:orca = `stablyai/orca`(AI orchestrator 桌面应用,非 ORCA 计算/语音);proma = `proma-ai/Proma`(本地优先 AI 桌面应用,非 sparesparrow/mcp-prompts);codex app = OpenAI 官方 Codex 桌面应用(Electron,闭源包装,CLI 开源);扣子/Coze = 字节跳动 AI 应用搭建平台(coze.cn/coze.com);workbuddy = 腾讯 WorkBuddy AI 工作台(非同名办公 SaaS)。

### 横切结论(先看)

- **5 个里仍无一用「服务端 stateless HTTP 给 agent 装 local 工具」**。两个桌面应用(Orca/Proma)给 agent 装能力走「进程内函数 / stdio 子进程 / prompt 注入」,Streamable HTTP 仅用于用户连远端第三方 MCP;两个大厂平台——扣子是云端 SaaS(工具走云托管 MCP)、WorkBuddy 是桌面办公应用(Connectors 走 MCP,三轮更正,非自研协议),都不是「服务端给本地 agent 装 stateless HTTP 工具」这条路径;Codex app 是 CLI 的 GUI 壳,工具/传输完全继承 Codex CLI。
- **新增一个同类样本**:Proma 的内置能力(nano-banana 生图/automation/collaboration)用 Claude Agent SDK 的 `createSdkMcpServer()` 进程内 MCP 注入——即 Claude Code 的 `type:"sdk"` 路径。**进程内 = 天然无状态,但不走 HTTP**。这是「给 agent 装 local 能力」的另一种无状态实现(进程内而非 wire),与我们「stateless HTTP」是同一无状态家族的两个分支,印证「local 工具无状态化」方向,但传输形态不同。
- **扣子(Coze)是本组最接近「平台用 MCP 给 agent 装能力」的**,但形态是「云托管 MCP server + 平台 agent 当 MCP client 连云上 URL」(remote HTTP),且仅 Coze 空间(扣子空间)这条产品线用 MCP;经典 Bot 插件体系是自研 OpenAPI/HTTP 协议,非 MCP。它不给我们「local 工具 stateless HTTP」提供反例,反而印证「MCP 在大厂平台里是 remote 云端形态」。
- **「我们仍是最激进的一个」成立**——核心判断加强而非修正。新增 5 个无反例,且 Proma 的进程内无状态 + 扣子的云端 MCP 两条都进一步验证「无状态化」方向,只是没人把我们这条「stateless HTTP 给 local 工具」走通。

### 各家

#### Orca(stablyai/orca,`~/repos/orca`,commit ~2026-07)[源码]

- **定位**:开源(Electron + 移动伴侣)AI orchestrator 桌面应用。把 Codex / Claude Code / OpenCode / Pi 并排跑,每个 agent 独立 git worktree,统一面板追踪。对标 Anthropic Claude 桌面应用 + OpenAI Codex app。**是 agent 编排器 / 多 agent IDE 外壳,不是 MCP 网关、不是工具 hub**。
- **怎么给 agent 装能力**:① **不自己造 MCP server**——grep 全仓 `src/` 无 `StreamableHTTPServerTransport` / `StdioServerTransport` / `new McpServer` / `createSdkMcpServer`,`package.json` 无 `@modelcontextprotocol/sdk` 依赖[源码]。② Orca 自有强能力(嵌入 Chromium + Design Mode 点击 UI 元素把 HTML/CSS/截图塞进 agent prompt、Ghost-class 终端 splits、SSH worktrees、GitHub/Linear PR 面板)**走 prompt 注入 / 直接 UX 集成,不走任何 MCP transport**——与第一轮「编辑器内置工具进程内函数调用、不付 JSON-RPC 税」同族,只是 Orca 把「内置工具」做成了「prompt 素材注入 + worktree/terminal/PR 编排」。③ 对外部 MCP,Orca 只是**被动读现有配置文件**:`src/shared/mcp-config.ts` 检查 `.mcp.json` / `.cursor/mcp.json` / `.claude.json` / `.claude/mcp.json` 四种候选,解析 `mcpServers`(stdio `{command}` / http `{url}`),UI 展示 enable/disable 状态 + 敏感 env 脱敏[源码 `mcp-config.ts`]。**Orca 不注入 mcpServers 到 agent spawn**——它把 CLI 拉起来,CLI 自己读项目里的 `.mcp.json`。Orca 是「配置可见性 UI 层」,不是「能力提供方」。
- **传输**:对外部 MCP 不选择、不桥接(只读展示);agent 自带工具走 CLI 原生(Codex/Claude 各自的 stdio+http)。**无 stdio→HTTP 桥,无自建 HTTP MCP server**。
- **内部工具 vs 外部工具**:Orca 自有能力(worktree/terminal/browser/PR 面板)= UX 层直集成(prompt 注入 + 进程管理);外部 MCP = 用户在项目 `.mcp.json` 里配、CLI 自己消费、Orca 只读展示。两者泾渭分明,Orca 不混也不聚合。
- **部署形态**:本地桌面(macOS/Windows/Linux)+ 移动伴侣(手机监控/跟进)+ SSH 远程 worktree(在远端机器跑 agent,自动重连 + 端口转发)。**单用户桌面**,非多租户、非服务端 spawn。SSH worktree 形态最接近「服务端跑 agent」,但那是把用户自己的 agent 进程搬到远端 box,不是 hub 给 agent 装工具。
- **对照我们 hub 定位**:
  - **相似**:Orca 也做「多 agent 并排 + worktree 隔离 + 终端/文件能力」,与我们控制台 shell 的 project-scoped agent/Terminal 工作区同构;SSH worktree 的「远端跑 agent + 本地控」与我们「服务端 spawn agent + 浏览器控」结构相似。
  - **差异**:Orca **不是工具/能力 hub**——它不向 agent 暴露任何 MCP 工具,自有能力走 prompt 注入而非 MCP。我们是「给 agent 装能力的统一层」,Orca 是「编排 agent + 给 agent 提供工作环境(worktree/terminal/PR)的外壳」。Orca 对 MCP 的角色是「读配置文件给用户看」,与我们的「hub 是能力源」正交。
  - **可借鉴**:① Design Mode 的「点击 UI → HTML/CSS/截图进 prompt」是我们 browser_ 域可参考的**非 MCP 降级形态**(简单场景 prompt 注入比 MCP 工具更轻,与定位文档「browser_ 是语义增强」呼应);② 多 agent + worktree 隔离 + 移动伴侣监控的编排 UX;③ 对用户项目里已有 `.mcp.json` 的**只读展示 + 脱敏**作为我们「外部 MCP 转发」UI 的参考(我们走转发,Orca 只读,但敏感 env 脱敏原语通用)。
  - **需规避**:Orca 的「自有能力全走 prompt 注入、不建 MCP server」对简单场景成立,但**不可扩展到需要结构化输入输出/可见性裁剪的能力域**(wiki 查询、browser 操作需要 schema + tools/list 动态裁剪,prompt 注入做不到)。这正是我们选 MCP 而非全 prompt 注入的理由——Orca 是反例对照组。
  - **证据强度**:[源码] 行级(`mcp-config.ts` 全文 + grep 全仓无 server 类/无 SDK 依赖)。

#### Proma(proma-ai/Proma,`~/repos/proma`,commit ~2026-07)[源码]

- **定位**:开源(Electron)本地优先 AI 桌面应用。多模型 Chat + 通用 Agent + 工作区 + Skills + MCP + 远程机器人(飞书/钉钉/微信桥接)+ 记忆。内置 Claude Agent SDK 与 Pi Agent SDK 两套运行时。**是 agent 工作台,带一个内置 MCP 能力层**——本组里最像我们 hub 定位的样本。
- **怎么给 agent 装能力(三层,关键)**:
  1. **内置 MCP = Claude Agent SDK 进程内 MCP server**(`apps/electron/src/main/lib/builtin-mcp/`):`injectBuiltinMcpServers()`[源码 `registry.ts`] 把 `nano-banana`(Gemini 生图)、`automation`、`collaboration` 三个内置能力用 **`sdk.createSdkMcpServer()`**[源码 `nano-banana-mcp.ts` L342] 注入 `mcpServers` 对象——即 Claude Code 的 `type:"sdk"` 路径,**进程内函数注册,不走任何 wire transport**。`chrome-devtools` 内置能力则用 **stdio `npx chrome-devtools-mcp@latest`** spawn[源码 `builtin-mcp/chrome-devtools.ts`],`required:false` 启动失败不阻塞主会话。`default-mcp.json` 编译进包作单一事实源,内置项 `kind:'internal'` 不写入工作区 `mcp.json`、`deletable:false` 删除护栏、保留名 `RESERVED_BUILTIN_KEYS` 防冲突[源码 `baseline.ts`]。
  2. **用户配置 MCP = Claude runtime 原生 mcpServers / Pi runtime 自建桥**:Claude runtime 把用户在工作区 `mcp.json` 配的 server 直接交给 SDK 原生 `mcpServers`(stdio/http/sse);Pi SDK 无等价 `mcpServers` 参数,Proma 在主进程自连(`StdioClientTransport`/`StreamableHTTPClientTransport`/`SSEClientTransport`),把 MCP tools 映射成 Pi `customTools`[源码 `adapters/pi-mcp-tools.ts` L96-149]。传输选择 UI `McpServerForm.tsx` 暴露 `stdio / http(Streamable HTTP) / sse` 三选项[源码]。
  3. **传输归一化**(`packages/shared/src/utils/mcp-transport.ts`):`streamableHttp`/`streamable-http`/`streamable_http` 别名归一到 `http`;有 `command` → stdio,有 `url` → http,都没有 → 默认 stdio[源码]。
- **传输(最关键章节)**:
  - **内置能力 = 进程内 SDK MCP(`createSdkMcpServer`),无 wire**——天然无状态(每次 agent 会话内函数调用,无 session 概念),但**不是 HTTP**。这是「local 工具无状态化」的**进程内分支**,与我们「stateless HTTP」同属无状态家族,传输形态不同。
  - **内置能力退路 = stdio npx spawn**(`chrome-devtools`)——**stateful 长驻子进程**,与第一轮编辑器 local MCP 一致。
  - **用户配置 MCP** = stdio(stateful 长驻子进程,SDK `Client` 跨 turn 持有)/ Streamable HTTP(client 侧,连远端)/ SSE。**Streamable HTTP 仅用于 remote**——和第一轮编辑器结论一致。**无 stdio→HTTP 桥**。
- **内部工具 vs 外部工具**:三层清晰隔离——① 进程内 SDK MCP(内置,`kind:'internal'`,代码注入,不落 `mcp.json`,保留名);② stdio npx 内置(chrome-devtools,写 `mcpServers` 但 `required:false`);③ 用户工作区 `mcp.json`(外部,可 stdio/http/sse)。**保留名机制**(`RESERVED_BUILTIN_KEYS`)防用户配置与内置撞名——干净的内外隔离原语。
- **部署形态**:本地桌面(单用户),`~/.proma/` JSON/JSONL 文件组织,无数据库。有远程机器人桥接(飞书/钉钉/微信触发本机 agent)和商业版/企业版(团队额度管理)——但 agent 仍跑在本机桌面,**非服务端 spawn agent 的多租户形态**。商业版「Proma Cloud API Key」是把 LLM/工具/多模态能力以 API 暴露给外部应用,方向相反(它是 server 卖能力给别人),不是「hub 给自己 spawn 的 agent 装工具」。
- **对照我们 hub 定位**:
  - **相似**:Proma 的「内置 MCP 层给 agent 装自有能力」**结构上最像我们 hub 的内部域**——`default-mcp.json` 单一事实源 + `kind:'internal'` 不落用户配置 + 保留名防冲突 + `injectBuiltinMcpServers()` 统一注入入口,这一套是干净的内/外 MCP 分层设计,直接可借鉴。Pi runtime 无 `mcpServers` 故自建桥把 MCP tools 转 `customTools`,印证「不同 agent runtime 能力接入面不一,需要适配层」(我们 stdio 桥同源问题)。
  - **差异(核心)**:Proma 内置能力走 **`createSdkMcpServer()` 进程内**,我们走 **stateless Streamable HTTP**。两者都无状态,但 Proma 是「进程内函数调用,零 wire」,我们是「HTTP per-request」。Proma 的取舍适合**单机桌面、agent 与 hub 同进程**;我们的取舍适合**服务端多租户、hub 与 agent 可分离、需水平扩展**。**这正是第一轮「无状态的两条路:进程内 vs stateless HTTP」在新样本里的再次体现**——Proma 选了进程内那条,我们选了 HTTP 那条,都无状态,驱动力是部署形态(桌面 vs 服务端)。
  - **可借鉴**:① `default-mcp.json` 编译进包 + 单一事实源 + `getBuiltinMcpName()` 统一取名(防注入器/UI/prompt 三处漂移)——我们 hub 的能力域 manifest 可照此结构;② `RESERVED_BUILTIN_KEYS` 保留名防用户外部 MCP 与内置撞名;③ `injectBuiltinSafely()` try/catch 隔离——单个内置能力注入失败不阻塞主会话(我们 hub 工具注册应同此);④ `required:false` + `startup_timeout_sec` 让可选能力启动失败降级;⑤ per-项目 `mcp.json` + 本地项目根目录选择(项目级配置,与 Cline/Windsurf 全局配置之弊相反,与我们 per-project 能力域一致)。
  - **需规避**:① `chrome-devtools` 用 stdio npx spawn = stateful 子进程(我们能避则避,用 stateless HTTP 暴露浏览器能力);② 内置能力与用户 MCP 共享 `mcpServers` 命名空间(虽有保留名,但同表混置)——我们可考虑内置域与外部转发分两个 `mcpServers` entry 或前缀隔离;③ 进程内 SDK MCP 锁死 Claude Agent SDK(`createSdkMcpServer` 是 Claude SDK API)——对 Codex/其他 runtime 无等价,只能像 Pi 那样自建桥。我们 stateless HTTP 对所有支持 `type:"http"` 的 runtime 通用,是更解耦的形态。
  - **证据强度**:[源码] 行级(`registry.ts`/`baseline.ts`/`nano-banana-mcp.ts`/`chrome-devtools.ts`/`pi-mcp-tools.ts`/`mcp-transport.ts`/`McpServerForm.tsx`)。

#### Codex app(OpenAI 官方桌面应用,Electron,闭源包装)[官方文档 + 弱证据]

- **定位**:OpenAI 官方 Codex 桌面应用(2026-02 发布,Mac-only 起,后扩 Windows)。「agent 的 command center」,多项目/多线程并行跑 Codex agent,diff review + 评论,内置 worktree 支持,与 CLI/IDE 扩展共享历史与配置。**是 CLI 的 GUI 壳 + 多 agent 编排 UX,不是独立工具层**。开源的只有 CLI(`openai/codex`),Electron 包装代码未开源(社区 issue 明说「electron wrapper code isn't in this repo」[弱证据 openai/codex issue #25188])。
- **怎么给 agent 装能力**:**完全继承 Codex CLI**——工具/能力/MCP 全走 CLI 引擎。app 增加的是「项目/线程/worktree/skills/automations/sandbox/内置终端」的**管理 UI**,不是新的能力接入面。MCP 配置仍读 `~/.codex/config.toml` 的 `[mcp_servers]`(与第一轮 Codex CLI 调研一致)。**三轮源码深挖补充**:Codex MCP 实际是 **project-scoped**(绑 git repo/worktree,thread 共享 project MCP、**无 per-conversation scope**)+ user-global 基线 + **trust 门**(untrusted project 的 MCP 解析但不连接),详见三轮「概念层级 × scope」节。
- **传输**:继承 CLI——**stdio + Streamable HTTP** 都支持[官方文档多份第三方配置指南一致,弱证据]。社区报告 app 有 **display bug**:把配成 `streamable_http` 的 server 显示成 STDIO[弱证据],但底层连法是 CLI 的。**无 app 自有的 stdio→HTTP 桥,无 app 自建 MCP server**——它不重新实现 transport,只复用 CLI。
- **内部工具 vs 外部工具**:Codex CLI 内置工具(文件/终端/apply_patch/search 等)进程内;外部 MCP 走 `config.toml`。app 不引入新的内外划分。
- **部署形态**:本地桌面(Electron)。Cloud 与 local agent 都支持(app 可让 agent 跑本地或远端[官方文档])。**单用户桌面,非多租户**。
- **对照我们 hub 定位**:
  - **相似**:Codex app 的「多 agent + worktree + diff review + 内置终端」与我们工作台 agent/Terminal/Git 检查同构;「与 CLI 共享配置」印证我们「hub 配置在 spawn 时注入 CLI」的共生关系。
  - **差异**:Codex app **不是 hub**——它不向 agent 暴露额外能力,只是 CLI 的编排外壳。我们是「给 agent 装能力的层」,app 是「管 agent 的壳」。两者正交。app 的 MCP 支持完全等于 CLI 的 MCP 支持(第一轮已详),本轮无新增传输事实。
  - **可借鉴**:① 「GUI 壳复用 CLI 引擎、不重造 transport」= 我们「hub 不重暴露 agent 原生工具,只补 agent 没有的」同源思想;② app/CLI 共享 `config.toml` 印证「单一 MCP 配置源」的价值。
  - **需规避**:app 闭源包装 + display bug(把 streamable_http 显示成 STDIO)说明「GUI 层 transport 展示易与底层不一致」——我们若做 MCP 管理 UI,展示态必须与实际 spawn 注入态严格对齐(第一轮 Cursor 的 streamable-http 分歧同族)。
  - **证据强度**:定位/功能 [官方文档](openai.com + devclass + 社区);MCP 支持 [官方文档](多份第三方配置指南一致)+ [弱证据](display bug issue);**transport 行级细节继承第一轮 Codex CLI 调研,本轮不重复**。

#### 扣子 / Coze(字节跳动,coze.cn / coze.com,闭源)[官方文档 + 弱证据]

- **定位**:国内大厂 AI 应用搭建平台(Bot 搭建 + 工作流编排 + 扣子空间 agent 工作台)。**两条产品线,工具体系不同**(关键,易混淆):
  - **经典 Coze Bot/扣子编程**:插件(plugin)体系 = **自研 OpenAPI/HTTP 协议**。插件 type 固定 `openapi`(= HTTP),定义 `sub_url`/method/header/query/path 参数,Coze 托管 HTTP 调用[官方文档 `coze-dev/coze-studio` wiki Plugin Configuration]。插件分官方内置 / 自定义 / 商业版收费三类。**非 MCP**。
  - **扣子空间(Coze Space)**:agent 工作台,**用 MCP 扩展库**给主 agent 装能力。内置通用 MCP 扩展(高德地图/飞书文档/Notion/GitHub/MySQL 等)直接进主 agent,模型按需自动调用;用户可加自定义 MCP 扩展(把扣子编程的工作流**发布为 MCP 服务**到空间扩展库)[官方文档 `docs.coze.cn/guides_publish_to_space`]。
- **怎么给 agent 装能力(扣子空间 MCP 路径,最相关)**:
  - **Coze 是 MCP client(host)**:扣子空间 agent 连「扣子托管的 MCP server URL」——**云托管 remote HTTP**。用户配置「MCP 插件 URL」指向外部/扣子托管的 MCP server,Coze 不在用户本地 spawn stdio 进程[弱证据,多份中文社区拆解一致:「MCP Server 必须由你在外部独立部署,Coze 不会生成、托管、运行任何 MCP Server 进程」——此为经典 Bot MCP 调用路径;扣子空间内置 MCP 扩展则是扣子自家云托管]。
  - **Coze 也可作 MCP server**:扣子编程工作流可发布为 MCP 服务,供 Trae/Cursor/Claude 等外部 MCP client 调用[官方文档 `docs.coze.cn/guides_call_plugin_mcp`]——封装官方付费/三方付费插件为 MCP 工具,支持临时凭证(1 天)/长期凭证,按订阅套餐限月调用次数 + QPS。
- **传输(最关键)**:扣子空间 MCP 扩展 = **云托管 remote Streamable HTTP**(扣子自家云跑 MCP server,agent 连 URL)。经典 Bot 插件 = OpenAPI/HTTP(非 MCP)。**无 local stdio 给 agent 装工具**——Coze 是云端平台,agent 本身跑在云上,「local」对 Coze 不成立。**Coze 的 MCP 是「remote 云端」形态,不是「服务端给本地 agent 装 stateless HTTP」**——它的 agent 与 MCP server 都在 Coze 云内,对 Coze 而言是「内部云调用」,对外部用户而言是「连远端」。
- **内部工具 vs 外部工具**:扣子空间内置 MCP 扩展(高德/飞书/Notion 等官方策展)= 平台自带;自定义 MCP 扩展(用户工作流发布)= 用户/第三方;商业版付费插件 = 收费。三层清晰,配额/计费按订阅套餐(个人/企业,月调用次数 + QPS 限)。
- **部署形态**:**云端 SaaS,多租户**(coze.cn 国内 / coze.com 海外;Coze Studio 开源版可自部署,插件接入官方/自定义/商业版三类)。agent 跑在云上,worktree/本地文件概念不适用(扣子空间有「工作区」但语义是任务边界非 git worktree)。
- **对照我们 hub 定位**:
  - **相似**:扣子空间的「平台内置 MCP 扩展 + 用户自定义 MCP 扩展 + agent 自动调用」**结构上最像我们 hub 的内外 MCP 分层**(内置域 + 外部转发),且是本组唯一**大厂平台用 MCP 给 agent 装能力**的样本——印证 MCP 在平台层(非仅编辑器/CLI)已被采纳。扣子把「工作流发布为 MCP server」的**反向暴露**是我们「外部转发」的镜像(我们消费第三方 MCP,Coze 生产 MCP 给第三方)。
  - **差异(核心)**:扣子是**纯云端**,MCP 全是「云内/远端 HTTP」,**没有「服务端给本地 agent 装 stateless HTTP 工具」这条**——它的 agent 不在用户本地,「local 工具」概念不存在。我们「服务端 spawn CLI agent + hub 用 stateless HTTP 给该 agent 装 local 能力」的形态,扣子没有对应物(扣子 agent 是云原生,不 spawn 本地 CLI)。扣子经典 Bot 插件用自研 OpenAPI 而非 MCP,说明**大厂平台对 Bot 工具层仍倾向自研协议**(可控、计费、配额),MCP 只在「扣子空间」这条新产品线用——MCP 在大厂是「新 agent 工作台」的选型,不是「全平台统一」。
  - **可借鉴**:① 「工作流/应用发布为 MCP server」= 我们 hub 的「外部转发」可对称提供「内部能力也可发布为 MCP 给外部 client」(双向);② 扣子空间「内置 MCP 扩展自动调用、无需用户配」= 我们内部域对 agent 默认可见、免配置,与定位文档「基线 + 域,tools/list 动态裁剪」一致;③ 订阅套餐 × 月调用次数 × QPS 限 = 多租户配额模型(若我们 hub 要做多租户计费);④ 临时凭证/长期凭证两档 = 外部 MCP 转发的凭证管理参考。
  - **需规避**:① 大厂平台 Bot 插件层用自研 OpenAPI 而非 MCP——**别以为「大厂都用 MCP」**,扣子经典 Bot 没用,只在扣子空间用。我们「统一 MCP」是更激进的统一,扣子是「MCP + 自研协议并存」;② Coze 的 MCP 是云端 remote 形态,**不给我们「local 工具 stateless HTTP」提供反例**,它的「无状态」是云内调用天然无状态,与我们「服务端给本地 agent 装 stateless HTTP」不是同一路径。
  - **证据强度**:插件 OpenAPI 协议 [官方文档](coze-dev/coze-studio wiki);扣子空间 MCP 扩展 + 工作流发布 MCP [官方文档](docs.coze.cn);「Coze 不托管/运行 MCP server 进程」、云托管形态 [弱证据](中文社区拆解,多源一致但非官方明文);transport 行级(stdio/http/sse 哪种)未能从官方文档拿到明文,标 [弱证据]。

#### WorkBuddy(腾讯,workbuddy.ai,闭源)[官方站点 + 弱证据]

- **定位**:腾讯(腾讯云 CodeBuddy 团队)个人 AI agent 工作台。一句话指令 → 多 agent 规划/并行执行 → 交付完整产物(报告/分析/文档/PPT/网站)。对标 OpenAI Codex app / Anthropic Claude 桌面,但面向**办公/知识工作**而非编码。多 agent 架构 + 本地文件访问 + 广泛集成(Slack/Telegram/QQ Mail/腾讯文档等)[官方站点 workbuddy.ai + eigent.ai review]。有 benchmark(tencent/workbuddy-bench on HuggingFace,真实工作任务评测)。
- **怎么给 agent 装能力**:**Skills + Connectors + Experts 三层**[官方 codebuddy docs + 第三方 review]:
  - **Experts** =「知识」角色(领域专家 prompt,知道怎么做);**Skills** =「做」角色(封装脚本/工作流执行动作:读写文件/生成 PPT/联网搜索);**Connectors** = 接外部服务(QQ Mail/腾讯文档/Slack/Telegram 等,读操作外部服务)。
  - **Connectors 技术形态含「MCP + CLI(标准化协议)」**——自定义连接器 = 安装 MCP 服务,腾讯会议/腾讯乐享等均走 MCP[官方 codebuddy Connector 文档 + tencent.com 新闻稿]。**【三轮更正】** 二轮基于公开材料缺失推断「不用 MCP」是错的:官方 Connector 文档明文用 MCP。WorkBuddy 是**同类 MCP 产品**,Connectors scope 模型可直接参考(见三轮「概念层级 × scope」)。
- **传输**:Connectors 走 MCP(标准化协议,CLI 形态)[官方 Connector 文档]。具体 stdio/HTTP 未见明文[弱证据]。Skills 是平台内脚本/工作流(进程内/云内)。
- **内部工具 vs 外部工具**:Skills(平台自带脚本/工作流,含 nanoskill 生态可加 agent skills[弱证据 nanoskill.ai])= 内部;Connectors(对接外部 SaaS,走 MCP)= 外部;Experts(领域 prompt)= 知识层。三层中 Connectors 走 MCP 标准协议。
- **部署形态**:**本地桌面应用**(Mac/Windows 下载,workbuddy.ai 官方下载页)+ 云端模型。**单用户桌面**,agent 跑本机 + 调云端模型。团队版/企业版存在(腾讯云页提 Team Edition)。**非服务端 spawn agent 的多租户 hub 形态**(虽有云服务,但定位是桌面 agent 工作台)。
- **对照我们 hub 定位**:
  - **相似**:多 agent 规划/并行 + 本地文件访问 + 任务工作区边界,与我们控制台 agent 工作区结构相似;「Skills 内部 + Connectors 外部」的内外分层与我们「内部域 + 外部转发」概念同构(只是协议不同)。
  - **差异(三轮更正)**:WorkBuddy **用 MCP**(Connectors 标准化协议,非「自研不用 MCP」)。它是**办公场景**桌面 agent 工作台(凭据全局 OAuth、文件 per-task 授权),我们是**服务端多租户**控制台(project ≈ 仓库边界)。两者同走 MCP,但部署形态不同致凭据/文件粒度取舍不同——WorkBuddy 的 MCP scope 模型(四层概念 + 三层分离,见三轮「概念层级 × scope」)可参考,但别照搬其全局凭据(办公场景合理,我们 DevOps 定位 per-project 凭据更安全)。
  - **可借鉴**:① Experts(knowledge)/Skills(do)/Connectors(external)三层分离 = 「知识 vs 能力 vs 外部接入」的语义分层,我们 hub 也可区分「知识/行为 skill-market」vs「能力/工具 MCP」(定位文档已提 skill-market 与 MCP 互补,WorkBuddy 的 Experts/Skills 切分是参考);② 任务工作区边界(授权文件夹范围) = 我们 project-scoped 能力可见性的办公场景镜像;③ benchmark 驱动(tencent/workbuddy-bench)说明 agent 工作台可用真实任务量化评测。
  - **需规避**:大厂分产品线选协议——扣子经典 Bot 自研 OpenAPI(适配层问题仍在),但 **WorkBuddy 已用 MCP**(三轮更正,不再是自研协议反例)。若接的大厂平台确是自研协议(如扣子 Bot),「统一 MCP」需适配层(类似 hapi 的 stdio 桥,但「自研协议→MCP」桥更重)。
  - **证据强度**:定位/三层架构 [官方 codebuddy docs + workbuddy.ai,较一手];**Connectors 用 MCP [官方 Connector 文档 + tencent.com 新闻稿,正证据——三轮更正二轮「公开材料无 MCP」的负证据推断]**;具体传输形态 stdio/HTTP [弱证据,未见明文];benchmark [HuggingFace tencent/workbuddy-bench,官方数据集]。

### 二轮核心判断修正

**判断:「我们用 stateless Streamable HTTP 给 agent 装 local 工具是全场最激进的」——在新增 5 个竞品里仍成立,且加强。**

逐一核对「有没有哪个也做了服务端 stateless HTTP 给 agent 装 local 工具」:

| 竞品 | 给 agent 装 local 能力的方式 | 是否 stateless HTTP 给 local 工具 | 备注 |
|---|---|---|---|
| **Orca** | 自有能力全走 prompt 注入(worktree/terminal/browser/PR 直集成);外部 MCP 只读用户 `.mcp.json`、不注入、不桥接;**不造任何 MCP server** | **否** | 连 MCP server 都不建,更无 transport 可言。local 能力走 prompt 注入(最轻,无 wire) |
| **Proma** | 内置能力走 `createSdkMcpServer()` **进程内 SDK MCP**(无 wire,天然无状态);退路 stdio npx spawn(chrome-devtools,stateful);用户外部 MCP 走 stdio/http/sse(HTTP 仅 remote) | **否(进程内无状态,非 HTTP)** | 无状态家族的**进程内分支**,与我们 stateless HTTP 是同族异支。印证「local 工具无状态化」方向,但传输形态不同 |
| **Codex app** | 继承 Codex CLI(stdio + Streamable HTTP,但 HTTP 用于连远端 server);app 不重造 transport | **否** | 等同第一轮 Codex CLI,无新增 |
| **扣子/Coze** | 扣子空间 MCP 扩展 = **云托管 remote HTTP**(agent 与 MCP server 都在 Coze 云内);经典 Bot 插件 = 自研 OpenAPI/HTTP(非 MCP) | **否(云端 remote,非 local)** | MCP 在大厂是云端形态,「local 工具」对云平台不成立 |
| **WorkBuddy** | Skills/Connectors/Experts 三层,**Connectors 走 MCP**(标准化协议,三轮更正) | **否(桌面办公场景,非服务端 local stateless HTTP)** | ~~反例对照组~~ → 三轮更正为**同类 MCP 产品**(办公桌面形态);补概念层级 scope |

**结论:5 个竞品无一对「服务端 stateless HTTP 给 agent 装 local 工具」做反例。** 因此:

1. **判断不修正,加强**。第一轮「5 编辑器 + 3 网关无一用 stateless HTTP 做 local 工具」+ 第二轮「5 新竞品仍无一」→ 累计 **13 个竞品(2 CLI + 5 编辑器 + 4 网关 + 2 桌面应用 + 2 大厂平台,去重)无一用 stateless HTTP 给 local 工具**。我们的「stateless HTTP 给 local 工具」是**全场独一份**。
2. **「无状态化」方向被新样本再次验证**(只是分支不同):Proma 选**进程内无状态**(`createSdkMcpServer`,Claude Code `type:"sdk"` 路径),我们选**stateless HTTP**。两者都无状态,驱动力是部署形态——**桌面单进程 → 进程内;服务端多租户/可水平扩展 → stateless HTTP**。我们与 Proma 的差异是**部署形态差异的必然**,不是路线之争。这给第一轮「唯一要正视的取舍」补了第二样本:无状态不只 HTTP 一条路,但我们的服务端多租户定位锁死了 HTTP 这条。
3. **大厂平台对工具层的选择分化(三轮修正)**:扣子空间用 MCP(云端 remote)、扣子经典 Bot 用自研 OpenAPI、**WorkBuddy 用 MCP**(Connectors 标准化协议,三轮更正)。即大厂「新 agent 工作台」(扣子空间/WorkBuddy)已普遍采纳 MCP,经典产品线(扣子 Bot)仍保留自研协议。我们「统一 MCP」与采纳 MCP 的大厂新工作台方向一致,差别在我们**对所有 runtime 通用**,大厂是**分产品线选**。
4. **新可借鉴(本轮增量)**:① Proma `default-mcp.json` 单一事实源 + `RESERVED_BUILTIN_KEYS` 保留名 + `injectBuiltinSafely()` 错误隔离 + `required:false` 可选降级——内/外 MCP 分层的工程原语,直接抄;② Proma Pi runtime 桥(无 `mcpServers` 的 runtime 要自建 MCP→customTools 适配)印证「不同 runtime 能力接入面不一,需适配层」(我们 stdio 桥同族问题);③ Orca Design Mode「点击 UI → HTML/CSS/截图进 prompt」是 browser_ 域的**非 MCP 降级形态**(简单场景 prompt 注入比 MCP 工具轻);④ 扣子「工作流发布为 MCP server」的双向暴露(我们外部转发可对称提供内部能力外发);⑤ WorkBuddy Experts/Skills/Connectors 三层 = 「知识 vs 能力 vs 外部接入」语义分层(定位文档 skill-market vs MCP 互补的参考)。
5. **新需规避(本轮增量)**:① 大厂分产品线选协议——扣子经典 Bot 自研 OpenAPI,但**扣子空间 + WorkBuddy 已采纳 MCP**(三轮更正 WorkBuddy)。我们「统一 MCP」与采纳 MCP 的大厂新工作台方向一致,差别在我们对所有 runtime 通用、大厂分产品线选;② GUI 层 transport 展示易与底层不一致(Codex app display bug、第一轮 Cursor 分歧)——我们若有 MCP 管理 UI,展示态必须与 spawn 注入态严格对齐;③ 进程内 SDK MCP(`createSdkMcpServer`)锁死 Claude SDK,对其他 runtime 无等价需自建桥——我们 stateless HTTP 对所有 `type:"http"` runtime 通用,是更解耦的形态,**这是我们选 HTTP 而非进程内的额外收益**(第一轮未提,本轮 Proma 对照补上)。

> **给整合者的提示**:本轮不修正 `mcp-hub-positioning.md`,但补强了「我们是最激进的一个」的证据 base(13 竞品无反例)+ 补了「无状态的两条路(进程内 vs stateless HTTP)由部署形态决定」的第二样本(Proma)。整合时建议在 positioning「取舍」节明确:**桌面单进程可走进程内 SDK MCP(如 Proma),我们因服务端多租户/水平扩展定位锁死 stateless HTTP**——这是比第一轮「无状态损失 stdio 白给的东西」更深的辩护(不是「我们丢了什么」,而是「我们部署形态决定了哪条无状态路」)。

## 三轮补充:概念层级 × scope 维度(Codex 源码深挖 + WorkBuddy 更正)

> 状态:三轮补充(2026-07-31)。用户追问「Codex app 有对话/项目概念,MCP 怎么挂;WorkBuddy 怎样」——发现前两轮**未讲清 MCP 配置在产品概念层级(对话/项目/全局)的挂载粒度**,且 WorkBuddy「不用 MCP」是事实错误(已就地更正二轮)。本轮聚焦补这个维度。

### 核心问题:MCP/工具配置挂在哪个概念层级?

前两轮聚焦「传输方式(stdio vs stateless HTTP)」和「是否用 MCP」,没讲清 **MCP/工具配置在概念层级(对话/项目/全局)上的挂载粒度**。这对我们 per-project hub(`/mcp/{project}`)是最该对齐的维度。

### Codex(源码级,最强证据):project-scoped + 无 per-conversation MCP

- **模型**:**project-scoped(主)+ user-global 基线 + CLI override** 混合。MCP **绑在 project 上**,**无 per-conversation MCP scope**——conversation(thread)只是 project 内逻辑分支,共享所属 project 的 MCP。
- **配置层级(低→高覆盖)**:`system(/etc/codex/config.toml)` < `user(~/.codex/config.toml,主入口)` < `profile` < `cwd` < `tree(父目录链)` < **`repo/project($(git rev-parse --show-toplevel)/.codex/config.toml,核心)`** < `CLI override(-c,最高)`[源码 `config/src/loader/mod.rs` L99-106, L366]。
- **conversation 继承 project MCP**:`thread/start` 只传 cwd(无 MCP 字段)→ Codex 用 cwd 解析 `active_project` → 读该 project 的 config.toml 叠加 user/global → `ConfigLayerStack.effective_config()` 合并 McpConfig。**同 project 下所有 thread 共享一套 MCP**[deepwiki 源码引用]。
- **换 worktree/cwd = 换 MCP**:落到不同 git repo/worktree → 触发该 worktree 自带的 `.codex/config.toml`。
- **trust 模型(安全层,关键)**:cwd/tree/repo 三层均 "loaded but disabled when untrusted"[L104-106 原文]。未在 `~/.codex` 注册为 trusted 的 project,其 project-local MCP **被解析但不连接**——防恶意 repo 自动起外部 MCP。`TrustLevel` + `projects_trust: HashMap`[L841] + `is_trusted()`[L856]。
- **工具非全可见(多级裁剪)**:`enabled_tools` 白名单 / `disabled_tools` 黑名单 + `default_tools_approval_mode` + per-tool `approval_mode` + `tool_is_model_visible()`(tool 元数据 `ui.visibility` 含 `"model"` 才对模型可见)[源码 gh search `mcp_edit.rs` / `core/src/mcp_tool_exposure.rs`]。
- **AGENTS.md / codex.md 只承载 instructions,不声明 MCP**——MCP 仅来自 config.toml 的 `[mcp_servers.*]`(`McpServerConfig` 定义于 `config/src/mcp_types.rs`)。

### WorkBuddy(官方文档级):四层概念 + 三层分离 scope

- **概念四层**:`Memory`(个人长期偏好)> `Project`(团队级上下文容器)> `Workspace`(本次任务文件目录)> `Task`(一次指令)[官方 cloud.tencent.com + 第三方 cnblogs 解读]。
- **三层分离 scope(关键洞察)**——WorkBuddy **没有把工具配置一刀切 per-project**,而是三层分离:

  | 维度 | 挂在哪层 | 为什么 |
  |---|---|---|
  | 凭据 / 市场 / 个人偏好 | **全局**(用户账号) | OAuth token 集中维护,一次配所有任务复用 |
  | 能力编排与默认值(用哪些 Skill/Connector/Expert) | **per-project** | 项目空间预设,注入该项目所有新任务,团队复用 |
  | 文件访问范围 | **per-task**(Workspace) | 每次任务独立授权工作目录,避免一次授权全盘 |

- **Experts 不持权限**:权限挂在工具(Skill/Connector)上,角色只调用工具。多 agent 并行时每位专家带自己「工具链」,工具可见性按角色**隐式划分**而非运行时动态裁剪[官方 Expert 文档 + 弱推断]。
- **task 有持久化载体**(任务历史 + 云端 7×24 托管,关客户端仍运行),但**文件范围 per-task**。

### 三列对照:概念层级 × 工具/MCP scope

| 维度 | **Codex**(源码级) | **WorkBuddy**(文档级) | **我们**(当前 hub) |
|---|---|---|---|
| 能力主挂载粒度 | project(git repo/worktree/cwd) | project(项目空间预设默认能力) | project(`/mcp/{project}`) |
| conversation/task 独立挂 MCP | ❌(thread 共享 project MCP) | ❌(task 继承 project 预设) | ❌(session 继承 project) |
| 全局基线层 | ✅ user/system config.toml | ✅ 凭据/市场/偏好 | ❌ 当前无 |
| 项目级覆盖 | ✅ .codex/config.toml | ✅ project 预设注入新任务 | ✅ mcp.json 能力开关 |
| CLI 临时覆盖 | ✅ -c(最高) | — | ✅ spawn --mcp-config(我们注入) |
| **trust 安全门** | ✅ untrusted project MCP 解析但不连接 | 沙箱 | ❌ 当前无 |
| 文件访问范围 | cwd=project(+ trust 门) | per-task Workspace | cwd=projectPath |
| 工具可见性裁剪 | enabled/disabled + approval + model-visible | 按专家角色隐式 | 计划:tools/list 动态裁剪 |

### 对我们的核心结论

1. **方向被验证**:Codex 源码 + WorkBuddy 文档都确认「能力挂 project,conversation/task/thread 不独立挂 MCP,只继承所属 project」。Codex `thread/start` 只传 cwd、无 MCP 字段,thread 用 cwd 解析 project 后读该 project MCP——和我们 session 继承 project MCP 语义一致。**两个成熟产品都是「进 project 锁定一套 MCP,对话只是 project 内分支,不换 MCP」**。我们的 per-project hub + session 继承设计是对的。

2. **trust 门 + 凭据管理 = 「外部 MCP 转发」阶段才引入,当前基座不需要**:
   - Codex 的 trust 门是因为它**读用户 project 里的 `.codex/config.toml`**(可能含恶意外部 MCP server URL);我们当前**不读用户 project 的任意 MCP**——我们注入的是自己提供的内部 hub,所以没有这个攻击面。
   - WorkBuddy 的三层分离(全局凭据 + per-project 能力 + per-task 文件)——我们当前「能力 per-project」对齐,但凭据/文件两维折叠在 project 里。短期 OK(内部 hub 无外部凭据、文件 cwd=projectPath 对代码仓库场景合理),**「外部 MCP 转发」阶段凭据维度才真正冒出来**(OAuth token 该全局还是 per-project)。
   - **内部能力域(wiki/browser 等)= 官方可信能力**(用户理解它们是平台官方提供,信任度最高)——**内部 hub 无需 trust 门**。trust 门纯粹为「外部 MCP 转发」(用户配的第三方 server)准备。

3. **与落地顺序一致**:安全/凭据机制(trust 门、全局凭据、per-task 文件授权)的引入时机是「外部 MCP 转发」能力域,不是基座/wiki/browser 阶段——与 positioning「落地顺序:基座 → wiki → browser,插件抽象等第二个样本再提取」节奏一致。本轮已把这条 deferred 决策写回 positioning「待深化」节。

### 证据强度

- **Codex**:源码原文(`config/src/loader/mod.rs` 层模型 L99-106/L366 + gh search 命中 `mcp_types.rs`/`mcp_edit.rs`/`mcp_tool_exposure.rs` struct/函数)= 最强;thread/MCP 绑定关系为 deepwiki 源码引用(次强)。注:`~/repos/codex` 完整 clone 因仓库较大超时未留存,验证改用 raw 文件 + `gh search code` 远程命中。
- **WorkBuddy**:[官方一手] workbuddy.ai/workbuddy.cn、cloud.tencent.com/product/workbuddy、codebuddy.cn docs(Connector/Expert-Center/Overview)、tencent.com/en-us/articles/2202350;[第三方·弱] cnblogs.com/tgzhu/articles/21629693(四层解读,清晰但非官方)、eigent.ai/blog/workbuddy-ai-review。**公开材料未覆盖**:Workspace 任务结束后授权是否自动回收、专家团是否做硬性运行时 tool-filter。
