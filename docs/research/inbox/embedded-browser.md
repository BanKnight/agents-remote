# 嵌入式浏览器（embedded browser）调研

> 状态：基础要素已对齐（2026-07-30），**待深化**，位于 `docs/research/inbox/`（未定型区，非沉淀结论）。三个新需求（wiki / pages / browser）统筹排序中，pages 排第一；browser 与 wiki 谁第二谁第三待深化讨论后定。pages 已细化见 `../pages-static-hosting.md`，wiki 调研见 `./llm-wiki-okf.md`。

## 需求基础要素

- **定位**：在控制台内嵌入一个**真实 Chromium 视图**，Agent 通过 CDP（Chrome DevTools Protocol）驱动，人可随时用鼠标键盘接管，可视、不离开工作区。
- **和 pages 的关系**：不直接绑定（pages 是静态托管，browser 是可控浏览器），但 browser 能连任意服务——包括 pages 托管的内容、本地 dev server、外部站点。
- **核心场景**：
  1. 可视化看 Agent 做登录 / 爬虫操作（观察 + 接管自动化）。
  2. 改本地代码，在 browser 里实时看变化（类 herdr "preview local dev server without leaving"）。
- **当前阶段**：只定技术方案落文档；后续和 Files/Git/Terminal/Agent/pages/wiki 合并排版。

## 参考实现：herdr-browser

`ogulcancelik/herdr-browser`（Herdr 插件）——在 Herdr pane 里渲染真实 Chromium 视图，通过 CDP 驱动。核心机制与卖点：

- **真实 Chromium + CDP 驱动 + 可视**：Agent 自动化浏览器，但不是 headless 不可见——用户在 pane 里实时看到它操作。
- **人可随时接管**：用鼠标键盘接管，不会 detach 自动化 client。自动化 client 与人共存在同一视图。
- **定位明确**："不是通用浏览器"——桌面浏览器在 devtools/extensions/video/downloads/右键菜单/IME 上更强，它不竞争这些。用途是**观察和操控自动化** + 在终端里预览本地 dev server，不离开工作区。
- **配置项**（`browser.json`）：`linkOpenPlacement`（split/focus）、`splitDirection`、`focusOnOpen`、`browserZoom`、`showDiagnostics`、`captureBackend`（screenshot/screencast）、`screencastEveryNthFrame`、`screencastPollMs`、`profileRoot`。
- **依赖**：Herdr 0.7.4+、Linux/macOS、Bun、Google Chrome/Chromium、Kitty graphics 兼容终端（Ghostty/kitty/WezTerm）。

**关键机制总结**：真实 Chromium + CDP 驱动 + 可视 + 人可接管。本质是把"agent 的眼睛"放进工作区布局，而不是另开一个无关浏览器窗口。

## 与本项目的差异（待深化）

herdr-browser 是**终端 pane 内**渲染（Kitty graphics protocol），我们是 **Web SPA 内**嵌入——渲染载体不同，这带来关键差异：

- **渲染方式**：herdr 用 Kitty graphics 在终端画帧（screencast/screenshot 后传帧）；我们在 Web SPA 里嵌入，候选方式不同（iframe？Canvas 帧流？WebRTC？CDP screencast over WS？）。这是 browser 待深化的核心决策点。
- **移动端冲突**：真实 Chromium 嵌入 + CDP 实时视图在移动端几乎不可行（资源重、视图嵌套复杂）。而本项目移动端是首轮体验重点——browser 排序靠后可规避此冲突，但深化时必须正面回答移动端怎么办（降级？仅桌面？）。
- **项目零基础**：项目目前没有任何浏览器自动化基础（grep 确认无 MCP server、无 Chromium/CDP/Playwright 代码）。browser 是三个需求里工程量最大、基础设施最新的。

## 待深化问题（进步骤 3 再定）

- **作用域**：per-project resource（和 Files/Git/Terminal/Agent/pages/wiki 并列）还是全局工具？
- **驱动方式**：CDP（同 herdr）还是 Playwright？两者与"人可接管"语义的兼容性不同。
- **SPA 内渲染方式**：iframe / Canvas 帧流 / WebRTC / CDP screencast over WS——各自的可视延迟、交互回传、移动端可行性。
- **移动端策略**：降级方案、仅桌面、还是另寻轻量路径。
- **人接管语义**：自动化 client 与人共存的实现细节（herdr 的"不 detach"如何在 Web 复刻）。
- **与 pages 的协同**：browser 消费 pages 托管内容的默认体验（URL 直接打开？）。
- **MCP 通道复用**：browser 的 Agent 驱动工具是否与 wiki 的 producer 工具共享一条 MCP 通道（一个 MCP server 暴露 wiki + browser 两类工具）。
- **安全边界**：嵌入 Chromium 访问本地 dev server / 外部站点的隔离与权限。
- **与 Terminal 的并列关系**：Terminal 是 PTY，browser 是 Chromium——并列的另一类"运行态视图"，UI 上如何组织。

## 来源

- herdr-browser：https://github.com/ogulcancelik/herdr-browser
- Herdr 官网：https://herdr.dev
- Herdr Agents 文档：https://herdr.dev/docs/agents
- "Herdr: the Tmux for AI Agents" 视频（提到 Herdr 无内置浏览器、可用 Playwright/CDP MCP 替代）：https://www.youtube.com/watch?v=XoitaexiCi0