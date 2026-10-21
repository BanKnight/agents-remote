# MCP Apps / Skills over MCP 宿主化落地：调研汇总与落地路线

> 调研批次主文档（2026-10-20）。深素材：[mcp-apps-spec-notes.md](./mcp-apps-spec-notes.md)（规范 + ext-apps SDK）、[mcp-cli-ecosystem-notes.md](./mcp-cli-ecosystem-notes.md)（三家 CLI 生态 + 本机活体探针）。
> 落地状态锚点：阶段 0（`9ec70ab`）、阶段 2（`5975eec`）、阶段 3（`0de7979`）已提交；阶段 4 反向通道（`1578ca9`）+ e2e 收口（`7392a2d`）；阶段 5 hub skills 分发已实现（见 §10）；本文档沉淀决策与路线，供后续能力域扩展引用。

## 1. 背景

agents-remote 是网页控制平面，远程管理服务器上的 Agent 会话。hub（ar-hub，API 进程内 loopback MCP server）已供 wiki 能力域工具；本批把「Agent 会话在网页端的呈现」从纯文本流升级为**宿主 MCP Apps**：Agent 调用 display tool 时，网页端渲染结构化 UI 卡片（首个场景 = wiki_read_page 的 wiki 页视图），而非降级的 JSON 文本。

两条协议线索：

- **MCP Apps（SEP-1865，已 Stable 2026-01-26）**：extension `io.modelcontextprotocol/ui`，`tool._meta.ui.resourceUri` 关联 ui:// 资源，宿主渲染 HTML 沙箱、桥协议 JSON-RPC 2.0 over postMessage。
- **Skills over MCP（SEP-2640，Final 2026-09-13）**：extension `io.modelcontextprotocol/skills`，`skills/list` / `skills/get` 两方法，server 侧把 skills 分发给支持 client。三家 CLI 均未实现 client，hub 侧 skills 分发推迟到阶段 5。

## 2. MCP Apps（SEP-1865）核心机制

详见 spec-notes §A。落地视角的五条关键事实：

1. **扩展声明**：initialize result `capabilities.extensions["io.modelcontextprotocol/ui"]`（hub 侧已带 `mimeTypes: ["text/html;profile=mcp-app"]`）。
2. **UI 关联**：tool 定义 `_meta.ui.resourceUri`（新格式；旧扁平 key deprecated）。host 从 tools/list 即知 UI 关联，无需等 tool result。
3. **资源供给**：`ui://` 资源 mimeType `text/html;profile=mcp-app`，resources/read 取 HTML。
4. **数据通道**：tool result 的 `structuredContent`（MCP 标准字段）+ 宿主→卡片 `ui/notifications/tool-result` 通知。
5. **沙箱**：SEP-1865 要求 web host 双 iframe（外层独立 origin 承载 CSP HTTP 头、内层不可信 HTML）。**本项目 MVP 裁定单层** `sandbox="allow-scripts"`：资源是我们自己的系统模板（HUB_UI_RESOURCES 单源表），不存在第三方 server 作者篡改面；双 iframe 是第三方 server 接入期的强化面。

## 3. Skills over MCP（SEP-2640）现状

详见 spec-notes §C。要点：

1. Final 状态，extension `io.modelcontextprotocol/skills`；**最终规范 = `skills/list` / `skills/get` 两方法**。早期草案的 `skill://index.json` + resource template 已在 v1 收缩时移除——旧方案不再引用。
2. **三家 CLI 均未实现 client**（Claude Code 2.1.299 / Codex 0.145.0 / ZCode v3.15.1 实测均不协商该扩展）。
3. SDK 侧 skills 支持未发布（TS PR open）→ hub 侧先行 = `setRequestHandler` 手写（SDK 1.30 对非 tools/call 的 setRequestHandler 走默认注册路径，自造 zod schema 按 method literal 索引，与内部自装 handler 并存——已读 SDK 源码验证）。
4. **裁定（2026-10-20 更新）**：hub 侧 server 先行落地（用户拍板「等他们 CLI 支持的时候直接对上」）；消费方（三家 CLI）仍等上游，枚举能力随实现走，不预造 UI。MCP Inspector 2.11 已原生消费 skills/get（本机实测），是现成的第三方 host 验证面。

