# MCP Apps / Skills / MCP server 注入机制：三家 CLI 生态现状调研

> 调研日期：2026-10-20。服务对象：agents-remote 两条产品计划——① web 控制面检测 CLI 流中 MCP Apps UI 信号并渲染（我们当宿主，CLI 是 MCP client）；② 自建 sidecar HTTP MCP server（ar-hub，已落地 `api/src/mcp-hub-server.ts` + `api/src/mcp-injector.ts`）在 spawn 时注入各家 CLI。
>
> **证据分级**：`[实测]` = 本机一手实验 / 二进制直读 / 本地源码直读（最高置信）；`[官方文档]` = 官方 docs 站；`[官方repo]` = 官方 GitHub 仓库（源码 / issue / changelog / SEP）；`[社区]` = 社区讨论（弱证据，明确标注）。所有外部结论附来源。不确定项标「未确认」。禁止编造版本号 / flag 名 / 配置键名。
>
> 版本基线：Claude Code 2.1.299（本机实测；网络查得当日最新 2.1.304；源码研究仓 `~/repos/claude-code-sourcemap/restored-src` 还原自 **2.1.88**，行号引用均为该版本）；Codex CLI 0.145.0（本机；最新 release 0.163.0）；ZCode v3.15.x（CDN 3.15.3 / 源码 main 声明 3.16.1）。

## 0. 执行摘要

| 维度 | Claude Code | Codex CLI | ZCode |
| --- | --- | --- | --- |
| MCP Apps 宿主（SEP-1865） | **TUI 不渲染**（官方文档只有排除性描述，client matrix 不含 Claude Code）；但 2.1.299 二进制内置**未公开实验通道**：env `CLAUDE_CODE_MCP_APPS_HOST=true` 使 CLI 对 server 通告 `io.modelcontextprotocol/ui` 扩展，SDK 流带 `mcp_tool_ui_meta_v1` / `mcp_read_resource_v1` capability + `mcp_read_resource` control request，供外部渲染宿主取 UI [实测 A/B] | **TUI 不渲染**；数据管道在 core/app-server（`mcpAppUi`、`appContext.resourceUri`），渲染面是 Codex Desktop / IDE 扩展；feature flag `enable_mcp_apps` under development=false [官方repo] | **已正式发布**：v3.15.1（2026-10-12）"Added support for UI plugins (MCP App)"，桌面 Electron Host 渲染 [官方文档+官方repo] |
| SEP-2640（Skills over MCP）client | **未实现消费**（提案已 Final，SEP 原文明写「Claude Code: prototyped internally; not yet public」）[官方repo=中高] | 不是运行时 client——**插件提交时静态快照导入**（Scan Tools），运行时不调 skills/list [官方文档] | 未发现支持；自有 skills 体系（目录 + 插件分发）[官方文档] |
| MCP server 注入通道 | `--mcp-config`（JSON 文件/inline 串，可多个）+ `--strict-mcp-config`；**同名碰撞 flag 全赢（整条 entry 替换）** [实测+2.1.88 源码] | `-c 'mcp_servers.<name>.url=…'`（deep merge，同 key 覆盖、兄弟 key 存活）或预写 config.toml [实测+官方文档] | **无 CLI flag / 无 env**，只能预写配置文件（`~/.zcode/cli/config.json` 或项目 `.zcode/config.json`，原生键嵌套 `mcp.servers`）[官方repo] |
| 流式输出 MCP tool result | `structuredContent`/`_meta` 在**消息顶层私有扩展字段 `tool_use_result`** 完整透传（子 agent 内被抹掉）；`message.content[].tool_result` 一侧全部文本化降级 [实测+源码] | exec `--json`：`{"type":"mcp_tool_call", result:{content, structured_content, _meta}}`（snake_case）；app-server v2 camelCase `structuredContent` [官方repo] | stream-json 事件 `tool_call_result`，payload `{toolCallId, result: ToolResultPayload, duration, …}` [官方repo] |

三家共识：**终端 TUI 都不渲染 MCP Apps HTML**，渲染宿主都是图形端（claude.ai / Claude Desktop、Codex Desktop、ZCode Desktop）。对我们意味着：web 控制面做 MCP Apps 宿主与各家 Desktop 宿主同位、无竞合；Claude Code 已把宿主数据通道开给外部（正是我们的形态，但属未公开实验能力），ZCode 官方原生支持可作对照实现。

---

## A. Claude Code（Anthropic）

### A1. MCP Apps 宿主支持：公开面「不支持」，二进制面存在未公开实验宿主通道

**公开面结论 [官方文档=高]**：CLI 终端形态当前**不支持** MCP Apps 渲染，无任何公开 flag / env。

- 官方 MCP 文档（code.claude.com/docs/en/mcp，2026-10-20 抓取）对 `ui://` / `text/html;profile=mcp-app` 资源只有**排除性描述**：不进 @ 建议与 resource list，「Reading a UI resource by its URI still works」（读回的是给模型的原始内容，非渲染）；env-vars 全表无 MCP Apps 相关变量。
- CHANGELOG 唯一相关条目是排除性改动：**2.1.281**「Changed MCP resource lists … to skip MCP Apps UI resources」；协议层结构化支持见 **2.1.128**「Support MCP `structuredContent` field in tool responses」（只喂模型，不渲染）。
- GitHub issues 全部无官方回应：#95149（open，2026-09-17，实测 CLI 不 advertise `io.modelcontextprotocol/ui`、工具结果只落 JSON 文本，问官方计划——零回复）；#48132、#88881、#22619、#23958 stale 关闭。Desktop 内嵌 Code tab 的 widget 由服务端 GrowthBook gate 控制，非 CLI 开关。
- 官方 client matrix（modelcontextprotocol.io/extensions/client-matrix）的 MCP Apps 列**不含 Claude Code**。SEP-1865 已于 2026-01-28 合入（PR modelcontextprotocol/modelcontextprotocol#1865）；spec/SDK repo github.com/modelcontextprotocol/ext-apps。术语：媒体类型准确写法 `text/html;profile=mcp-app`，扩展标识符 `io.modelcontextprotocol/ui`。

