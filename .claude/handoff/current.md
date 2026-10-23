# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-24(轻/重模板分流收尾 `1f6251d`+`e6518a9`;213 序列的 1/2 完成,剩 3=M5 浮层与审批)

## 一句话状态

**MCP Apps 阶段 5.6 轻/重模板分流完成并提交**:无 mermaid 的 markdown 卡改走 76KB 轻变体(富卡 5.39MB),e2e case1 全链 36s→12.7s;code-review P1(围栏正则漏判面)已修。**此前 213 序列第 2 项(双模式 reviewer 补跑)亦已收口**(GTD 勾选)。**下一步 = 第 3 项:M5 浮层与审批**(sheet/popover 体系 + 服务端聚合审批中心,security-reviewer 必过)。

## 本 session 焦点

### 关键决策(不可丢)

- **轻/重分流的分工**:供给在 api(`MARKDOWN_LITE_UI_URI` = RICH_SPEC 关 withMermaid 的构建期变体,HUB_UI_RESOURCES 注册后 resources/read + api gzip 路由零改动自动获得);**选择在 web 宿主渲染策略**(`contentNeedsMermaid(sc)` + registry uri 函数形态按 structuredContent 解析)。工具 `_meta` 不动——CLI 不透传 `_meta.ui`,外部 host 仍拿富 uri 全能力。
- **code-review P1(围栏正则)**:首版正则锚行首 + 恰好三反引号,漏判 blockquote/list 前缀形态(`> ```mermaid`、`- ```mermaid`)——**marked 15.0.12 实测这些形态真渲染 language-mermaid 且富模板升级出图**。修复 = 去行首锚 + `{3,}`;判定宁宽不窄(误判 lite 唯一后果是围栏按代码块显示,误判 rich 只多传 5.4MB)。在 api 包内跑 marked 验证的方法可复用:`cd api && bun -e 'const {marked} = await import("marked")...'`(根 workspace 解析不到,api 包才有依赖)。
- **探针预置假设漂移又一例(§29)**:富卡探针「script 数 = 4」断言自 M2.2 canvas 批起过期(canvas 占位符使模板恒有 5 个 script 标签,含 1 个空 canvas 槽)——本批回归时才暴露,已修注释+断言。
- **双模式 reviewer 补跑收口(2026-10-23)**:code+design 已于 10-16 跑成并全修(`dcae8c6`),HEAD 复核全在位;security 面 subagent 故障改自查,结论无新增 P0/P1,两项候选判不改(事件窗口不能盲 consume 防陈旧 approval 复活;`void rm` 仅残留临时文件)。

### 进度

- ✅ **213 之 2:双模式批 reviewer 补跑**(GTD 勾选,2026-10-23)
- ✅ **213 之 1:轻/重模板分流**:`1f6251d`(实现 11 文件)+ `e6518a9`(GTD 哈希补记)。验证:api 单测 5+1 / web 单测 7 / 探针 33/33 / 富卡探针 31/31 / e2e 3/3(case1 36s→12.7s,case3 加 mermaid 围栏锁富路径)
- 挂起批(工作区,刻意不提交):`api/src/index.ts` inset-report hunk + `web/src/lib` 三件(keyboard-inset.ts/.test.ts + use-composer-inset-debug-badge.ts,composer 第二次埋点等真机数据);根目录 `.mcp.json` untracked(是否提交由用户定)

### 待办

- **213 之 3:M5 浮层与审批**(sheet/popover 体系 + 服务端聚合审批中心,security-reviewer 必过)→ 之后 M6–M10
- **真机清单(交用户,统一最后验)**:
  1. M3 真实点击选区路径(端到端用调试口 API,真实鼠标点击→引用 需真机)
  2. M2 画布端到端(agent 建画布→手改→commit→agent apply→卡刷新)
  3. 多卡焦点互抢后回卡首次拖画失效(「先点一下卡片」即恢复)
  4. esm.sh 字体被 CSP 拦(系统字体回退)视觉确认
  5. M1 gen-ui 三条(滑块/全屏/回放)
  6. MCP Apps 卡片:轻/重分流后 wiki 页/文件预览加载显著变快(主观感受);含 mermaid 图的页仍出图(升富路径)
- 双模式真机验收(交用户):GUI↔TUI 接力全链

### 易丢的关键上下文

- **探针 lang 坑**:`page.addInitScript(() => localStorage.setItem("lang", "zh"))`。
- **跑测试限内存**:`systemd-run --scope --user -p MemoryMax=2G`。
- **e2e 单 spec**:`bun run e2e mcp-app-card.spec.ts`(run-e2e.ts 支持透传 spec 路径,自起隔离 api+web)。
- **探针点击后必须 waitForTimeout**:postMessage 异步入队,click 后立读 `__msgs` 会竞态(本批 markdown-lite ask 断言踩过,50ms 解决)。
- **tmux**:`ar-dev:api` / `ar-dev:web`;标准重启 `respawn-pane -k`;绝不 kill server。
- **iframe 内容 evaluate**:`frame.locator("body").evaluate(fn)`;`contentFrame()` 返回 FrameLocator。
- **sandbox iframe localStorage SecurityError**:excalidraw 访问 localStorage 的固有噪音,断言须过滤。

---
最后更新:2026-10-24(触发原因:阶段 5.6 轻/重模板分流收尾提交,213 序列 1/2 完成)

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
