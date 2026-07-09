# AI 设计/原型工具调研:OpenDesign 嵌入可行性

> 调研时间:2026-07。开源项目活跃度、star、实现细节会快速变化,使用前请回验仓库现状。

## 结论速览(TL;DR)

- **赛道分三派**:① 设计编辑器派(canvas + 原生 AI)② Prompt→产物 agent 派(skills/CLI/MCP)③ App/全栈 builder 派。本项目(agent 控制台 + 想加"原型设计")语义上最贴近 ①② 的交集。
- **两个锚点项目身份**:`opendesign` = `nexu-io/open-design`(②派代表);`openpencil` = `open-pencil/open-pencil` + `ZSeven-W/openpencil`(①派代表)。
- **没有"既 AI-native 设计工具、又能作为可编辑 React 19 library 嵌入"的现成开源项目**。所有 `@open-design/*` 包 `private:true`,npm 上零个可装,**只能 fork/vendor 源码**。
- **OpenDesign 倾向成立,但以"借鉴机制"为主而非"整体嵌入"**:它的 daemon/CLI/MCP 方向与本项目相反(web 控制 CLI vs CLI 编排);真正值得搬的是 **GenUI declarative surface 协议**(agent 请求受控 UI,~300 行可照搬)、**iframe sandbox 安全模板**、**token-contract 机制**。
- **最小复刻三步**:① GenUI surface(给 claude2 流加可中断问询)→ ② iframe sandbox 预览(agent 产出 HTML/JSX)→ ③ agui-adapter(可选,生态投资)。

## 背景与目标

本项目(agents-remote)是网页控制 Codex/Claude agent 的控制台(React 19 + Vite + TS + TanStack Router/Query + Jotai + Tailwind + Bun),希望在网页里增加"原型设计"能力。用户接触到的两个开源项目作为调研锚点:

- **OpenDesign**(`nexu-io/open-design`):开源 Claude Design 替代,prompt → 原型/landing/dashboard/slides,以 skills + CLI + MCP server 三件套发行。
- **OpenPencil**(`open-pencil/open-pencil` / `ZSeven-W/openpencil`):AI-native 设计编辑器,打开 `.fig`/`.pen`,带 headless SDK。

调研目的:① 盘点 Reddit 社区视角的赛道竞品与特点/实现机制;② 判断这些工具是否有利于嵌入本项目的 React 19 网页。用户最终倾向 OpenDesign,因此本文以 OpenDesign 为深度剖析重点。

> 证据强度约定:**✅ 确证**(官方/源码/一手热帖)、**🟡 推测**(架构推断)、**⚠️ 弱证据**(社区二手转述,直发帖稀缺)。OpenDesign 深度部分全部经源码逐行验证;竞品全景部分多为社区弱证据。

## 一、赛道全景(三派划分)

Reddit 讨论常把三个不同物种混在一起,先分派才好对比:

| 派别 | 核心机制 | 代表项目 | 与本项目契合度 |
|---|---|---|---|
| **① 设计编辑器派**(canvas + 原生 AI) | AI 直接操作 canvas 节点/真实 DOM | OpenPencil、Onlook、Penpot(+MCP) | 最贴近"让 agent 在画布上做设计" |
| **② Prompt→产物 agent 派**(skills/CLI/MCP) | agent 生成代码/文件,产物落盘 | OpenDesign、SuperDesign、open-codesign | 契合"网页控制 agent"形态 |
| **③ App/全栈 builder 派** | prompt → 可运行 app | Dyad、bolt.diy、v0/Lovable/Bolt(闭源) | 偏 app 生成,与"设计"语义最远 |

## 二、竞品对比(Reddit 社区视角 + 实现机制)

### 开源竞品(按派别)

