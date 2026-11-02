# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-03（订阅死亡静默对账批实现+全门禁完成；等 code-reviewer 报告）

## 一句话状态

**Web Push 订阅死亡静默对账批**（2026-11-03 通知排障的机制化收口）实现完成：push.ts
`reconcilePushSubscription`（三 gate → 复用 enablePush 重订阅）+ `use-push-reconcile.ts`
（冷启动 + visibilitychange visible 双触发）+ main.tsx 挂载 + push.test.ts 4 用例
（10/10 pass）。全门禁绿（format/lint/typecheck/全量单测 1016 pass/CSS 硬闸/tokens）。
spec §3.6 设置分组补通知组 + 对账一句。**等 code-reviewer 报告 → 消化 → commit。**

## 本 session 焦点

### 关键决策（不可丢）

- **对账机制**：iOS 对主屏 PWA push 订阅静默撤销（getSubscription() → null）而 APNs 对死
  endpoint 仍报 201——服务端零感知。对账 = 前台激活时「支持 push + 权限 granted + 订阅
  null」三 gate 全过 → 静默重订阅上报自愈。规范基础：权限已 granted 时
  requestPermission() 同步返回 granted，不弹窗、无手势要求。
- **首授权不属于对账职责**：权限未授权 → 跳过（首次授权必须设置页用户手势）。
- **enablePush 双语境共用**：①设置页开关（手势内）②静默对账（reconcile）。
- **单测 mock 铁律（本批实锤）**：push.ts 读裸标识符 `Notification`/`navigator`（=
  globalThis；bun 内建全局 navigator ≠ dom.window.navigator、无 serviceWorker）——
  mock 必须挂 globalThis；挂 dom.window 时 gate 恒 false，短路用例假绿、主路径用例全挂。
- **v1.7 批已推送**（commit `23f3dbd`，origin/main 同步），等真机验证清单反馈（含平板长按）。

### 进度

- ✅ 通知排障闭环：根因 = 设备端订阅死亡 + APNs 201 假成功；用户重开开关已收到通知
- ✅ reconcilePushSubscription（push.ts）+ usePushReconcile（use-push-reconcile.ts）
  + PushReconcileSync 挂载（main.tsx，JotaiProvider 内 RouterProvider 前）
- ✅ push.test.ts 4 新用例：主路径自愈 / 订阅健在跳过 / 权限未授权跳过 / inflight 并发短路
- ✅ 全门禁：format:check / lint（0 warning）/ typecheck / 全量单测 1016 pass /
  CSS 硬闸 ✓ / tokens 机检 0 违例
- ✅ design_spec §3.6 补通知分组 + 对账机制一句
- ✅ /handoff save（本次）

### 阻塞 / 风险

- **未 commit、未 push**（外发须用户逐次确认）；等 code-reviewer 报告消化后再 commit。
- commit 尾行：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 真机验证路径：删订阅场景难以人为制造——等 iOS 自然失效后观察 App 自动恢复（或说明
  Chromium 探针盲区），交用户清单时讲清。

## 下一步

1. 消化 code-reviewer 报告 → 修复（如有）→ commit（标准 `git add && git commit`，
   禁 --only/--git-dir）。
2. 交用户真机清单 + push 确认。
3. 可选后续（未拍板）：服务端死订阅清理（设备重订阅后旧 endpoint 永远 201 不被 prune，
   订阅库积累死记录）——可记 GTD。
4. 遗留：wiki/ 目录 git 归属（用户已明确暂不做决定）；v1.7 真机验证清单反馈。

## 易丢的关键上下文

- 排障方法论（通知批）：APNs 对死订阅报 201 使服务端观察失效；updatedAt 前进只是
  recordActivity，**CLI JSONL 才是 turn 真实完成的决定性证据**；REST
  `POST /api/projects/$key/sessions/$id/message`（D13）可造真实 turn 与 WS 同管道。
- 单测限内存：`systemd-run --scope --user -p MemoryMax=2G bun run test`。
- push.ts 读裸标识符的根因：模块内 `typeof Notification` / `navigator.serviceWorker`
  解析链 = 模块作用域 → globalThis；`globalThis.window = dom.window` 只改 `window` 键，
  不提升 dom.window 属性到 globalThis。
- fetchJson 契约（client.ts:1755）：裸 fetch + AbortSignal.timeout(8s) + 401 refreshAuth
  重试 + 非 ok 抛 ApiClientError；mock Response status 200 + JSON body 即满足。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
