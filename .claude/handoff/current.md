# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-24(审批中心补强批完成 `2d6705a`;v2 收口核实 + 补强两批连做;等待用户提新需求)

## 一句话状态

**审批中心补强批完成**:①服务端登记排除 ExitPlanMode/AskUserQuestion(shared `isOneClickApprovable` 谓词单源,与客户端托盘口径一致)②approvals WS 断线重连(500ms + 防重入);code-reviewer 通过(2 P3 记档),单测 +6/探针 43/43/全门禁绿,commit `2d6705a`。**此前本 session 完成了 v2 里程碑 M5–M10 收口核实**(`81f0707`,全部早已于 2026-09-21/22 完成)。等待用户提新需求。

## 本 session 焦点

### 关键决策(不可丢)

- **GTD 过期条目的代价(教训)**:「M5 浮层与审批 → M6–M10」漏勾条目让多个 session 误判「M5 待做」——**完成状态以总纲 §6 表 + 收口补记为准,GTD 勾选可能滞后**;发现矛盾先查收口补记再动手。
- **审批补强批的拍板**:排除而非完整分派——AskUserQuestion/ExitPlanMode 的一键 allow 语义错误,但完整分派(mode 选择/answers 表单)与会话内 UI 重复承载违反多端同构;排除点在 ApprovalCenter 入口(非 registry 层),blocked 状态信号保留,PWA push 随排除消失(用户拍板接受)。缺口 3(审批卡持久化)调研证明无真实对象(live 缓冲重放可恢复 + runtime 重启自然失效);缺口 5(ACP request_permission 接入)是新功能另批,修复方向已记档(transport 抽象 + pending Promise)。
- **code-review P3-①(混合审批提前收口,记档)**:Bash 卡与被排除的复杂审批同时 pending 时,应答已登记卡会误触发 approval_settled(blocked→working)——仅状态点失真、应答后自愈;彻底修需从「排除登记」改「登记+不进快照标记」,待 ACP 批一并评估。
- **fake timers × react-query 测试坑**:notifyManager 用 setTimeout(0) 调度通知,fake timers 冻结下 emit 帧后需 `vi.advanceTimersByTime(1)` 冲刷,否则断言读到旧值(本批 web 测试踩过)。

### 进度

- ✅ **v2 收口核实**:`81f0707`(总纲表 M6–M10 补 ✅ + GTD 漏勾修正 + handoff)
- ✅ **审批中心补强批**:`2d6705a`(两修复 + 三记档 + 2 P3 记档;api 1104/shared 11/web 907 全绿)
- 挂起批(工作区,刻意不提交):`api/src/index.ts` inset-report hunk + `web/src/lib` 三件(keyboard-inset.ts/.test.ts + use-composer-inset-debug-badge.ts,composer 第二次埋点等真机数据);根目录 `.mcp.json` untracked(是否提交由用户定)

### 待办

- **用户新需求(待提)**:用户已选「其他新需求」方向,具体内容待用户说明。
- **真机清单(交用户,统一最后验)**:
  1. M3 真实点击选区路径(端到端用调试口 API,真实鼠标点击→引用 需真机)
  2. M2 画布端到端(agent 建画布→手改→commit→agent apply→卡刷新)
  3. 多卡焦点互抢后回卡首次拖画失效(「先点一下卡片」即恢复)
  4. esm.sh 字体被 CSP 拦(系统字体回退)视觉确认
  5. M1 gen-ui 三条(滑块/全屏/回放)
  6. MCP Apps 卡片:轻/重分流后 wiki 页/文件预览加载显著变快(主观感受);含 mermaid 图的页仍出图(升富路径)
- 双模式真机验收(交用户):GUI↔TUI 接力全链
- 长期方向(未排期):画布 C 路线(外部 MCP App 托管)、多 agent 编排(OPC)、MCP skills 阶段 6(等上游 CLI)、审批中心后续批(subagent 归属关联态 / ACP request_permission 接入,修复方向在总纲 §6.5 补强段)

### 易丢的关键上下文

- **探针 lang 坑**:`page.addInitScript(() => localStorage.setItem("lang", "zh"))`。
- **跑测试限内存**:`systemd-run --scope --user -p MemoryMax=2G`。
- **e2e 单 spec**:`bun run e2e mcp-app-card.spec.ts`(run-e2e.ts 支持透传 spec 路径,自起隔离 api+web)。
- **探针点击后必须 waitForTimeout**:postMessage 异步入队,click 后立读 `__msgs` 会竞态(50ms 解决)。
- **tmux**:`ar-dev:api` / `ar-dev:web`;标准重启 `respawn-pane -k`;绝不 kill server。
- **iframe 内容 evaluate**:`frame.locator("body").evaluate(fn)`;`contentFrame()` 返回 FrameLocator。
- **sandbox iframe localStorage SecurityError**:excalidraw 访问 localStorage 的固有噪音,断言须过滤。

---
最后更新:2026-10-24(触发原因:审批中心补强批收尾)

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
