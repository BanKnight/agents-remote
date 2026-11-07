# 开源 Agent Memory 方案调研（ar-hub memory 能力域选型）

> 调研日期 2026-11-07。目标：给 agent 加「项目 memory」能力——memory 的本质是「在正确时机被召回」；期望形态 = MCP hub 注入（initialize instructions 常驻索引 + 工具按需读）；**优先调研已有开源项目能否集成，而非自研**。
>
> 证据强度标记：**强** = 本地源码 / 官方 repo 源码 / 实测 API（GitHub API / npm registry / PyPI）；**中** = 官方文档 / 官方 wiki（deepwiki）；**弱** = 社区 / blog / reddit / 第三方分析。

## 0. 结论速览

- **没有可直接「集成」的开源 memory server 能同时满足我们的硬约束**（单机 Bun + 文件型 hub + per-project 隔离 + web 可见）。轻的（官方 reference server）是 stdio 形态、stdio 挂载会绕开 hub 单点；重的（mem0/cognee/Zep/Letta）都要外部服务或多库。
- **行业已收敛在同一个形状上**：常驻索引（MEMORY.md / instructions）+ 按需检索（工具）+ 命令式增量写。Anthropic 官方 memory tool（API `memory_20250818`）、Claude Code 自带 auto memory、Letta core memory（`MEMORY.md` 索引）、社区文件式 MCP server 全是这个形状；LLM 自动抽取消解（mem0/cognee/Zep 系）只在多用户产品化场景有收益。
- **第一推荐：把 Anthropic memory tool 的范式 + MCP 官方 memory server 的工程骨架移植成 ar-hub 的 `memory` 能力域**（约一个 wiki 能力域量级的自研，但不是从零发明——数据模型抄官方文件约定，工程模式抄 reference server 的原子写/串行锁/annotations，召回复用 wiki 的 Service 单源 + 全文搜索模式）。零新增依赖。
- 关键落地前提与风险：**MCP server `instructions` 注入在 Claude CLI 有历史黑洞**（anthropics/claude-code#23808，closed 但社区报仍复现）——「instructions 常驻索引」不能是唯一召回通道，必须在真机实测后才可依赖（§5.3）。

## 1. 调研范围与方法

### 1.1 本项目硬约束（选型标尺）

- **单机部署**：18G 内存服务器，无 K8s/Docker 编排诉求；api = Bun 单进程。
- **ar-hub 形态**（一手源码，`api/src/mcp-hub-server.ts`）：无状态 Streamable HTTP（`sessionIdGenerator: undefined`）+ 绑 127.0.0.1 + URL `/mcp/{project}`；每请求 `buildRequestServer()` 新建 `McpServer`，按 per-project `.agents-remote/mcp.json` 的 `capabilities`（`McpCapability = "wiki" | "ui" | "skills" | "gen-ui" | "admin"`，`packages/shared/src/index.ts:954`）决定注册面；wiki 能力域已确立「Service 单源（`ProjectWikiService`）+ MCP 工具 producer / HTTP consumer 同源」模式，存储 `wiki/{slug}.md` + gray-matter frontmatter + 全文搜索。
- **供应链规则**（`.claude/rules/supply-chain.md`）：依赖发布 ≥7 天，pre-alpha（0.0.x / 官方明示不稳定）换库优先。
- **agent 侧**：Claude Code CLI 经 spawn 时 `--mcp-config` inline JSON 注入连 hub（`api/src/claude-runtime.ts` `buildMcpArgs()` + `mcp-injector.ts` per-provider injector）；用户终端自跑 claude 也可挂载；Codex 走 `-c mcp_servers` 深合并注入（见 `mcp-cli-ecosystem-notes.md`）。
- 用户核心诉求：memory = 「在正确时机被召回」；instructions 常驻索引 + 工具按需读双通道。

### 1.2 方法

- deepwiki（read_wiki_structure / ask_wiki_question）覆盖 mem0、Letta（letta 与 letta-code 两仓）、Zep、cognee、LangMem、Basic Memory、MCP servers 官方仓。
- 一手源码：MCP 官方 memory server `src/memory/index.ts`（52KB，GitHub contents API 取回 `~/repos/mcp-memory-servers-src/index.ts` 逐段读）。
- 本仓一手：ar-hub / wiki / mcp-config / claude-runtime 源码（codegraph）。
- 活跃度核实：GitHub REST API（stars/pushed_at/archived，2026-11-07 实测）+ npm registry + PyPI JSON API 实测。
- 社区扫描：firecrawl_search（2026 年 MCP memory server 对比文、awesome-mcp-servers 清单、reddit 共识帖）+ anthropics/claude-code issues 实查（instructions 注入行为）。

