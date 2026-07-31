# MCP Hub 定位共识

> 状态:定位共识(2026-07-31),**待深化**,位于 `docs/research/inbox/`(未定型区,非沉淀结论)。
> 本文件立**定位与方向**;传输 / 接入 / 进程模型三项已结合竞品调研([mcp-hub-competitors](./mcp-hub-competitors.md))消解;工具集设计 / 外部对接形态 / 移动端留「待深化」实现期再定。
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

**「市面上已有成熟抽象」落地到具体**:统一抽象就是 MCP 协议本身——内部 hub 用它建 server,外部对接用它当 client 网关。两者不再各造一套。

## 能力域分层(内部 hub)

内部 hub 的工具按「基线 + 能力域」分层:

- **基线层**:项目内文件读写原语(默认 agent 接上 hub 即具备)。wiki/browser 等能力域在此之上。
- **能力域层**:`wiki_*`(wiki 语义:link graph / front matter / 搜索)/ `browser_*`(CDP 驱动)/ 后续更多。

> wiki_* 不是从零造一套文件工具:它 = 基线文件读写 + wiki 语义增强。基线复用现有 Project-safe resolver(与 pages、Files 同一安全边界)。

**能力域可见性 = `tools/list` 动态裁剪**:MCP 协议原生支持 server 按上下文(项目配置)返回不同工具集(见「MCP 协议事实」)。没开 wiki 的项目,server 在 `tools/list` 不返回 wiki 工具。这让 per-project 能力开关自然落在协议层,不用自建开关系统。

## 落地顺序(不建空架子)

定位可以是 hub,但实现从**一个具体能力域**切入,不先搭 hub 空壳:

```
MCP Hub 定位(只立方向)
  └─ 内部 hub 基座 + 基线文件读写
        └─ wiki 第一个内部能力域(producer 工具 + consumer 渲染)—— 验证 hub 设计
              └─ browser 第二个内部能力域 —— 复用 hub,此时提取正式「工作台能力域插件」抽象
```

- **wiki 先于 browser**:wiki 工程量小(consumer 渲染层 + producer MCP 工具),先打通 hub 地基;browser 作第二个能力域复用,并在它身上提取 workspace 注册 / 开关的正式抽象。
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
- **我们是全场最激进的一个,且加强为全场独一份**:累计 **13 个竞品**(2 CLI + 5 编辑器 + 4 网关 + 2 桌面应用 Orca/Proma + 2 大厂平台 扣子/WorkBuddy)无一用 stateless HTTP 给 local 工具。竞品分布:编辑器内置工具走进程内函数、local 外部 MCP 一律 stdio stateful、Streamable HTTP 只用于 remote;Orca 干脆不建 MCP server(能力走 prompt 注入);扣子空间的 MCP 是**云端 remote**形态(local 对云平台不成立),WorkBuddy 用自研协议不用 MCP。偏离可辩护,记为**显式决策**(非偶然):我们的差异点是**服务端多租户 / 按需 spawn agent / 需水平扩展**——正是与桌面 IDE / 单进程桌面应用的根本不同。
- **无状态有两条路,由部署形态决定(第二样本 Proma 对照)**:桌面单进程可走**进程内 SDK MCP**(`createSdkMcpServer`,Claude Code `type:"sdk"`,无 wire 天然无状态,如 Proma);我们因**服务端多租户 / 可水平扩展**定位锁死 **stateless HTTP**。两者都无状态,不是路线之争而是部署形态的必然——桌面单进程进程内即可,服务端多租户必须 HTTP(进程内锁死单一 SDK runtime,stateless HTTP 对所有 `type:"http"` runtime 通用,这是我们选 HTTP 而非进程内的额外收益)。这比第一轮「无状态损失 stdio 白给的东西」更深:**不是「我们丢了什么」,而是「部署形态决定了哪条无状态路」**。
- **Smithery 实证 stateful stdio-桥单实例 ~50 并发天花板**(员工亲口)——正是我们「不用 stdio」规避的扩展瓶颈。
- **大厂平台工具层选择分化(扣子 / WorkBuddy 对照)**:扣子空间用 MCP(云端 remote)、扣子经典 Bot 与 WorkBuddy 用**自研协议**(OpenAPI / Skills+Connectors+Experts)。MCP 在大厂是「新 agent 工作台」选项,不是「全平台统一」。我们「统一 MCP」比大厂更激进——大厂可保留自研协议闭环可控,我们必须用 MCP 才能开放接任意第三方 + 跨 agent runtime 通用。这是**定位差异不是技术优劣**。
- **可借鉴**:Claude Code `--mcp-config '<json>' --strict-mcp-config`(spawn 时注入,config `{mcpServers:{hub:{type:"http",url,headers}}}`);Composio `allowed_tools` + per-user 动态 `tools/list`(贴合我们 per-project 能力域开关);stdio→HTTP 桥作「只能说 stdio 的 agent」适配层(hapi `hapi mcp --url`),非 canonical;Proma `default-mcp.json` 单一事实源 + 内/外 MCP 分层原语(保留名 / 错误隔离 / `required:false` 可选降级),直接抄;Orca Design Mode「点击 UI → 进 prompt」是 browser_ 域的**非 MCP 降级形态**(简单场景 prompt 注入比 MCP 工具轻);扣子「工作流发布为 MCP server」双向暴露(我们外部转发可对称提供内部能力外发)。