## 4. 与现有实现的结构性差异

skills（本地文件）与 MCP Apps（协议分发）是两条正交轨道：

| 维度 | 本地 skills（已有） | Skills over MCP（阶段 5） | MCP Apps（本批） |
| --- | --- | --- | --- |
| 存储方 | agents-remote 文件系统 | hub（server 侧） | hub ui:// 资源 |
| 消费方 | CLI（--append-system-prompt 等注入） | CLI client（协商 skills 扩展） | web 宿主（渲染沙箱） |
| 发现机制 | 文件目录扫描 | skills/list | tools/list 的 `_meta.ui.resourceUri` |
| 互不干扰面 | 注入通道（argv/环境变量） | server 能力域开关 | display tool 名单 + structuredContent 契约 |

## 5. 生态现状（三家 CLI）

详见 ecosystem-notes（含本机活体探针记录）。落地视角四条结论：

1. **三家 TUI 均不渲染 MCP Apps**——CLI-TUI 不消费 UI 资源（S1 实测：`resources/list` 未实现时返回 -32601 CLI 容忍不崩；从不 read ui://）。
2. **Claude Code 有未公开实验宿主通道** `CLAUDE_CODE_MCP_APPS_HOST=true`（mcp_tool_ui_meta_v1 capability + mcp_read_resource control request）——web 宿主 POC 备选，需防版本漂移。本批未依赖它：CLI 流内 `tool_use_result.structuredContent` 原样透传已是稳定数据通道。
3. **`--mcp-config` 同名合并 = flag 侧全赢、整条 entry 替换**（活体三路碰撞 + 2.1.88 源码 spread 序一致）→ ar-hub 注入不存在被用户配置劫持的通道；保留名守卫（阶段 0）是第二道防线（防用户侧写同名 server 混淆）。边界：enterprise managed-mcp.json 存在时 flag 注入 exit(1)。
4. **Codex** `-c 'mcp_servers.ar_hub.url=…'` 深合并注入；`mcp_tool_call.result` 含 `structured_content`（snake_case）。**ZCode** 无注入 flag 只能预写配置文件且用户配置优先——注入无安全保障，需冲突检测。

## 6. UI 供给与数据通道（本批架构核心）

CLI 不透传 `_meta`（S1 实测：tool_use block 无 _meta）→ 宿主无法从流内感知 UI 关联，必须走 **display tool 名单**：宿主按 tool 名（`mcp__ar-hub__wiki_read_page`）+ structuredContent.kind（`wiki-page`）双条件判定，未知形态回退通用 tool 卡。

数据流全链（已实现）：

```
hub wiki_read_page（ui 开时带 _meta + structuredContent）
  → CLI tool_use_result.structuredContent 原样透传（user 帧顶层 envelope，唯一通道）
  → normalizeChatStream：part.structuredResult（既有管道）
  → renderChatStream：envelope 带 structuredContent 键才投影进卡片 metadata
  → HubWikiPageToolUI：kind 守卫 → McpAppCard
  → iframe（sandbox="allow-scripts" srcdoc=模板）load 后 postMessage ui/notifications/tool-result
```

> ⚠️ 链上曾有一个断点（`0de7979` 引入）：SystemChatBubble 把 custom 重建为 renderer props 时漏转发 structuredContent，守卫恒假、卡片整链生产路径零执行——两段单测各自全绿夹出集成断点（2026-10-20 code-review P0）。`7d098a7` 修复：重建抽成 registry 导出纯函数 `buildToolCardToolProps`（单源）+ 集成断言（custom → renderer → iframe）。

模板 HTML 供给：api 的 `HUB_UI_RESOURCES` 单源表（hub resources/read 注册与 `/api/projects/{name}/mcp-ui-resource` HTTP 投喂共用，无复制漂移面；hub 恒 loopback 浏览器够不着）。路由鉴权在前、ui 开关门控、404 不暴露原因。