## 2. 各方案详评

### 2.1 MCP 官方 memory reference server（modelcontextprotocol/servers `src/memory`）

**强证据（一手源码 + npm 实测）。** npm 包 `@modelcontextprotocol/server-memory` 2.1.0，registry modified 2026-11-04；所在 repo 91.8k stars、pushed 2026-11-05——参考实现中维护最活跃的一个。

- **数据模型**：知识图谱三元组（`index.ts:137-152`）——`Entity { name, entityType, observations: string[] }`、`Relation { from, to, relationType }`、`KnowledgeGraph { entities, relations }`。
- **存储**：单 JSONL 文件；`MEMORY_FILE_PATH` env 指定路径（支持 `~` 展开、相对路径按包目录解析）；默认路径在 node_modules 内会**启动告警**（#4117：npm 重装/npx 清缓存会删库）；写入 = temp 文件 + rename 原子写；全部 mutation 走 `withLock` 单队列串行（`index.ts:404`）；legacy `memory.json` 自动迁移 JSONL（#5203：迁移失败宁可拒绝启动也不空库顶上）。
- **工具面（9 个）**：`create_entities` / `create_relations` / `add_observations` / `delete_entities` / `delete_observations` / `delete_relations` / `read_graph`（全量）/ `search_nodes`（名称+类型+observation 内容子串搜索）/ `open_nodes`（按名取）。每个工具带 `annotations`（readOnlyHint/destructiveHint/idempotentHint）与 input/outputSchema（zod）。同名 entity 重复创建会被 skip 并在结果里显式返回 `skipped` 列表（避免 agent 误以为已写入——值得抄的细节）。
- **召回机制**：无 instructions 注入（一手 grep 确认全文无 "instructions"）；靠工具自描述 + README 建议用户在 CLAUDE.md 里加一段使用引导（官方 README 给的示例 prompt：使用前先 search_nodes、对话中主动存事实）。附带 `memory://knowledge-graph` 可订阅资源（mutation 发 `notifications/resources/updated`）。
- **运行形态**：stdio MCP server（`serveStdio`），同时兼容 2025-era 与 2026-07-28 clients。
- **与我们形态的适配**：**范式与工程骨架最接近，但运行形态接不上**。stdio 独立进程挂给 CLI = 绕开 hub 单点（web 不可见、per-project 管理失效、与外部 MCP server 管理面重叠）；它没有 HTTP transport 也没有 instructions。**可行路径是移植而非集成**：数据模型、JSONL 原子写、withLock 串行、annotations、skipped 显式返回，都可以直接搬进 hub 的一个 `registerMemoryTools()`。zod hub 已有，**移植零新增依赖**。
- **警惕点（弱证据，社区共识）**：graph 模型对「人物/组织/关系事实」好使，对项目工作记忆（决策/踩坑/进度/handoff）表达绕——entities+relations 描述一条「决策为什么被推翻」很吃力；社区对比文（coworker.ai 2026）也把它定位成「最简单的本地记忆：一条命令一个文件」，而非工作记忆最佳形。

### 2.2 Anthropic 官方 memory tool（API beta）+ Claude Code 自带 memory 现状

**强证据（官方 SDK skill 文档一手）+ 中证据（官方 docs）。**

