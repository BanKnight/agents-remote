# wiki 知识库格式标准调研（Obsidian / Foam / OKF / 发布管线）

> 状态：已完成（2026-11-07）。承接 [llm-wiki-okf.md](./llm-wiki-okf.md)——该文档拍板的是**定位层**（agent 用 `wiki_*` MCP 工具逐页写、产物形态=可浏览 per-project 知识库，wiki 能力域已按此落地），并把「深挖 OKF spec 字段、格式对齐、发布管线」留给实现期。本文档回答的正是这部分：**项目 wiki 目录的文件格式与组织范式该对齐什么标准、能否直接用 Obsidian 打开、如何发布成静态站**。

## 1. 调研范围与方法

### 1.1 问题定义

wiki 能力域现状（`api/src/project-wiki.ts`，一手代码）：flat 目录 `wiki/{slug}.md`（slug 限 `[a-zA-Z0-9._-]`，拒 `/`）+ gray-matter frontmatter（`title`/`tags`/`created`/`updated`）+ 行级全文搜索 + MCP 三工具（`wiki_list_pages`/`wiki_write_page`/`wiki_read_page`）+ Web 端结构化渲染（列表按首 tag 分组、单页 markdown 渲染）。producer = agent（MCP 写），consumer = 人 + agent（HTTP 只读）。

用户判断：作为知识库「靠自己实现终归不现实」——本文评估**格式标准**，不评估「集成 wiki 服务器应用」。

### 1.2 调研对象与方法

| 对象 | 方法 | 证据等级 |
| --- | --- | --- |
| Obsidian vault 格式 | firecrawl 抓官方 help 文档（Internal links / Properties 两页全文） | 官方文档，确凿 |
| Foam | deepwiki（foambubble/foam + foam-template）+ npm 维护状态 | deepwiki 源码级，确凿 |
| Logseq | deepwiki（logseq/logseq） | deepwiki 源码级，确凿 |
| Dendron | web 搜索维护状态 | 官方 discussion + 社区多源，确凿 |
| OKF | 抓取 SPEC.md v0.2 全文（GoogleCloudPlatform/open-knowledge-format） | 规范原文，确凿 |
| Karpathy LLM wiki | 抓取 gist 原文（2026-04-04，5000+ stars） | 原文，确凿 |
| DeepWiki（Cognition） | web 搜索官方 blog/docs | 官方，确凿 |
| 发布管线 | deepwiki（jackyzha0/quartz）+ npm 发布时间实测 + web 搜索 | 混合 |
| wikilink 解析库 | npm registry 实测（version + time） | 实测，确凿 |
| 社区实践 | web 搜索（Karpathy 模式衍生、OKF 讨论） | 弱证据，已标注 |

## 2. 各方案详评

### 2.1 Obsidian vault 格式——编辑器互操作的事实标准

**定位**：Obsidian 不发布「格式规范」，但 vault = 纯文件夹 + `.obsidian` 配置目录 + markdown 文件，任何工具都能当普通文件夹读写。它是个人知识库工具市场占有率最高的一档，**「能不能被 Obsidian 直接打开」是 wiki 目录格式事实上的互操作标尺**。

