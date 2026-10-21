# MCP Apps 卡片渲染能力调研：渲染库供给路线与流式渲染

> 调研批次（2026-10-21）。背景：真机测试发现 MCP Apps 卡片（wiki 页模板）只支持 legacy 手写渲染（标题/标签/列表/代码块/段落，~30 行），mermaid / SVG / 表格 / 富 HTML 均不可渲染。主文档：[mcp-apps-hosting.md](./mcp-apps-hosting.md)。
>
> 证据强度标注：官方文档 / 源码实证 = 强；社区讨论 / vendor 文档转述 = 弱（tvly 检索）。

## 1. 问题定义：MCP Apps 有渲染组件标准吗？

**没有。** SEP-1865（MCP Apps，Stable 2026-01-26）只规定**传输与沙箱协议**：`ui://` 资源的 HTML 供给、iframe 沙箱、postMessage 桥、`structuredContent` 数据通道。渲染层（markdown？mermaid？图表？）完全是 **app（模板）自己的实现选择**——宿主 CSS 变量与桥协议是唯一约束面。

因此「mermaid/SVG/HTML 不行」不是标准缺失，是我们的模板没装渲染库。补齐 = 模板内引入渲染库，问题收敛为**库从哪来（供给路线）**与**怎么选型**。

## 2. 渲染库供给：三条路线

| 路线 | 做法 | 采用者 | 致命伤 |
| --- | --- | --- | --- |
| ① CDN allowlist | 模板 CSP 放行 CDN 域名，运行时 `<script src>` 拉库 | ZCode Gen UI（visualize Skill） | 仅 ZCode 生成式 UI 用；纯 MCP Apps 宿主 0 先例；回放/离线场景空白 |
| ② 构建期打包（内联） | 构建时把库源码内联进 HTML（Vite `vite-plugin-singlefile` 等） | **ext-apps 官方全部示例、OpenAI Apps SDK、ZCode UI Plugin**（三方一致） | HTML 体积膨胀 |
| ③ 手写极简渲染器 | 自写解析（现状 legacy renderBlocks） | — | XSS / 渲染缺陷藏身处，能力天花板低 |

**定案：② 构建期内联。** 三方一致是强证据；路线 ① 的 CSP 放行 + 回放场景（历史卡片在无网/CDN 慢时白屏）违背 spec「MAY prefetch and cache」精神；路线 ③ 与「不伪造渲染缺陷」底线冲突。

本项目实现（无生成文件）：

- **Bun text import 直读 node_modules dist**：`import mermaidSource from "mermaid/dist/mermaid.min.js" with { type: "text" }`，构建期字符串拼接进模板占位符（`WIKI_PAGE_APP_TEMPLATE.replace("/*__AR_LIB_X__*/", ...)`），运行时零外域。
- `</script` 防御转义（`/<\/script/gi → "<\\/script"`，replace 用函数形式防 minified 源 `$&`/`` $` `` 特殊模式展开）。
- CSP 保持 `default-src 'none'; script-src 'unsafe-inline'`——**比 CDN 路线更严**（连外域都没有）。

## 3. 选型与体积

| 库 | 版本 | dist 大小 | 角色 |
| --- | --- | --- | --- |
| marked | 15.0.12 | ~40KB | markdown → HTML（`marked.parse`） |
| dompurify | 3.2.6 | ~22KB | HTML sanitize（白名单剥 script 而非转义） |
| mermaid | **12.0.0** | **5.4MB**（11.x 是 2.7MB） | mermaid 围栏 → SVG |

- mermaid 12 体积翻倍的来源：图表类型默认全量打包（11 拆 lazy chunk）。定案（用户拍板）：**统一到 12** 与 web 包（react-markdown 管线用的 mermaid 12.0.0）对齐——monorepo 双大版本并存的维护成本 > 传输体积差；传输层用 gzip + 后续轻/重模板分流消化。
- 管线：`marked.parse → DOMPurify.sanitize → innerHTML`，mermaid 围栏（`pre > code.language-mermaid`）逐块升级 `mermaid.render` → `.mermaid-box`；任一步异常回落 legacy renderBlocks（兜底不丢内容）；主题切换 → `mermaid.initialize` 重初始化 + 全量重渲染。
- mermaid 12 min 的全局名是 esbuild 内部命名空间 `__esbuild_esm_mermaid_nm.mermaid`（非标准 UMD `window.mermaid`）——注入点附归一化行（对 11 兼容，`||` 短路）。

## 4. 流式渲染调研（用户问：别人说的流式渲染是用在这块吗？）

**不是。** 流式渲染工具（streamdown ~10KB gz / smd ~3KB / remend）全部为 **LLM 聊天流**而生：token 增量到达时渲染不完整的 markdown（未闭合代码块、未闭合粗体）需要「补全再渲染」或增量解析。特征：React 绑定（streamdown）或极简 vanilla（smd）+ 零依赖预处理（remend）。

MCP Apps 卡片是**一次性整篇数据**（tool result 一次到达），无增量渲染诉求。SEP-1865 的 `tool-input-partial` 是**参数级流式**（agent 还在生成 tool 参数时宿主可拿到前缀——FastMCP Generative UI 在用），与「流式 markdown 渲染」是两回事，且我们不消费参数流。

我们主聊天流的 CodeBlock + mermaid 400ms 防抖已是「朴素块级 memo」同族——聊天流侧现状维持，不引入专门库。

## 5. 沙箱冗余的固有性（用户问：聊天流已有同款组件，冗余吗？）

**结构性冗余，不可消除**（在保留 MCP Apps 标准模型的前提下）：卡片跑在 iframe 沙箱（独立 JS 上下文），宿主 React 组件树对其**不可达**——iframe 里无法 `import` 宿主的 React/react-markdown/mermaid 实例。这与「iOS App 与 App Extension 各自带框架副本」同构：沙箱隔离是 SEP-1865 的安全模型本身，双份依赖是它的代价。

消解路径（已定案）：传输重量 ≠ 内存双份（iframe 是按需挂载）；api 路由 gzip 压传输；**轻/重模板分流**（无 mermaid 页用 ~60KB 轻模板）是后续批次的彻底解法。

## 6. 落地验证清单（本批已实测）

- 模板探针 26/26：mermaid SVG 升级、表格、HTML 白名单直通、raw `<script>` 剥除（DOMPurify）、3 库 + 1 主脚本全内联无 src、主题切换 mermaid 重渲染、刷新清残留。
- e2e mcp-app-card 全链（含 gzip 传输）：全链 35.6s（5.65MB srcdoc parse 在 2G cgroup 下慢 3-5 倍）→ spec timeout 提至 90s。
- api 单测 29/29：gzip 协商（Content-Encoding + 解压等价 + <1/2 字节）+ identity 明文。
