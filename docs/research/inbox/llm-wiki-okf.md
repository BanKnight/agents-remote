# llm-wiki / OKF 知识库调研

> 状态：基础要素已对齐（2026-07-30），**待深化**，位于 `docs/research/inbox/`（未定型区，非沉淀结论）。三个新需求（wiki / pages / browser）统筹排序中，pages 排第一；wiki 与 browser 谁第二谁第三待深化讨论后定。pages 已细化见 `../pages-static-hosting.md`，browser 调研见 `./embedded-browser.md`。

## 需求基础要素

- **定位**：per-project resource workspace，与 Files / Git / Terminal / Agent / pages / browser 并列，有开关控制。
- **producer（内容产生）**：用户正在交互的 Agent（Claude/Codex）通过我们提供的工具按 OKF 格式维护 wiki 内容。我们不写"自动编译 routine"，我们提供工具让 AI 调用。
- **consumer（展示）**：我们读 OKF bundle + 渲染展示（博客式页面）。
- **当前阶段**：只定技术方案落文档；后续和 Files/Git/Terminal/Agent/pages/browser 合并排版。

## 什么是 llm-wiki

Andrej Karpathy 提出的 **pattern / 方法论**（2026-04），不是一个正式标准。核心是与传统 RAG 的根本区别：

| | RAG | LLM Wiki |
|---|---|---|
| 知识何时产生 | 查询时实时检索片段 | 新源到达时**一次性编译**成持久 wiki 页面 |
| 查询时做什么 | 重新从原始片段推导 | 读**预合成**的 wiki |
| 知识走向 | 不累积 | **复利累积**（compounds） |

两个设计目标：
- **给 AI**：作为 LLM 的 context layer（应用用户的心智模型）。
- **给人**：wiki 本质就是**一个 markdown 文件目录**，用任何 markdown viewer / Obsidian / 编译产物都能读。

关键性质：wiki 是 **agent-agnostic** 的——"它就是一个 markdown 文件目录"，不绑定任何运行时。

## OKF（Open Knowledge Format）

2026-06-16 由两位 Google Cloud tech leads 发布，把 Karpathy 的 LLM Wiki pattern 形式化为可移植格式。多源确认（techstrong.ai、Reddit r/LLMDevs、Google Cloud Blog、Cole Medin 视频）。

**时效与风险标注**：
- 很新：距今约 6 周，生态早期。
- 能否成事实标准未定：连推荐它的视频都原话说 "even if OKF doesn't end up becoming the standard"——方向对，但赌注还没赢。
- 格式本身足够简单，即便 OKF 没赢，按它做也不会被坑（就是 markdown + YAML）。

**OKF 的性质（决定选型）**：
- 它只是一个**格式规范，不是工具**。标准不指定任何特殊工具，只规定格式和组织方式。
- 知识 = 一个带 YAML front matter 的 markdown 文件目录，可放任何文件系统 / Git / tarball。
- 显式做 **producer / consumer 分离**：

| 角色 | 职责 | 在我们这里的归属 |
|---|---|---|
| Producer | 创建 wiki-bundle（AI 把资料编译成 wiki markdown） | 用户交互的 Agent（经我们提供的工具） |
| Consumer | 把 bundle 转成网站/PDF 等给人看 | 我们（渲染展示） |

## 选型结论：不并入外部开源项目

社区主要开源实现：
- `lucasastorian/llmwiki` — Karpathy LLM Wiki 的开源实现，夜间 Claude Routine 自动维护。
- `nashsu/llm_wiki` — 跨平台桌面应用，增量编译成交互链接知识库。
- `praneybehl/llm-wiki-plugin` — 做成 Claude Code 插件。
- `llm-wiki-compiler` — Node.js CLI，批量编译源目录成 wiki。

**都不并入**，理由：
1. 它们大多是 **producer 侧或独立应用**（AI 编译生成 wiki），或自己是完整应用。我们的职责是 **consumer 展示**，职责不匹配。
2. consumer 侧在 React SPA 里自建轻量层就够：读目录 + 解析 YAML front matter + 渲染 markdown + `[[wiki-link]]` 跳转。渲染栈项目已有（react-syntax-highlighter 等），加 react-markdown + front-matter 解析即可。
3. 我们是嵌入已有 SPA，不是独立站点。consumer 工具（转成独立网站）即便成熟，也不适合直接塞进 React 路由。