## 待深化(实现期再定,当前不锁)

> 以下三项已结合竞品调研([mcp-hub-competitors](./mcp-hub-competitors.md))消解,不再悬空:
> - **传输**:内外统一 Streamable HTTP 无状态(Claude Code / Codex CLI 都原生支持 `type:"http"` 无状态,内部 hub 不必 stdio)。
> - **接入方式**:spawn 时注入 `--mcp-config`(Claude `--mcp-config <json|file>` + `--strict-mcp-config`、Codex `-c mcp_servers.<name>...`),hapi 已实证。
> - **hub 进程模型**:无状态后共享一个常驻 hub server 进程(不必每 session spawn),按请求 project 上下文路由到正确项目根。

仍待实现期定:

- **基线读写默认值**:hub 默认给所有 agent 文件读写,还是按项目配置开——实现期配置策略,不影响 hub 架构。
- **工具集设计**:wiki_* 的确切工具签名、能力域边界(基线 vs 语义层的切分点)。
- **外部 MCP 对接的具体形态**:配置 schema、转发/隔离边界、鉴权透传(Glama / Composio 的 token-vault + OAuth auto-refresh 可借鉴)。
- **移动端**:browser 能力域的移动端策略(降级 / 仅桌面),wiki 的 consumer 渲染移动端适配。

## 命名清理(已完成)

`web/src/components/workbench/right-panel-plugin.tsx` 的 `RightPanelPlugin` / `FIRST_PARTY_PLUGINS` / `WorkbenchRightTab` 命名失准(实际是「工作台 inspection tab 种类注册表」,不在「右栏」)已正名为 `workbench-tab-plugin.tsx` / `WorkbenchTabPlugin` / `WORKBENCH_TAB_PLUGINS` / `WorkbenchInspectionTab`。运行时相关命名(URL `rightTab` 字段、`workbenchRightTabAtom` localStorage 键、字符串值 `"files"/"git"/"pages"`)刻意保留以免破坏契约。详见对应 refactor commit。

## 来源

- 本讨论(2026-07-31):wiki / browser 统筹 + 插件系统时机 → 收敛为 MCP hub 定位。
- 竞品调研:[./mcp-hub-competitors.md](./mcp-hub-competitors.md)(hapi / Claude Code / Codex / 5 编辑器 / 4 网关,源码级)。
- MCP 官方 spec(modelcontextprotocol/modelcontextprotocol,2025-11-25)+ SEP-2575「Make MCP Stateless」(Final)。
- 参考实现源码:hapi(`~/repos/hapi`)、Claude Code 2.1.88(`~/repos/claude-code-sourcemap`)。
- 关联调研:`./llm-wiki-okf.md`、`./embedded-browser.md`、`../pages-static-hosting.md`。
