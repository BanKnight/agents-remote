# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-26(丢弃策略补全提交 da43ba1:毒化 + 删除清扫墓碑;待用户真机复测 081b51b+da43ba1)

## 一句话状态

**回放缓存丢弃策略补全已提交(da43ba1)**——用户对照三场景提醒核查:①长期没用打开快(已有行为满足,锚 miss 自动 full 回退);②一直用内存/存储稳定(修「至少保留一行」被超大单行击穿——本机 JSONL 实测 2.5MB tool_result 行真实存在;毒化=整窗放弃+墓碑);③删除的项目不留残余(接 useProjectRowActions/useCloseSession 显式清扫;跨设备靠全局 2.5M+LRU 硬上界兜底)。关键机制**墓碑**:clearReplayCache 写 removed 标记 entry、saveReplayCache 读到即拒写——卸载 cleanup flush 的迟到重写不复活已删缓存(真链路探针实抓该竞态)。前一批 081b51b(跨 remount 增量回放恢复)同待真机复测。

## 本 session 焦点

### 关键决策(不可丢)

- **丢弃策略分层(da43ba1,2026-10-26)**:内存窗 = 行数(1200→600) + 字符(1.5M)双 cap、组件卸载即释放;落盘 = 单 entry 600 行/1.5M chars + 全局 2.5M chars(UTF-16 口径)+ savedAt LRU;生命周期 = 项目删除/重命名清前缀(useProjectRowActions onSettled 从 variables 取参——onSettled 出错时 data undefined)、agent 会话删除清单 key(useCloseSession);跨设备残留 = 全局 cap 硬上界兜底。**毒化**:单行 > REPLAY_CACHE_MAX_ENTRY_CHARS(1.5M) → 整窗放弃 + replayPoisonedRef 短路采集/调度/flush + 墓碑持久(重放还会再遇到大行,永久挡掉避免反复失败循环;LRU 淘汰墓碑自愈)。
- **墓碑 = 写者纪律**:cache 层单一写者,删除语义对 save 单向生效。直接 removeItem 被「面板卸载 cleanup replayFlush 重写」竞态覆盖(探针 ④ 实抓:清完读回仍是完整 entry);写 removed 标记 entry 后 loadReplayCache 既有校验(无 cursorUuid)天然拒收,saveReplayCache 开头 parse existing 查 removed。墓碑 ~80B 随 LRU 淘汰。
- **探针教训(da43ba1 实抓)**:UI 按 id 前缀推断会话类型(inferSessionTypeFromId)——探针自建会话必须用服务端返回的 agent_ 真实 id 打开页面/预写 key,自造标记 id 不被识别为 agent,删除流程走不到 agent 分支。

- **非 bug 的诊断结论**:增量回放(reconnect delta)本身工作正常——服务端日志实证同页面断线重连大量 `replay=delta`。缺口纯粹是**锚的持久化范围**:设计只覆盖「连接级重连」,不覆盖「组件级 remount」。修复属 `state-sync-principles.md` 的「上下文不足」难题:客户端要保住自己的上下文(锚 + 锚点处数据)才能按需同步。
- **无损论证**:当前 full replay 的数据源本就只有 relay 内存缓冲(`historyLines` = last compact block ≤8MB + `liveLines` ≤10k 行)。持久化窗口 ≥ 该量级即**不牺牲任何现状可得的消息**——这是选「持久化原始行窗口」而不是「只存锚 + 重新拉历史」的核心理由(后者需要新 API 且会引入新的上下文不足)。
- **单一真相:锚由窗口自身推导**(`deriveAnchor` 逆序 parse 找最后一条带顶层 `uuid` 的行)——不用调用方 `cursorRef`。原因:history 批次**先采集、`history_end` 才 processBatch**,采集窗口领先于 cursor;粗剪/字符 cap 又可能把旧锚丢出窗口。两者一旦分叉就清空缓存(早期缺陷)。
- **锚必须 parse 而非字符串匹配**:`includes('"uuid":"…"')` 会被 `tool_result` 大行内嵌的同形文本误命中。
- **P0 过期闭包**:WS effect 闭包捕获 mount 渲染的空数组。恢复场景 effect 不重跑、闭包永不更新 → `replayCursorRef` 必须读 `rawMessagesRef.current.length`,`deltaEnter.from` 必须读 `renderedMessagesRef.current.length`(新增镜像,commit 后 effect 写入),否则恢复窗口整体被套上淡入动画。
- **恢复不注入 batch_boundary divider**:恢复窗口按 1:1 行数映射(anchor/liveStart 公式的前提);divider 是纯合成行,注入即破公式。
- **恢复语义三件套**:`processBatch(parsed)` 一站式(rawMessages + messageMapRef + scalar 折叠 + cursor 行内推导);`liveStartRef = parsed.length`(整窗视作 history,否则渲染→delta 完成期间假 running);`isResumeRef = cached.resume`(孤儿 tool_use 需 interrupted 语义,否则渲染成永久 running)。
- **容量治理口径**:字符 cap 用 `string.length`(UTF-16 code units)= localStorage 配额同量纲,免每次 flush 全窗口 encode。单 entry 600 行 / 1.5M chars,全局 2.5M chars(配额 ~5M/origin,留一半给 workbench 的 `atomWithLocalOnlyStorage`)+ savedAt LRU。`evictForCapacity` 用头部 64 字节正则读 `savedAt`,不 parse MB 级 entry —— **`savedAt` 必须是 entry 首属性(序列化串头部 64 字节内),这是 `readSavedAt` 的契约**。
- **落盘调度**:trailing debounce 2s + maxWait 10s(纯 debounce 在流式期间被无限重置 → PWA 被杀丢整回合);gen 代数防切会话串档(flush 回调执行时 gen 漂移即丢弃,切会话分支先同步 flush 旧会话再 gen++);`visibilitychange/hidden` + `pagehide` + unmount cleanup 三点兜底。ingestion 侧**批内只入窗,批末调度一次**(回放 burst 上万行不逐行建 timer)。
- **JSDOM Storage 坑**:成员是 `[LegacyUnforgeable]`(实例 own non-configurable),`Object.defineProperty` 静默无效 → stub 必须整体替换 `globalThis.localStorage` + 手动代理原型方法(spread 不拷原型)。
- **StrictMode double-effect 两次 setup 都真实执行**(模拟卸载重挂):两个 socket、恢复跑两遍但第二次 `resetSessionState` 清第一次窗口 → 不翻倍。hook 用例按 3 个 socket 断言。
- **v2 路由**:`/projects/$projectName/agent-sessions/$sessionId/claude` 是重定向页 → `/projects/$key/session/$id`;agent session id 形如 `agent_8edb4fb6fca3497d`(≠ 底层 claudeSessionId)。
- 前批决策仍有效:composer 抬高焦点门闩(551b724)、多图挂死 `baseCount` 修复、COMPOSER_MAX_ATTACHMENTS=8 + WS 48MB、加号一键直达、UI 准则「布局 do the explaining」。