## producer 工具：skill vs MCP

| 维度 | Skill 路径（SKILL.md） | MCP 路径（MCP server） |
|---|---|---|
| 项目现有基础 | ✅ 有 skill-market（`api/src/skill-market.ts`），装/卸/发现/源管理全有 | ❌ 从零建 MCP server |
| AI 怎么调用 | Agent 读 SKILL.md，按指引调我们提供的 API/CLI 写 wiki 目录 | Agent 通过 MCP client 调我们暴露的 `wiki_read/write/list` 工具 |
| 工具契约形态 | 自然语言 SKILL.md + 脚本（松散） | 结构化 tool schema（严格） |
| 跨 agent 兼容 | 现成支持 claude-code + codex | 需为每个 agent 配 MCP client |
| 用户启用成本 | 在现有 skill marketplace 里装一下 | 配 MCP server 连接（更重） |
| 适合的职责 | 写/编辑 wiki 内容（AI 自主决定写什么） | 结构化读写原语（list/read/write 单个页面） |

**用户倾向**：MCP——因为可以随我们项目一起发布更新，而 skill 作为文件相对没那么容易更新。当前不取舍，留到 wiki 与 browser 统筹深化时一起看 MCP 这条线是否能同时服务多个需求（一个 MCP server 暴露的工具集可能同时喂 wiki producer 和 browser agent 驱动）。

**两层叠加的目标态（参考，非起步）**：
1. 底层 MCP server：暴露结构化 wiki 工具（`wiki_list_pages`、`wiki_read_page`、`wiki_write_page`、`wiki_search`、`wiki_link_graph`）。consumer 侧 browser 也可复用同一套读 API。
2. 上层 wiki skill：一份 SKILL.md，教 Agent 何时、为何维护 wiki（新源到达 → 编译成页面、发现矛盾 → 更新、跨页面链接 → 补 `[[link]]`），内部调底层 MCP 工具。

> MCP 只给 AI 手段，不给 AI 动机；skill 给动机但不保格式正确。底层 MCP 保格式，上层 skill 保行为发生。

## 待深化问题（进步骤 3 再定）

- wiki 目录在 project 内的具体位置（`wiki/` / `bundles/`）与 OKF bundle 结构。
- 是否现在深挖 OKF spec 字段（front matter 约定、cross-link 语法）——倾向暂不深挖，spec 太新可能变，实现期再定。
- producer 工具走 MCP 的具体工具集设计，以及与 browser 的 MCP 通道复用关系。
- consumer 渲染层的具体技术栈（react-markdown + front-matter 解析 + `[[wiki-link]]` 跳转 + 链接图）。
- 开关粒度：per-project 启用/禁用（项目级配置）还是全局功能开关。
- wiki 与其他 resource workspace 的合并排版（与 Files/Git/Terminal/Agent/pages/browser 一起考虑）。

## 来源

- Karpathy LLM Wiki gist（原始 pattern）
- OKF 发布（2026-06-16）：Google Cloud Blog "How the Open Knowledge Format can improve data sharing"
- techstrong.ai：https://techstrong.ai/articles/google-launches-a-universal-format-for-karpathys-llm-wiki
- Reddit r/LLMDevs 讨论：https://www.reddit.com/r/LLMDevs/comments/1u7jmvt/
- Cole Medin 视频（2026-07-02）："Finally, an Open Standard for the Karpathy LLM Wiki is HERE"
- `lucasastorian/llmwiki`：https://github.com/lucasastorian/llmwiki
- `nashsu/llm_wiki`：https://github.com/nashsu/llm_wiki
- `praneybehl/llm-wiki-plugin`：https://github.com/praneybehl/llm-wiki-plugin
- `llm-wiki-compiler`（Hermes bundled）：https://hermes-agent.nousresearch.com/docs/user-guide/skills/bundled/research/research-llm-wiki
- 2026 实践指南：https://www.kunalganglani.com/blog/llm-wiki-karpathy-local-knowledge-base