- **工具类型**：`memory_20250818`（client-side 工具，无 schema——语义内建于模型）；**命令面**：`view` / `create` / `str_replace` / `insert` / `delete` / `rename`；**存储约定**：`/memories` 目录下自由文件（官方给了 security 提示：不存密钥、多用户要 per-user 目录隔离）；Python/TS/Java SDK 提供 handler helper（TS `betaMemoryTool(handlers)`，`MemoryToolHandlers` 六个回调，官方示例 anthropic-sdk-typescript `examples/tools-helpers-memory.ts`）。
- **范式要点**（官方 docs + cookbook 定位）：client 完全掌控存储实现；模型侧是「文件目录 + 命令式编辑」——这正是 Claude 系 agent 训练期最熟的形态（text_editor 工具同族）；官方推荐与 context editing（`clear_tool_uses_20250919`）配合：长任务先把状态写进 `/memories`，再清旧 tool result 腾上下文，回来靠 memory 恢复。
- **Claude Code 自带 memory（对照锚点）**：官方文档（code.claude.com/docs/en/memory）确认 v2.1 起有 auto memory——Claude 自己维护 `MEMORY.md` 索引 + 分类记忆文件，**只有 MEMORY.md 在会话启动时自动加载**，其余按需读；与四层 CLAUDE.md scope 并存。社区分析（弱证据）：MEMORY.md 有 ~200 行静默截断，逼着索引保持精简。第三方 `fainir/recall` 直接把这套 per-project memory markdown 桥接给其他 MCP client——反证了「文件式 memory + 索引文件」是 agent 端事实标准。
- **与我们形态的适配**：**范式第一顺位**——命令式增量编辑是 agent 习惯本体；存储约定（目录 + 自由 markdown）与我们 wiki 同构，web 渲染可复用 gray-matter 管线。但它**不是 MCP server**，是 API 工具类型：要在我们栈里落地，正确姿势是把命令面搬进 hub 的 MCP 工具（`memory_*` 系列自建工具），而不是找现成包。
- **一个行业趋同的佐证（中证据）**：Letta 新仓 letta-code 的 MemFS 设计（见 §2.4）与 Claude Code auto memory 几乎同形（MEMORY.md 索引 + 目录 + 渐进披露）——独立两家收敛在同一形状，说明该范式不是 Anthropic 偶然选择。

### 2.3 mem0（mem0ai/mem0）+ OpenMemory

**中证据（deepwiki 官方仓 wiki）+ 强证据（活跃度实测）。** 68.5k stars、pushed 2026-11-06（当日）；PyPI `mem0ai` 最新 2.2.1（2026-09-25 发布）。

- **数据模型**：LLM 抽取出的「事实条目」（单条文本 + 元数据 + 可选图谱扩展）；历史版本的招牌是 LLM 冲突消解（ADD/UPDATE/DELETE/NOOP 四操作）。**注意**：deepwiki 称当前开源版抽取管线已改「单遍 ADD-only」、消解只在 Platform 侧——与 2.2.1 版本号对不上（疑为 wiki 滞后或指代 v3 未发布线），**此点存疑（弱证据）**，但两版共性一致：写入行为由 LLM 决定，应用侧不精确可控。
- **存储/运行**：OSS = 嵌入式 Python 库（`from mem0 import Memory`），需要 LLM API key + embedding provider（默认 OpenAI text-embedding-3-small，可换 Ollama/FastEmbed 等）+ 向量库（默认本地 Qdrant 磁盘 `/tmp/qdrant`，可选 Chroma/FAISS）；graph memory（Neo4j）在 v3 已从 OSS 移除。MCP server 形态 = 托管 `mcp.mem0.ai`（云端账号）或 self-host server（Docker 栈 + dashboard + per-user key）。
- **召回**：语义向量检索（`search`）+ 平台侧 rerank；集成模式里 mem0 主推「prefetch-caching」——会话开始自动检索 top memories 注入上下文（弱证据，mem0 官方 blog）。
- **依赖重量**：Python 全家桶（LLM client + embedder + vector store + pydantic 等），即使最小配置也带一个向量库进程/文件库；MCP self-host 是 Docker 多容器。
- **与我们形态的适配**：**不推荐集成**。①我们的 hub 是 Bun/TS 单进程，接 mem0 = 常驻一个 Python 服务 + 向量库，运维面翻倍；②写入走 LLM 抽取，每次 `add` 都烧一次 LLM 调用且行为不可精确预期——与「项目工作记忆要求精确可审计」相悖；③托管 MCP 把 memory 数据送云。**可借鉴**：prefetch 注入思想（若未来做自动召回）；`add/search/get/update/delete` 最小工具面（其 Hermes 集成只暴露 3 个工具，弱证据）。

### 2.4 Letta（原 MemGPT；letta-ai/letta → letta-ai/letta-code）

**中证据（deepwiki 两仓 wiki）+ 强证据（活跃度实测）。** 旧仓 25.4k stars（2026-10-18 后无 push，README 明示 V1 retired、源码归档迁移）；新仓 letta-code 3.8k stars、pushed 2026-11-07（当日）——**主力开发已整体迁到新仓**。