## 7. 现状审计（互不干扰）

- **保留名**：`isReservedMcpName` = `ar-hub` + `ar-` 前缀；add/update 拒（MCP_CONFIG_INVALID），remove/enable 不拦（历史遗留可清理）。`ar.wiki`/`archive-tools` 不在保留域。
- **注入安全**：flag 注入机制本身 flag 全赢 → 劫持不可能；守卫防混淆。CLI 零调用（守卫在 spawn 前）。
- **能力开关矩阵**：wiki 单开（三工具无 _meta）/ ui 单开（仅 wiki_read_page，list/write 不泄露）/ 全关（空壳 capabilities）——hub 测试 8 用例锁定。
- **前端零误伤**：普通工具 envelope（Bash 等）无 structuredContent 键 → 卡片 metadata 零增量（单测锁定）。

## 8. 架构决策记录

| 决策 | 裁定 | 理由 |
| --- | --- | --- |
| ext-apps SDK vs 手写桥 | MVP 手写 JSON-RPC 桥 | 观察者宿主桥面极小（单 notification）；ext-apps 2.0.3 peer 依赖 SDK 2.x 分包 vs 项目 sdk@1.x，阶段 4（反向 tools/call）再评估 |
| 双 iframe vs 单层沙箱 | 单层 `sandbox="allow-scripts"` | 资源是自家系统模板，无第三方篡改面；第三方 server 接入期再强化 |
| UI 关联判定 | display tool 名单 + kind 双条件 | CLI 不透传 _meta（S1 实测）；未知名单回退通用卡 |
| ui-resource 路由 | api 进程内单源表直读 | hub 与 api 同进程；hub 恒 loopback |
| skills 分发时机 | 阶段 5 | 三家 CLI 无 client；SDK 无 skills 支持 |
| 渲染库供给：CDN vs 构建期内联 vs 手写 | **构建期内联**（marked + DOMPurify + mermaid，Bun text import 直读 dist） | ext-apps 官方示例 / OpenAI Apps SDK / ZCode UI Plugin 三方一致；CDN 路线回放/离线空白、CSP 放宽；手写 30 行是 XSS 藏身处。详见 [mcp-app-rendering-survey.md](./mcp-app-rendering-survey.md) |

## 9. Spike 结论（S1-S4）

- **S1 Claude 流透传**（本机一手实测）：`mcp__<server>__<tool>` 命名、system init `mcp_servers[].source: "dynamic"`、`tool_use_result.structuredContent` 原样透传（dict/list 双形状）、`_meta` 不透传、CLI 方法序列 discover→initialize→initialized→tools/list→resources/list→tools/call。
- **S2 Codex 同测 / S4 Codex 注入**：`-c` 深合并；exec --json 的 `mcp_tool_call.result`（snake_case 字段）。
- **S3 `--mcp-config` 同名合并**：flag 全赢整条替换（活体 + 源码双证）。

## 10. 落地路线与状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 0 | 保留名守卫 + mcpInject 能力投影 | ✅ `9ec70ab` |
| 1 | Spike S1-S4 | ✅ 全闭环（见 §9） |
| 2 | ar-hub 扩 ui + wiki_read_page display tool + ALLOWED_CAPABILITIES 扩集 | ✅ `5975eec` |
| 3 | 宿主 MVP：流信号检测 → 卡片投影 → api 回源路由 → 沙箱 iframe | ✅ `0de7979` + 审查修复 `7d098a7` |
| 3.5 | 主题变量化 + 高度自适应（ZCode §11 立即项） | ✅ `2347552` |
| 4 | 反向通道：ui/initialize 握手 + tools/call 刷新 + ui/message 再推理 | ✅ `1578ca9` |
| 4.5 | e2e 收口：mcp-app-card.spec.ts（全链零 mock）+ run-e2e 预置 | ✅ `7392a2d` |
| 5 | hub skills 分发（SEP-2640 skills/list-get + skill:// 资源读取） | ✅ 本批（Inspector 2.11 实测过） |
| 5.5 | 卡片富渲染：marked + DOMPurify + mermaid 12 构建期内联 + api 路由 gzip | ✅ 2026-10-21（见渲染调研报告） |
| 6 | 上游 CLI client 消费（协商扩展后 skills 直达 agent） | 等上游 |

