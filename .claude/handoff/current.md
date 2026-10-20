# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-20 20:45（MCP Apps 阶段 4 完成：`1578ca9` 实现 + `9072dd1` 双 reviewer 消化，全链收尾）

## 一句话状态

**MCP Apps 阶段 0-4 全部提交且双 reviewer 审查消化完毕**：…→`2347552`（主题+高度）→`1578ca9`（阶段 4 反向通道）→**`9072dd1`（reviewer 修复批：导航守卫 revokedRef 重构 + locale 源修正 + hostCapabilities 声明 + 模板超时/防重入）**。双 reviewer 均 0 P0/P1；全门禁绿（api 1017 / shared 10 / web 859）；模板探针 20/20；api 已 respawn + health OK。**待用户真机验证**（清单见下）。composer 第二次埋点批仍挂起工作区**刻意不提交**。

## 本 session 焦点

### 关键决策（不可丢）

- **MCP Apps 落地总纲（用户拍板）**：「调研完之后就开始落地，除非有需要我拍板的内容否则就全部逐个按里程碑全部实现」。**e2e 推迟到最终里程碑完成后统一写**（用户拍板 2026-10-20：中途探针/单测做开发期验证，最终靠 e2e，效率更好）。
- **阶段 4 取舍（已实现，主文档 §10 已记）**：① ext-apps SDK 再评估结论 = **继续手写桥**（+60 行 vs peer 冲突未解）；② tools/call **代理直调 ProjectWikiService** 不过 MCP 协议层（hub 真无状态；同进程单源；`HUB_APP_TOOLS` 白名单显式映射；`wikiPageStructuredContent` 共享纯函数防漂移）；③ 发送回调**零新管道**（renderer 已持 `ClaudeBridgeContext`，`bridge.sendMessage` = sendToSocket user 帧，不抛错面）；④ 确认框复用 `useConfirm`（双端分流）；⑤ 协议面只做四方法，其余 -32601。
- **阶段 4 协议链**：模板 `sendRequest`（id 多路复用 + pending map）→ postMessage 请求 → web 宿主 `McpAppCard` latest-ref dispatcher（`event.source` 校验 → 按 method 分派 → `reply/replyError` 均校验 `fedWinRef`）→ tools/call 走 `callProjectMcpHubTool`（POST 代理）→ ui/message 走 confirm 闸 → `onSendPrompt`（tool-ui-registry 注入 `bridge?.sendMessage`）。
- **模板回环守卫（新，探针实抓）**：id 消息无 `result`/`error` 时不得当应答——JSON-RPC 2.0 应答必含其一；无此守卫时 file:// 探针（parent===self）下模板自吞请求、真应答遭丢（locale/刷新/追问三条探针假 FAIL 的共同根因）。真实 iframe 环境 parent≠self 不触发，但守卫是协议正确性。
- **历史决策（不重复展开，见主文档 §8）**：单层沙箱（allow-scripts 无 same-origin）；display tool 名单 + kind 双条件；HUB_UI_RESOURCES 单源表；postMessage targetOrigin 必须 `"*"`（opaque origin）；feed-once + fedWinRef 守卫；高度量 `body.scrollHeight`（非 documentElement）。

### 进度

- ✅ 阶段 4 实现全链：模板（request 基建/握手/locale DICT/刷新钮/追问条）+ api 路由 + web client + i18n 两键 + McpAppCard dispatcher + renderer 接线
- ✅ 验证：组件测试 15/15（新增 7 条反向通道用例）+ api 路由测试 29/29 + 模板探针 20/20（握手往返/locale 应用/刷新回灌/追问包装/输入清空）
- ✅ 全门禁 + CSS 硬闸 + touch main.tsx 完整 rebuild（产物含 `mcpHubToolCallFailed`/`unknown app tool`）+ content-type text/css
- ✅ 提交 `1578ca9`（hunk 拆分：composer inset-report 两处 hunk 留工作区）+ api respawn + health
- ✅ 双 reviewer（code/security）审查完成：均 0 P0/P1；security 3 P2（导航检测失效/握手时序窗口[实测不存在]/listener source 校验）+ code 3 P2（同导航问题/locale 取错源/hostCapabilities 矛盾）+ info 若干 → 修复批 `9072dd1`（组件 15/15 + 探针 20/20 + 全门禁 + CSS 闸 + content-type）
- ✅ 主文档 §10（阶段表 + 协议面表 + 取舍记录 + 阶段 4 审查结论 + 待验证/待补）与 §11 对照表更新；index.md 更新；GTD 更新
- ⏳ 真机验证清单交付用户（既有清单 + 阶段 4 两条追加）

