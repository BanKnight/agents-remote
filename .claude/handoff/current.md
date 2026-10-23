# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-24(M5–M10 收口核实——v2 里程碑全部完成,记录修正;等待用户提新需求)

## 一句话状态

**v2 UI 重构 M0–M10 实际已全部完成(2026-09-21/22)**:本 session 三路调研 + git log 实锤后收口——总纲 §6 里程碑表 M6–M10 行补 ✅ 标注、GTD 漏勾的「M5 浮层与审批 → M6–M10」条目勾选修正、handoff 更正。**此前「213 之 3 = M5 待做」是过期 GTD 条目造成的误判**,213 序列实际全部完结。等待用户提新需求。

## 本 session 焦点

### 关键决策(不可丢)

- **GTD 过期条目的代价(教训)**:「M5 浮层与审批 → M6–M10」漏勾条目让后续多个 session(含本 session)误判「M5 待做」并向用户汇报,用户「开始吧」基于错误前提——**里程碑完成状态要以总纲 §6 表 + 收口补记小节为准,GTD 勾选状态可能滞后**;发现「待办」与「文档记录」矛盾时,先查收口补记再动手。
- **M5–M10 完成证据链**(收口核实依据):M5 `1814270`(security 五红线全过,审批中心全链三方调研实锤在位)→ M6 `fb49dde`(探针 59/59)→ M7 `1bddc9c`(68/68)→ M8 `4ae8098`(65/65)→ M9 四批次 `4681642`/`d59e1ad`/`2ce3531`/`579ca24` → M10 `95443b2` 总验收(spec §9 25 项矩阵)+ §6.12 用户 iPhone 总验证 8 问题全修。各收口补记:总纲 §6.5/§6.7/§6.8b/§6.9b/§6.10/§6.11/§6.12。
- 审批中心现状补充(三路调研之一):全链(registry/center/REST/WS/web 三层 UI/双模式让位/hooks 旁路)完整在位;已知缺口清单(terminal 形态不进审批中心=设计如此、AskUserQuestion 全局中心语义存疑、整页刷新会话内审批态丢失等 8 项)见调研报告,均为记档级非缺陷。

### 进度

- ✅ **213 序列全部完结**:1 轻重分流 `1f6251d`、2 双模式 reviewer 补跑、3 = M5(早已完成,本 session 收口)
- ✅ **M5–M10 文档收口**:总纲表 + GTD + handoff 三处修正(本批 commit)
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
- 长期方向(未排期):画布 C 路线(外部 MCP App 托管)、多 agent 编排(OPC)、MCP skills 阶段 6(等上游 CLI)

### 易丢的关键上下文

- **探针 lang 坑**:`page.addInitScript(() => localStorage.setItem("lang", "zh"))`。
- **跑测试限内存**:`systemd-run --scope --user -p MemoryMax=2G`。
- **e2e 单 spec**:`bun run e2e mcp-app-card.spec.ts`(run-e2e.ts 支持透传 spec 路径,自起隔离 api+web)。
- **探针点击后必须 waitForTimeout**:postMessage 异步入队,click 后立读 `__msgs` 会竞态(50ms 解决)。
- **tmux**:`ar-dev:api` / `ar-dev:web`;标准重启 `respawn-pane -k`;绝不 kill server。
- **iframe 内容 evaluate**:`frame.locator("body").evaluate(fn)`;`contentFrame()` 返回 FrameLocator。
- **sandbox iframe localStorage SecurityError**:excalidraw 访问 localStorage 的固有噪音,断言须过滤。

---
最后更新:2026-10-24(触发原因:M5–M10 收口核实,213 序列完结)

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