**阶段 5 协议面（实现 vs 明确不做）**：

| 面 | 实现 |
| --- | --- |
| 扩展声明 | `capabilities.extensions["io.modelcontextprotocol/skills"] = {}`（skills 开关时）+ 同声明 resources capability（SEP MUST） |
| `skills/list` | 实时扫描本地 skills 磁盘文件（项目 `.claude/skills` + 全局 `~/.claude/skills` 并集,claude-code 口径）;entry = uri/frontmatter/resources 完整清单（sha256 digest+size,含 SKILL.md 自身）;CacheableResult（ttlMs 300s/cacheScope private）;offset cursor 分页（量级小单页全量） |
| `skills/get` | manifest URI 精确查找;非本 server 的 skill → -32602;无分页 |
| `resources/read`（skill://） | `ResourceTemplate("skill://{+resourcePath}")` 模板注册（保留展开匹配多段路径）;清单精确命中才读 + resolve/startsWith 双道防穿越;mimeType text/markdown |

明确不做（有意收窄）：`resources/directory/read`（不声明 directoryRead）、请求 `params._meta` 三键校验（client 侧 MUST,server 宽容）、server 侧 512 文件/16MiB 限额**校验报错**（host 侧职责;server 侧仅做超限整体跳过的 DoS 防护,不校验不报错——见审查结论 P1-2）、web 控制面（「不预造 UI」裁定;web 无 capabilities 编辑 UI）。

**阶段 5 关键取舍**：① **数据源 = 本地 skills 同一批磁盘文件**（单一数据源,无第二份存储;与 CLI 文件发现同源,web 管理面现成）;② **分发口径 = claude-code 目录约定**（项目 + 全局 `~/.claude/skills` 并集,同名项目 scope 胜出与 slash catalog 同口径;codex 目录暂不分发——hub 服务 claude 为主,Codex 仅提交时快照）;③ **SDK 1.30 手写桥**（自造 zod schema 经 `server.server.setRequestHandler`,与内部 tools/resources handler 并存——官方 TS 支持落地后再迁移）;④ **每请求实时扫描**（hub 无状态;清单精确命中才读 = 防穿越第一道,digest 与内容必然一致 = SEP 读时校验模型天然满足）;⑤ name 缺失 → 目录名兜底（URI 末段=frontmatter.name 恒自洽;与本地系统 `fm.name \|\| entry` 同口径）。验证：hub 真 HTTP 测试 9 用例 + **MCP Inspector 2.11 真 host 实测三方法全过**（skills/list / skills/get / resources/read）+ 全门禁绿。

**阶段 5 审查结论（2026-10-21,security-reviewer 已消化）**：0 安全漏洞（主链防穿越经实验验证成立：清单精确匹配 + 不 decode + resolve 包含检查）;2 P1 + 2 P2 已修——**P1-1 清单读回不对称**（中文/空格/含 `..` 字样文件名「列出即承诺」却读不回 → 扫描时建 uri→实际相对路径 Map,读取查表,消灭反向构造）;**P1-2 无上限全量扫描**（SEP 固定上限未实现 → 单 skill >512 文件或 >16MiB 整体跳过 + digest 流式化,防 1GB 参考数据文件把请求 buffer 顶爆）;**P2-1 根级 symlink 跟随**（stat 跟随与内部条目不跟随口径矛盾 → realpath 后校验仍在 skills 根之下,与 skill-market 口径对齐）;**P2-2 cacheScope "public"**（本机 per-project 私有数据 → "private"）。info 三条：frontmatter 平铺 KV 拍扁嵌套 YAML（互操作债,官方 SDK 落地迁移时一并处理——含嵌套 frontmatter 的 skill 经本 hub 分发的 entry 恒过不了严格 host 的逐字段比对）、同 name 冲突留痕（已加 sort + warn）、home 注入参数无害（保持现状）。

