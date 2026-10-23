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

**阶段 5.5 卡片富渲染（2026-10-21,调研定案 + 实现）**：真机发现卡片只支持 legacy 手写渲染（mermaid/SVG/表格/富 HTML 不可渲染）→ 调研定案**构建期内联**（[mcp-app-rendering-survey.md](./mcp-app-rendering-survey.md)：ext-apps 官方示例 / OpenAI Apps SDK / ZCode UI Plugin 三方一致;CDN 路线回放/离线空白）。实现：marked 15.0.12 + DOMPurify 3.2.6 + **mermaid 12.0.0**（与 web 包统一版本,接受 5.4MB;Bun text import 直读 dist,`</script` 防御转义,无生成文件）→ 模板 rich 管线（`marked.parse → DOMPurify.sanitize → innerHTML`,mermaid 围栏逐块升级 SVG,异常回落 legacy renderBlocks;主题切换重初始化重渲染）;CSP 维持 `default-src 'none'`（零外域,比 CDN 路线更严）。配套：api mcp-ui-resource 路由 **gzip 协商**（响应体缓存 + Bun.gzipSync,5.65MB → ~1.2MB,Bun.serve 无内置 HTTP 压缩）;e2e spec timeout 提 90s（5.65MB srcdoc 在 2G cgroup 全链 36s）。验证：模板探针 26/26（mermaid SVG/表格/HTML 直通/script 剥除/主题重渲染/刷新清残留）+ e2e 31/31 + api 29/29 + web 859。真机加载比之前慢是预期（5.4MB parse）。流式渲染调研结论：全部为聊天流而生,卡片整篇数据不需要（见调研报告 §4）;沙箱双份依赖是 SEP-1865 隔离模型的固有代价（§5）。

**阶段 5.6 轻/重模板分流（2026-10-23 完成）**：无 mermaid 的 markdown 内容不再付 5.4MB 的传输/parse。供给面：`MARKDOWN_LITE_UI_URI`（`ui://ar-hub/markdown-lite`）= `RICH_SPEC` 关掉 `withMermaid` 的构建期变体（marked + DOMPurify 保留,实测 **76KB raw** vs 富卡 5.39MB;`HUB_UI_RESOURCES` 注册,resources/read 与 api gzip 路由零改动自动获得）。选择面在**宿主侧渲染策略**（CLI 不透传 `_meta.ui`,外部 host 拿到的仍是全能力——工具 `_meta` 不动）:web `contentNeedsMermaid(sc)`（判据与模板渲染逻辑逐字对齐:wiki-page 看 markdown;file-preview 仅 `\.(md|markdown)$` 路径看 content;围栏匹配宁宽不窄——误判 lite 唯一后果是围栏按代码块显示）,registry `uri` 支持函数形态按 structuredContent 解析,wiki_read_page/read_file 两注册点接入。退化路径 = lite 下 mermaid 围栏按代码块显示（`upgradeMermaidBlocks` 的 `typeof mermaid === "undefined"` 守卫既有）。验证：api 单测 5 + hub resources/read 1 + web 单测 7 + 探针 `probe-mcp-app-light-template.mjs` 33/33（lite 静态特征 + 真浏览器表格/围栏保持代码块/主题/追问）+ 富卡探针 31/31 + e2e 3/3——**case1 全链 36s → 12.7s**（轻模板生效的直接证据）,case3 加 mermaid 围栏保持富路径（mermaid SVG 断言锁死选择）。

**阶段 4 协议面（实现 vs 明确不做）**：

| View → Host 请求 | 实现 |
| --- | --- |
| `ui/initialize` | 应答 hostInfo + hostCapabilities + hostContext{theme, locale}；模板应用后回 `ui/notifications/initialized` |
| `tools/call` | 双侧白名单（web 本地 + api `HUB_APP_TOOLS`）→ api 代理直调 `ProjectWikiService` → CallToolResult 回帧（不触发 turn） |
| `ui/message` | `useConfirm` 用户同意闸 → `bridge.sendMessage(text)` → 新 turn；取消/无回调 → error -32600 |
| `ping` | 应答 `{}` |
| `ui/update-model-context` | M3 画布选区引用（2026-10-23）：模板发 `{kind:"canvas-selection",docId,title,revision,elements}` → 宿主 `isCanvasSelectionContext` 形状守卫 → jotai 单槽（latest-wins）→ composer chip（可见可删）→ 发送时 `formatCanvasSelectionContext` 并入 prompt 首项并清槽。SEP 原语义是「宿主存上下文随请求发送」；我们上游是 Claude CLI（非自控 loop），落地形态 = 序列化进 prompt 的 `[画布选区]` 文本块 |

