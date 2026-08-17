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
- `lucasastorian/llmwiki` — Karpathy LLM Wiki 的开源实现（**A 机制**：agent 调 MCP 工具逐页写；「夜间 routine」只是 A 的定时触发器，非 B 编译——见「A/B 路线调研结论」修正说明）。
- `nashsu/llm_wiki` — 跨平台桌面应用，增量编译成交互链接知识库。
- `praneybehl/llm-wiki-plugin` — 做成 Claude Code 插件。
- `llm-wiki-compiler` — **非独立 repo**（GitHub/npm 查无），实为 Hermes bundled skill `skills/research/llm-wiki`，也是 A（见「A/B 路线调研结论」修正说明）。

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

## A/B 路线调研结论（2026-07-31，三轮 subagent 源码级）

> 状态：原「待深化」的 A/B 选型经三轮调研已得出结论。**结论不是「A 还是 B」，而是问题被重构了——见下。** 本节优先级最高，是 wiki 能力域进入 plan 前的定位锚点。

### 原始困惑：wiki 走 A 还是 B？

- **A（agent 实时维护）**：agent 对话中自主 read/write 单个知识条目，wiki 是 agent「工作记忆」，细粒度工具。
- **B（一次性编译）**：routine/batch 把源材料编译成持久 wiki，agent 不在对话里逐页写。

### 三路证据（均源码级）

**路 1 — LLM Wiki 开源实现深挖**（lucasastorian/praneybehl/nashsu/Hermes）：
- **生态 A 为主（3/4）**。Karpathy 原版 `lucasastorian/llmwiki` = **A**（agent 调 MCP 工具 `guide/search/read/create/edit/append/delete/lint` 逐页写）；praneybehl = A（agent 原生 edit）；Hermes skill = A。仅 nashsu 桌面 app = B。
- **【修正本文档两处误读】**：① `lucasastorian`「夜间 routine」≠ B——routine 只是 A 的*定时触发器*，机制仍是 agent 逐页写（`mcp/tools/write.py` create/edit/append 装饰器实证）。②「llm-wiki-compiler」根本不是独立 repo（GitHub/npm 查无），是 Hermes bundled skill `skills/research/llm-wiki`，且也是 A。
- lucasastorian 工具集是我们 `wiki_*` 的一对一现成模板。

**路 2 — agent IDE/CLI 落地**（Claude Code/Cursor/Codex/Windsurf/Continue/Copilot/Gemini/Aider）：
- 成熟生态是**两层架构**：committed 项目规则（CLAUDE.md/AGENTS.md/.cursor/rules，**全 B，agent 永不自主写**）+ 个人记忆层（Claude Code auto-memory/Codex `~/.codex/memories`/Windsurf Cascade Memories，**全 A，agent 自主写默认开**）。
- **关键**：我们 spawn 的 claude/codex **已各自内置 A 层**（auto-memory / memories）——重造「agent 工作记忆」无差异化。

**路 3 — agent 记忆框架**（mem0/Letta/Zep/Graphiti/Devin）：
- mem0/Zep/Graphiti 主流引擎是 **B**（后台 LLM 抽取器，`mem.add(messages)`→系统抽事实，agent 不逐条写）。
- 唯一 A 旗手 **Letta/MemGPT**（agent 显式 `core_memory_append` 自写），但记忆是 agent 私人笔记本，不面向人类。
- Claude Code Auto Memory = A 但扁平 jotter（200 行封顶），非结构化多页 wiki。
- 真正像 wiki 的 Devin DeepWiki = B 后台编译。

### 综合表：谁缝合了「A 机制 + 可浏览 wiki 产物」

| 产品 | A 机制 | 可浏览 wiki | 缝合 | 对我们的缺口 |
|---|---|---|---|---|
| Letta/MemGPT | ✅强 | ❌私人记忆 | 否 | 产物不给人看 |
| Devin DeepWiki | ❌B | ✅ | 否(B) | agent 不写 |
| Claude Code Auto Memory | ✅ | 半(扁平 200 行) | 半 | 非结构化 wiki |
| mem0/Zep | ❌B | 半(事实条目) | 否(B) | agent 不手写 |
| CLAUDE.md/AGENTS.md | ❌B | ❌单文件 | 否(B) | 是规则非 wiki |
| **Karpathy/lucasastorian** | ✅ | ✅ | ✅**唯一** | 桌面 routine,非服务端 |

### 结论：空白生态位

**「agent 用工具逐页写（A 机制）+ 给人可浏览的结构化 wiki（产物）+ 服务端多租户 per-project」是空白。** 只有 Karpathy/lucasastorian 缝合了 A+wiki，但它是桌面 routine 形态。Letta 有 A 没 wiki、DeepWiki 有 wiki 但是 B、Claude Code Auto Memory 是 A 但扁平——**无人缝合且落在我们的形态**。

### 推荐定位

> **wiki = agent 用 `wiki_*` MCP 工具逐页维护（A 机制）的、结构化可浏览的 per-project 知识库（产物形态），占「agent 写的可浏览 wiki」空白。**

不重复 agent 内置能力（auto-memory 是给 agent 自己的扁平笔记，非给人浏览的结构化 wiki）；差异化在**产物形态（可浏览 wiki）**，不在机制（A 本身不稀缺）。和我们 hub 天然适配（lucasastorian 工具集是现成模板）。

### 必须正视的张力 + 现成解法

成熟 agent IDE 刻意把 A（agent 自主写）隔离在个人记忆层，绝不碰团队 committed 知识（怕 silent corruption / 自读自输出漂移 / 维护棘轮）。我们让 agent 写「给人浏览的项目 wiki」正踩此张力。**praneybehl 已验证解法**：
- **三层**：raw（不可变源）/ wiki（agent 拥有的 markdown）/ SCHEMA.md（约定）。
- **provenance**：每页 `sources:` 指回 raw（可追溯）。
- **lint 工具**：孤儿页 / 断链 / 超大页 / frontmatter 校验（防 silent corruption）。
- **atomic 页**：400 行软限制 + YAML frontmatter + `[[wikilink]]`。

### 三项定位决策（已拍板，2026-07-31）

1. **定位**：认可——wiki = agent 用 `wiki_*` MCP 工具逐页写（A 机制）的、结构化可浏览 per-project 知识库（产物），占「agent 写的可浏览 wiki」空白。
2. **触发方式**：**agent 自主触发（起步）**。agent 对话中自主判断何时调 `wiki_*` 维护，最贴「wiki 作 context layer」+ 最小闭环（无需 cron / slash 路由基建）。routine 定时 / slash 指令作为后续增强，不在首期。
3. **审批桥**：**agent 直接写 + lint 兜底**。agent 写后即落盘，不设用户审批桥（信任官方能力，保持 wiki 轻盈、不打断 agent 流，与 auto-memory 一致）；silent corruption 由 praneybehl lint（孤儿页 / 断链 / 超大页 / frontmatter 校验）兜底。

### 证据来源（本轮增量）

- `~/repos/llmwiki`（lucasastorian Karpathy 原版，源码级）、`~/repos/llm-wiki-plugin`（praneybehl，源码级）。
- `~/repos/letta`、`~/repos/graphiti`（Letta/Zep 源码级）。
- Claude Code v2.1.88 sourcemap（`~/repos/claude-code-sourcemap`）+ openai/codex + codex-rs/memories README。
- 三轮 subagent 报告存档于本会话 transcript。

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