- **数据模型（新仓 MemFS）**：分层——core memory（常驻 system prompt 的 memory block / 根 markdown，agent 自编辑）+ recall memory（全量会话历史，agent 不可直接改，经 recall subagent 检索）+ **外部 memory 文件**（目录 + `MEMORY.md` 索引，渐进披露：system prompt 只放索引与描述，内容按需读）+ sleep-time agents（后台整理/合并/去噪）。
- **存储**：Git-backed 文件系统（MemFS）；运行形态 = 独立 App Server（`letta server`），旧仓时代要求 PostgreSQL。
- **与我们形态的适配**：**不推荐集成**。Letta 是「agent 平台」——引入它等于在 Claude Code runtime 之外再养一整套 agent harness + server + DB，与本项目「网页控制平面管 CLI 会话」的定位整体冲突。**可借鉴**：①「常驻索引 + 目录 + 渐进披露」正是我们要的召回形状（§2.2 趋同佐证）；②「recall 不可直接改、core 精细可编辑」的分层权限思想；③ sleep-time 整理是未来扩展项（把 cron 化的记忆合并挂到 hub 的 admin 面）。

### 2.5 Zep（getzep/zep）+ Graphiti

**中证据（deepwiki 官方仓 wiki）+ 强证据（活跃度实测）。** zep 仓 5.0k stars（定位已变为「示例 + 集成 + 更多」）；**开源 Community Edition 已废弃**，代码移进 `legacy/`；当前主推 Zep Cloud。Graphiti（时序知识图谱引擎）32.6k stars 活跃，但自部署要求 PostgreSQL(pgvector) + Neo4j 双库。

- **数据模型**：时序知识图谱——fact triple 带 `valid_at` / `invalid_at`（旧事实标失效不删除），分层 episodic/semantic/community。
- **与我们形态的适配**：**排除**。CE 弃维护（依赖死路）+ 双库运维面 + 云导向。时序失效语义（invalid_at 而非删除）作为数据模型思想可借鉴，写进我们的 memory 条目元数据设计（如 `superseded_by`）即可，不必引引擎。

### 2.6 LangMem（langchain-ai/langmem）

**强证据（PyPI 实测）+ 中证据（deepwiki）。** PyPI 最新 **0.0.30（2025-10-27）——发布已停滞一年+，0.0.x 版本号**，直接命中供应链规则 pre-alpha 判据。架构上 hot path（agent 工具管理）/ background（ReflectionExecutor 防抖后台抽取）分离是合理范式，状态面绑定 LangGraph `BaseStore`（生产建议 Postgres store）。**排除集成**；hot path/background 双轨划分作为写入语义分类学可借鉴（对应我们的「agent 主动写 vs 未来后台整理」）。

### 2.7 cognee（topoteretes/cognee）

**中证据（deepwiki）+ 强证据（活跃度实测）。** 33.1k stars、PyPI 1.6.7（2026-11-06，当日）——非常活跃。但默认三存储（SQLite + LanceDB + Ladybug 图库，全嵌入式）；无 LLM key 时用 GLiNER（**首次下载 ~800MB**）+ fastembed 抽取；ECL 管线（Extract→Cognify→Load）；MCP server（cognee-mcp，`remember/recall/forget` 三工具）Docker 优先。**排除集成**：单机 18G 服务器塞 800MB 模型 + 三库是明确的过重；社区对比（coworker.ai，弱证据）也承认「比文件式 server 门槛高」。适合「把大量文档变图谱」的 RAG 场景，不是项目工作记忆场景。

### 2.8 其他值得一看：Basic Memory + 社区生态扫描