明确不做（有意收窄）：`resources/read` 转发、`ui/open-link`、`ui/request-display-mode`、`sampling`、`ui/download-file`、sandbox-proxy、`ui/resource-teardown`。

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
- **长期（生成式 UI 能力域）**：若做「Agent 生成卡片」（对应 ZCode visualize 路线），必备防线来自其规范——片段体积上限、输出目录路径校验（禁 symlink/穿越）、CDN allowlist、导出渲染器。这与 MCP Apps 是**互补的两条轨道**（确定性视图 vs 生成式界面），共用同一沙箱渲染基座；ZCode 自己也两条都做（visualize Skill + MCP Apps 可编辑画布）。→ 已立项（2026-10-22），见 §12.5。

## 12. UI Plugin 官方契约 + Gen UI 契约更新 + 立项决策（2026-10-22 精读）

来源：`UI_PLUGIN.md`（zai-org/ZCode main，v3.15.1，commit `aac4755` 2026-10-10；461 行全文抓取）。§11 的 visualize 源码精读仍有效，本节补官方文档版契约与增量信息。

### 12.1 UI Plugin 是什么（定位）

**MCP Apps 的插件化封装 + 侧栏持久面板 + 市场分发**。页面用官方 `@modelcontextprotocol/ext-apps` SDK（无 ZCode 专用 SDK），锁定页面 SDK 2.0.0 / MCP 服务 SDK 1.29.0。

- **平台硬边界（原文）**：「交互页面目前用于 ZCode Desktop 的本地工作区。Web、手机和远程工作区保留普通 MCP 工具记录，不把这些路径视为已经支持交互面板」。渲染宿主 = Electron：沙箱在 `packages/desktop/src/main/pluginSandbox/`（main）+ `plugin-sandbox/`（renderer，aliasApi）。
- **manifest 三件套**（`.zcode-plugin/plugin.json`）：① `mcpServers`（stdio，业务逻辑+数据）；② `ui.surfaces[]`（`id` / `title` i18n / `server` 名 / `resourceUri: ui://<name>/<page>.html` / `availability: "session"`）——侧栏持久面板声明，面板非一次性卡片、后续工具继续操作同一份文档；③ 工具定义 `_meta.ui.resourceUri` + `_meta.ui.surface` 把工具结果路由到面板。server 须实际注册 `ui://` 资源返回 `text/html;profile=mcp-app`。`ui.surfaces` 可省略（仅内联页面）。
- **分发**：独立 `zcode-plugins` marketplace repo + `zcode.cjs plugins marketplace add/install/enable`；PR 模板强制声明插件类型（UI Plugin / 普通插件 / 不适用）。
- **页面变量**：`${ZCODE_PLUGIN_ROOT}`（插件目录）/ `${ZCODE_PROJECT_DIR}`（工作区）/ `${ZCODE_PLUGIN_DATA}`（持久数据）；页面经服务执行文件操作，无 Node / 任意文件访问。

### 12.2 Excalidraw：画布⇄对话循环（工具表全录，画布立项直接参照）

五步循环：Agent `create_diagram` 画初稿（侧栏开可编辑画板）→ 用户手动编辑，页面 `commit_scene` 保存（revision）→ 用户框选元素右键**「引用选区到对话」**（`updateModelContext`，输入区出现插件上下文徽标）→ 发追问（Agent 收到问题+选区）→ Agent `read_scene` → `apply_operations` 按**稳定元素 ID** 局部修改（不重画全图；用户编辑与工具编辑共用撤销栈）。

| 工具 | 调用方 | 关键语义 |
| --- | --- | --- |
| `create_diagram` | 模型、页面 | `title`+`elements` 新建；返回文档 ID 和版本 |
| `open_diagram` | 模型、页面 | 按 `id` 打开或按 `path` 导入工作区 `.excalidraw`（二选一） |
| `read_scene` | 模型、页面 | 当前版本+元素摘要；`elementIds` 限定选区 |
| `apply_operations` | 模型、页面 | 按元素 ID 增改删；携带 `expectedRevision` + `operationId` |
| `export_diagram` | 模型、页面 | 导出原生 `.excalidraw`；版本检查，覆盖需 `overwrite: true` |
| `commit_scene` | 仅页面 | 提交编辑草稿，版本冲突检查 |
| `list_diagrams` / `save_copy` / `save_image` | 仅页面 | 列文档 / 另存 / PNG·SVG 写工作区 |