**阶段 5.5 卡片富渲染（2026-10-21,调研定案 + 实现）**：真机发现卡片只支持 legacy 手写渲染（mermaid/SVG/表格/富 HTML 不可渲染）→ 调研定案**构建期内联**（[mcp-app-rendering-survey.md](./mcp-app-rendering-survey.md)：ext-apps 官方示例 / OpenAI Apps SDK / ZCode UI Plugin 三方一致;CDN 路线回放/离线空白）。实现：marked 15.0.12 + DOMPurify 3.2.6 + **mermaid 12.0.0**（与 web 包统一版本,接受 5.4MB;Bun text import 直读 dist,`</script` 防御转义,无生成文件）→ 模板 rich 管线（`marked.parse → DOMPurify.sanitize → innerHTML`,mermaid 围栏逐块升级 SVG,异常回落 legacy renderBlocks;主题切换重初始化重渲染）;CSP 维持 `default-src 'none'`（零外域,比 CDN 路线更严）。配套：api mcp-ui-resource 路由 **gzip 协商**（响应体缓存 + Bun.gzipSync,5.65MB → ~1.2MB,Bun.serve 无内置 HTTP 压缩）;e2e spec timeout 提 90s（5.65MB srcdoc 在 2G cgroup 全链 36s）。验证：模板探针 26/26（mermaid SVG/表格/HTML 直通/script 剥除/主题重渲染/刷新清残留）+ e2e 31/31 + api 29/29 + web 859。后续：**轻/重模板分流**（无 mermaid 页 ~60KB 轻模板）是传输重量的彻底解法;真机加载比之前慢是预期（5.4MB parse）。流式渲染调研结论：全部为聊天流而生,卡片整篇数据不需要（见调研报告 §4）;沙箱双份依赖是 SEP-1865 隔离模型的固有代价（§5）。

**阶段 4 协议面（实现 vs 明确不做）**：

| View → Host 请求 | 实现 |
| --- | --- |
| `ui/initialize` | 应答 hostInfo + hostCapabilities + hostContext{theme, locale}；模板应用后回 `ui/notifications/initialized` |
| `tools/call` | 双侧白名单（web 本地 + api `HUB_APP_TOOLS`）→ api 代理直调 `ProjectWikiService` → CallToolResult 回帧（不触发 turn） |
| `ui/message` | `useConfirm` 用户同意闸 → `bridge.sendMessage(text)` → 新 turn；取消/无回调 → error -32600 |
| `ping` | 应答 `{}` |

明确不做（有意收窄）：`resources/read` 转发、`ui/open-link`、`ui/request-display-mode`、`ui/update-model-context`、`sampling`、`ui/download-file`、sandbox-proxy、`ui/resource-teardown`。

**阶段 4 关键取舍**：① ext-apps SDK 再评估结论 = **继续手写桥**（双向 request/response 约 +60 行；SDK 2.x peer 冲突未解、自家模板无互操作诉求——§8 决策①维持）；② tools/call **代理直调 service 不过 MCP 协议层**——hub 真无状态（每 HTTP 请求新建 McpServer+transport，initialize→tools/call 实例不共享），经 HTTP 打 hub 每请求都要走完整序列且 loopback 端口校验麻烦；api 与 hub 同进程共享 `ProjectWikiService` 单源（`handleWikiRoute` 先例模式），`structuredContent` 包装抽 `wikiPageStructuredContent` 共享纯函数防漂移；③ 发送回调**零新管道**——renderer 已持有 `ClaudeBridgeContext`，`bridge.sendMessage` 是现成干净面（running 时 assistant-ui 排队非禁发）；④ 模板反向请求的 id-only 消息守卫——JSON-RPC 2.0 应答必含 `result` 或 `error`，无二者的 id 消息是 `parent === self` 回环请求（file:// 探针/自嵌帧），不得当应答（无此守卫时模板会自吞请求、真应答遭丢——探针实抓）。

