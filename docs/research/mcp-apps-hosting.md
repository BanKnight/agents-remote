# MCP Apps / Skills over MCP 宿主化落地：调研汇总与落地路线

> 调研批次主文档（2026-10-20）。深素材：[mcp-apps-spec-notes.md](./mcp-apps-spec-notes.md)（规范 + ext-apps SDK）、[mcp-cli-ecosystem-notes.md](./mcp-cli-ecosystem-notes.md)（三家 CLI 生态 + 本机活体探针）。
> 落地状态锚点：阶段 0（`9ec70ab`）、阶段 2（`5975eec`）、阶段 3（`0de7979`）已提交；本文档沉淀决策与路线，供阶段 4/5 与后续能力域扩展引用。

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
3. SDK 侧 skills 支持未发布（TS PR open）→ hub 侧若先行需 `setRequestHandler` 手写。
4. **裁定**：hub skills 分发推迟到阶段 5（等上游 CLI client 跟进）；枚举能力随实现走，不预造 UI。

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
| 4 | 反向通道：卡片→宿主 tools/call + ui/message → composer 管道 | 未开工（按需） |
| 5 | hub skills 分发（skills/list-get）+ 上游 CLI client 跟进 | 等上游 |

**审查结论（2026-10-20，`7d098a7` 已消化）**：code-reviewer 1 严重（route 重建漏转发 structuredContent = 卡片主路径不可达，见 §6 断点注）+ 3 建议；security-reviewer 0 高/中危、3 低危（postMessage 导航守卫 + CSP meta 治本 / 原型链索引 / 404 注释）。全门禁绿 api 1016 / shared 10 / web 851。

**待验证/待补**：

- 真机会话端到端（test 项目 wiki+ui 双开，agent 真调 wiki_read_page 看卡片）——交真机清单。
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
| 再推理 | `sendFollowUpMessage`（宿主确认框） | 阶段 4：SEP-1865 `ui/message` → composer |
| 状态 | widgetState 16KiB（modelContent 可进模型） | 无（阶段 4+） |
| 主题 | 宿主 CSS 变量注入，theme-aware 强制 | 模板硬编码浅色（**缺口**） |
| 安全 | CSP CDN allowlist + 路径校验 + 1MB 上限 | CSP `default-src 'none'` + opacity-origin 沙箱 |

**落地启示**：

- **立即（阶段 3 尾巴，低成本）**：① wiki 模板主题变量化——当前硬编码 `#fff/#111`，深色主题是刺眼白块（code-reviewer 已标记为后续迭代面），改为消费宿主 CSS 变量或 `prefers-color-scheme`；② iframe 高度自适应——ZCode 随内容高伸缩；我们固定 `h-[420px]`，长 wiki 页只能内滚，可改 `ResizeObserver` 上报高度。
- **阶段 4（反向通道）**：`ui/message` 的宿主确认面参考 `sendFollowUpMessage({ prompt, title })`——title 作确认框标题、prompt 带用户所选值；状态持久参考 `modelContent`/`privateContent` 二分（模型可见 vs 仅 UI）。
- **长期（生成式 UI 能力域）**：若做「Agent 生成卡片」（对应 ZCode visualize 路线），必备防线来自其规范——片段体积上限、输出目录路径校验（禁 symlink/穿越）、CDN allowlist、导出渲染器。这与 MCP Apps 是**互补的两条轨道**（确定性视图 vs 生成式界面），共用同一沙箱渲染基座；ZCode 自己也两条都做（visualize Skill + MCP Apps 可编辑画布）。