| 项目 | 派别 | 技术栈 | 生成机制 | 可嵌入性 | License | 社区评价 |
|---|---|---|---|---|---|---|
| **nexu-io/open-design** | ② | Next.js16 + React18 + Node daemon + Electron | 生成 HTML/JSX → iframe `srcdoc` | ❌ 无 SDK,整站/iframe | Apache-2.0 | ⚠️ "Reddit 上作为 Claude Design 免费替代走红",产物落盘不锁 vendor |
| **open-pencil/open-pencil** | ① | **Vue3** + CanvasKit WASM + Yoga + Tauri | MCP 工具操纵 PenNode 树(向量图) | 🟡 仅 Vue SDK(`@open-pencil/vue`),无 React | MIT | ⚠️ XDA:"AI 住在编辑器内直接操作 canvas"是它对 Penpot 的差异化 |
| **ZSeven-W/openpencil** | ① | **React19** + TanStack Start + CanvasKit + Nitro + Electron | AI 输出 PenNode(JSONL 流式上画) | ⚠️ 有 React19 SDK 但**只读 viewer**,不可编辑 | MIT | ⚠️ 项目较新(2026-01 动工),社区规模评价未形成 |
| **OpenCoworkAI/open-codesign** | ② | **React19 + Vite6 + Tailwind4 + Zustand** + Electron | 生成 HTML/JSX → iframe(esbuild-wasm + import maps) | ❌ 无 SDK,整站/iframe | MIT | ⚠️ 栈几乎和本项目一致,但无嵌入 SDK |
| **onlook-dev/onlook** | ① | Next.js + Tailwind(CodeSandbox SDK 沙箱) | 直接编辑真实 React app 的 DOM,code 即真相 | ❌ 无 SDK | Apache-2.0 | ✅ HN 404 分热帖,"点击编辑+实时更新+回退代码"获赞;吐槽"又 tailwind+react" |
| **superdesigndev/superdesign** | ② | BYO model,跑在 IDE 内 | 开源 AI design agent | ❌ | MIT | ✅ awesome-claude-design:"唯一住在 IDE 里的开源设计 agent" |
| **penpot/penpot** | ①(非 AI-native) | ClojureScript + Rust/WASM(Skia) + Clojure 后端 | 纯设计工具;2026 走 MCP 让外部 AI 读写设计文件 | ❌ plugin 跑在隔离 iframe(方向反了),无画布嵌入 SDK | MPL-2.0 | ✅ self-hosted 圈公认最佳 Figma 替代;⚠️ 吐槽"无原生 on-canvas AI" |
| **dyad-sh/dyad** | ③ | 桌面 app | 本地代码,无 lock-in | ❌ | 开源 | ✅ **Reddit 出镜率最高**,作者横扫 r/ChatGPTCoding/LocalLLaMA/selfhosted 高赞帖 |
| **stackblitz-labs/bolt.diy** | ③ | WebContainer(WASM 跑 Node.js) | 浏览器内 full-WASM app 生成 | ❌ | 开源 | ✅ Bolt.new 官方开源版,机制明确:VFS+进程+集成终端+一键部署 |
| **wandb/openui** | ② | React + Vite + **Jotai** + FastAPI | prompt→HTML 流式 → iframe + Monaco | ❌ 无 SDK | Apache-2.0 | 前端栈与本项目部分重合,但无嵌入 SDK |
| **tambo-ai/tambo** | (GenUI runtime) | **React SDK**(`@tambo-ai/react`) | LLM 调 tool 生成 props → 流式渲染已注册 React 组件 | ✅ Provider + hooks 嵌入(无画布) | MIT | 唯一真正可嵌入且方向契合,但**不是设计工具**,是 runtime GenUI |

### 闭源参照(Reddit 所有对比的锚点,本项目的功能也会被拿来和它们比)

**v0 / Lovable / Bolt.new / Figma Make / Claude Design**。Reddit 高频铁三角是 **v0 vs Lovable vs Bolt.new**;设计语义层高频对比是 **Claude Design vs Figma Make**。社区对 Claude Design launch 的核心吐槽:"每个产物长得都一样"。⚠️ 注意 GitHub 上的 `anthropic-claude-design/claude-design` 是 typo-squat 假仓库。

### Reddit 社区最常被拿来互相比较的高频组合