并发与容量：`expectedRevision` 冲突时保留本页草稿可另存；相同操作重试复用 `operationId`；业务文档 SQLite 按工作区隔离；每文档 ≤5000 元素 / 6 MiB；编辑器与字体随包提供不依赖 CDN；撤销历史仅当前活编辑器不跨重启。

### 12.3 平台能力边界（UI Plugin 轨道）

| 项 | 值 |
| --- | --- |
| HTML 资源上限 | 16 MiB；页面资源读取 8 MiB |
| 初始工具结果 | `structuredContent` 64 KiB / `content` 32 KiB / 页面元数据 16 KiB（超限省略+标记，页面从服务重读） |
| widgetState | 宿主内存级（会话内重建可恢复，应用重启不保证）；`experimental["zcode/widgetState"]` 能力协商 |
| 网络/原生权限 | 字体/WASM 随包优先；CSP 放宽须资源 `_meta["zcode/csp"]` 声明；camera/mic/geo/clipboard 需声明+宿主/系统授权，默认不可用 |
| ZCode 比我们多的 API 面 | `createSamplingMessage`（应用内模型调用；我们阶段 4 已裁定不做）、`registerTool`/`onlisttools`（页面注册工具给模型调）、`updateModelContext`（选区引用）、资源订阅（`resources/subscribe` + 通知）、`requestDisplayMode`、`downloadFile`、`openLink` |

宿主源码导航（UI Plugin 轨道）：`packages/ui/src/plugin-ui/`（能力声明/交互端口/handlers/资源订阅）+ `plugin-ui/CONTRACT.md`（页面保留/回收/恢复）+ `packages/services/src/plugin-ui-bridge/` + 桌面集成测试 `packages/desktop/scripts/mcp-apps-host-e2e.mjs`。

### 12.4 Gen UI 官方契约（§11 的文档版确认 + 增量）

§11 机制五条全部得到官方文档印证。**增量信息**：

- **专用输出目录**：「桌面端会向 Agent 提供当前会话的专用输出目录。生成的 HTML 保存在该目录，由宿主加载，**不写入项目工作区**；页面状态按工作区和会话隔离」。
- **展开/收起保留同一个活页面**（含「复制当前界面为图片」）——不是双实例：ZCode 宿主做了 DOM 迁移；我们 McpAppCard 因 React 换父必卸载（frontend-notes §3）选第二实例，同一问题的不同取舍，记档不跟进。
- **能力收窄明确**：Gen UI 页面**不提供 `callTool`、MCP 资源读取、Node 或任意文件访问**；需要插件服务执行操作时用 UI Plugin。生成物零提权——值得照抄的收窄线。
- **`sendFollowUpMessage`**：「没有有效用户操作时需要确认，失效或只读会话不能发送」——与 §11 第 4 条确认闸一致，官方文档版语义补全。
- **`setWidgetState({ modelContent, privateContent })`**：合计 ≤16 KiB 整快照替换，**只有 `modelContent` 进下一轮模型上下文**（`privateContent` 仅供 UI 恢复）；`zcode:set_globals` 事件 `detail.globals` 应用宿主注入状态。
- **Tweak 体系**：页面注册控件后，宿主提供滑块/颜色/开关/选项调整入口，支持重置、原始效果预览、明确提交——依赖页面注册控件协议，立项定为后续增量决策点（见 §12.5）。
- **两轨道关系（官方）**：「两者虽都可能出现 `window.zcode`，可用方法和状态结构不同，**不能混用**」；UI Plugin 的开发调试在独立 `zcode-plugins` 仓库（`feat/ui-plugin` 分支，主仓库公开分支尚未建好）。
- 规格与测试入口：`packages/ui/src/gen-ui/CONTRACT.md`（Gen UI 契约）；`apps/zcode-cli/packages/visualize-plugin/skills/visualize/references/api.md` + `tweak.md`；桌面集成验证 `node packages/desktop/scripts/gen-ui-e2e.mjs`。

### 12.5 立项决策（2026-10-22 用户拍板）

