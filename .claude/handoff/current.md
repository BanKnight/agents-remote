# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-26(骨架永驻修复 3ce63b5 提交,双 reviewer 报告消化完毕)

## 一句话状态

**「连接成功但骨架永驻」间歇 bug 修复已提交(3ce63b5)**——根因 = socket open 后回放帧根本没到(骨架 gate `turns===0 && loading`,空批次也会清 loading,唯一可能是订阅从未建立):①服务端 `open()` 的 metadata/ensureRunning 裸奔在 try/catch 外,抛错 = 半死连接(pong 掩盖永不自愈);②startStream catch 只发 error 帧不 close,同病。修复 = 两 catch 对称 close + `relay.ensureActive()` 不变量守卫 + 客户端 session_init 15s 看门狗 + 重连指数退避(500ms×2ⁿ cap 30s)。**api dev 未重启(watch 假死),服务端修复尚未生效——respawn 时机交用户(respawn 会杀所有运行中 CLI 包括 Claude 自己的会话);客户端看门狗+退避已在 web 产物即刻生效**。

## 本 session 焦点

### 关键决策(不可丢)

- **骨架永驻根因链**:快速切换会话偶发「WS 已连接 + 骨架永驻」= 服务端 open 失败路径静默(metadata 探活/ensureRunning respawn 抛错未接住)或订阅前抛错,而服务端 `message()` 对任何 socket 都回 pong → 半死连接被心跳永久掩盖。客户端此前对「open 后没有 session_init」零检测。
- **修复四件套**:①`open()` metadata+ensureRunning 包 try/catch(error 帧+close);②startStream catch 补 close(与①对称,双 reviewer 同发现);③`ensureActive()` 订阅前置守卫(**doActivate 全同步、pending 态不可观测,当前窗口不可达——纯防御性不变量钉,doActivate 未来异步化才生效**,注释已如实化);④看门狗 15s(onopen 武装/session_init·onclose·cleanup 解除,fire = warn 日志即下一轮取证第一手数据)。
- **重连退避(perf review P1 采纳)**:open 失败变受控 error+close 后,固定 500ms = ~2 次/秒无界风暴(CLI fork + 状态条闪烁)→ 500ms×2ⁿ cap 30s;归零点 = session_init 到达 + 会话切换(stale timer effect 同位,依赖 `[projectName, sessionId]` 天然不经过重连重跑)。
- **relay「切走再切回就好」**:新 socket 订阅到已 active 的 relay,全量回放立即到达——印证「回放帧没到」而非「数据丢了」。
- **测试质量(code review P1)**:ensureActive 首版测试是恒真断言(`.then` 回调同步不执行)——已重写为 gate 慢激活方案(实例覆写 `doActivate`,`this.doActivate()` 动态查找覆写生效),断言真正区分两种实现。
- **前批决策仍有效**:全宽实底状态条(dc1dd4d)、墓碑写者纪律(da43ba1)、增量回放跨 remount 恢复(081b51b)、composer 抬高焦点门闩(551b724)。

### 进度

- ✅ 3ce63b5:7 文件(api 4 + web 2 + 测试 3 合并计数),新增测试 6 个(relay gate 重写 1 + open 三失败路径 + hook 看门狗 2 + 退避 1)。门禁:api 1111 / web 935 全绿、typecheck 三包、CSS 硬闸、format+lint 0 warning、回归探针 17/17 + 7/7。code-reviewer + perf-reviewer 并行审查,发现全消化(P1 测试恒真/P2 startStream close×2 报告同发现/P2 注释失实/P1 退避/P3 测试名夸大)。
- ✅ 前三批 dc1dd4d/bd5ac6e/da43ba1/081b51b 均已提交。

### 待办

- **⚠️ api dev 重启交用户**:api `bun --watch` 自我改文件后没重启(watch 假死),**服务端三处修复尚未在运行进程生效**;respawn `ar-dev:api` 会杀所有运行中 CLI(包括 Claude 自己的会话进程)。用户方便时自行 `respawn-pane -k -t ar-dev:api`。客户端侧(看门狗+退避)已在 dev web 产物生效(`rg "session_init watchdog" web/dist/assets/` 已验证)。
- **真机复测(iPhone PWA)**:①原复现场景快速切换会话——不再骨架永驻;若复现,Console 的 `session_init watchdog fired` warn 即取证数据;②前批清单:回放缓存三场景/飞行模式横幅/composer 抬高。
- **记档不修**(写进 review 消化,勿重复调查):`spawnAndStart` 的 `relay.activate()` 无 catch(JSONL 读抛错 → rejected relay 留 map + 孤儿 CLI 常驻;当前 readHistoryFromJsonl 吞 ENOENT 故不可达);`relay.destroy()` 静默清订阅者不关 socket(受害面=客户端已迁走的僵尸 socket,看门狗兜底);stream() `!relay` 分支清失败 relay vs spawnAndStart 失败 relay 永留 map 的不对称(moot);pi/acp 通道同构 emitter 无 since 通道。
- **既有 bug 立批**:React #310 跨 lg 断点切换崩溃(390 进页 setViewportSize 1280,桌面小窗拉大真实场景)。
- 取证件待拆(inset-report/use-attach-debug);e2e 基线 32+1 flaky;既有真机清单(composer 附件四条/插件域五条/M3 选区/M2 画布/键盘 inset)统一最后验。

### 易丢的关键上下文

- **看门狗 warn 语义**:修复后若真机仍见 `session_init watchdog fired`,= 还有未覆盖的静默路径,是下一轮调查的第一手数据,不要先入为主当误报。
- ensureActive 是防御性守卫非根因修复——真根因是 open/startStream 的 catch 洞;别在后续排查里把它当「等待激活的延迟来源」(它是微任务级)。
- 探针跑法 `bun scripts/probe-*.mjs`;跑测试限内存 `systemd-run --scope --user -p MemoryMax=2G`;编辑文件一律内置 Read/Edit/Write。
- commit:标准 `git add && git commit`,尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`;禁 `git commit <paths>` / `--git-dir`。

---
最后更新:2026-10-26(触发原因:骨架永驻修复提交 3ce63b5,阶段收尾)

## 提醒
- 开干前读 .claude/gtd/next-actions.md;守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时,主动 /handoff save。