1. **v0 vs Lovable vs Bolt(new)** — 最高频铁三角。
2. **Claude Design vs Figma Make** — 设计语义层(前者赢 design-system coherence + 多形态输出,后者赢 Figma-native 工作流)。
3. **OpenPencil vs Penpot** — 围绕"有没有原生 on-canvas AI"的对照。
4. **Penpot + Figma MCP vs 原生 AI 设计工具** — r/mcp / r/FigmaDesign 圈讨论 MCP 路线 vs 原生 AI 路线。

### 协议层

**MCP 已是这一赛道事实标准**(open-design / open-pencil / ZSeven-W / pencil.dev / penpot 全部支持)。**AG-UI(CopilotKit 主导定义的开放 agent↔UI 事件协议)是新兴层**,OpenDesign 已落地,核心理念是"agent 请求 UI surface,由受控组件渲染,而非 agent 写任意前端代码"。

## 三、OpenDesign 深度剖析(重点)

> 以下结论全部经 `~/repos/open-design` shallow clone 源码逐行验证。仓库版本 `0.14.1`,Node ~24,pnpm workspace,Apache-2.0,76.8k★。

### 3.1 DESIGN.md 契约机制

**机制**:DESIGN.md 是 **prompt-context 契约(数据层)**,不是代码生成产物,也不是 schema 校验源。它是 active design system 的一等文件,被 daemon 的 prompt composer 读入并嵌入 system prompt 的 token 数据层(palette/typography/spacing),明确 "treated as data not instructions"。

- **生成**:`design-systems/` 是 154 个内置目录(airbnb/apple/ant/…),每个含 `DESIGN.md` + 可选 `tokens.css` + `components.html` + `USAGE.md`,来源是 `apps/daemon/src/design-systems/{import,github-import,shadcn-import,token-contract}.ts`(从真实项目 import + token 契约重建)。用户也能 `od design-systems` 自建。
- **消费**:`apps/daemon/src/prompts/system.ts` 是 composer,在 system prompt 里堆叠:official-system(专家人格)→ discovery(交互规划)→ **active design system 的 DESIGN.md + tokens.css + components manifest** → active skill 的 SKILL.md → deck framework。
- **格式**:纯 Markdown,无强制 schema。真正机器可校验的是 `token-contract.ts` + `token-schema.ts`——把 `tokens.css` 的 `:root` CSS 变量解析成结构化 token 契约。
- **与"产物落盘"的关系**:DESIGN.md 是**输入约束**,不是产物。产物(HTML/deck/canvas)落盘到 project dir,是 agent 输出;DESIGN.md 约束 agent 怎么生成。

✅ 确证(`prompts/system.ts` L1-31/L397-424、`design-systems/` 实际目录、`prompts/panel.ts` L21-34)

**对本项目的意义**:本项目的 `docs/design/DESIGN.md` 已经是这套哲学的轻量版(权威设计标尺)。OpenDesign 把它工程化成了「design system 目录 + token 契约 + prompt composer 注入」。**最值得借鉴的是 token-contract 机制**(把 CSS :root 变量解析成可校验契约),而非 DESIGN.md 文本本身。

### 3.2 skills + CLI + MCP 三件套

**关键认知:它们是同一知识库的三种投影,不是三个独立系统。**

