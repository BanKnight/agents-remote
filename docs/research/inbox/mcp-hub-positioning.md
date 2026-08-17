# MCP Hub 定位共识

> 状态:定位共识(2026-07-31),**待深化**,位于 `docs/research/inbox/`(未定型区,非沉淀结论)。
> 本文件立**定位与方向**;传输 / 接入 / 进程模型 / **概念层级 scope**(per-project + session 继承,被 Codex 源码 / WorkBuddy 文档验证)四项已结合竞品调研([mcp-hub-competitors](./mcp-hub-competitors.md))消解;工具集设计 / 外部对接形态(含 trust 门 + 凭据管理)/ 移动端留「待深化」实现期再定。
> 上游需求来源:`./llm-wiki-okf.md`(wiki)、`./embedded-browser.md`(browser)、`../pages-static-hosting.md`(pages,已实现)。

## 一句话定位

**MCP Hub 是「给 agent 装能力(tool)」的统一层**,采纳 MCP(Model Context Protocol)成熟抽象,不重新发明协议。它服务两类 MCP,本项目的 wiki / browser 等只是这个 hub 上最先落地的内部能力域。

## 为什么是 hub,不是「wiki 的配套 server」

最初讨论 wiki/browser 时,框定是「自建一个 MCP server 给 wiki/browser 用」。这个框定太小——把它拔成 hub 定位后,关系清晰了:

- **如果 MCP 只服务 wiki**,它就是 wiki 的实现细节,没有独立产品价值。
- **拔成 hub**,它和现有架构的关系是:**`skill-market` 给 agent 装「知识 / 行为」(skill),`MCP hub` 给 agent 装「能力 / 工具」(tool)**——两个维度互补,覆盖 agent 的「会做什么(tool)」和「怎么做(skill)」。wiki/browser 是 hub 上验证设计的首批内部能力域。

## 两类 MCP(框架一起定,各取成熟抽象)

| | 内部 hub(自建) | 外部 MCP 对接(转发第三方) |
|---|---|---|
| 谁提供能力 | 我们自带的工具(wiki 读写、browser 驱动、文件基线……) | 用户配的外部 MCP server(Google 邮件等第三方工具) |
| 协议 | MCP(spec 2025-11-25) | 同 MCP(协议统一,差别只在传输) |
| 传输 | **Streamable HTTP**(最新版,**无状态**)——内外统一 | 同 Streamable HTTP(外部 server 本就用它) |
| 我们的角色 | server 的实现者 + 把连接信息注入 CLI spawn | 配置管理者(用户填外部 server URL / 命令,我们 spawn CLI 时带进去) |
| 鉴权 | 进程内信任(同机子进程) | 透传 CLI 与外部 server 之间的鉴权(bearer/OAuth,由外部 server 定) |
| **trust / 安全门** | **无需**——内部能力域(wiki/browser 等)是**官方可信能力**,用户理解为由平台官方提供,信任度最高 | **需要**(防任意 project 静默起外部 MCP,参考 Codex trust 模型)+ 凭据管理(全局 vs per-project,见「待深化」) |

**「市面上已有成熟抽象」落地到具体**:统一抽象就是 MCP 协议本身——内部 hub 用它建 server,外部对接用它当 client 网关。两者不再各造一套。

## 能力域分层(内部 hub)

内部 hub 的工具按能力域组织,**无基线层**:

- **基座不暴露工具**(空壳):agent(Claude/Codex)自带文件工具(Read/Write/Edit / apply_patch / shell)且 spawn 时 `cwd=projectPath`,基线文件读写是重复造轮子。基座只提供 server + 注入管线,`tools/list` 返回空。
- **能力域层**:`wiki_*`(wiki 语义:link graph / front matter / 搜索)/ `browser_*`(CDP 驱动)/ 后续更多。wiki 是基座之上第一个加真实工具的能力域。

> wiki_* 工具实现内部复用现有 Project-safe resolver(与 pages、Files 同一安全边界)做文件操作——这是工具实现的细节,不是 hub 的基线层。

**能力域可见性 = `tools/list` 动态裁剪**:MCP 协议原生支持 server 按上下文(项目配置)返回不同工具集(见「MCP 协议事实」)。没开 wiki 的项目,server 在 `tools/list` 不返回 wiki 工具。这让 per-project 能力开关自然落在协议层,不用自建开关系统。

## runtime 兼容维度(McpInjector)

注入能力是 runtime 级维度,与能力开关(project 级)正交:

- **Claude**(`ClaudeMcpInjector`):直拉 spawn,argv 可扩展,`--mcp-config` inline JSON + `type:"http"`,基座先行。
- **Codex**:当前走 tmux 非直拉,无 argv 注入抽象 → 基座暂不支持,等 Codex 直拉 runtime 落地加 `CodexMcpInjector`(TOML `-c mcp_servers.<name>...`)。
- **不加 `--strict-mcp-config`**:避免干扰 agent 已有的 user/project/enterprise MCP 配置(用户可能已有个人 MCP server,strict 会强制忽略;enterprise 场景还会拒跑)。hub 与 agent 现有 MCP 配置并存,工具列表是合集。strict 留待后续按需再开。

## 落地顺序(不建空架子)

定位可以是 hub,但**第一个要实现的是 MCP hub 基座本身**——无状态 Streamable HTTP server + spawn 时 `--mcp-config` 注入这套管线。基座跑通后,wiki 才是它之上第一个能力域:

```
MCP Hub 定位(只立方向)
  └─ 第一步:MCP hub 基座 —— 无状态 Streamable HTTP server(空壳) + --mcp-config 注入管线(Claude 先行)
        └─ wiki 第一个内部能力域(producer 工具 + consumer 渲染)—— 基座之上第一个能力域,验证 hub 设计
              └─ browser 第二个内部能力域 —— 复用 hub,此时提取正式「工作台能力域插件」抽象
```

- **MCP 基座先于能力域**:基座(无状态 server + 注入管线)是所有能力域的共同前置依赖,wiki/browser 都长在它上面。基座本身是空壳(不暴露工具),但必须先打通「agent 能连上 hub」这条最小管线,wiki 工具才有地方注册。基座不建空架子——它必须先有一个被调用的能力域(wiki)才值得存在,但 wiki 工具的运行依赖基座已就绪,故实现期先落地基座再立刻接 wiki 工具。
- **wiki 先于 browser**:wiki 工程量小(consumer 渲染层 + producer MCP 工具),作基座之上首个能力域验证 hub 设计;browser 作第二个能力域复用,并在它身上提取 workspace 注册 / 开关的正式抽象。
- **插件抽象时机**:现有 `WORKBENCH_TAB_PLUGINS`(`web/src/components/workbench/workbench-tab-plugin.tsx`)已是 consumer 侧渲染 + 可见性的雏形(pages 即以此接入)。wiki 复用现成加一项即可;**不**在 wiki 阶段就把 hub 抽象成正式插件系统——等 browser(第二个样本)复用时差异点暴露,再提取(rule of three)。

## 与现有架构的关系

| 现有 | 定位 | MCP hub 的关系 |
|---|---|---|
| `skill-market`(`api/src/skill-market.ts`) | 给 agent 装**知识 / 行为**(SKILL.md) | 互补:skill = 怎么做,tool = 会做什么 |
| `WORKBENCH_TAB_PLUGINS`(工作台 tab 注册) | consumer 侧**渲染 + 可见性** | hub 只补另一半(producer / agent 驱动);consumer 渲染 wiki 时复用此注册加一项 |
| pages(`docs/research/pages-static-hosting.md`,已实现) | 静态托管,不管内容怎么来 | pages 是「被动能力」(只 serve),wiki/browser 是「主动能力」(agent 驱动)——后者才逼出 MCP hub |
| Project-safe resolver / Files 安全读取 | 项目内路径安全边界 | hub 基线文件读写复用同一 resolver |

## MCP 协议事实(spec 2025-11-25,用于「采纳成熟抽象」的依据)