### 待办

- **真机验证（交用户）**：既有清单（卡片渲染 + 主题两态 + 高度自适应 + 回退，移动/桌面双端）**追加两条**：①刷新钮点击 → 改 wiki 页后点刷新见新内容回灌（按钮文案应随应用语言显中文）；②追问输入 → 确认框 → 确认后新 turn 出现在会话流（取消不发；Enter 可发送）
- **e2e 收口**（最终里程碑后统一）：GTD 已记
- **e2e 收口**（最终里程碑后统一）：GTD 已记（mock WS 帧 + routeWebSocket 先例；mcp-ui-resource REST 不 mock）
- 挂起批（工作区，刻意不提交）：composer 第二次埋点（api/src/index.ts inset-report hunk + web/src/lib 三件）等真机数据
- TUI hooks 批真机长期观察；阶段 5 等上游 CLI

## 易丢的关键上下文

- **iframe WindowProxy 跨导航恒定**（本批 reviewer 实锤）：`contentWindow` 返回的 proxy 在帧导航后身份不变——**身份比较检测不了帧内导航**；导航信号 = onLoad 同模板 refire（`revokedRef` 模型）。同理「event.source === contentWindow」校验在导航后仍为 true，反向通道熔断只能靠 revokedRef。
- **真实 Chromium 时序实测**：srcdoc iframe 的 load 事件**先于**帧内解析期 postMessage 到达宿主（`["load","message"]`）——onLoad 才设的守卫不会丢握手应答；但 reply 已改挂 revokedRef，不依赖该引擎顺序。
- **TS 模板字符串转义坑**：`WIKI_PAGE_APP_HTML` 里内嵌 JS 的 `\"` 会被 TS 求值成裸 `"` → 浏览器端 SyntaxError（实抓）。内嵌 JS 用单引号字符串包双引号。**改模板后探针必跑**（语法错误 = 20 断言连锁 FAIL + pageerror "Unexpected string"）。
- **探针 parent===self 回环**：file:// 直开模板时 postMessage 到 parent 会回环到模板自身 listener——请求（id 无 result）会先于真应答被自吞。守卫已加（协议正确性）；探针里「请求先于应答」的断言顺序也因此成立。
- **jsdom + Radix Dialog 测试坑（本批结晶）**：需要全局 `NodeFilter` + `HTMLInputElement`/`HTMLButtonElement` 等类（FocusScope 读裸全局）；matchMedia mock 必须带 `addEventListener/removeEventListener`（useIsMobile effect）；Dialog portal 在 body，按钮用 `document.body.querySelectorAll("button")` 找；`mock.module` factory 里要显式加 `callProjectMcpHubTool: toolCallMock`。
- **生成层损坏对策（历史 8 次事故结晶）**：小步 Edit + 纯英文骨架 + 每次写入后校验；连续两次写入失败就停。本段再次验证（一次 new_string 自丢 `currentTitle` 拼接，靠 rg 回读抓到）。
- **提交拆分手法**：混合 hunk 用 `git diff` 导出 + awk 过滤目标 hunk + `git apply --cached`；awk：`/^@@/ { skip = ($0 ~ /目标 hunk header/) } !skip { print }`。
- **api 测试事实**：jsonError 响应形状 = `{error:{code,message}}`；writePage 存盘 content 补尾随 `\n`（readPage body 带它）；wiki 路径 = `{root}/{project}/wiki/{slug}.md`。
- **探针跑法**：`systemd-run --scope --user -p MemoryMax=2G bun …`；用 bun 不用 node；`_diag-` 前缀一次性脚本用后删。
- **tmux**：`ar-dev:0` = api、`ar-dev:1` = web；标准重启 `respawn-pane -k`；绝不 kill server。

---
最后更新：2026-10-20 20:45（触发原因：阶段 4 完成链收尾——`1578ca9` 实现 + `9072dd1` reviewer 消化 + 文档/GTD 更新）