| 层 | 职责 | 形态 |
|---|---|---|
| **skills/**(163 个) | 每个 = 一个产物品类的工作流知识包(poster/deck/canvas/d3…)。frontmatter 声明 `triggers`/`od.mode`/`od.category`。多数是**目录条目**(指向上游 anthropic/google-labs skills repo),少数带 `assets/`+`references/` | `skills/<name>/SKILL.md` |
| **`od` CLI**(35 个顶层命令) | 本地编排入口。`SUBCOMMAND_MAP`:artifacts/media/mcp/research/plugin/ui/marketplace/brand/project/run/files/templates/chat/daemon/skills/design-systems/export/…。**完全 headless 可用**(UI 是效率层不是 runtime 依赖) | `apps/daemon/src/cli.ts` |
| **MCP server** | 把 OD 能力暴露给**外部 code agent**(claude/codex/cursor)的 stdio 桥。17 个 tool + 3 类 resource | `apps/daemon/src/mcp.ts` |

**MCP server 暴露内容**(`mcp.ts` L155-482):
- Tools(17,含可写):`list_projects` `get_active_context` `get_artifact` `get_project` `get_file` `search_files` `list_files`(只读)/ `create_artifact` `write_file` `delete_file` `create_project` `start_run` `get_run` `cancel_run` `list_skills` `list_plugins` `list_agents`(含可写)。
- Resources(3 类 URI):`od://focus/active`(JSON)、`od://skills/<id>/SKILL.md`、**`od://design-systems/<id>/DESIGN.md`** ← DESIGN.md 在此被 MCP 暴露为可被 agent `read_resource` 的 URI。

**skills 怎么触发**:不是自动执行脚本。SKILL.md 是**agent 可发现的知识**——通过 `list_skills` 或 `od://skills/*/SKILL.md` 被 agent 读到,agent 自己决定按 skill 描述工作流干活。所谓"155+ 内置 skills"多是上游 skills 的目录广告,真正 assets 要去上游装。

**`od mcp install <agent>` 改了什么**(`mcp-agent-install.ts`):
- 支持 14 个 agent(claude/codex/cursor/copilot/openclaw/antigravity/pi/vibe/hermes/cline/kimi/kiro/trae/opencode)。
- **3 种注册策略**(按 agent 能力选):
  - `cli`:agent 自带 `<bin> mcp add`(claude/codex/kimi)→ shell out,继承 agent 的 merge 规则。
  - `json`:agent 读 JSON 配置(cursor/copilot/cline/opencode/…)→ deep-merge 一个 server entry,**不覆盖文件其余部分**。
  - `manual`:格式未确证(pi/hermes/vibe)→ **拒绝写**,只打印可粘贴片段 + best-known 路径(避免污染用户配置)。
- planning 是纯函数(无 fs/spawn,可单测),executor 在 cli.ts 做 IO。

✅ 确证(`mcp.ts` TOOL_DEFS、`cli.ts` SUBCOMMAND_MAP L308、`mcp-agent-install.ts` AGENT_SLUGS + 3 策略)

**对本项目的意义**:本项目是 **web 控制已存在的 claude/codex CLI**,不是"让外部 agent 调 OD"。所以 **MCP server 整套方向相反**(OD 当 server、agent 当 client;本项目是 web 当 controller、CLI 当 server)。**但 `od mcp install` 的 per-agent 配置写入逻辑(14 agent × 3 策略 + planning/执行分离 + manual 拒写安全策略)极具参考价值**——若未来 web 要管理用户本地多个 agent 配置,可直接借鉴。skills 作为"agent 可发现的品类工作流知识"也是可直接复用的形态。

### 3.3 AG-UI 协议适配

**`@open-design/agui-adapter`**(`packages/agui-adapter/src/`,3 文件 312 行,**纯 TS,仅依赖 `@open-design/contracts`**):

- **方向**:OD native event → AG-UI canonical wire shape,**单向 encode**(daemon 发,web/CopilotKit 收)。`description` 明写 "No node:fs imports — daemon emits, web/CopilotKit consumes"。
- **映射**(`encode.ts` `encodeOdEventForAgui`,一个 switch):
  - `message_chunk` → `agent.message`
  - `tool_call` → `tool_call`
  - `state_update` → `state_update`(dot-path + value)
  - `run_started`/`end` → `run.lifecycle`
  - `pipeline_stage_started/completed` → `run.lifecycle`
  - **`genui_surface_request` → `ui.surface_requested`**(surfaceId + surfaceKind ∈ form/choice/confirmation/oauth-prompt + payload)
  - `genui_surface_response` → `ui.surface_responded`
  - `genui_surface_timeout` → `ui.surface_responded`(respondedBy='auto')
  - 其他 → `null`(relay 丢弃)
- **AG-UI 事件全集**(`types.ts`):6 种 kind——`agent.message` `tool_call` `state_update` `ui.surface_requested` `ui.surface_responded` `run.lifecycle`。注释明确这是 AG-UI 的 minimum surface,OD 只用了 Declarative tier(form/choice/confirmation/oauth-prompt)。

**SSE 流 `/api/runs/:id/agui`**(`routes/runs.ts` L1348-1398):先回放历史 events(支持 `Last-Event-ID`/`?after` 断点续传),run 未终态则订阅 `run.clients`(adapter 把 native event 转 AG-UI 后 `sse.send`),终态则 `sse.end()`,`res.on('close')` 清理订阅。**核心:native event 先存进 run.events,agui adapter 是无状态投影层,可对同一 run 同时供 native `/events` 和 agui `/agui` 两条 SSE。**

**CopilotKit/AG-UI 角色**:AG-UI 是 CopilotKit 主导定义的开放协议,CopilotKit 是协议定义方 + 参考消费方。OD 是协议消费方 + 自己的 daemon 是生产方——它没用 CopilotKit 的 runtime,只是让自己的 event stream 说 AG-UI 方言,**这样任何 AG-UI client(含 CopilotKit)都能消费 OD run**。

✅ 确证(全 3 文件逐行读;SSE 路由逐行读)

**对本项目的意义**:**整个项目里最干净、最可独立抽取的模块**。本项目的 claude2 session 已有等价的 native event 流(JSONL + relay live buffer)。agui-adapter 是 312 行纯函数映射,**复制粘贴 + 改 event union 即可**让 session 也说 AG-UI 方言。但要注意:OD 的 GenUI surface 事件(`genui_surface_*`)是 OD 自己加进 union 的,**AG-UI 协议本身没有这套 surface 语义**——adapter 把它强行映射成 `ui.surface_requested/responded`,这部分是 OD 私有扩展蹭 AG-UI 的壳。

### 3.4 GenUI surface 协议(嵌入最关键)

**结论先行:这是两套并存机制,但都受控,没有"agent 写任意前端代码注入"这种东西。**

#### 机制 A:Declarative 受控 surface(内置,可照搬)

agent 发 `genui_surface_request{ payload }`,payload 是 **JSON Schema 数据**,host 用**内置 React 组件**渲染,agent 永远不生成 UI 代码。

- 数据契约 `GenUISurfaceSpec`(`contracts/plugins/manifest.ts` L89-127):`id` / `kind`∈{form,choice,confirmation,oauth-prompt} / `persist`∈{run,conversation,project} / `schema`(JSON Schema) / `prompt` / `oauth` / `timeout`+`onTimeout`+`default`。
- 客户端消费(`apps/web/src/components/GenUISurfaceRenderer.tsx`,958 行),host 按 `kind` 渲染:
  - `confirmation` → Continue/Cancel 两按钮。
  - `choice`(单 enum 属性)→ 按钮组;多属性 → JSON 表单。
  - `form`(JSON Schema object)→ 自研 `JsonSchemaFormSurface`(**故意不用 react-jsonschema-form,依赖面最小**),支持 string/number/integer/boolean/enum,超集 fallback 到 JSON textarea。
  - `oauth-prompt` → Authorize 按钮。
- 响应回传:`POST /api/runs/:runId/genui/:surfaceId/respond`。
- 持久化:`persist` tier 决定答案存活到 run/conversation/project。

#### 机制 B:Bundled-component surface(plugin 自带组件,沙盒)

当 `GenUISurfaceSpec.component.path` 声明时(capability `genui:custom-component` gated),host 把 plugin 自带的 HTML/组件塞进 iframe。

- iframe `src` = `/api/plugins/:pluginId/asset/<sanitized path>`。
- **`<iframe sandbox="allow-scripts">`——只有 allow-scripts,无 allow-same-origin/allow-forms/allow-popups/allow-downloads**。
- 通信单向 `postMessage({kind:'genui:respond', surfaceId, value})`,parent 按 shape+surfaceId 过滤。
- path sanitize(`sanitizePluginComponentPath`):剥控制字符、拒 `javascript:`/`data:`/任意 scheme、拒 `..`、URL-decode 3 次防绕过。
- `component.sandbox` 字段预留 `'react'` tier 但 **v1 一律走 iframe**。

#### 两套边界

- **机制 A**:agent 只产出**数据**(JSON Schema + payload),UI 完全由 host 内置组件决定。最安全,agent 无法越权渲染。
- **机制 B**:plugin**作者**(非 agent)写组件,经 capability gate + sandbox。用于需要高保真 UI(diff review/canvas annotation/3D preview)的场景。plugins-spec 明确:**v1 surface kind 是封闭的**,plugin 想要新 UI 必须走 B 的 gated sandbox,不能 mint 新内置 kind。

✅ 确证(`GenUISurfaceRenderer.tsx` 全文 958 行、`manifest.ts` L89-127、`genui.ts` L50、plugins-spec L2279)

**对本项目的意义(嵌入判断核心)**:这正是"agent 请求 UI surface,由受控组件渲染"的工程化范本。**机制 A 几乎可以照搬**:给 claude2 流加一个 `surface_request` 事件类型 + 一个 `<SurfaceRenderer>` 组件(form/choice/confirmation 三件套 ≈ 300 行)+ 一个 respond 回传 endpoint,就拿到 agent 可中断问询能力。机制 B 的 sandbox attr 方案(`allow-scripts` only + postMessage shape filter + path sanitize)是**本项目做"agent 生成可预览 HTML"时的安全模板**。

### 3.5 代码生成 + iframe 渲染机制

三条独立代码路径(`srcdoc.ts` 零 babel/react 引用,只管纯 HTML):

**路径 1:纯 HTML artifact → `srcdoc.ts`(2701 行)**:agent 生成完整 HTML → `buildSrcdoc(html, opts)` → iframe `srcDoc`。

**路径 2:JSX/TSX artifact → `react-component.ts`(231 行)**:
1. `prepareReactComponentSource(source)`:用**正则(非 AST)**剥 import/export——`import ... from 'react'` 重写成 `const X = window.React`,其他 import 全删;`export default function App` → `function App` + 记 defaultName。
2. `buildReactComponentSrcdoc`:拼完整 HTML doc,内联 `<script src="https://unpkg.com/react@18/umd/react.development.js">` + `react-dom` + **`@babel/standalone`**(三个都从 **unpkg CDN 拉,非 vendored**)。
3. iframe 内运行时:`window.Babel.transform(source, {presets:['typescript','react']}).code` → `(0, eval)(compiled)` → 找 `window.__OpenDesignComponent`/`App` → `ReactDOM.createRoot(root).render(createElement(Component))`。错误进红框。

**路径 3:powered preview(`powered-preview.ts`,98 行)**:给需要同源 Web Worker/Storage/WASM/SharedArrayBuffer 的 artifact(WebGL splat、ffmpeg.wasm)。daemon 报自己 base origin,host 把 `127.0.0.1`↔`localhost` swap 得到 cross-origin loopback origin,从那拉 `/powered/*`;daemon 给 `/powered/*` 盖 `Document-Isolation-Policy: isolate-and-credentialless`。

**安全边界**:路径 1/2 = opaque-origin sandbox(parent 省略 allow-same-origin),运行时锁在 preview doc 内;路径 3 = cross-origin + COOP/COEP 隔离。

**导出**:浏览器端 PDF = popup + `window.print()`;HTML = Blob 下载;ZIP = artifact + DESIGN-HANDOFF.md;MD = 源码 verbatim。daemon 端 deck→PDF/PPTX 用 `pdf-lib` + `pptxgenjs`。

✅ 确证(`react-component.ts` 全文、`powered-preview.ts` 全文、`exports.ts`、daemon deps)

**对本项目的意义**:路径 2(正则剥 import + CDN Babel + eval)是**约 230 行可移植的"agent 写 React,浏览器即时预览"方案**,但安全性完全依赖 iframe sandbox attr。若做"agent 生成预览"功能,这套可直接 fork,但要补 CSP + 评估 CDN 依赖(离线/内网场景需 vendor babel)。路径 3 的 cross-origin loopback swap 是处理 WebGL/WASM 的高级技巧,本项目大概率用不上。

### 3.6 "嵌入真实交互 HTML 到 canvas template" 语义澄清

**这个特性在源码里不是字面意义的"往 canvas DOM 元素里塞 HTML"**。"canvas" 在 OD 语境 = 设计平面/产物画布(README:"instead of pushing pixels on a canvas, it delivers single-page artifacts in real CSS")。

**实际机制 = 3.4 机制 B + 3.5 的组合**:
- `design-templates/`(115 个)是产物骨架模板(blog-post/contact-widget/audio-jingle…),每个是一组 seed 文件,agent 选中后在模板基础上生成。
- "交互 HTML" 的承载就是 iframe sandbox(机制 B 的 plugin component,或机制 5 的 artifact srcdoc)。

🟡 部分确证(`design-templates/` 115 目录实存、plugins-spec L2279 + README canvas 语义;但"canvas template"作为独立数据结构**未在源码找到**,推断它是产品话术而非独立技术概念)

**对本项目的意义**:不要被"canvas template"这个词误导。本项目需要的"agent 产出可交互预览" = iframe sandbox + 一组 seed 模板,不需要专门的 canvas 数据结构。

## 四、可借鉴/可嵌入边界

### 可独立抽取借鉴(低耦合,fork 友好)

| 模块 | 文件 | 抽取成本 | 对本项目的价值 |
|---|---|---|---|
| **agui-adapter** | `packages/agui-adapter/src/*.ts`(312 行) | **极低**:纯 TS,仅依赖 contracts,零 fs。复制 3 文件 + 改 event union | 让 claude2 session 说 AG-UI 方言,可被 CopilotKit 等消费 |
| **GenUI declarative surface 协议** | `contracts/plugins/manifest.ts` GenUISurfaceSpec + `events.ts` + `GenUISurfaceRenderer.tsx` form/choice/confirmation 部分 | **中**:renderer 是单体 958 行,但 form/choice/confirmation 三件套 ≈ 300 行可独立 | agent 可中断问询能力(permission 确认/选项选择) |
| **iframe sandbox 安全模板** | `GenUISurfaceRenderer.tsx` SandboxedComponentSurface + `react-component.ts` | **低**:纯前端,~250 行 | 做"agent 生成 HTML 预览"时的 sandbox + postMessage + path sanitize 范本 |
| **token-contract 机制** | `design-systems/token-contract.ts` + `token-schema.ts` | **中**:需 design-systems 目录生态配合 | 把本项目 DESIGN.md 从文本升级成可校验 token 契约 |
| **per-agent MCP 配置写入逻辑** | `mcp-agent-install.ts`(444 行,14 agent × 3 策略) | **低-中**:纯函数 planning + executor 分离 | 若未来管理用户本地多 agent 配置,直接借鉴 |

### 耦合死在 OD 自己栈里的(不建议抽取)

- **CLI `od`**(35 命令):和 daemon HTTP API + project/run/skill 生态深度耦合,且方向相反(本项目是 web 控制 CLI,不是 CLI 编排)。
- **daemon 整体**(express + better-sqlite3 + node-pty + langfuse + posthog + Electron 壳):重型本地运行时,本项目 Bun api + 现有 claude2 runtime 已覆盖等价能力。
- **MCP server**:方向相反(OD 当 MCP server 给外部 agent;本项目是 web 当 controller)。
- **prompt composer**(`prompts/system.ts`):和 OD 的"专家设计师人格 + 5 维 critique + direction picker"产品定位绑定,agent 控制台用不上这套 design-specific 人格。
- **163 个 skills / 154 design-systems / 115 templates**:内容资产,非代码,按需 cherry-pick 个别 skill 思路即可。

### npm 可装性(关键事实)

**全部 20 个 `@open-design/*` 包 `"private": true`**(`packages/*` + `apps/*` 逐个验证,零个非 private)。**npm 上没有 `@open-design/agui-adapter` 等任何包可装**。要用只能 fork/vendor 源码。

## 五、最小复刻切入点建议

给本项目的 React 19 + Vite + TS + Bun agent 控制台,**最高性价比的三步**:

1. **GenUI declarative surface(最先做)**:在 claude2 事件流加 `surface_request{kind, schema, prompt}` 事件 → web 加 `<SurfaceRenderer>`(form/choice/confirmation,~300 行,参考 `GenUISurfaceRenderer` 的 JSON Schema→React 表单部分,**不要抄 diff-review/sandbox-component**)→ 加 respond 回传。这是 agent 可中断问询的最小闭环,和本项目的 permission 模式天然契合。

2. **iframe sandbox 预览(按需)**:若要让 agent 产出可预览 HTML/JSX,fork `react-component.ts`(231 行,正则剥 import + CDN Babel + eval + opaque sandbox)。**务必补 CSP + 评估 CDN 依赖**(离线/内网要 vendor babel)。

3. **agui-adapter(可选,扩展性投资)**:若想让 session 可被 CopilotKit 等 AG-UI client 消费,复制 312 行 adapter + 把 native event 映射进去。短期 ROI 低,长期生态价值高。

**不建议碰**:OD 的 daemon/CLI/MCP/prompt-composer/design-systems 生态——耦合重、方向不同、本项目现有栈已覆盖。

## 六、证据强度与 deepwiki 幻觉修正记录

全程未采信 deepwiki 的任何包名/文件名/API 描述,所有 load-bearing 结论均有源码行号背书。修正记录:

| deepwiki / 二手来源的说法 | 源码证据 | 修正 |
|---|---|---|
| "vendored React 18 + Babel standalone" | `react-component.ts` L5-7 三个硬编码 `https://unpkg.com/...` URL | **从 unpkg CDN 实时拉,非 vendored** |
| (历史)虚构不存在的 npm 包名 | 20 个 `@open-design/*` 包全部 `"private": true` | **npm 上零个可装的 OD 包**,全部 workspace 内部,只能 fork |
| "Template Mode & Design System Mode" 像独立运行时 | `design-templates/` 是 seed 资产目录;"canvas template" 无独立数据结构 | **template/canvas 是产品话术语义,非独立技术模块**;承载仍是 iframe sandbox |

竞品全景部分(Reddit 视角)多为社区弱证据:Onlook/Dyad/Penpot 有 Reddit 一手热帖;OpenDesign/OpenPencil/SuperDesign 的 Reddit 直发帖稀缺(传播靠 X/博客/awesome 仓库),其社区评价多为二手转述。

## Sources

- [nexu-io/open-design](https://github.com/nexu-io/open-design)(源码逐行验证:root package.json + agui-adapter + react-component.ts + powered-preview.ts + GenUISurfaceRenderer.tsx + mcp.ts + mcp-agent-install.ts)
- [open-pencil/open-pencil](https://github.com/open-pencil/open-pencil)、[ZSeven-W/openpencil](https://github.com/ZSeven-W/openpencil)、[OpenCoworkAI/open-codesign](https://github.com/OpenCoworkAI/open-codesign)
- [onlook-dev/onlook](https://github.com/onlook-dev/onlook)、[penpot/penpot](https://github.com/penpot/penpot)、[tambo-ai/tambo](https://github.com/tambo-ai/tambo)、[wandb/openui](https://github.com/wandb/openui)、[dyad-sh/dyad](https://github.com/dyad-sh/dyad)、[stackblitz-labs/bolt.diy](https://github.com/stackblitz-labs/bolt.diy)
- [AG-UI protocol (CopilotKit)](https://github.com/CopilotKit/CopilotKit)
- [awesome-claude-design(社区对比汇总)](https://github.com/rohitg00/awesome-claude-design)
- [XDA: OpenPencil 实测](https://www.xda-developers.com/ditched-figma-for-open-source-tool-ai-does-what-figma-cant)
- Reddit 一手热帖:[Dyad r/ChatGPTCoding](https://www.reddit.com/r/ChatGPTCoding/comments/1kh88k1)、[Claude Design r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1so3k1y)、[Onlook HN](https://news.ycombinator.com/item?id=44127653)
