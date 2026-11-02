---
title: MCP Server 功能列表（ar-hub 现状汇报）
tags:
  - mcp
  - ar-hub
  - 架构
created: 2026-10-31
updated: 2026-10-31
---

agents-remote 的 MCP 能力全景：内部 hub（ar-hub）+ 注入管线 + MCP Apps 宿主 + 外部 server 管理。定位共识：**MCP Hub 是「给 agent 装能力（tool）」的统一层**，采纳 MCP 成熟抽象不重造协议。调研沉淀见 `docs/research/`（mcp-apps-hosting / plugin-extension-system / mcp-cli-ecosystem-notes 等）。

## 一、ar-hub 内部 hub（能力域与工具面）

api 进程内 loopback Streamable HTTP MCP server（绑 `127.0.0.1:43013`，无状态，每请求新建实例，**每请求重读 `.agents-remote/mcp.json` → capabilities 改动即改即生效**）。工具注册分两类：

**capabilities 开关控制**（项目 `.agents-remote/mcp.json` 的 `capabilities`，白名单 = wiki/ui/skills/gen-ui，未知键拒绝）：

| 能力开关 | 注册面 |
| --- | --- |
| `wiki` | `wiki_list_pages` / `wiki_write_page`（`wiki_read_page` 恒注册，见下） |
| `ui` | `wiki_read_page` 升级 display tool（`_meta.ui.resourceUri` → 卡片渲染门控） |
| `skills` | SEP-2640 分发：`skills/list` / `skills/get` 方法 + `skill://` 资源模板 |
| `gen-ui` | 生成式 UI 能力（见 §三） |

**恒注册**（不受开关控制，所有项目可用）：

| 工具 | 说明 |
| --- | --- |
| `wiki_read_page` | 恒注册（调用方保证 wiki/ui 至少一开）；仅 `ui` 开时带 display `_meta` |
| `git_status` / `git_log` | git-status 卡 / 提交历史 |
| `session_overview` | session-overview 卡 |
| `create_diagram` / `read_scene` / `apply_operations` / `export_diagram` | 画布卡 |
| `read_file` | file-preview 卡 |
| `project_settings` | 项目设置概览 |

全关时空壳 capabilities（基座行为保留）。本项目（agents-remote）当前开 `ui` + `wiki`（2026-10-31 起）；test 项目 wiki/ui/gen-ui 三开（wiki 示例页在其名下）。

## 二、注入管线（agent 会话怎么拿到 ar-hub）

| Provider | 通道 | 说明 |
| --- | --- | --- |
| Claude | `--mcp-config` inline JSON | spawn 时注入；flag 侧全赢、整条 entry 替换（活体+源码双证），不存在被用户配置劫持的通道 |
| Codex | `-c mcp_servers.ar-hub.url=…` 深合并 | chat 直拉与 terminal（tmux）双形态（批 E）；`mcp_tool_call.result` 为 snake_case 字段 |

- **保留名守卫**：`ar-hub` + `ar-` 前缀拒绝外部 add/update，防同名混淆。
- **不加 `--strict-mcp-config`**：ar-hub 与用户的外部 MCP 配置并存，工具列表是合集。
- 外部 server 管理（wrap `claude mcp`）与内部 hub 并存、互不干扰。

## 三、MCP Apps 宿主（SEP-1865，Stable）

Agent 调 display tool → 网页端渲染结构化 UI 卡片（非降级 JSON 文本）。阶段 0–5.6 全部落地：

- **判定**：display tool 名单 + `structuredContent.kind` 双条件（CLI 不透传 `_meta`，实测）；未知名单回退通用工具卡。
- **沙箱**：单层 `sandbox="allow-scripts"` srcdoc iframe + CSP `default-src 'none'`（自家系统模板无第三方篡改面；双 iframe 是第三方 server 接入期强化）。
- **模板**：构建期内联渲染库（marked + DOMPurify + mermaid 12，富模板 5.4MB）+ 轻模板分流（无 mermaid 内容走 76KB lite，宿主侧 `contentNeedsMermaid` 判据）；api `/mcp-ui-resource` 路由 gzip。
- **反向通道**（阶段 4）：`ui/initialize` 握手（主题/locale 同步）/ `tools/call` 双侧白名单代理直调 / `ui/message` 追问（宿主确认闸 → composer）/ `ui/update-model-context`（画布选区引用 → composer chip → 并入 prompt）。
- **Gen UI**（`gen-ui` 开关，ZCode visualize 路线完整版）：agent 生成 HTML 片段 + `::visualize` 标记 → 沙箱变体卡片 + 迷你桥（widgetState 读 / setWidgetState 双槽 ≤16KiB / sendFollowUpMessage 确认闸 / set_globals）→ modelContent 回流下一轮 prompt → 回放恢复。防线照抄 ZCode：体积上限、路径校验（禁 symlink/穿越）、能力收窄（无 callTool/文件访问）。

## 四、Skills over MCP（SEP-2640，Final）

hub 侧 server 先行（三家 CLI 均未实现 client，等上游）：`skills/list`（实时扫描项目+全局 skills 并集，claude-code 口径，digest+分页）/ `skills/get` / `skill://` 资源读取（清单精确命中 + resolve 双道防穿越）。MCP Inspector 2.11 实测三方法全过。

## 五、外部 MCP server 管理（插件体系 MCP 区）

定位 = **配置管理者**（用户填第三方 server，agents-remote 管配置），D1 拍板 wrap `claude mcp`：

- **清单（读）**：直接读 `~/.claude.json`（user scope）+ 项目 `.mcp.json`（project scope），结构化秒级；不解析 `claude mcp list` 文本（无 --json 且 4s+ health-check）。
- **增删改（写）**：wrap `claude mcp add/remove/update --scope user|project`（非交互，只信 exit code + 回读）。
- **UI**：M6 插件 Tab——MCP 组卡片 / 添加 sheet（stdio/sse/http 三类型 + env 键值行 + 作用域分段）/ 详情页（global scope）。
- **已知缺口（M8 记档）**：运行状态面（● 已连接/注入工具 N/重启）无数据源；project scope 详情入口；MCP 市场发现（D2 预留，registry.modelcontextprotocol.io / glama / mcp.so）。

## 六、候选路线（2026-10-31 梳理）

1. Codex 宿主卡消费（`structured_content` snake_case 分支，最小真实功能洞）
2. 运行状态与健康面（管理面最大体感缺口）
3. browser 能力域（hub 注释预留的下一能力域，需先小调研定工具面）
4. MCP 市场发现（D2 预留扩展点）
5. Tweak 体系（页面注册控件，立项时定为后续增量）
6. 第三方 server Apps 接入面（双 iframe + SEP 顺序治理）——等「接第一个真实第三方 server」事件触发
7. CLI client 消费 skills 分发（阶段 6，等上游）