**二进制/实测面结论 [实测，2.1.299]**：CLI 虽不渲染，但已内置一整套「给外部渲染宿主」的 MCP Apps 数据通道，由未公开 env `CLAUDE_CODE_MCP_APPS_HOST=true` 打开（该 env 不在官方 env-vars 表，无 changelog 条目——属内部实验能力）。

活体 A/B 实验（server 按 MCP Apps 规范声明，探针见附录 D）：

- 设 `CLAUDE_CODE_MCP_APPS_HOST=true`，CLI → server 的 initialize 参数：
  ```json
  {"protocolVersion":"2025-11-25",
   "clientInfo":{"name":"claude-code","title":"Claude Code","version":"2.1.299"},
   "capabilities":{"roots":{"listChanged":true},"elicitation":{"form":{},"url":{}},
     "extensions":{"io.modelcontextprotocol/ui":{"mimeTypes":["text/html;profile=mcp-app"]}}}}
  ```
- 不设该 env：`capabilities` 只有 `roots` + `elicitation`，**无 extensions 字段**。两臂其余完全一致——env 是宿主通告的唯一开关。

二进制直读（2.1.299 minified bundle 字符串 / schema 描述原文）：

- 常量：`"text/html;profile=mcp-app"`、`"io.modelcontextprotocol/ui"`、`"ui://"`、`"ui/resourceUri"`（deprecated 扁平形式）及尺寸上限 4096 / 1024 / 8MB。
- tool 定义 schema 的 `_meta` 描述原文：
  > "The MCP Apps (SEP-1865) members of the tool's `_meta`, for a host that renders the tool's `ui://` resource, under the keys the server used: `ui` (an object: `resourceUri`, a `ui://` string; `visibility`, an array of 'model' | 'app'; …) and the deprecated flat `ui/resourceUri` … Validated and size-bounded; every other `_meta` key is withheld. Present only on a tool that declares one, from CLIs that advertise `mcp_tool_ui_meta_v1`."
- 资源读取 control request schema 描述原文：
  > "Reads one MCP Apps (SEP-1865) UI resource — a `ui://` URI, typically the `_meta.ui.resourceUri` a tool declares — from a connected MCP server the CLI itself dialed, with `resources/read`, **for a host that renders it**. Read-only and no model turn."
- UI 资源对模型隐藏：日志串 "MCP Apps UI resource(s) left out of …'s list for the model …; … can still read them by URI"——**ui:// 资源不进模型资源列表，仅渲染宿主可按 URI 读**（与官方文档 2.1.281 排除性改动互证）。

stream-json `system/init.capabilities` 实测值（两种模式都在）：

```json
["interrupt_receipt_v1","interrupt_cancel_queued_v1","interrupt_send_now_v1","msg_lifecycle_v1",
 "request_marker_lists_v1","sdk_mcp_tools_list_changed","sdk_mcp_manifests",
 "mcp_read_resource_v1","mcp_tool_ui_meta_v1","ui_surface_v1"]
```

- `mcp_tool_ui_meta_v1`——向 SDK 宿主透传 tool 级 `_meta.ui`（MCP Apps 成员）；
- `mcp_read_resource_v1`——SDK 宿主可发 control request **`mcp_read_resource`**（`{serverName, uri}`，uri 必须 `ui://` scheme 否则拒绝），由 CLI 对其已拨号的 MCP server 执行 `resources/read` 把 HTML 取回，返回 `contents:[{uri, mimeType, text, blob, _meta}]`；
- `ui_surface_v1`——配套 `uiSurfaceFrameOf` / `uiSurfaceChannel` / `surfaceClientAttached` 子系统（UI surface 客户端附着到会话的渲染面基础设施），公开语义**未确认**。

**综合解释**：CLI 的角色是「拨号代理 + 元数据中继」——MCP 连接由 CLI 建立（凭据不外泄），tool 的 `_meta.ui.resourceUri` 经 SDK 通道给渲染方，渲染方再用 `mcp_read_resource` 取 HTML 自行渲染。TUI 自身无 iframe 渲染路径（`CLAUDE_CODE_MCP_APPS_HOST` 的消费点是通告层而非渲染层）。与 issue #95149 的观察不矛盾：该 issue 未设此 env。**未确认**：该通道是否会在后续版本公开 / 变动（无 roadmap 信号，官方 roadmap 页 404）。

### A2. stream-json 中 MCP tool result 透传形状 [实测 2.1.299 活体 + 源码 2.1.88]

命令形态：`claude -p … --mcp-config '{"mcpServers":{…}}' --output-format stream-json --include-partial-messages --verbose`（注意：`--print` 下 `stream-json` 必须 `--verbose`，实测缺它直接报错退出）。

**发现 1：`message.content[].tool_result` 一侧全部文本化降级（无结构化字段）。**[实测]

```json
{"tool_use_id":"call_…","type":"tool_result","content":[
  {"type":"text","text":"[Resource from probe at ui://probe/index.html] <!doctype html>…"},
  {"type":"text","text":"[Resource link: linked-ui] ui://probe/linked"},
  {"type":"text","text":"{\"answer\":42,\"nested\":{\"ok\":true}}"}]}
```

