# research/inbox 索引

本层是 research 的**未定型区**：放置带调研但方案未定、尚未进入实现期的意图文档。

## 与 research 根的区别

- `docs/research/` 根：**已沉淀结论**——方案已定、可作为长期参考的调研。
- `docs/research/inbox/`：**未定型意图**——基础要素已对齐、调研已做，但技术方案未定、待深化。非沉淀结论。

## 治理规则

- 本区文档**不是长期结论**，引用时须标注"待深化"。
- 文档定型（方案定稿、进入实现期）后，须**迁出**：技术方案迁 `docs/research/` 根，行为契约迁 `docs/specs/`，并从本区删除。
- 本区不长期堆积：进入 roadmap / 完成深化即迁出或归档。

## 文档

- [mcp-hub-competitors.md](./mcp-hub-competitors.md) — MCP Hub 竞品调研(待深化):编辑器 agent 集成(Cursor/Windsurf/Cline/Continue/Zed)、MCP 网关(Smithery/Glama/Composio/mcp.so)、Claude Code/Codex CLI 的 MCP client、参考实现 hapi 如何实现 agent 工具层;二轮补 Orca/Proma(桌面 agent 工作台源码)、Codex app(CLI 的 GUI 壳)、扣子 Coze(字节平台,MCP 仅扣子空间云托管 + 经典 Bot 自研 OpenAPI)、WorkBuddy(腾讯,**三轮更正:Connectors 走 MCP 非自研**);聚焦「传输:stdio vs Streamable HTTP + 无状态性」抉择(累计 13 竞品无一用 stateless HTTP 给 local 工具,我们仍是最激进;Proma 走进程内 SDK MCP 是无状态家族的另一分支,印证「无状态两条路由部署形态决定」);**三轮补「概念层级 × scope」维度**(Codex 源码 project-scoped + 无 per-conversation + trust 门 / WorkBuddy 四层概念 + 三层分离 scope,验证我们 per-project 方向)+ 就地更正 WorkBuddy 用 MCP;附可借鉴/规避点与来源。
- [mcp-hub-positioning.md](./mcp-hub-positioning.md) — MCP Hub 定位共识（待深化）：把 wiki/browser 拔成「MCP hub 上最先落地的内部能力域」,统一采纳 MCP 协议(spec 2025-11-25)成熟抽象而非自造。两类 MCP(内部 hub 自建 / 外部 MCP 对接转发第三方)框架一起定;**基座是空壳**(agent 自带文件工具,无基线层),工具按能力域(wiki_/browser_)组织;与 skill-market(知识/行为 vs 能力/工具)互补;runtime 兼容维度(McpInjector:Claude2 先行 / Codex 后接,不加 strict);落地顺序(**第一个要实现的是 MCP hub 基座**(无状态 Streamable HTTP server + --mcp-config 注入),wiki 是基座之上第一个能力域,browser 第二个,不建空壳,插件抽象等 browser 第二样本再提取);MCP 协议事实(tools/list 动态裁剪=能力开关、stdio vs Streamable HTTP);**概念层级 scope 三轮已验证 per-project + session 继承**(Codex 源码/WorkBuddy 文档),trust 门 + 凭据管理 deferred 到「外部 MCP 转发」阶段(内部能力域=官方可信,无需 trust 门)。吸收了 wiki/browser 草稿里 MCP 通道复用的待决点。
- [llm-wiki-okf.md](./llm-wiki-okf.md) — llm-wiki / OKF 知识库调研（基础要素已对齐，待深化）：Karpathy LLM Wiki pattern（与 RAG 区别）、Google OKF（2026-06-16，markdown+YAML 格式规范非工具、producer/consumer 分离）、选型不并入外部开源项目（consumer 侧自建轻量渲染层）。**A/B 路线三轮源码级调研结论已写入**：不是 A vs B 单选——问题被重构为「agent 逐页写(A机制) + 给人可浏览 wiki(产物)」的缝合，占空白生态位（Karpathy/lucasastorian 唯一已做但桌面形态，服务端多租户 per-project 无人占据）；就地修正两处误读（lucasastorian「夜间 routine」非 B、llm-wiki-compiler 非独立 repo）；剩余触发方式/审批桥两决策点留 plan 阶段。producer 工具走 MCP 已收敛至 [mcp-hub-positioning](./mcp-hub-positioning.md)。
- [embedded-browser.md](./embedded-browser.md) — 嵌入式浏览器调研（基础要素已对齐，待深化）：类 herdr-browser 在控制台内嵌入真实 Chromium + CDP 驱动 + 人可接管，核心场景为可视化 Agent 登录/爬虫操作与本地代码实时预览；herdr-browser 机制参考、与本项目 Web SPA 嵌入差异（渲染方式、移动端冲突、项目零基础）、待深化决策点（作用域/驱动方式/SPA 内渲染方式/移动端策略）。MCP 通道复用已收敛至 [mcp-hub-positioning](./mcp-hub-positioning.md)。