### 进度

- ✅ bd5ac6e:离线提示条悬浮化(03i 流内分隔→composer 上方悬浮胶囊,重连卸载不再布局跳动;capLeaving 淡出状态机 + --duration-exit 单源;design-reviewer P2×2+P3×1 全消化)。**真机待验:飞行模式 3s 再关,提示浮现/淡出且内容不跳**。
- ✅ da43ba1:丢弃策略补全(毒化 + 删除清扫墓碑)。cache 单测 +3、hook 毒化用例 1;全仓 api 1106 / shared 11 / web 932 全 0 fail;新探针 `probe-replay-cache-cleanup.mjs` 真链路 4/4(自建会话→预写 entry→打开不清理→UI 关闭后只剩墓碑);remount 探针回归 7/7。
- ✅ 081b51b:增量回放跨 remount 恢复(新 `web/src/lib/claude-replay-cache.ts` + adapter 采集/恢复/落盘 + cache 单测 12 + hook 用例 5 + 真链路探针)。perf-reviewer P1 四条全部消化进返工。
- ✅ 全门禁:format/lint/typecheck 0;`node scripts/ar-verify-css.mjs` 过。

### 待办

- **立即:用户真机复测**(iPhone PWA):①切走会话再切回 → 直接看到最新内容,无「从旧加载」过程;②杀 PWA 重开进会话 → 同上;③新会话(无缓存)/ relay 重建场景仍正常全量。
- composer 抬高修复(551b724)用户仍在观察。
- 取证件待拆(定案后):`use-composer-inset-debug-badge.ts` + `/api/debug/inset-report`;`use-attach-debug.ts` + composer-attach 打点 + `/api/debug/attach-report` + `probe-attach-debug.mjs`。
- 记档不修:队列恢复陈旧性(queue-operation 是 broadcast-only,恢复可能重建已派发排队项——仍优于现状);会话删除残留 cache(LRU 兜底);pi/acp 无增量通道;full 回放视觉过程(仅剩低频谱场景);delta 防御去重场景下缓存窗可能含被去重行(渲染层按 message.id 合并,视觉无害);i18n 孤儿键 `claude.attach.ready`。
- e2e 基线:32 直接绿 + mcp-app-card 1 flaky(重跑绿)。
- 既有真机清单(统一最后验):composer 附件四条 / 插件域五条 / M3 选区引用 / M2 画布 / 键盘 inset。

### 易丢的关键上下文

- **改 cache 层必看**:`savedAt` 属性顺序契约(首属性)+ 锚由窗口推导(不要重新引入 cursorUuid 入参)。
- 探针跑法:`bun scripts/probe-replay-cache-remount.mjs`(bun 不用 node;`PROBE_PROJECT`/`PROBE_SESSION`/`WEB_ORIGIN` 可覆盖)。
- 跑测试限内存 `systemd-run --scope --user -p MemoryMax=2G`;编辑文件一律内置 Read/Edit/Write(两次写失败就停)。
- 产物验证:懒加载 chunk 不在 index.html 里,`rg "特征串" web/dist/assets/` 直查;watch 假死第一动作 = `respawn-pane -k -t ar-dev:<web|api>`。
- commit:标准 `git add && git commit`,尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`;禁 `git commit <paths>` / `--git-dir`。

---
最后更新:2026-10-26(触发原因:增量回放跨 remount 恢复提交 081b51b,阶段收尾,待真机复测)