**发现 2：同一条 user 消息顶层的 `tool_use_result`（CLI 私有扩展）结构化保留 `structuredContent` + `_meta` + `resourceLinks`。**[实测]

```json
"tool_use_result": {
  "content": [ /* 同上文本化数组（单 text 时退化为纯字符串） */ ],
  "_meta": {"mcp.apps":"probe-meta-value","customKey":"meta-val"},
  "structuredContent": {"answer":42,"nested":{"ok":true}},
  "resourceLinks": [{"uri":"ui://probe/linked","name":"linked-ui"}]
}
```

源码链（2.1.88，行号均为该版本）：`callMCPTool`（src/services/mcp/client.ts:3100-3176）把 `mcpResult._meta / structuredContent` 组装成 `mcpMeta`（client.ts:1897-1908，注释明确「never sent to model」）→ `toolExecution.ts:1401-1464` → `createUserMessage`（src/utils/messages.ts:468-524）→ `normalizeMessage`（src/utils/queryHelpers.ts:102,204-215）输出 `tool_use_result: _.mcpMeta ? {content, ..._.mcpMeta} : _.toolUseResult`。structuredContent 支持自 CHANGELOG 2.1.128。

细节（源码 2.1.88）：

- **错误路径也带 `_meta`**（仅 `_meta` 无 structuredContent）：`tool_use_result = {content:"Error: <msg>", _meta?}`（client.ts:3141-3143、toolExecution.ts:1727-1731）。
- **embedded resource 不透传原始 block**：`transformResultContent`（client.ts:2478-2612）在喂模型**和**写 `tool_use_result.content` 之前就转换——`type:"resource"` → `[Resource from <server> at <uri>] <text>` 文本；`resource_link` → `[Resource link: <name>] <uri>` 文本；image 缩压保留；audio/blob **落盘**换「文件路径+大小」文本；**未知类型直接丢弃**。超大输出另经落盘换 `<persisted-output>` 读文件指令。
- **子 agent 内的 MCP tool result 同时抹掉 `toolUseResult` 与 `mcpMeta`**（toolExecution.ts:1463-1464，`toolUseContext.agentId` 存在且未 `preserveToolUseResults`）——子 agent 流的 tool_result 无 `tool_use_result` 扩展字段（与我们「子 agent 信号过滤」现状互证）。
- **渲染宿主的数据源结论**：`tool_use_result.structuredContent` / `._meta` 是结构化透传的唯一位置；UI 资源本体不在此，正确路径是 A1 的 `mcp_read_resource` control request。同消息顶层另有 `tool_result_meta`（权限判定：`{id, permission_decision:{decision:"accept", source:"config", reason_type:"rule"}}`）。[实测]

**发现 3：流式 partial（`stream_event`）只有 assistant 侧**（`message_start / content_block_start / content_block_delta / content_block_stop / message_delta / message_stop`），tool_result 不做流式拆分。[实测]

**发现 4：`system/init` 元数据**——`mcp_servers:[{name,status,source}]`（`source` 取值实测 `user` / `project` / `dynamic`=flag 注入；`status` 含 `connected` / `pending`）、`tools` 仅字符串数组（`mcp__server__tool` 命名）、`apiKeySource`、`skills` / `plugins` 名单、`claude_code_version`。tool 级 `_meta` 不在 init 出现（SDK manifest 通道才有，`sdk_mcp_manifests`）。[实测]

### A3. `--mcp-config` 同名合并语义：flag 全赢（整条替换）——安全设计核心结论

**活体三路碰撞 [实测，2.1.299]**：同一名字 `collide` 三份实例（tool 名不同以区分）——flag `--mcp-config` inline JSON（ANSWER:222）、项目 `.mcp.json`（ANSWER:111，`enableAllProjectMcpServers:true` 放行审批）、user 级（`CLAUDE_CONFIG_DIR` 重定向到假配置目录的 `.claude.json`，ANSWER:333，不碰真实用户配置）。结果：

```
init.mcp_servers: [{"name":"collide","status":"connected","source":"dynamic"}]
tools: ["mcp__collide__from_flag"]        ← 只有 flag 实例的 tool
tool_use_result.structuredContent: {"answer":"222","marker":"flag-config"}
```

对照臂：项目级单独在场正常连接（`source:"project"`）；`--strict-mcp-config` 且不给 flag 配置 → `init.mcp_servers: []`，user + project 全部忽略。

**源码实锤（2.1.88 main.tsx:2386-2389）**：

```ts
// CLI flag (--mcp-config) should override file-based configs, matching settings precedence
const allMcpConfigs = { ...existingMcpConfigs, ...dynamicMcpConfig };  // spread 在最后 = 同名赢
```

交互模式同构（useManageMCPConnections.ts:776-777）；strict 时 `existingConfigs = {}`。

**完整优先级（低 → 高）**[2.1.88 源码 + 官方文档]：