- **Basic Memory**（basicmachines-co/basic-memory，中证据 deepwiki）：**与我们 wiki 形态最像的成熟独立方案**——markdown 文件为 source of truth + SQLite 索引；数据模型（entity/observation/relation）直接从 markdown 列表语法解析（`- [category] content` + `- relation [[WikiLink]]`，即 Obsidian 同款）；MCP 工具 `bm_write/bm_read/bm_edit/bm_search/bm_context` 等；支持 stdio / streamable-http（默认绑 127.0.0.1）。**不直接集成的理由**：Python 独立进程，数据落它自己的 SQLite + 目录（不在 `.agents-remote/`），web 不可见、per-project 能力开关体系外；但**它是「若不做 hub 能力域」时最稳的外挂备选**，其「markdown 即真相 + 解析派生索引」的实现哲学与我们 wiki 单源模式同构。
- **社区生态全景（弱证据，2026 年扫描）**：coworker.ai《9 Best MCP Memory Servers (2026)》把第一梯队列为 reference KG server / Basic Memory / mcp-memory-service / Mem0 / Supermemory / Graphiti / Zep Context / Cognee；awesome-mcp-servers 的 memory 分类下有 60+ 轮子，**占主流的实现配方是「本地文件（markdown vault 或 SQLite FTS5）+ 命令式增量写 + 按需检索，无向量库无 LLM key」**（如 mnemon、GhostPawJS/codex、todox、Meshnote 等）；Meshnote（闭源 hosted）甚至就是「agent 维护的 wiki = 长期记忆」（markdown + YAML frontmatter + BM25 + 反链 + 版本历史，16 工具）——直接验证「wiki 即 memory」路线在社区成立。reddit 共识帖（r/mcp）把「文件式记忆」定位为「个性化/轻量场景最佳，透明可审计但不 scale」——我们单项目场景恰好不在其「不 scale」区间。
- **一个反方向的数据点（弱证据）**：InfraNodus 对比文的判据——「每轮都做检索的多用户产品才需要 Mem0/Zep/Cognee」，单 agent 单项目的「读得见的文件记忆」是另一极。与我们场景吻合。

## 3. 横向对照表

| 方案 | 数据模型 | 存储 | 写入语义 | 召回机制 | 运行形态 | 依赖重量 | 活跃度（2026-11-07 实测） | 集成判定 |
|---|---|---|---|---|---|---|---|---|
| MCP 官方 memory server | KG 三元组（Entity/Relation/Observation） | 单 JSONL 文件（原子写+锁） | 命令式增量（9 工具） | search_nodes/read_graph/open_nodes 按需；无 instructions | stdio MCP server | 零外部依赖（zod） | 91.8k★ repo，npm 当周更新（强） | **移植骨架，不直接集成** |
| Anthropic memory tool | `/memories` 目录自由文件 | client 侧自实现 | 命令式（view/create/str_replace/insert/delete/rename） | system prompt 引导 + 按需 view；配合 context editing | API 工具约定（非包） | 零（我们自实现 handlers） | 官方 GA beta，SDK helper 稳定（强） | **范式第一顺位（搬命令面进 hub）** |
| Claude Code auto memory | MEMORY.md 索引 + 分类文件 | CLI 本地 per-project 目录 | agent 自主写 | 索引开机加载 + 按需读 | CLI 内建 | 零 | CLI v2.1+ 内建（中） | 对照锚点/分工对象 |
| mem0 OSS | LLM 抽取事实条目 | 向量库（Qdrant/Chroma/FAISS 本地） | LLM 抽取+消解（现报 ADD-only，存疑） | 向量检索；平台侧 prefetch 注入 | 嵌入库 / Docker server / 托管 MCP | Python 全家桶+向量库 | 68.5k★，当日 push（强） | **不集成，借鉴 prefetch** |
| Letta（letta-code） | core/recall/MemFS 分层 + MEMORY.md | Git-backed 文件系统 | agent 自编辑 core；recall 只读 | 索引常驻 + 渐进披露 + subagent 检索 | 独立 App Server | server + DB | 新仓 3.8k★ 当日 push；旧仓 retired（强） | **不集成，借鉴分层** |
| Zep CE / Graphiti | 时序知识图谱（valid/invalid_at） | PostgreSQL(pgvector)+Neo4j | LLM 抽取 | 图检索+时序过滤 | 多服务 | 最重 | CE 已弃（强）；Graphiti 32.6k★（强） | **排除** |
| LangMem | 事实条目（Pydantic schema） | LangGraph BaseStore（建议 Postgres） | hot path 工具 / background 抽取 | search 工具 + 注入 | 嵌入库 | LangGraph 栈 | 0.0.30，停更一年+（强） | **排除（pre-alpha）** |
| cognee | ECL 图谱+向量 | SQLite+LanceDB+Ladybug | LLM/GLiNER 抽取管线 | 图+向量混合 | 嵌入库 / Docker MCP | ~800MB 模型 | 33.1k★，当日发版（强） | **排除（过重）** |
| Basic Memory | entity/observation/relation（markdown 解析派生） | markdown 真相 + SQLite 索引 | 命令式（bm_* 工具） | search/context 图导航 | Python stdio/HTTP server | Python+SQLite | 活跃（中） | **外挂备选** |

## 4. 行业收敛点（选型推理的主轴）