- **工具暴露**:`tools/list`(client 发现工具)+ `tools/call`(调用),JSON-RPC 2.0;server 在 init 声明 `capabilities.tools`。
- **传输两种,我们统一选 Streamable HTTP**:stdio(本地子进程)虽无网络开销但是**有状态**的(client 持有子进程生命周期,server 进程内维护状态);Streamable HTTP(POST + 可选 SSE)可做到**无状态**——每请求独立、server 不持有 session,利于 hub 水平扩展、无 session 粘性、崩溃恢复简单。**无论内部 hub 还是外部对接,我们都用 Streamable HTTP 最新版**(旧 HTTP+SSE 2024-11-05 已废弃)。内部 hub 即使同机也走 HTTP(绑 127.0.0.1),换取无状态 + 与外部一套抽象。
- **`tools/list` 动态**:server 可按上下文返回不同工具集(能力域裁剪的协议原生支持)。
- **安全**:Streamable HTTP server 必须校验 `Origin`、本地绑 127.0.0.1、实现鉴权;stdio 进程内信任。
- **无状态 = 不返回 `Mcp-Session-Id`**:spec 规定 server「may」分配 session id,不分配是合法的无状态实现,client(Claude Code / Codex)即无亲和性。**返回了反而有害**——Claude Code 会 pin session id,hub 重启 / 再平衡即崩([弱证据] claude-code #27142);hapi 源码注释亦明说 `sessionIdGenerator: undefined` 是与 Claude SDK 兼容的必要条件(见 [mcp-hub-competitors](./mcp-hub-competitors.md))。
- **`type:"http"` 字面量**:Claude Code 配置里 Streamable HTTP 的 type 是 `"http"`,不是 `"streamable-http"`(schema 拒后者);`"sse"`(旧 HTTP+SSE)已废弃。
- **无状态是 spec 目标方向**:SEP-2575「Make MCP Stateless」(Final,Standards Track)把 stateless-by-default 定为目标,指出 stateful 初始化握手让 MCP 难以在标准负载均衡后运行——我们走在 spec 前瞻上。
- spec 2025-11-25 很新(协议仍在演进),采纳格式层不变,实现期留意版本字段。

> 来源:[modelcontextprotocol/modelcontextprotocol](https://github.com/modelcontextprotocol/modelcontextprotocol)(官方 spec 仓库)。

## 竞品对照(决策依据,详 [mcp-hub-competitors](./mcp-hub-competitors.md))

调研覆盖 hapi(参考实现,源码级)、Claude Code 2.1.88 / Codex CLI(我们 spawn 的目标)、5 个编辑器(Cursor / Windsurf / Cline / Continue / Zed)、4 个 MCP 网关(Smithery / Glama / Composio / mcp.so)。核心对照:

- **「统一 Streamable HTTP 无状态」被验证为前瞻方向**:SEP-2575(Final)定 stateless-by-default;hapi 源码注释明说 `sessionIdGenerator: undefined`(无状态)是与 Claude SDK 兼容的必要条件(带 session id 会让 spawn 失败);两端 CLI 都原生支持 `type:"http"` 无状态。
- **我们是全场最激进的一个,且加强为全场独一份**:累计 **13 个竞品**(2 CLI + 5 编辑器 + 4 网关 + 2 桌面应用 Orca/Proma + 2 大厂平台 扣子/WorkBuddy)无一用 stateless HTTP 给 local 工具。竞品分布:编辑器内置工具走进程内函数、local 外部 MCP 一律 stdio stateful、Streamable HTTP 只用于 remote;Orca 干脆不建 MCP server(能力走 prompt 注入);扣子空间的 MCP 是**云端 remote**形态(local 对云平台不成立);WorkBuddy 的 Connectors 也走 MCP(三轮更正——办公桌面形态,非云端 remote,非自研协议)。偏离可辩护,记为**显式决策**(非偶然):我们的差异点是**服务端多租户 / 按需 spawn agent / 需水平扩展**——正是与桌面 IDE / 单进程桌面应用的根本不同。
- **无状态有两条路,由部署形态决定(第二样本 Proma 对照)**:桌面单进程可走**进程内 SDK MCP**(`createSdkMcpServer`,Claude Code `type:"sdk"`,无 wire 天然无状态,如 Proma);我们因**服务端多租户 / 可水平扩展**定位锁死 **stateless HTTP**。两者都无状态,不是路线之争而是部署形态的必然——桌面单进程进程内即可,服务端多租户必须 HTTP(进程内锁死单一 SDK runtime,stateless HTTP 对所有 `type:"http"` runtime 通用,这是我们选 HTTP 而非进程内的额外收益)。这比第一轮「无状态损失 stdio 白给的东西」更深:**不是「我们丢了什么」,而是「部署形态决定了哪条无状态路」**。
- **Smithery 实证 stateful stdio-桥单实例 ~50 并发天花板**(员工亲口)——正是我们「不用 stdio」规避的扩展瓶颈。
- **大厂平台工具层选择分化(扣子 / WorkBuddy 对照,三轮修正)**:扣子空间用 MCP(云端 remote)、扣子经典 Bot 用**自研 OpenAPI**、**WorkBuddy 用 MCP**(Connectors 标准化协议,三轮更正)。即大厂「新 agent 工作台」(扣子空间/WorkBuddy)已普遍采纳 MCP,经典产品线(扣子 Bot)保留自研协议。我们「统一 MCP」与采纳 MCP 的大厂新工作台方向一致,差别在我们**对所有 runtime 通用**,大厂**分产品线选**。这是**定位差异不是技术优劣**。
- **可借鉴**:Claude Code `--mcp-config '<json>' --strict-mcp-config`(spawn 时注入,config `{mcpServers:{hub:{type:"http",url,headers}}}`);Composio `allowed_tools` + per-user 动态 `tools/list`(贴合我们 per-project 能力域开关);stdio→HTTP 桥作「只能说 stdio 的 agent」适配层(hapi `hapi mcp --url`),非 canonical;Proma `default-mcp.json` 单一事实源 + 内/外 MCP 分层原语(保留名 / 错误隔离 / `required:false` 可选降级),直接抄;Orca Design Mode「点击 UI → 进 prompt」是 browser_ 域的**非 MCP 降级形态**(简单场景 prompt 注入比 MCP 工具轻);扣子「工作流发布为 MCP server」双向暴露(我们外部转发可对称提供内部能力外发)。

## 待深化(实现期再定,当前不锁)

> 以下三项已结合竞品调研([mcp-hub-competitors](./mcp-hub-competitors.md))消解,不再悬空:
> - **传输**:内外统一 Streamable HTTP 无状态(Claude Code / Codex CLI 都原生支持 `type:"http"` 无状态,内部 hub 不必 stdio)。
> - **接入方式**:spawn 时注入 `--mcp-config`(Claude `--mcp-config <json|file>` + `--strict-mcp-config`、Codex `-c mcp_servers.<name>...`),hapi 已实证。
> - **hub 进程模型**:无状态后共享一个常驻 hub server 进程(不必每 session spawn),按请求 project 上下文路由到正确项目根。

仍待实现期定:

- **基线读写默认值**:hub 默认给所有 agent 文件读写,还是按项目配置开——实现期配置策略,不影响 hub 架构。
- **工具集设计**:wiki_* 的确切工具签名、能力域边界(基线 vs 语义层的切分点)。
- **外部 MCP 对接的具体形态**(含 trust 门 + 凭据管理,**基座/wiki/browser 阶段不引入**):配置 schema、转发/隔离边界、鉴权透传(Glama / Composio 的 token-vault + OAuth auto-refresh 可借鉴)。**三轮调研([mcp-hub-competitors](./mcp-hub-competitors.md)「概念层级 × scope」)明确**:① **trust 门**(防任意 project 静默起外部 MCP,Codex 的「untrusted project MCP 解析但不连」模型可参考)随外部转发一起设计;② **凭据管理**(OAuth token 全局 vs per-project)——办公场景(WorkBuddy)凭据全局合理,我们 DevOps/代码仓库定位(project ≈ 仓库边界)**per-project 凭据更安全**,实现期定;③ 当前内部 hub(官方可信能力)**无需 trust 门**,这些机制是「外部 MCP 转发」能力域的专属,与「落地顺序」一致。
- **移动端**:browser 能力域的移动端策略(降级 / 仅桌面),wiki 的 consumer 渲染移动端适配。

## 命名清理(已完成)

`web/src/components/workbench/right-panel-plugin.tsx` 的 `RightPanelPlugin` / `FIRST_PARTY_PLUGINS` / `WorkbenchRightTab` 命名失准(实际是「工作台 inspection tab 种类注册表」,不在「右栏」)已正名为 `workbench-tab-plugin.tsx` / `WorkbenchTabPlugin` / `WORKBENCH_TAB_PLUGINS` / `WorkbenchInspectionTab`。运行时相关命名(URL `rightTab` 字段、`workbenchRightTabAtom` localStorage 键、字符串值 `"files"/"git"/"pages"`)刻意保留以免破坏契约。详见对应 refactor commit。

## 来源

- 本讨论(2026-07-31):wiki / browser 统筹 + 插件系统时机 → 收敛为 MCP hub 定位。
- 竞品调研:[./mcp-hub-competitors.md](./mcp-hub-competitors.md)(hapi / Claude Code / Codex / 5 编辑器 / 4 网关,源码级)。
- MCP 官方 spec(modelcontextprotocol/modelcontextprotocol,2025-11-25)+ SEP-2575「Make MCP Stateless」(Final)。
- 参考实现源码:hapi(`~/repos/hapi`)、Claude Code 2.1.88(`~/repos/claude-code-sourcemap`)。
- 关联调研:`./llm-wiki-okf.md`、`./embedded-browser.md`、`../pages-static-hosting.md`。