1. claude.ai connectors（最低）——strict 下整个跳过
2. plugin 提供的 server
3. user（`~/.claude.json` 顶层 `mcpServers`）
4. project（`.mcp.json`，目录树自根向下，离 cwd 近的覆盖父目录；需 approved）
5. local（`~/.claude.json` 项目级 `mcpServers`）——合并原语 `Object.assign({}, plugin, user, approvedProject, local)`
6. **`--mcp-config` flag（覆盖以上全部文件 scope）**
7. **enterprise `managed-mcp.json`（管理员部署时独占，压倒一切）**：存在时只用 enterprise servers；此时 `--strict-mcp-config` 直接 `process.exit(1)`，`--mcp-config` 里非 `type:'sdk'` 条目也 exit(1)。文件路径：Linux `/etc/claude-code/managed-mcp.json`（macOS `/Library/Application Support/ClaudeCode/`、Windows `C:\Program Files\ClaudeCode\`）。
8. managed settings 的 `managedMcpServers`（v2.1.259+ 新机制，2.1.88 无此键）：官方文档明确「provided server 同名压倒 local/project/user；但 **`--mcp-config` 同名 replaces the provided one for that run**，且仍过 `allowedMcpServers` 检查」——文档直接印证 flag 优先语义。[官方文档=高]

官方文档印证（code.claude.com/docs/en/mcp §Scope hierarchy and precedence）：「When the same server is defined in more than one place, Claude Code connects to it once, using the definition from the highest-precedence source. **The entire server entry from that source is used; fields are not merged across scopes.**」`--mcp-config` 可多个（空格分隔、JSON 串或文件路径，**后传覆盖先传**）；`--strict-mcp-config` 下文件配置完全不读。

**⚠️ 边界漏洞（2.1.88 源码实锤；2.1.299 行为未实测复现，新版是否修复未确认）**：headless 下若该次运行真的发生了后台 plugin 安装，完成后会跑 MCP re-diff（print.ts:1704-1724 → `applyPluginMcpDiff` 1794-1825 → `getAllMcpConfigs()` **重读文件配置且不含 flag servers**），`reconcileMcpServers` 会把文件侧同名 server（如恶意 `ar-hub`）重新连上并按名字把 flag 版连接换成文件版。该路径只受 `isBareMode()` 门控，**`--strict-mcp-config` 不覆盖它**（print.ts 全文无 strictMcpConfig 引用）。窗口窄但真实存在。

**安全设计结论（ar-hub 注入）**：

1. `--mcp-config` 注入同名 `ar-hub`：**启动期语义安全**——flag 整条覆盖，用户任何配置文件的同名恶意条目无法劫持连接、也不产生字段混合。[实测 + 2.1.88 源码 + 官方文档三方一致]
2. 硬隔离可叠 `--strict-mcp-config`（顺带跳过 claude.ai connectors 拉取）；要连 plugin re-diff 边界一并封死需组合 `--bare`（但 --bare 同时关 CLAUDE.md 自动发现、hooks、LSP 等，对我们会话功能影响大，需权衡）。
3. enterprise `managed-mcp.json` 存在的环境两种注入都会 exit(1)，失败特征：进程立即退出 + stderr「You cannot use --strict-mcp-config when an enterprise MCP config is present」类报错。
4. 企业 `allowedMcpServers` / `deniedMcpServers` 策略对 flag server 同样生效（防 flag 绕过 allowlist）。

### A4. Skills 机制现状

**① 加载机制与 SKILL.md 格式 [官方文档=高]**（docs 已迁移 code.claude.com/docs/en/skills）：

- 七级加载（低→高）：enterprise managed 目录 < `~/.claude/skills/<name>/SKILL.md`（个人）< `<repo>/.claude/skills/`（项目）< nested 子目录（惰性）< `--add-dir` < plugin `skills/` < claude.ai 同步（`~/.claude/skills/synced/`，v2.1.273+）。向上发现到仓库根；同名裁决 enterprise > personal > project；skill 优先于 `.claude/commands/` 同名文件（commands 已并入 skills）。
- SKILL.md = YAML frontmatter（`---` 首行）+ Markdown 正文，遵循 Agent Skills 开放标准（agentskills.io）。progressive disclosure：常驻上下文只有 name+description（预算=模型上下文 1%，单条 1536 字符截断）；正文调用时进入、跨轮保留。热更新：改动免重启，新建顶层目录需 `/reload-skills`。
- Frontmatter 20 个字段全可选（`name`、`description`、`when_to_use`、`argument-hint`、`disable-model-invocation`、`user-invocable`、`allowed-tools`、`model`、`effort`、`context: fork`、`agent`、`background`、`hooks`、`paths`、`metadata` 等）；跨产品打包（claude.ai/Skills API）只接受 6 个标准字段。
- 本机 `system/init.skills` 返回已启用 skill 名单 [实测]。

**② plugin 与 skills 关系 [官方文档=高]**：plugin（`.claude-plugin/plugin.json`）可打包 skills（`skills/<name>/SKILL.md`，命名空间 `/plugin-name:skill-name`）；反之 skill 目录加 plugin.json 即成 plugin；marketplace = 含 `.claude-plugin/marketplace.json` 的仓库；`/plugin` 管理；本机 init.plugins 实测列出已装 plugin [实测]。plugin skills 不受 `skillOverrides` 影响。

**③ SEP-2640「Skills over MCP」：提案已 Final，Claude Code 未实现消费侧 [官方repo=中高]**：

- SEP-2640 Skills Extension：PR modelcontextprotocol/modelcontextprotocol#2640，**Status: Final**（2026-09-13 合入）；方法 `skills/list`（MUST）+ `skills/get`（MUST）+ `resources/directory/read`（可选，**不存在 `skills/read`**）；内容经标准 `resources/read` 读；惯用 `skill://` scheme；扩展标识符 `io.modelcontextprotocol/skills`；工作小组 repo modelcontextprotocol/ext-skills。
- Claude Code 侧零踪迹（GitHub search 实测）：0 条 SEP-2640 issue、CHANGELOG 无 skills-from-MCP 条目；**SEP 原文 Reference Implementation 写明「Claude Code: prototyped internally at Anthropic; not yet public」**。官方 client matrix 的 Skills 列仅 `mcpc MCP CLI` 完整支持。无公开 roadmap。

### A 小节来源