1. **召回形状收敛**：「常驻索引（instructions 或 MEMORY.md，开机自动进上下文）+ 目录式条目 + 按需读工具」——Anthropic 官方 memory tool、Claude Code auto memory、Letta MemFS、社区文件式 server 四方独立收敛同形（§2.2/§2.4）。mem0 官方集成模式（prefetch 注入）本质也是同一思想的服务化变体。
2. **写入语义两派**：命令式增量编辑（Claude 系/Letta/Basic Memory/大量社区轮子）vs LLM 自动抽取消解（mem0/cognee/Zep/LangMem background）。前者精确、可审计、零额外推理成本；后者适合「对话流持续喂进」的多用户产品。**项目工作记忆（决策/踩坑/handoff）属前者**——写入主体就是 agent 自己，且每条都值得精确落盘。
3. **存储形态**：单机场景的事实标准是「markdown 目录（人可读可 git）或 SQLite FTS5」，向量库只在语义检索需求真实出现时才值得。我们的 memory 条目量级（单项目几十~几百条）全文搜索绰绰有余（wiki searchPages 同款）。
4. **对「记忆索引放 instructions」的一个冷静校准（强证据）**：anthropics/claude-code#23808（2026-02 报，2026-06 关）——「initialize response 的 instructions 未传给模型」，关后 6-8 月仍有社区跟帖报 Claude Desktop 等面复现。官方 MCP 文档（code.claude.com/docs/en/mcp）明确说 instructions 会被使用、tool search 场景尤其有用——但**工程上必须按「可能静默丢失」设计**：instructions 索引是增益通道，按需检索工具是保底通道；上线前真机验证 Claude CLI 当前版本实际行为。

## 5. 集成建议排序

### 5.1 第一推荐：ar-hub 新增 `memory` 能力域（范式移植，零新增依赖）

**定位**：给每个项目一个跨 agent（Claude + Codex + 终端自跑 claude）共享、web 可见（后续可挂 workbench）的项目记忆，形态 = **「Anthropic memory tool 命令面 + Claude Code auto memory 召回约定 + MCP 官方 server 工程骨架」**。

**理由**（对照 §4 收敛点）：
- 范式 = agent 习惯本体（命令式文件编辑是 Claude 系训练内建；Codex 侧也是普通 MCP 工具吃得下）；
- 工程骨架有官方参考实现可抄（原子写/串行锁/annotations/skipped 显式返回），不是从零发明；
- 与 hub 现有 wiki 能力域同构（Service 单源 + 文件存储 + 全文搜索 + 前端渲染管线全部复用），实现量级 ≈ 一个 wiki 能力域；
- 满足全部硬约束：单机、纯文件、零新依赖、per-project 隔离天然成立（存储在项目目录内）。

**集成路径草图**：

1. **能力开关**：`McpCapability` union 加 `"memory"`（`packages/shared/src/index.ts:954`）；`.agents-remote/mcp.json` 配 `capabilities.memory: true`。hub handler 读开关后把 `memoryEnabled` 传进 `buildRequestServer()`（`api/src/mcp-hub-server.ts:869`）。
2. **存储落点**：`{project}/.agents-remote/memory/`——
   - `MEMORY.md`：常驻索引（手动/agent 维护，条目 = 一行一条 + 相对链接），对齐 Claude Code auto memory 的「索引文件是唯一自动加载面」约定；
   - `entries/{slug}.md`：逐条记忆文件（gray-matter frontmatter：`title/tags/created/updated/status`），schema 与 wiki 页同族——web 渲染、frontmatter 管线、路径安全 resolver 全部复用 `project-wiki.ts` 的既有纯函数（`sanitizeWikiSlug`/`buildWikiPage` 同款）。
   - 路径安全：所有路径过 `resolveProjectRelativePath`（realpath 防穿越），与 wiki 同纪律。
