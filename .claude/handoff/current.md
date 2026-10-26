# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-26(回放缓存迁 IndexedDB 批:实现+双 reviewer 消化全部完成)

## 一句话状态

**「回放缓存迁 IndexedDB」批全部完成:3 commit(9e8215b 存储层 + ae11ded 原子改 + fe4f496 review 消化),双 reviewer 零 P0(perf 0 P0/P1 净改善;code 1 P1 已修=项目清扫硬删化),探针复验全绿,产物已重建——用户真机已确认「极大提升」(核心验收通过),剩余真机清单项随时可验。**

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
- ✅ 双 reviewer 消化(perf:0 P0/P1 净改善,meta 扫描 <0.1% 主线程、save 净省 10-30ms、内存峰值更低;code:1 P1 已修=项目清扫硬删化消灭 rename-A→B→A 静默失效陷阱,3 P2 已修=withDb 类型诚实化/metaChars 死代码/注释漂移;perf P2-1=配额重试 evict 不重复);commit `fe4f496`。
- ✅ 收尾复验:全门禁绿(web 951)、产物重建、remount 探针 7/7、cleanup 探针 4/4;**用户真机反馈「确实有了极大的提升」(核心验收=三大会话轮切稳态全命中,通过)**。

### 待办

- **剩余真机清单(用户有空时)**:①大会话进入→切走→杀 PWA→重进(恢复即现 + delta);②大窗口恢复完整(2.9M 会话不丢头);③关会话/删项目/改名清扫(改名改回不失效——fe4f496 硬删语义);④升级后首次进入(旧 localStorage 清理一次全量自愈);⑤弱网重连。
- **记档不修**(本批新增 4 条):50M 预算满载边界(现阶段 5× 余量,大会话数逼近 17 时 bump);3s 竞速败者迟到物化(~12MB 瞬时,仅真挂起时发生);流式期写放大(~1-2GB/h 闪存,有界可接受);handleBinaryBatch decompress 后不检查 cancelled(本批之前已存在、正交,如修属另一批)。
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
