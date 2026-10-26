# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-26(回放缓存迁 IndexedDB 批:三大会话互驱逐根治)

## 一句话状态

**「回放缓存迁 IndexedDB」批实现完成并已提交(9e8215b 存储层纯新增 + ae11ded 签名原子改),双探针全绿(remount 7/7 + cleanup 4/4),web 产物已重建、双 reviewer 后台审查中——审查消化后交用户真机清单(核心验收:三大会话快速轮切稳态全命中)。**

## 本 session 焦点

### 关键决策(不可丢)

- **「瞬出时有时无」根因(2026-10-26 定案)**:不是 LRU 代码 bug,是容量参数与真实数据规模不匹配——实测三窗口(22router 2.89M / agents-remote 1.44M / novels 2.75M)合计 4.44M > localStorage 全局 cap 2.5M,快速轮切稳态互驱逐全 miss;窗口内容动态波动在临界值附近来回跨越 = 「时好时坏」。**附带正确性问题**:旧单 entry 字符 cap 1.5M 在偷偷丢头截断两个大会话的落盘窗口。用户拍板迁 IndexedDB(iOS 动态配额数百 MB 级)。
- **常量拆分**:`REPLAY_CACHE_MAX_ENTRY_CHARS`(1.5M 一常量三用途)删除 → `REPLAY_WINDOW_MAX_CHARS=8M`(内存摊还+单行毒化) + **落盘不截断**(600 行窗口原样缓存) + `REPLAY_CACHE_MAX_TOTAL_CHARS=50M`(全局 LRU 预算,meta.chars 口径,~17 个大会话)。
- **三层架构**:adapter(恢复 await+3s 超时竞速 / flush·clear fire-and-forget) → cache 逻辑层(签名异步化、永 reject、同步段先快照) → `ReplayCacheStore` 接口(seam 注入) → store 实现(IDB 生产 / mem 测试)。零新依赖。
- **恢复异步化竞态面**:async IIFE + `Promise.race([loadReplayCache, 3s→null])` + 双守卫(cancelled + gen 快照)——迟到恢复 bail 不串窗口;重连分支同步开连零新增延迟。StrictMode 用例 diag 实证:首轮 IIFE `cancelled=true` bail、第二轮命中应用。
- **hook 测试断言坑(本批实测)**:`rawMessagesRef` 是 commit 后的 effect 派生(claude-adapter.ts:4090)——socket 建立同步先于 commit,断言必须 waitFor 不能同步读;`MockSocket.instances` 数组跨本测试累计(first 实例的 socket 占 [0]),断言索引按累计算。
- **探针 IDB 预写两坑(首批实测)**:①值必须存**对象**(存 JSON 字符串被 loadReplayCache 形状校验拒收);②upgrade 必须建全 entries+meta 双 store——残缺 DB(缺 meta)让应用所有写 tx 静默死,tombstone 写不进去 → 假 FAIL。预写时机 = 登录后先 evaluate 直写再导航(不用 addInitScript,IDB 异步写与应用首个恢复读竞态)。
- **用户否决项(仍有效)**:缩回放缓存窗口换命中率——恢复语义完整性 > 命中率,勿再提(本批「落盘不截断」正是修复)。

### 进度

- ✅ Step 1:`replay-cache-store.ts` 新建(接口七方法 + IDB/mem 双实现 + sweepLegacy)+ 11 测试绿;commit `9e8215b`。
- ✅ Step 2:cache 层重写(17 测试)+ adapter effect 重排 + 消费点 void 化 + hook 测试改造(6 用例异步化 + 新增竞态/超时降级 2 用例);探针改造(remount 断言改 evaluate 内联 async IDB 读 + cleanup 预写改先写后导航);commit `ae11ded`。
- ✅ 验证:web 951 全绿 / typecheck 三包 / lint+format 0 warning / CSS 硬闸过;`respawn-pane -k` ar-dev web 重建;`rg "agents-remote-replay-cache" web/dist/assets/ChatSessionDetailRoute-*.js` 验产物;content-type text/css ✓;remount 探针 7/7(真实 IDB 落盘 1.22M 窗口 + delta)+ cleanup 探针 4/4(墓碑 `{savedAt,v,removed:true}` 覆盖)。
- 🔄 双 reviewer(code + perf)后台审查中——报告回来后消化、必要时修复补 commit。

### 待办

- **reviewer 消化**(进行中)→ **真机清单交用户**:①大会话进入→切走→杀 PWA→重进(恢复即现 + delta);②**三大会话快速轮切 ×N(核心验收:稳态全命中,不再互驱逐)**;③大窗口恢复完整(不截断);④关会话/删项目清扫;⑤升级后首次进入(旧 localStorage 清理 + 一次全量回放自愈,sweepLegacy 在 createIdbReplayStore 工厂体开头);⑥弱网重连。
- **记档不修**(不变):claude-stream open() terminal 守卫不 close;spawnAndStart relay.activate() 无 catch;relay.destroy() 不关 socket;pi/acp 无 since 通道。
- **既有待办不变**:React #310 跨 lg 断点崩溃立批;批 16/17/18 真机复验(见 next-actions);取证件待拆;e2e 基线;M2.0 多卡焦点互抢。

### 易丢的关键上下文

- 墓碑语义链:clearReplayCache = store.tombstone(写 removed 标记);putUnlessTombstone 单 tx 内 get→墓碑? false:put——删除语义对 save 单向闸,LRU 淘汰墓碑后自然重试自愈。
- IDB 引擎防御:所有 request 在 request 回调内同步发起(不跨 await 用 tx);open 失败缓存 null → 本页面加载内永久降级(隐私模式零噪音)。
- save 同步段铁律:pushReplayLine 会原地 push raw 数组——capByLines/deriveAnchor/join 必须在首个 await 前。
- 探针跑法 `bun scripts/probe-*.mjs`;测试限内存 `systemd-run --scope --user -p MemoryMax=2G`;commit 尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`,标准 `git add && git commit`。
- RTL waitFor 在 bun fake timers 下推进虚拟时钟 ~1ms(上批教训);「差 1ms」容差断言分两段推进。

---
最后更新:2026-10-26(触发原因:IDB 迁移批实现+提交完成,双探针全绿,等 reviewer)