**审查结论（2026-10-20，`7d098a7` 已消化）**：code-reviewer 1 严重（route 重建漏转发 structuredContent = 卡片主路径不可达，见 §6 断点注）+ 3 建议；security-reviewer 0 高/中危、3 低危（postMessage 导航守卫 + CSP meta 治本 / 原型链索引 / 404 注释）。全门禁绿 api 1016 / shared 10 / web 851。

**阶段 4 审查结论（2026-10-20，`9072dd1` 已消化）**：code/security 双 reviewer 均 0 P0/P1；P2 三主修 = ①帧内导航检测失效（WindowProxy 跨导航恒定，身份比较无效 → onLoad 同模板 refire 即导航信号，`revokedRef` 正反向全断 + 单测改真实语义）；②模板 listener 补 `e.source !== parent` 校验；③hostContext.locale 取错源（navigator.language ≠ 应用语言偏好 → 改 useT 的 lang）。另：真实 Chromium 诊断实锤「iframe load 先于帧内 postMessage 到达」——握手应答时序窗口不存在（reply 仍挂 revokedRef 以消除引擎顺序依赖）；模板 sendRequest 加 15s 超时 + askSend 防重入。info 记录：宿主在 initialized 前发 tool-result 与 notes §79/§124 的 MUST NOT 顺序不符（自家模板两序都处理，接外部 app 时治理）；-32600 双语义；body 无大小上限（与既有路由同水位）。

**待验证/待补**：

- 真机会话端到端（test 项目 wiki+ui 双开，agent 真调 wiki_read_page 看卡片 + 阶段 4 刷新钮/追问条）——交真机清单；e2e 已完成（`7392a2d`）。
- 阶段 5 后续：上游 CLI 运行时 client 跟进后的端到端消费验证（等上游）；Codex 提交时快照导入的真实消费走 OpenAI 插件提交流程，届时按其限额（≤5 skills/10 分页等）复核兼容性。
- 宿主在 `initialized` 通知前发 `tool-result`/`host-context-changed` 与 SEP 顺序要求（MUST NOT）不符——自家模板两种顺序都处理，接外部 app 时治理。
- fedWinRef/revokedRef 守卫面（帧内导航检测、feed 前请求路径）目前靠引擎时序与设计推演，无测试锁「feed 之前到达的请求」分支（jsdom 构造困难；reviewer 判定无需补写）。
- Codex `structured_content` 的 web 宿主消费（snake_case 字段名分支）——接入 Codex 宿主卡时做。
- 细粒度 CLI 源码深挖 subagent（Claude Code / Codex / ZCode 内部实现）成果丢失于 session 压缩；阶段 4/5 需要时重跑。
- `CLAUDE_CODE_MCP_APPS_HOST` 实验通道的版本漂移监控——仅作 POC 备选记录。

## 11. 参考实现：ZCode Gen UI（visualize Skill，2026-10-20 精读）

来源：ZCode v3.15.1（commit `aac4755`，2026-10-10）「Add UI plugins and inline Gen UI experiences」；`SKILL.md` 全文精读（`apps/zcode-cli/packages/visualize-plugin/skills/visualize/SKILL.md`，配套 `gen-ui-output.ts` / `visualize-skill-gate.ts` / `references/` / `widgets/` / `examples/`）。

**机制五条**：