3. **工具面（MCP，`registerMemoryTools()`）**：对齐官方 memory tool 命令面收敛为 6 个——`memory_view`（列目录/读索引/读条目）、`memory_create`、`memory_str_replace`、`memory_delete`、`memory_rename`、`memory_search`（复用 wiki searchPages 全文搜索模式；官方命令面的 `insert` 可由 str_replace 覆盖，首版可裁）。每个工具带 annotations（destructive/idempotent hint）与显式 skipped/notFound 返回（抄 reference server 细节）。写路径 = temp + rename 原子写。
4. **instructions 注入（增益通道）**：`McpServer` 构造第二参加 `instructions`——SDK 1.32.1 已支持并在 initialize result 发出（一手核实：`node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.d.ts:13-15`，`index.js:268`；**ar-hub 当前没传，是现成缺口**）。内容 = 固定使用引导（何时读/何时写/索引约定）+ 动态拼接 MEMORY.md 当前内容（**size gate：超限降级为「条目计数 + 提示用 memory_view 读索引」**，对齐 Claude Code 200 行截断思想）。**上线前置：真机实测 Claude CLI 是否把 instructions 进上下文（§4-4 风险）**；Codex 侧消费行为另测（未决）。
5. **召回通道合计三条**：① instructions 常驻索引（增益）；② `memory_search` / `memory_view` 按需读（保底）；③（后续可选）wiki 式写扩散——memory Service 作为单源，HTTP consumer 挂 workbench 渲染面板（web 可见性诉求的现成管线）。
6. **验证**：api 包单测（工具语义/原子写/路径安全）+ 探针（真机 Claude 会话里存→新会话召回全链路）。

### 5.2 备选：Basic Memory 外挂（零开发过渡方案）

若想先跑通手感再决定投入：`uv`/`pip` 装 Basic Memory，`claude mcp add` 挂 stdio（或其 streamable-http）。优点 = 零开发、markdown 真相 + SQLite 索引成熟；缺点 = Python 常驻进程 + 数据不在 `.agents-remote/`（不在 hub 能力开关与 web 视野内）+ per-project 配置要另起一套。**适合作为对拍参照（它写的 markdown 规范 `- [category] content` + `[[wikilink]]` 值得抄进我们的 frontmatter/body 约定），不建议作为终态。**

### 5.3 明确不推荐清单（附一句话理由）

- **mem0**：LLM 抽取写入不可控 + Python/向量库运维面 + 托管 MCP 数据出域；
- **Zep CE**：开源版已废弃（死路）；Graphiti 双库过重；
- **cognee**：800MB 模型 + 三库，场景错配（文档→图谱 RAG，非项目工作记忆）；
- **LangMem**：0.0.x + 停更一年，供应链规则直接排除；
- **Letta**：整个 agent 平台，与「网页控制平面管 CLI 会话」定位冲突；
- **官方 reference server 直接 stdio 挂载**：绕开 hub 单点（web 不可见、能力开关失效），且无 instructions、无 per-project 存储约定——只值得抄代码不值得挂进程。

## 6. 开放问题（需用户拍板）

1. **存储格式终选**：markdown 目录 + MEMORY.md 索引（本报告推荐：agent 习惯 + web 渲染 + wiki 复用三面全赢）vs JSONL 知识图谱（官方 reference server schema 原样移植：结构化但 web 渲染要另做、人读性差）。推荐前者；若未来出现真实「关系推理」需求，可加一张 JSONL 边表而不动主存储。
2. **instructions 注入的内容与预算**：MEMORY.md 全文拼接（索引常驻但可能静默丢失）vs 仅使用引导（省 token，索引全靠工具读）。以及 size gate 阈值（建议对齐 Claude Code 200 行思想取一个常量，禁魔数）。
3. **与 Claude Code 自带 auto memory 的分工**：并存分域（推荐——CLI auto memory = 单机 CLI 个人记忆，hub memory = 跨 agent 项目记忆；在 memory 工具 description 与 instructions 里写明分工，避免 agent 双写混淆）还是桥接（fainir/recall 式直接读写 auto memory 文件，耦合 CLI 内部目录布局，CLI 升级易碎）。
4. **工具面粒度**：6 命令完整对齐官方 memory tool（agent 熟悉度最高）vs 精简 4-5 个（mem0 Hermes 式极简）。倾向完整命令面 + `insert` 视实现成本裁剪。
5. **Codex 侧召回**：Codex 是否消费 MCP server instructions（未一手验证）；若不消费，Codex 会话的召回只剩工具描述自驱动——要不要对 Codex 附加注入（如 `-c` 里加一条 system 提示或首条消息注入，参考 wiki 注入 D13 管线）。
6. **web 可见性排期**：memory Service 单源 + HTTP consumer 挂 workbench 面板（wiki 同款管线）是首版就做，还是 memory 能力域先落 MCP 面、web 面排队。倾向先 MCP 后 web（召回是本质诉求，可见是增益）。