1. **生成式 UI：完整版，不做 MVP**。范围 = §12.4 契约全能力面：visualize 型 skill（输出目录+标记）→ 标记扫描（live/回放同管道）→ McpAppCard 基座沙箱变体（无 MCP Apps 握手、注入迷你桥；CSP 不放松）→ 迷你桥四能力（widgetState 读 / setWidgetState 双槽 ≤16KiB 硬闸 / sendFollowUpMessage 确认闸 / set_globals 事件）→ 状态回流（活页 modelContent 组装进下一轮 prompt）→ 回放恢复。ZCode 防线照抄：体积上限、路径校验（禁 symlink/穿越）、能力收窄。Tweak = 显式后续增量。
2. **画布：两批**。批 1 最小闭环 = ar-hub 四工具（照抄 §12.2 表，`expectedRevision`+`operationId` 语义）+ 文档存储（api 数据目录，revision 计数）+ excalidraw 富模板 + callServerTool 代理（ar-hub 进程内，iframe→postMessage→api 直调链，比外部 server 架构短——我们的独特优势）；**前置实验半天**：excalidraw standalone 单文件打包（体积/无 React 环境/中文字体 fallback）。批 2 = updateModelContext 选区引用循环（协议新方法 + composer「插件上下文」chip + CLI stdin prompt 注入格式——我们上游 Claude CLI 非自控 loop，须序列化进 prompt）。
3. **架构取舍**：画布 MVP 流内卡片形态（每次 apply 新版本刷新），侧栏常驻面板（工作台右栏）留升级路径；**绕开 registerTool**（反向调用链高成本；迂回 = agent 直调 ar-hub 工具 + 页面随工具结果刷新，ZCode 官方流程 agent 本就只调服务端工具）。
4. **落地次序**：生成式 UI 先（纯增量、零实验风险）→ 画布批 1 → 画布批 2；两条轨道共享沙箱基座与确认闸。GTD inbox 已捕获（2026-10-22 两条）。



### 12.6 M2.0 前置实验结论（2026-10-22，excalidraw standalone 单文件）

**判定：可行，进 M2.1/M2.2。** 打包管线（实验实证）：

- **依赖**：`@excalidraw/excalidraw@0.18.1`（npm latest，2026-04-20 发布，供应链 ≥7 天 ✅；peer `react ^17||^18||^19`，实测 react@19.3.1 可用）。打包 = vite 8（rolldown）lib mode IIFE + `@vitejs/plugin-react` + `inlineDynamicImports` + `process.env.NODE_ENV=production` define。
- **体积**：全量 7.6MB raw / 2.36MB gzip —— 大头是 `@excalidraw/mermaid-to-excalidraw` 拖进的 mermaid 全量。**alias stub 掉 mermaid 后 3.94MB raw / 1.46MB gzip**（目标 <3MB ✅），CSS 另计 244KB raw / 102KB gzip。stub 导出 `parseMermaidToExcalidraw` 抛错——M2 画布不需要 mermaid 导入。
- **CSP srcdoc 运行 ✅**：`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:` 的 srcdoc（sandbox="allow-scripts"）2~3s 挂载，画布/工具栏/场景全渲染，零 page error。
- **⚠️ 首次点击画图失效（实验实锤的坑）**：首次点击 iframe → iframe 获焦（`win:focus`）→ excalidraw 的 `maybeCleanupAfterMissingPointerUp`（挂 ownerWindow focus 事件）把按下态立即清成 up → **第一次拖画/框选必然无效**（后续点击 iframe 已聚焦则正常；顶层页面无此问题）。修复 = **宿主在 iframe onLoad 后 `iframe.focus()` 预聚焦**（实证：预聚焦后 focus 事件消失、CDP mouse 拖画 PASS）。M2.2 模板/卡片宿主必须带这条。
- **API prop 名**：0.18 是 `excalidrawAPI`（回调拿 imperative API；旧文档的 `onExcalidrawAPI` 已不存在——实验里回调不触发才定位到）。中文场景元素 `updateScene` 注入/渲染正常，`langCode: "zh-CN"` 生效。
- **opaque origin 无 localStorage**（SecurityError 被 excalidraw 内部容错，不崩）：excalidraw 自身持久化不可用——预期内，画布状态持久化走我们的 `project-canvas` 存储，不依赖 excalidraw 本地存储。
- **worker 被 CSP 阻断**（字体子集 worker）：实验期间未产生 page error；影响面 = 导出图片/字体子集化（M2 裁定不做导出图片，如未来要做再放宽 `worker-src blob:` 并重验）。
- **调试手法沉淀**：① 探针拿 srcdoc frame 用 `elementHandle.contentFrame()`——frame.url 判定不稳定（初值 `about:blank`、就绪后继承宿主 URL）；② 页内合成 PointerEvent 对照不可靠（合成 pointerId 无真实活动指针，excalidraw `setPointerCapture` 必抛 NotFoundError 且污染其指针状态机）；③ 判「首次点击失效」看 canvas DOM 事件序列 + window focus 事件时序。
- 实验产物在 `/tmp/exc-probe`（打包配置 src/main.tsx + vite.config.ts + stubs/mermaid.ts），M2.2 入仓时按此复刻。