[实测] 本机活体探针（2.1.299，附录 D）+ 二进制直读 `@anthropic-ai/claude-code-linux-x64@2.1.299`；[源码 2.1.88] `/home/deploy/repos/claude-code-sourcemap/restored-src/src/`（main.tsx flag 定义 976-1000、--mcp-config 解析 1414-1510、enterprise 检查 1583-1593、最终合并 2386-2389；services/mcp/config.ts scope 合并 888-1255、enterprise 1470-1503；services/mcp/client.ts 1897-1908/2478-2612/3100-3176；services/tools/toolExecution.ts 1401-1464/1727-1731；utils/queryHelpers.ts 102-215；cli/print.ts 1700-1825/5450-5560）；[官方文档] code.claude.com/docs/en/mcp、/cli-reference、/managed-mcp、/skills、/plugins、/env-vars；[官方repo] github.com/anthropics/claude-code CHANGELOG + issues、modelcontextprotocol PR #1865/#2640、ext-apps、ext-skills、client matrix。

---

## B. Codex CLI（OpenAI）

本机 0.145.0；最新 release 0.163.0（2026-10-15）。注：developers.openai.com/codex/* 文档现 302 到 learn.chatgpt.com/docs/*（同内容，支持「URL + `.md`」取 markdown）。

### B1. MCP Apps 宿主：CLI TUI 不渲染，数据管道在 core/app-server，渲染面是 Desktop/IDE

**结论（中-高置信，源码 + issues 交叉印证）**：

- **feature flag**：`enable_mcp_apps`——本机 `codex features list` 显示 `under development / false` [实测 0.145.0]；main 源码 `Stage::UnderDevelopment, default_enabled: false`（codex-rs/features/src/lib.rs）[官方repo]。flag 由 PR #19884「Add MCP app feature flag」（merged 2026-04-27）引入；运行时确切开关点未定位——未确认。
- **协议层**：`McpAppUi { resourceUri, preferredModelDisplayMode: Inline | Fullscreen }`（codex-rs/protocol/src/items.rs L435-452）；tool item 上 `mcpAppResourceUri` 是 legacy、`mcpAppUi` 首选（PR #45805「Preserve MCP App UI metadata in tool-call events and history」，merged 2026-09-15）[官方repo]。
- **能力握手**：Codex 向 server 通告 `io.modelcontextprotocol/ui`（mimeTypes `["text/html;profile=mcp-app"]`），但该扩展由 **app-server 宿主客户端声明**、Codex 只转发自己认识的受信命名空间（codex-rs/codex-mcp/src/client_capabilities.rs，注释「Selects the MCP extensions Codex supports from those declared by the app-server host」）[官方repo]。
- **渲染面**：Codex Desktop 渲染 MCP Apps 交互卡片——佐证 issues：#33717（deferred MCP tool calls 丢 structuredContent/_meta 使卡片不可交互，open）、#45913（CSP 拦 iframe）、#35786、#36765 [官方repo]。
- **辨析**：`features.apps`（stable, on）是 ChatGPT connector 集成，与 MCP Apps 无关 [官方文档]。

### B2. Skills over MCP（SEP-2640）：插件提交时静态快照，非运行时

**结论：OpenAI 实现的是「插件提交时快照导入」（Scan Tools），Codex CLI 运行时不消费 MCP skills。**

官方文档 developers.openai.com/plugins/build/mcp-server「Import skills from the MCP server」章节 [官方文档=高]：

- 定位原文：「During plugin submission, Scan Tools imports a static snapshot of those skills into the draft」；基于 draft SEP-2640 的「bounded, static subset」，该 proposal「not yet part of the stable MCP specification」（注：SEP-2640 本体现已 Final，见 A4③；Codex 文档表述滞后）。
- **server 侧声明**：initialize capabilities `extensions["io.modelcontextprotocol/skills"] = {}`（必须在 `extensions` 下，不认 `experimental` 旧声明）；分页 `skills/list`（每项 `{uri（skill:// 约定，目录名=技能名）, frontmatter, resources[]}`，资源带 `sha256:<64hex>` digest）；`skills/get {uri}`；`resources/read` 对 manifest 每个 URI 返回恰好 1 个 content item。导入限额：≤5 skills / 10 分页；每 skill ≤100 文件；SKILL.md ≤256KiB；单文件 ≤1MiB；单 skill 资源 ≤5MiB；单次扫描 ≤8MiB；校验失败→仍返回 tools 但不导入 skills。
- **消费时机原文**：「Skills imported from MCP are submission-time snapshots, not live runtime resources. After changing a skill, run Scan Tools again…」——导入物进**插件草稿**随插件目录分发；不落本地 skills 目录、不虚拟挂载；Codex 运行时不调 skills/list [deepwiki openai/codex=中]。
- **反向通道**：`skill_mcp_dependency_install`（stable, on）——skill 的 `agents/openai.yaml` 可声明 `dependencies.tools`（type: mcp + url），Codex 在 skill 提及时检测缺失 MCP 依赖并提示安装 [官方文档]。

### B3. MCP server 配置与运行时注入

**① config.toml 形状 [官方文档=高]**（`~/.codex/config.toml`，`$CODEX_HOME` 可重定向；项目级 `.codex/config.toml` 仅 trusted projects）：

- stdio：`[mcp_servers.<name>]` `command`（必需）/ `args` / `env` / `env_vars` / `cwd` / `experimental_environment`；
- **HTTP（streamable）**：`url`（必需）、`auth`（`oauth` 默认 | `chatgpt`）、`bearer_token_env_var`、`http_headers`、`env_http_headers`、`http_headers_helper`；
- 公共：`startup_timeout_sec`(10)、`tool_timeout_sec`(60)、`enabled`、`required`（true 时初始化失败→启动失败）、`enabled_tools` / `disabled_tools`、`default_tools_approval_mode`、`tools.<tool>.approval_mode` / `output_token_limit`。
- 文档示例：`[mcp_servers.figma] url = "https://mcp.figma.com/mcp"` + `bearer_token_env_var`。**`type` 键不在官方文档**（transport 由 url vs command 推断；本机 config 手写有 `type="http"`，是否被消费未确认）。

**② `-c` 运行时注入 [实测 0.145.0]**：

- 可行：`codex mcp list -c 'mcp_servers._probe.url="http://…"'` 直接出现该 server（transport 识别为 streamable_http）；`codex exec -c` 全局接受。
- **合并语义 = 深合并**：对 config.toml 已有 server 用 `-c 'mcp_servers.context7.url="…"'` 或整表 `-c 'mcp_servers.context7={url="…"}'`，**兄弟 key（http_headers）均存活**，被覆盖的只有同 key。
- `-c` 语法（--help 原文）：dotted path；value 先按 TOML 解析，失败作字面字符串。

**③ `codex mcp add` [实测]**：`codex mcp add [OPTIONS] <NAME> (--url <URL> | -- <COMMAND>...)`，flags `--env`（仅 stdio）、`--bearer-token-env-var` / `--oauth-*`（仅 HTTP）；写 `$CODEX_HOME/config.toml`。其它子命令：list / get / remove / login / logout。

**④ headless 建议 [官方文档=高]**（learn.chatgpt.com/docs/non-interactive-mode.md）：`codex exec` 即 headless；`required=true` 的 server 初始化失败→exec 报错退出；`--ignore-user-config` 完全跳过 config.toml（纯净环境）；CI 认证 `CODEX_API_KEY`。**重要变更**：`codex mcp-server` 子命令与独立 `codex-mcp-server` 二进制**已移除**（不能再把 Codex 当 MCP server 宿主）；编程集成走 **app-server**（自有 JSON-RPC 协议，experimental，「isn't an MCP server」；子命令 `codex app-server {daemon|proxy|generate-ts|generate-json-schema}`）。

### B4. 流式输出中 MCP tool result 形状 [官方repo=高，main 源码直读]

- exec `--json`（JSONL）：事件 `thread.started / turn.started / turn.completed / turn.failed / item.* / error`；MCP 调用 item `"type":"mcp_tool_call"`，`McpToolCallItem {server, tool, arguments, result?, error?, status(in_progress|completed|failed)}`；**`McpToolCallItemResult { content: JsonValue[], _meta?, structured_content? }`——exec 通道字段名是 snake_case `structured_content`**（codex-rs/exec/src/exec_events.rs，刻意用 serde_json::Value 保 wire 形状）。
- app-server v2（camelCase）：`McpToolCallResult { content, structuredContent, _meta }`；item `mcpToolCall {…, appContext?, pluginId?, result?}`，受信 MCP apps 的 `appContext` 含 `resourceUri` 等（codex-rs/app-server-protocol/src/protocol/v2/mcp.rs；learn.chatgpt.com/docs/app-server）。
- **已知缺陷**：#33717（open）deferred 路径丢 structuredContent/_meta；#41280（open）result 含 `resource_link` 被拒——做 Apps 集成的现成雷区 [官方repo]。

### B5. Skills 本地机制

**结论：skills 已是默认开启的正式能力（无 features.skills 总开关）；格式 = agentskills.io 开放标准 SKILL.md（与 Claude Code 同构）；用户级目录是 `~/.agents/skills` 而非 `~/.codex/skills`。**

- 时间线 [官方repo=中]：2025-12-01 PR #7412 experimental skills.md → 2025-12 SkillsManager 重构 → 现在 config reference 正式 `skills.*` 键（GA；精确 GA 版本未确认）。本机 `codex features list` 无 skills flag；相关：`skill_search`(stable,on)、`skill_mcp_dependency_install`(stable,on) [实测]。
- 加载目录 [官方文档=高]：REPO `$CWD/.agents/skills`（向上逐级）+ `$REPO_ROOT/.agents/skills`；USER `~/.agents/skills`；ADMIN `/etc/codex/skills`；SYSTEM 内置。⚠️ 本机 `~/.codex/skills` 存在但为空，是否仍被扫描未确认。支持 symlink；同名 skills 不合并。
- 格式：frontmatter 必需 `name`+`description`；progressive disclosure 初始只注入 name/description/路径（预算默认 2% context 或 8000 字符，`skills.max_context_tokens` ≤10000）；调用 `/skills` 或 `$skill-name`；禁用 `[[skills.config]] path=… enabled=false`；可选 `agents/openai.yaml`（UI 元数据 + `policy.allow_implicit_invocation` + `dependencies.tools`）。
- 与 Claude 兼容性：共同遵循 agentskills.io 标准，格式层同构（Claude SKILL.md 原则上可直接放 `.agents/skills` 被扫到——推断，弱证据）；OpenAI 另提供「Submit a Claude Code plugin」指南佐证互通 [官方文档]。

---

## C. ZCode（z.ai GLM 官方 Agent 产品）

产品身份：ZCode 是 z.ai 自研 ADE（「Official Harness for GLM-5.3」），桌面（Electron）+ CLI 发行版（`zcode` 命令 = TUI + Web + Agent CLI）+ Mobile Remote/Bot Channel。**不是 Claude Code fork**（自研 TypeScript monorepo，github.com/zai-org/ZCode，Apache-2.0，~8k stars，2026-10 开源），但**扩展协议层刻意 Claude Code 兼容**：hooks 事件名 / exit code 语义与 Claude Code 一致且 stdin 同时带 ZCode camelCase 与 Claude snake_case 别名；插件 manifest 回退接受 `.claude-plugin/plugin.json`、注入 `CLAUDE_PLUGIN_ROOT` 兼容变量；MCP 配置可从 Claude Code / Codex / OpenCode 一键导入；工具命名对齐（`mcp__` 前缀）。[官方文档=高 zcode.z.ai + 官方repo=中]

### C1. MCP 支持形态

**① 配置文件 [官方文档=高 + 官方repo]**——自有 `.zcode` 体系 + `.agents` 兼容层，**不是** Claude Code 同构布局：

| Scope | 路径 | 配置键 |
| --- | --- | --- |
| User | `~/.zcode/cli/config.json` | `mcp.servers`（嵌套，非顶层 `mcpServers`） |
| Workspace | `<root>/.zcode/config.json` | `mcp.servers` |
| User 兼容 | `~/.agents/mcp.json` | `mcpServers` |
| Workspace 兼容 | `<root>/.agents/mcp.json` | `mcpServers` |

- 加载：workspace 先、user 后；**同 scope 内 `.zcode` 有任一 server → 同 scope `.agents/mcp.json` 整个跳过**（不合并）；**同名冲突用户配置优先于项目配置**。禁用 = server 对象内 `"enable": false`。
- Full-configuration 粘贴模式接受 `{"name":{…}}` 与 `{"mcpServers":{…}}` 两种结构（导入归一化，落盘仍 `.zcode` 原生）。

**② 传输**：stdio / **HTTP（streamable）/ SSE 全支持**。CLI schema：`type:"http"` + `url` / 可选 `headers` / `oauth` / `timeoutMs`；旧 `type:"sse"`；`protocolVersion: auto|legacy|2026-07-28`；桌面另有 OAuth 授权流。workspace 级 MCP server 在会话启动时**自动连接**（官方同时警示打开陌生仓库会自动连其 `.zcode/config.json` 里的 MCP）。[官方文档=高]

**③ spawn 注入通道：只能预写配置文件**。CLI strict 参数表（apps/zcode-cli/packages/cli/src/arguments.ts）**无任何 MCP flag**（无 `--mcp-config` 等价物）、无 MCP 专属 env；`/mcp` 斜杠命令只有 list / status / connect / disconnect（运行时连断已配置 server，不能 add）；无 `zcode mcp add` 子命令。[官方repo=中，较强]

### C2. Skills

支持 SKILL.md（与 Anthropic Agent Skills 同一格式契约），**但不会自动读 `~/.claude/skills`**，需导入或放自有目录 [官方文档=高]：

- 目录：`~/.zcode/skills/<name>/SKILL.md`（user）、`<ws>/.zcode/skills/`（workspace）、额外发现 `.agents/skills/`（两级）；同级 `.zcode` 优先于 `.agents`；`skills.roots` 可追加。
- 限额：description ≤1024 字符（超限整个丢弃）、正文 >100KB 截断；每轮注入元数据（name + description 摘录 ≤250 字符），预算固定（装太多退化成只注名字）。
- 分发：无独立市场，走 plugin（插件内 skills 必须扁平 `skills/<name>/SKILL.md`）；桌面可从 Claude Code / Codex / OpenClaw / Augment / Windsurf 批量导入（Symlink/Copy 两种模式）。

### C3. MCP Apps / generative UI：**已正式发布（推翻「预期无」）**

- 官方 changelog **v3.15.1（2026-10-12）**："Added support for UI plugins (MCP App)." [官方文档=高 zcode.z.ai/en/changelog]
- 实现 [官方repo=中，较强]：Agent 侧 `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/mcp-ui/`（CONTRACT.md 完整生命周期：server 必须在当前会话可信 MCP 配置中；页面只能选工具名与参数；callTool 复用 ToolExecutor 校验/hooks/审批；app-only 工具可不暴露给模型；面向 UI 的 resources/read 结果移除 `_meta`；总大小 8 MiB + MIME 白名单；页面侧 sampling 每实例/任务/Agent 并发 1/4/8、60s 期限）；渲染侧桌面 Electron Host（`packages/desktop/scripts/mcp-apps-host-e2e.mjs` + fixture）。
- 语义与 Anthropic MCP Apps（ui:// resource + HTML 渲染 + sampling）同模型；官方文档站 MCP 页尚未宣传（滞后于实现），公开用户入口是 v3.15.1 的「UI plugins」。

### C4. 非交互/流式输出协议 [官方repo=中]

- headless：`zcode --prompt "…" --cwd … --mode plan|build|edit|yolo|guarded --json --no-color`（`-p` 是 `--prompt` 短选项，**不是** Claude 的 `--print`；`--prompt` 缺省权限模式 `yolo`；文档明确警告勿用 Claude 的 `--print/--model/--settings/--max-turns/--allowed-tools/--permission-mode`）。`--resume <sessionId>` / `--continue`。
- 输出：`--output-format text|json|stream-json`。`json` = 单个摘要对象；`stream-json` = **NDJSON** 逐行事件 + 结尾 `type:"result"` 行。事件类型含 `tool_call_scheduled → tool_call_started → tool_call_progress → tool_call_result|tool_call_error → tool_batch_complete`；**`ToolCallResultPayload = { toolCallId, result: ToolResultPayload, duration, skillMetadata?, pluginId? }`**（contracts/src/events/session.events.ts）。进程退出码 0 ≠ 任务成功。
- 另有协议服务入口 `zcode app-server` / `zcode agent-server`（stdout NDJSON 帧通道，内部 ZCode Protocol v4：createSession / sendText / stop / compact / retryTurn…）。

### C 小节弱证据与未确认

- Reddit 社区帖（r/ZaiGLM「Is there a zcode cli?」等）仅作时间线旁证，内容未采信 [弱证据]。
- 未确认：ZCode CLI 发行版公开下载渠道（README 自建分发 / install.sh，`ZCODE_DIST_BASE_URL` 占位）；MCP Apps 面向用户的配置文档（changelog 一句话 + 源码实现，文档滞后）。

---

## 1. 对 agents-remote 两条计划的落点

### 计划① web 控制面渲染 MCP Apps UI（我们当宿主）

- **Claude Code 是唯一已把宿主数据通道开给外部渲染方的 CLI**（但属未公开实验能力）：spawn 时设 `CLAUDE_CODE_MCP_APPS_HOST=true` → CLI 对 MCP server 通告 `io.modelcontextprotocol/ui`；tool 声明的 `_meta.ui.resourceUri` 走 SDK 通道（`mcp_tool_ui_meta_v1` capability）；HTML 本体用 control request `mcp_read_resource {serverName, uri}` 取（`mcp_read_resource_v1`）。tool result 数据源在 `tool_use_result.structuredContent / _meta`（A2）。**待 PoC**：control request 在我们 spawn 形态下的下发格式；`ui_surface_v1` 语义；该 env 的版本稳定性（无官方承诺）。[实测]
- **Codex**：TUI 无渲染；apps 渲染需消费 app-server 协议的 `mcpToolCall.mcpAppUi` / `appContext.resourceUri`（experimental），exec `--json` 通道 `structured_content`（snake_case）可作数据源；注意 #33717 / #41280 已知缺陷。[官方repo]
- **ZCode**：官方已原生支持（v3.15.1+），渲染在桌面 App 内；CLI / stream-json 通道里 MCP App 事件如何透出未确认——可读其 `zcode-protocol/mcp-ui/CONTRACT.md` 作对照实现。[官方repo]
- 通用前提：三家 TUI 都不渲染——我们做 web 宿主与各家 Desktop 宿主同位、无竞合；官方 client matrix（MCP Apps 列）三家 CLI 均不在列，「CLI 作为 MCP Apps 宿主」尚无一家官方化。

### 计划② sidecar HTTP MCP server（ar-hub）spawn 注入

现状：`api/src/mcp-injector.ts` 的 `ClaudeMcpInjector` 已实现 `--mcp-config` inline JSON（`ar-hub` type:http），代码注释明确「不加 `--strict-mcp-config`」（保留用户既有 MCP 并存）。本次调研给出该取舍的新证据面：

| CLI | 注入方式 | 同名安全 |
| --- | --- | --- |
| Claude Code | spawn argv 加 `--mcp-config '{"mcpServers":{"ar-hub":{"type":"http","url":"http://127.0.0.1:<port>/mcp/<project>"}}}'` | **flag 全赢、整条替换**（user / project 同名被顶掉，字段不合并）[实测+源码+官方文档三方一致]。两个残留边界：① headless 后台 plugin 安装后的 re-diff 可让文件侧同名 server 抢回连接（`--strict-mcp-config` 不设防，需 `--bare` 才封死——但 --bare 关 hooks/CLAUDE.md 等，与我们 hooks 采集冲突，不建议）；② enterprise `managed-mcp.json` 存在时 flag 注入直接 exit(1)（错误特征可识别）。 |
| Codex | argv 加 `-c 'mcp_servers.ar_hub.url="http://127.0.0.1:<port>/mcp/<project>"'`（deep merge，同 key 覆盖）或预写 `$CODEX_HOME/config.toml` | `-c` 同 key 赢、兄弟键保留；config.toml 无法覆盖 `-c` 值 [实测+官方文档]。`required=true` 可控失败语义；`--ignore-user-config` 可做纯净环境。 |
| ZCode | **无 flag**——spawn 前写 `~/.zcode/cli/config.json`（user）或项目 `.zcode/config.json`（workspace），键 `mcp.servers["ar-hub"]={type:"http",url:…}`；workspace 级会话启动自动连接 | **用户配置优先于项目配置**——同名安全无保障：写 user 级可压制项目级同名，但无法防用户既有同名条目；建议命名避撞（如带 session 后缀）或注入前读取现有配置做冲突检测。[官方repo] |

---

## 附录 D. 本机活体探针记录（2026-10-20）

环境：claude 2.1.299（`@anthropic-ai/claude-code-linux-x64`），`ANTHROPIC_BASE_URL` 网关；探针文件在 `/tmp/mcp-probe/`（临时，不入库）。

- `server.mjs`：stdio MCP server，tool result 含 text + embedded resource + resource_link + structuredContent + _meta；
- `server2.mjs`：MCP Apps 规范形——tool `_meta.ui.resourceUri` + `resources/read`（`text/html;profile=mcp-app`），client initialize 参数落盘 `init-params.jsonl`；
- `server-param.mjs`：env 参数化（TOOL_NAME / MARKER / ANSWER），用于同名碰撞；
- 碰撞矩阵：`proj/.mcp.json`（project）+ `cfgdir/.claude.json`（`CLAUDE_CONFIG_DIR` 重定向的假 user 配置）+ `flag-config.json`（--mcp-config inline）。

实验结果索引：`out2.jsonl`（A2 tool_result 形状）、`out3/out4/out5.jsonl`（宿主模式 init A/B）、`coll1-coll4.jsonl`（A3 碰撞三臂 + 对照 + strict）。
