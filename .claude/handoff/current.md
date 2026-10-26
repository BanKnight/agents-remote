# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-26(连接级看门狗批:快速切换「一直在连接中」修复)

## 一句话状态

**「骨架永驻」修复(3ce63b5)已上线并复测通过;紧随其后用户发现新现象「有些会话一直在连接中,退出项目页重进迅速连上」——已定位为 CONNECTING 态裸奔(握手挂起时所有自愈机制都没武装),本批加「连接级看门狗」(new WebSocket 后武装 10s,onopen 转武装 session_init 看门狗)修复,待提交 + 真机复测。api dev 已于上批按用户授权重启(服务端修复生效)。**

## 本 session 焦点

### 关键决策(不可丢)

- **「一直在连接中」根因链(2026-10-26)**:chat 形态「正在建立连接中…」= composer placeholder(`ClaudeSessionDetailRoute.tsx:3831`),驱动 = WS `connected=false`。既有全部自愈(session_init 看门狗/心跳 half-open/退避重连)都武装在 `onopen` 之后——**握手挂起(WebKit/中间层对「刚 close 就对同地址重连」的竞态,快速切换会话高频触发)期间 CONNECTING 裸奔**:onclose 不来、无超时、无重连,UI 停到系统级 TCP 超时(分钟级)。退出会话页 = 组件卸载强砍挂死 socket,重进 = 全新连接秒连——与用户观察完全吻合。**排除法硬证据**:服务端 open 失败已被上批 error+close 覆盖、open 后哑已被 15s 看门狗覆盖,用户仍见长时「连接中」→ 必是 onopen 之前。
- **修复 = 连接级看门狗**(`WS_CONNECT_TIMEOUT_MS = 10_000`):`new WebSocket` 后武装 → 到期 `console.warn`(带 project/session,取证通道)+ `socket.close()` → onclose → 既有退避重连;`onopen` 首行 `clearWatchdog()` 后同一 timer 槽转武装 session_init 看门狗(阶段接力,不 clear 会泄漏旧 timer 并误杀活连接)。误报代价 = 一次 500ms 退避重连。
- **测试坑(第一手数据)**:RTL 的 `waitFor` 在 bun fake timers 下会**推进虚拟时钟 ~1ms**——武装点在 waitFor 之前的定时器测试,「差 1ms 到期」的容差断言必挂(9999+1 恰好到点)。修法:分两段推进(半程断言未误杀 + 剩余半程+1 断言到期),对毫秒级偏移鲁棒。既有看门狗测试没踩坑是因为武装点在 waitFor 之后。
- **骨架永驻根因链(上批)**:socket open 后回放帧没到(订阅从未建立)——服务端 open() metadata/ensureRunning 裸奔 try/catch 外 + startStream catch 不 close;修复四件套 = 两 catch 对称 close + ensureActive 守卫 + 15s session_init 看门狗 + 指数退避(500ms×2ⁿ cap 30s)。
- **用户否决「缩回放缓存窗口换命中率」(2026-10-26)**:切会话有时骨架(缓存 miss)有时直接呈现(命中)是设计内两路径,用户确认现状可接受;缩窗口提案被否——「正确性都受到影响,耗费巨大」。恢复语义完整性 > 命中率,勿再提。
- **前批决策仍有效**:全宽实底状态条(dc1dd4d)、墓碑写者纪律(da43ba1)、增量回放跨 remount 恢复(081b51b)、composer 抬高焦点门闩(551b724)。

### 进度

- ✅ 上批 3ce63b5(骨架永驻)+ 5dafbed(handoff)已提交;api dev 已重启,用户复测「切了很多次没发现问题」。
- ✅ 本批:连接级看门狗实现 + 2 个新测试(CONNECTING 挂死关闭重连 / onopen 转接不双杀)。门禁:web 937 全绿、typecheck 三包、format+lint 0 warning、CSS 硬闸过、web 产物已重建含 `connect watchdog fired`。

### 待办

- **真机复测(iPhone PWA)**——本批核心验证:①持续快速切换会话,观察「一直在连接中」是否消失;②若仍复现,Console 的 `connect watchdog fired` warn 即第一手数据(说明重连也失败,下一轮查握手失败方);③前批清单:回放缓存三场景/飞行模式横幅/composer 抬高(骨架永驻已复测通过)。
- **记档不修**(勿重复调查):claude-stream `open()` terminal 形态守卫(error 帧后只 return 不 close,socket 半留);`spawnAndStart` 的 `relay.activate()` 无 catch;`relay.destroy()` 静默清订阅者不关 socket;pi/acp 无 since 通道。
- **既有 bug 立批**:React #310 跨 lg 断点切换崩溃(390 进页 setViewportSize 1280)。
- 取证件待拆(inset-report/use-attach-debug);e2e 基线 32+1 flaky;既有真机清单(composer 附件四条/插件域五条/M3 选区/M2 画布/键盘 inset)统一最后验。

### 易丢的关键上下文

- **两条 warn 语义**:`session_init watchdog fired` = open 后无回放帧(服务端订阅问题);`connect watchdog fired ... in CONNECTING` = 握手挂起(网络/中间层)。真机复现时先看是哪种,决定查哪层。
- 连接看门狗与 session_init 看门狗共用 `watchdogTimer` 槽:onopen 必须先 clear 再武装(否则 10s 后误杀活连接)。
- 探针跑法 `bun scripts/probe-*.mjs`;跑测试限内存 `systemd-run --scope --user -p MemoryMax=2G`;编辑文件一律内置 Read/Edit/Write。
- commit:标准 `git add && git commit`,尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`;禁 `git commit <paths>` / `--git-dir`。

---
最后更新:2026-10-26(触发原因:连接级看门狗批实现完成)

## 提醒
- 开干前读 .claude/gtd/next-actions.md;守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时,主动 /handoff save。