1. **Agent 生成 HTML 片段写文件**：产物是 fragment（无 doctype/html/head/body），写到宿主提供的 session 输出目录（绝对路径、禁 symlink 与 parent traversal），体积 <1MB（大数据集须聚合/降采样）。
2. **内容引用而非内联**：最终回复里发一行 `::visualize{"path":"<abs>/<title>.html"}`（可带 `"mode":"wide"`）；宿主只渲染**已完成的 assistant 消息**。
3. **宿主 sandbox iframe 渲染**：frame 起始 240px、随内容高度自适应到上限 10000px、5px paint gutter；片段内禁 fetch/XHR/WS，静态资源只许 CDN allowlist（cdnjs/esm.sh/jsdelivr/unpkg/fonts.googleapis/gstatic/bunny，越界静默失败）。
4. **交互分层**：普通交互（滑块/图表/表单）纯客户端 JS 本地完成；需要继续推理时调 `await window.zcode.sendFollowUpMessage({ prompt, title })`——宿主弹确认对话框（title ≤250 字符），用户确认后才发新 turn。
5. **状态持久**：`window.zcode.widgetState` 读取、`setWidgetState({ modelContent, privateContent })` 保存（<16KiB，整快照替换）；`modelContent` 可进模型（best-effort，不保证投递，保存不触发 turn），`privateContent` 仅供 UI 恢复；`zcode:set_globals` 事件应用宿主注入状态。

**宿主侧规范（对我们有直接约束力）**：CSS 变量注入（`--background/--foreground/--card/--primary/--viz-series-1..6` 等）且**强制 theme-aware**（禁硬编码浅/深色、禁 Tailwind 字面色）；宿主 utility 设计系统（`.card/.btn/.form-*/.table/.viz-*`）+ Lucide 全局，禁自造样式；可访问性硬要求（语义 HTML、44px 粗指针目标、320px 最窄宽、`role=alert` 校验错误）；导出走 `scripts/render.py` 包独立 HTML。

**与我们的对照**：

| 维度 | ZCode visualize | 我们（MCP Apps 宿主 MVP） |
| --- | --- | --- |
| UI 来源 | Agent 每次生成 HTML 片段（生成式） | hub 预置模板 + structuredContent（确定性视图） |
| 传输 | 文件路径引用 `::visualize{path}` | tool result `structuredContent` + `_meta.ui.resourceUri` |
| 渲染 | sandbox iframe（读文件） | sandbox iframe（srcdoc 模板） |
| 数据注入 | fragment 内联写死 | postMessage `ui/notifications/tool-result` |
| 再推理 | `sendFollowUpMessage`（宿主确认框） | ✅ 阶段 4：SEP-1865 `ui/message` → 宿主确认框 → composer 管道 |
| 状态 | widgetState 16KiB（modelContent 可进模型） | 无（阶段 5+，按需） |
| 主题 | 宿主 CSS 变量注入，theme-aware 强制 | ✅ 模板 CSS 变量双态（`:root` 深色基准 + light 覆盖）+ hostContext/host-context-changed 同步 |
| 安全 | CSP CDN allowlist + 路径校验 + 1MB 上限 | CSP `default-src 'none'` + opacity-origin 沙箱 + 双侧 tools/call 白名单 |

**落地启示**：

- **立即（阶段 3 尾巴，低成本）**：① wiki 模板主题变量化——当前硬编码 `#fff/#111`，深色主题是刺眼白块（code-reviewer 已标记为后续迭代面），改为消费宿主 CSS 变量或 `prefers-color-scheme`；② iframe 高度自适应——ZCode 随内容高伸缩；我们固定 `h-[420px]`，长 wiki 页只能内滚，可改 `ResizeObserver` 上报高度。
- **阶段 4（反向通道）**：`ui/message` 的宿主确认面参考 `sendFollowUpMessage({ prompt, title })`——title 作确认框标题、prompt 带用户所选值；状态持久参考 `modelContent`/`privateContent` 二分（模型可见 vs 仅 UI）。
- **长期（生成式 UI 能力域）**：若做「Agent 生成卡片」（对应 ZCode visualize 路线），必备防线来自其规范——片段体积上限、输出目录路径校验（禁 symlink/穿越）、CDN allowlist、导出渲染器。这与 MCP Apps 是**互补的两条轨道**（确定性视图 vs 生成式界面），共用同一沙箱渲染基座；ZCode 自己也两条都做（visualize Skill + MCP Apps 可编辑画布）。