**wikilink 语法**（[Internal links 官方文档](https://help.obsidian.md/Linking+notes+and+files/Internal+links)）：

| 形式 | 示例 | 说明 |
| --- | --- | --- |
| 基础 | `[[Three laws of motion]]` | 按文件名匹配，扩展名可省（`.md`） |
| 带路径 | `[[Projects/Note]]` | 从 vault root 起的正斜杠路径 |
| 别名 | `[[Note\|Custom name]]` | `\|` 后为显示文本 |
| 标题锚点 | `[[Note#Heading]]`、多级 `[[Note#H1#H2]]` | |
| 块引用 | `[[Note#^blockid]]` | **Obsidian 专属，非标准 markdown**，出了 Obsidian 失效 |
| 嵌入 | `![[Note]]` | |
| markdown 等价形式 | `[text](Note.md)`、`[text](Note#Heading)` | URL 编码空格；设置里可关 wikilink 改用纯 markdown 链接 |

- 非法字符：`# | ^ : %% [[ ]]`（出现在文件名里会破坏链接语义）。
- 指向不存在的链接 → 点击时按该路径创建文件。
- 链接解析按「文件名（不含扩展名）」匹配；「New link format」设置有 shortest / relative / absolute 三种生成模式（本条为常识性补充，官方 help 的 settings 页未在本轮抓取范围，弱证据）。
- **backlinks/graph 全部从正文链接派生**：无数据库、无索引文件，纯文本扫描。

**frontmatter（Properties 官方文档）**：YAML frontmatter；默认属性 `tags`（List）、`aliases`（List）、`cssclasses`（List）；Publish 属性 `publish`/`permalink`/`description`/`image`/`cover`；**已废弃**：`tag`/`alias`/`cssclass` 单数形式（1.4 弃用、1.9 移除支持）——对齐时必须用复数。类型系统：Text/List/Number/Checkbox/Date（`YYYY-MM-DD`）/Date & time/Tags；不支持嵌套属性；支持 JSON 块（读作 YAML）。文本属性里的内链必须加引号（`link: "[[Episode IV]]"`）。日期格式 `2020-08-21` **恰好是我们当前 `created`/`updated` 的格式**——零改动兼容。

**附件**：约定 `attachments/` 目录（可在设置指定固定路径）；Karpathy 模式推荐固定 `raw/assets/`。

**对我们现状的 gap**：目录结构零 gap（flat 或层级都是合法 vault）；frontmatter 字段是 vault 惯例的超集关系；**唯一实质 gap 是正文链接**——我们的页面无链接语义，且 slug 规则 `[a-zA-Z0-9._-]` 拒空格/中文/`/`，而 Obsidian 文件名允许空格与中文（用户在 Obsidian 里建的新页面我们读不到，`listPages` 对非法 slug 静默跳过）。

### 2.2 Foam——wikilink 解析约定最好的开源参考实现

[foambubble/foam](https://github.com/foambubble/foam)（VS Code PKM，deepwiki 源码级调研）：**仍活跃维护**（VS Code Marketplace 2026-11-06 更新），节奏慢但活着。它的价值不在「集成它」，而在它是**wikilink 语义的开源规范实现**（unified/remark 管线 + remark-wiki-link 插件），解析约定可直接抄：

- 语法全集：`[[note]]`、`[[note|alias]]`、`[[note#heading]]`、`[[note#^blockid]]`、`[text](note.md)`、`![[note]]` 嵌入——与 Obsidian 一致（Foam 的定位就是「Obsidian 兼容的 VS Code 版」）。
- **链接解析规则**（比 Obsidian 文档更明确，值得抄）：
  - 以 `/` 或 `./`/`../` 开头 = **path link**（按文件路径解析）；否则 = **identifier link**（全 workspace 按文件名不含扩展名匹配）。
  - 大小写不敏感（`[[page-b]]` 可解析 `PAGE-B.md`）。
  - 歧义（同名多处）→ 字母序取第一个 + 显示警告。
  - 目录链接 `[[projects]]` → 解析到 `index.md`/`README.md`（同名文件优先于目录）。
- frontmatter 特殊属性：`title`（覆盖文件名）、`type`（图谱样式分类）、`tags`、`alias`（注意：Foam 用单数 `alias`，与 Obsidian 现行的复数 `aliases` 分叉——对齐以 Obsidian 复数为准）。
- **backlinks/graph 数据流**（`MarkdownParser` → `Resource` 模型 → `FoamGraph`）：解析每页提取 links/tags 存入 Resource；图 = 节点（note）+ 边（link）纯内存遍历；「Connections」面板即反向链接。**无索引文件、无数据库，全量内存派生**——与我们「首期页面少全量扫描可接受」的现状（`searchPages` 同模式）完全同构。
- foam-template conventions：`.foam/templates/`、`journals/`（daily notes）、`inbox.md`（快速捕获）、`attachments/`。

### 2.3 Logseq——不建议对齐

deepwiki 源码级调研：outliner 风格（bullet 缩进表达层级，非标题层级）、页面属性用 `property:: value` 行内语法（**不写 YAML frontmatter**）、`pages/` + `journals/` 双目录、markdown/org-mode 双轨文件。与标准 markdown 的差异是结构性的（整个文档 = 块树），对齐 = 放弃我们的普通 markdown 渲染管线。其导入导出生态（Obsidian 有「Import from Logseq」）也证明它被当作迁移来源而非互操作目标。**结论：不跟**。

### 2.4 Dendron——已死，核实完毕

- 2023-03 官方确认开发停止进入 maintenance mode（[discussion #3890](https://github.com/dendronhq/dendron/discussions/3890)：失去资金 + 维护者 burnout）。
- 2026 年社区评价其为「dead extension without any future development」（[issue #3956](https://github.com/dendronhq/dendron/issues/3956) 反映用户对前景的持续不确定）。
- 其「层级命名空间」（`domain.domain2.note.md` 点分文件名即层级）曾是层级组织的独特方案，但已被「普通子目录」取代。**结论：不跟，层级诉求用子目录解决。**

### 2.5 OKF（Open Knowledge Format）v0.2——与我们定位直接对口的开放规范

**这是本次调研最重要的发现**。[GoogleCloudPlatform/open-knowledge-format](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md)：Google Cloud 2026-06 发布 v0.1、2026-07-24 发布 v0.2，把 Karpathy LLM-wiki 模式形式化为可移植格式（llm-wiki-okf.md 当时评估时只有 v0.1 概述并标注「spec 太新暂不深挖」——现已稳定出 v0.2，本节为全字段深挖）。

**规范全文要点**（SPEC.md 原文）：

- **bundle** = markdown 目录树（层级自定）；保留文件名仅两个：`index.md`（目录清单，progressive disclosure）与 `log.md`（更新史，ISO 日期分组、append-only）。分发形态：git repo（推荐）/ tarball / 仓库子目录。
- **concept** = 每个知识单元一个 `.md`：YAML frontmatter + markdown body。
  - frontmatter **必填仅一个**：`type`（自由字符串，消费方必须容忍未知值）。
  - 推荐：`title`、`description`（一句话摘要，供 index/搜索/预览）、`resource`（资产 URI）、`tags`（YAML list）。
  - 信任族（全可选，v0.2 核心）：`sources[]`（provenance：`resource` 必填 + `id`/`title`/`author`/`usage_count`/`last_modified` + `usage_window`）、`generated: { by, at }`（谁写的）、`verified: [{ by, at }]`（谁确认过 → 三档 trust tier：无 verified=unverified / 非 human=机器确认 / 有 `human:<id>`=人工复核）、`status: draft|stable|deprecated`、`stale_after`（绝对时刻，过期判定 = 纯时间比较）。
  - **actor 约定**：agent 用 `<producer>/<version>`（如 `reference_agent/gemini-2.5-pro`）、人用 `human:<id>`、自动化用 `process:<id>`。
  - per-claim 引用：markdown footnote 标签键入 `sources[].id`（键控而非位置序——因为 agent 会不断重排列表，位置序会静默错配）。
- **链接**：**标准 markdown 链接，不是 wikilink**。bundle-absolute 形式 `/tables/customers.md`（推荐，页面移动不破链）或相对路径 `./other.md`。**断链不视为错误**——「可能只是还没写的知识」，消费方必须容忍。链接不携带关系类型语义（父子/引用/依赖由上下文 prose 表达），graph 视图把所有链接当作无类型有向边。
- **conformance 刻意宽松**：未知字段必须保留、缺可选族不拒绝、未知 type 当通用 concept、断链容忍。「只有 type 必填」。
- v0.2 新增的 Attested Computation（可证明计算：runtime/parameters/executor/attester/receipt）面向数据资产场景（BigQuery/dbt），对项目知识库场景超纲，不采用。

**与本项目的同构性**：OKF 的 producer/consumer 分离、「authored by people, generated by agents, consumed by both」与 llm-wiki-okf.md 拍板的定位逐字吻合；`generated.by` = 我们的 agent 会话、`sources` = praneybehl 三层解法里的 provenance（该文档已引用此解法，OKF 把它标准化了）。**风险标注**（沿用原调研的时效判断 + 本次核实）：规范仍年轻（v0.2 发布 ~3.5 个月），生态早期；但格式就是 markdown + YAML frontmatter，即使 OKF 没赢也不会被坑——下行风险趋零。

### 2.6 Karpathy LLM Wiki 模式——agent-producer 场景的直接社区印证

[gist 原文](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)（2026-04-04，5000+ stars；inbox 文档已详述模式与 A/B 路线，此处只补与格式相关的增量）：

- 三层：raw sources（不可变）/ wiki（LLM 全权）/ schema（`CLAUDE.md`——**我们的对应物是 MCP 工具描述 + skill**）。
- 两个特殊文件 `index.md`（内容目录：每页一行链接+摘要，查询先读 index 再 drill-in，「~100 sources 数百页规模内够用，不需要 RAG 基建」）与 `log.md`（append-only，`## [2026-04-02] ingest | Title` 统一前缀 → 可 `grep "^## \[" | tail -5`）——**这两个文件被 OKF 采纳为保留文件名**。
- 操作三件套：Ingest（一个源触达 10-15 页的更新）/ Query（好答案归档回 wiki）/ Lint（矛盾/过期/孤儿页/缺页检查）——inbox 的 lint 兜底决策与此一致。
- 明确推荐 Obsidian 为浏览端（graph view 是「看 wiki 形状」的最佳工具）+ wiki 是 git repo（版本历史免费）。

### 2.7 DeepWiki（Cognition）——概念参考

[官方 blog](https://cognition.com/blog/deepwiki)（2025-05 发布，GitHub 域名换 `deepwiki.com` 即用）：LLM + 代码库图结构分析混合，**structure-first 生成**（先读仓库结构与 README、让 LLM 产出机器可读的 wiki 结构，再逐页生成内容），配架构图与锚定源码的引用链接，支持 `.devin/wiki.json` 配置。对我们的启示只在**生成组织方式**（先结构后内容、引用锚定源码）——inbox 已把 Devin DeepWiki 归为 B 路线（后台编译）证据并裁定我们走 A，无格式可借鉴，不展开。

### 2.8 发布管线——markdown 目录 → 静态站

| 方案 | 形态 | 构建成本 | Obsidian 特性支持 | 维护状态（实测） | 与 pages 衔接 |
| --- | --- | --- | --- | --- | --- |
| **docsify** | 纯客户端运行时渲染：一个 `index.html` loader + markdown 原文直接 serve | **零构建** | wikilink 需插件（弱） | **活跃**：5.1.0，2026-10-30（npm 实测） | 最好——放 html + 原文即可 |
| **Quartz**（jackyzha0/quartz，v5 生态 2026-09 活跃，npm 实测） | Node 静态站生成器：unified/remark 管线 + `ObsidianFlavoredMarkdown` transformer | build 一次（watch 可增量） | **全量**：wikilinks/aliases/headings/blocks/callouts/highlights/`%%`注释/mermaid/tags/embeds + 图谱 + 反向链接 | 活跃（@quartz-community/* 插件 2026-09-14 发布） | 好——`quartz build` 输出进 `site/` |
| mkdocs（+material） | Python SSG | build 一次 | 无 wikilink（插件补） | **偏弱信号**：2026 年有「material 维护模式」说法（GitBook 博客提及，弱证据） | 好，但引入 Python 工具链 |
| Docusaurus | React SSG | 15-45s build | 无 wikilink | 最活跃 | 重——SPA overkill |
| Obsidian Publish | 官方付费托管 | 零 | 全量 | 商业服务 | 无关（闭源 SaaS） |

补充：Quartz 纯 markdown 目录即可跑（无需 Obsidian；deepwiki 源码级确认），其 wikilink→标准链接的转换逻辑同时也是**渲染层 wikilink 支持的参考实现**。docsify 的 `_sidebar.md` 可由我们的 `wiki_list_pages` 数据派生生成。

### 2.9 wikilink 解析的现成库供给（工程评估）

npm 实测（2026-11-07）：

- `@portaljs/remark-wiki-link` 1.2.0（flowershow/remark-wiki-link，2024-04-17 发布）——**稳定但 2.5 年未更新**；remark 插件，解析 `[[target|alias]]`→mdast link。可用但需评估「停止维护但语义已稳定」是否可接受。
- `@moritzrs/micromark-extension-ofm-wikilink` **0.0.1**（2024-11-02）——pre-alpha 征兆，按供应链规则（pre-alpha 换库优先）排除。
- Quartz 自带 OFM transformer——绑定 Quartz，不单独取用。
- **自写正则**：`\[\[([^\[\]|]+)(?:\|([^\]]+))?\]\]` + `#` 分割标题锚点，覆盖基础/别名/标题三形态（不做块引用 `#^`），~50 行 + 渲染组件死链样式。首期页面量级下正则方案工程量最小、零依赖。

## 3. 横向对照表

| 维度 | 我们现状 | Obsidian vault | Foam | OKF v0.2 | Logseq | Dendron |
| --- | --- | --- | --- | --- | --- | --- |
| 目录组织 | flat，拒 `/` | 自由（flat/层级均可） | 自由 + 约定目录 | 目录树，层级自定 | `pages/`+`journals/` 固定 | 点分文件名即层级 |
| 正文链接 | 无 | wikilink（可选纯 md 链接） | wikilink + md link | **标准 md 链接**（bundle-absolute 推荐） | `[[Page]]` | 无 |
| frontmatter | title/tags/created/updated | tags/aliases/cssclasses + 自由 | title/type/tags/alias | **type 必填** + title/description/resource/tags + 信任族 | `property::` 行内（非 YAML） | YAML |
| 日期格式 | YYYY-MM-DD | YYYY-MM-DD（Date 类型） | — | ISO 8601 带时区 | — | — |
| 反向链接 | 无 | 派生（文本扫描） | 派生（Resource+Graph） | 派生（无类型有向边） | 派生 | 派生 |
| 特殊文件 | 无 | `.obsidian/` | `.foam/templates` | `index.md`/`log.md` | — | — |
| provenance/信任 | 无 | 无（社区插件 Dataview） | type 字段 | **sources/generated/verified/status/stale_after** | — | — |
| Obsidian 直接打开 | ✅（但 Obsidian 建的空格/中文/子目录页面我们读不到） | ✅ 本体 | ✅ 兼容 | ✅（标准 md 链接原生可读，wikilink 形式不识别） | ⚠️ 需迁移 | ✅ 但格式已无人维护 |
| 活跃度 | — | 高 | 中（慢但活着） | 新（Google Cloud 背书，早期） | 高（方向不合） | **死**（2023-03 停止开发） |

## 4. 对齐建议

### 4.1 核心判断：双标尺对齐，一处关键调和

**格式标准选「OKF（存储语义）+ Obsidian vault（编辑器互操作）」双标尺**，两者在 2026 年的现状下可以调和，关键调和点是**链接语法**：

- OKF 用标准 markdown 链接；Obsidian 官方设置里有「Use [[Wikilinks]]」开关——**关掉后 Obsidian 生成的就是标准 markdown 链接**（官方文档明确两种形式等价、编辑器渲染与跳转一致）。
- 因此建议：**存储主语法 = 标准 markdown 链接**（agent 写入时用相对路径或 `/wiki/...` 形式，OKF 推荐形式），**渲染层兼容 wikilink**（正则解析 `[[target|alias|#heading]]` 转 wiki 路由链接，死链样式标出）——用户日后用 Obsidian 打开 wiki 目录也不会破坏我们读取（wikilink 只是没被我们升级成可点击链接，页面本体、frontmatter、目录全部无损）。

这个组合的净效果：agent 产出的 wiki 目录 = 一个合法 OKF bundle + 一个合法 Obsidian vault + 一组可被 docsify/Quartz 直接消费的 markdown。三方互操作一次到位。

### 4.2 frontmatter 对齐细则

| 字段 | 现状 | 建议 | 依据 |
| --- | --- | --- | --- |
| `title` | ✅ 已有 | 保留 | Obsidian/Foam/OKF 三方通用 |
| `tags` | ✅ 已有（复数 list） | 保留（已是复数，正确） | Obsidian 默认属性 / OKF 推荐 |
| `created`/`updated` | ✅ 已有 YYYY-MM-DD | 保留；Obsidian 侧即 Date 类型 | 零改动兼容 |
| `description` | ❌ | **新增（一行摘要）** | OKF 推荐（index/搜索片段/预览）+ Obsidian Publish 属性同名词 |
| `type` | ❌ | 可选新增（自由字符串，如 `note`/`spec`/`reference`） | OKF 唯一必填字段； Obsidian/Foam 用 tags/cssclasses 表达同类信息，不冲突 |
| `aliases` | ❌ | 可选新增（复数形式） | Obsidian 默认属性（注意 Foam 的单数 `alias` 已被 Obsidian 废弃，取复数） |
| `source` | ❌ | 可选（agent 写页时注明来源会话/材料） | OKF `sources` 的极简版；完整信任族暂不做 |
| `status` | ❌ | 暂不做 | OKF 信任族超出现阶段诉求，规范宽松（缺省不拒） |

写入侧：`writePage` 序列化时透传可选字段；读取侧 `buildWikiPage` 按「未知字段保留」的 OKF conformance 原则不丢弃（gray-matter 已天然满足，只需类型放行）。

### 4.3 分期建议

- **Phase 0（零/微工程量，立即可做）**：frontmatter 增 `description`（可选透传）；`wiki_write_page` 的工具描述写明链接约定（**正文跨页引用用标准 markdown 相对链接 `[text](./target.md)` 或 `[[target]]` wikilink 均可，目标用文件名不含扩展名**）——producer 侧引导零代码，只改 MCP 工具描述文案。
- **Phase 1（2-4 天，价值最大）**：
  1. 放开层级子目录：slug 允许 `a/b` 形式（`WIKI_SLUG_RE` 放宽 + `listPages` 递归 readdir + `writePage` mkdir——OKF 与 vault 都支持子目录）；
  2. 渲染层 wikilink 解析（自写正则，§2.9）+ markdown 相对链接的站内跳转 + 死链样式；
  3. backlinks 派生：list/read 时全量扫描正文提取链接建内存 map（与 `searchPages` 同模式，首期页面量级可接受；页面多了再换增量）；
  4. 阅读页加「反向链接」段。
- **Phase 2（按需）**：`index.md`（可由 `wiki_list_pages` 数据自动生成——OKF 允许消费方合成）、`log.md`（写入时追加一行，格式 `## YYYY-MM-DD` 分组）；图谱视图（复用 backlinks map，参考 Foam Graph/Obsidian graph view）。
- **明确不跟**：wikilink 作为存储主语法（只做渲染兼容）、块引用 `#^blockid`（Obsidian 专属，出了 Obsidian 失效）、Logseq outliner/property 语法、Dendron 点分命名空间、OKF 完整信任族与 Attested Computation、嵌入 `![[...]]`（后两项列入 future watch）。

### 4.4 发布管线选型 + pages 衔接草图

**推荐：docsify 起步（零构建、零依赖风险），Quartz 作为「要图谱/反向链接/全 Obsidian 特性」时的升级项。**

衔接关键 gap：pages 约定 serve 的是项目 `site/` 目录 → `/p/{project}/`，而 wiki 在 `wiki/` 目录——**发布需要一个「wiki/ → site/wiki/」的显式同步动作**（symlink 会撞我们的 symlink-escape 安全模型，用复制最稳）：

```
「发布 wiki」动作（Web 按钮 / MCP 工具 / api CLI 任一形态）
  1. cp wiki/*.md → site/wiki/           （含子目录；site/wiki/ 不入 wiki 索引，纯产物）
  2. 写 site/wiki/index.html             （docsify loader 模板，~30 行静态文件，api 内置）
  3. 由 listPages 数据生成 site/wiki/_sidebar.md（分组目录，替代 docsify 默认侧栏）
  → /p/{project}/wiki/ 即为可导航静态站
```

- wiki 更新后重新点一次发布即同步（或 writePage 后自动增量同步，成本一次文件 copy）。
- 升级路径：同一动作换成 `quartz build`（输入 wiki/ 输出 site/wiki/），消费端 URL 不变。Quartz 引入 Node 依赖树（esbuild/preact 等），按供应链规则过 `/check-deps` 再立项。

### 4.5 工程量级汇总

| 项 | 量级 | 说明 |
| --- | --- | --- |
| frontmatter description 透传 | ~半天 | buildWikiPage + writePage + shared 类型 + UI 摘要位 |
| MCP 工具描述引导 | <1 小时 | 纯文案 |
| 层级子目录 | 1-2 天 | slug regex、递归 list、write mkdir、前端 slug 路由 |
| wikilink/相对链接渲染 | 1-2 天 | 正则 + 渲染组件 + 死链样式（MarkdownString 管线扩展） |
| backlinks 派生 + 阅读页段 | ~1 天 | 全量扫描内存 map，与 searchPages 同模式 |
| index.md 自动生成 | ~1 天 | listPages → markdown 列表 |
| docsify 发布桥 | ~1 天 | 同步动作 + 内置 index.html 模板 + _sidebar 生成 |
| Quartz 升级项 | 2-3 天 | 另加供应链评估 |

## 5. 开放问题（需用户拍板）

1. **slug 规则放宽的尺度**：Obsidian 允许空格/中文文件名。若要「用户在 Obsidian 里随手建的页面也能被读到」，`WIKI_SLUG_RE` 需放宽（至少放行 Unicode + 空格，继续拒 `/`/`..`/`\0`）；若维持 ASCII slug，则 Obsidian 互操作是「我们写的它能读」单向。放宽涉及 URL 编码与路由，影响 web 端 slug 传参。
2. **链接主语法拍板**：本调研建议「存储用标准 markdown 相对链接 + 渲染兼容 wikilink」（4.1）；若用户更看重「在 Obsidian 里手写也顺手」，可反转为「存储用 wikilink + 发布时转换」，代价是违背 OKF 存储建议、且非 Obsidian 工具（grep、多数静态生成器）不识别 wikilink。
3. **`type` 字段要不要**：OKF 唯一必填字段，但我们的页面尚无类型诉求；列表已按首 tag 分组。加 `type` 是向 OKF conformance 靠拢（一行代码），不加也不破坏互操作（OKF 消费方容忍缺 type 的宽容度是「SHOULD 而非 MUST」级别，弱证据：SPEC §11 未将缺 type 列入拒绝条件，但 conformant 定义含「非空 type」——严格 bundle 校验会标红）。倾向加，等拍板。
4. **发布动作的触发形态**：手动按钮（显式、语义清晰）vs writePage 后自动同步（省一步但「公开」变成写副作用，与 pages 配置即启用的显式性冲突）。倾向手动。
5. ~~inbox/llm-wiki-okf.md 的归档~~ **已决（2026-11-07 用户拍板「清理」并执行）**：该文档连同 mcp-hub-positioning.md / mcp-hub-competitors.md 已迁至 `docs/research/` 根，inbox 仅余 embedded-browser.md（browser 能力域未立项）。
6. **Quartz 是否立项**：发布起步用 docsify 已定方向，但「wiki 站内图谱/反向链接可视化」若被提上日程，Quartz（build 产物）vs 自研（复用 backlinks map 前端画）是两条路，涉及 Node 依赖树引入，届时再过 `/check-deps`。

## 来源

- Obsidian Internal links：<https://help.obsidian.md/Linking+notes+and+files/Internal+links>（经 obsidian.md/help/links）
- Obsidian Properties：<https://help.obsidian.md/Editing+and+formatting/Properties>（经 obsidian.md/help/properties）
- Foam：deepwiki foambubble/foam + foambubble/foam-template；维护状态见 [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=foam.foam-vscode)（2026-11-06 更新）与 [Releases](https://github.com/foambubble/foam/releases)
- Logseq：deepwiki logseq/logseq
- Dendron：[discussion #3890（Development stopped?）](https://github.com/dendronhq/dendron/discussions/3890)、[issue #3956（Is Dendron Project Still Active?）](https://github.com/dendronhq/dendron/issues/3956)
- OKF：[SPEC.md v0.2](https://github.com/GoogleCloudPlatform/open-knowledge-format/blob/main/SPEC.md)、[Google Cloud 发布 blog](https://cloud.google.com/blog/products/data-analytics/how-the-open-knowledge-format-can-improve-data-sharing)（2026-06-12）
- Karpathy LLM wiki gist：<https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>（2026-04-04）
- DeepWiki：[Cognition blog](https://cognition.com/blog/deepwiki)、[Devin docs](https://docs.devin.ai/work-with-devin/deepwiki)
- Quartz：deepwiki jackyzha0/quartz；v5 插件生态 npm 实测（@quartz-community/*，2026-09-14）
- docsify / wikilink 库维护状态：npm registry 实测（2026-11-07：docsify 5.1.0 / 2026-10-30；@portaljs/remark-wiki-link 1.2.0 / 2024-04-17；@moritzrs/micromark-extension-ofm-wikilink 0.0.1 / 2024-11-02）
- 发布管线 2026 对比（弱证据）：[Docusaurus vs MkDocs（docsio, 2026-04）](https://docsio.co/blog/docusaurus-vs-mkdocs)、[Docsify vs MkDocs（softwr, 2026-08）](https://www.softwr.com/compare/docsify-vs-mkdocs)、[GitBook 文档工具盘点（2026-02）](https://www.gitbook.com/blog/best-software-documentation-tools)
- 社区实践（弱证据）：Karpathy 模式衍生（[Obsidian karpathywiki 插件](https://community.obsidian.md/plugins/karpathywiki)、[starmorph 指南](https://blog.starmorph.com/blog/karpathy-llm-wiki-knowledge-base-guide)）、[obsidian-wiki（ar9av）](https://github.com/ar9av/obsidian-wiki)、OKF 社区讨论（[r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1u9rbs8/googles_new_open_knowledge_format_is_basically/)）
- 承接文档：[llm-wiki-okf.md](./llm-wiki-okf.md)（定位层 A/B 路线与三项拍板）、[pages-static-hosting.md](./pages-static-hosting.md)（pages 静态托管方案）
