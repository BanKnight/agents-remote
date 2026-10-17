# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-17（PWA Web Push 通知批，三 commit 已 push 至 main：`75890b2` + `591da88` + `c37ccf8`）

## 一句话状态

**PWA Web Push 通知批完成并 commit（两 commit，未 push）**：iOS 16.4+ standalone PWA 锁屏/后台可收系统通知，三类触发（等待审批 blocked / turn 完成 done / 出错 error），设置页逐类开关（偏好存服务端 settings.yaml `notifications` 域，页面冻结时服务端 gate 可读）。全链落地：Spike 1（web-push 分支 C：只用加密层 + Bun fetch 发送）→ Spike 2（generateSW→injectManifest 迁移，真修通）→ shared 类型 → api（VAPID 密钥/订阅存储/notifier/路由 + 装配接线）→ web（自写 sw.ts push handler + 客户端订阅 + 设置 section）→ 单测/e2e/双 review 消化。门禁全绿：api 985 + shared 10 + web 825 单测、e2e pwa-installable/mobile-nav/desktop-side、CSS 硬闸 + tokens 机检 + precache 无断链。

## 本 session 焦点

### 关键决策（不可丢）

- **技术路线 = Web Push 服务端推送**（前端 `new Notification()` 在 iOS PWA 切后台被 WebKit 冻结，否决）。web-push 只取 `generateRequestDetails` 加密产物（aes128gcm 密文 + VAPID headers），HTTP 由 Bun fetch 承担（sendNotification 内置走 node:https，Bun 下不可用——Spike 1 实证）。
- **偏好存服务端**（settings.yaml `notifications` 域，non-optional normalize 补默认全 true，**不 bump schemaVersion**）——页面冻结时服务端推送必须能读偏好。
- **injectManifest 迁移四坑 + dev SW 两坑**（全在 redesign-v2.md 记档）：strategies 必须显式；`srcDir: "src"`；`includeAssets: ["icons/**/*"]` 补 public 静态件；**webmanifest 绝不能列 includeAssets**（conflicting-entries → SW evaluate 失败）；dev SW 是 ESM → `devOptions.type: "module"`；dev `__WB_MANIFEST` 为 `[]` → `devOptions.navigateFallback: "index.html"`。**SW evaluate 失败原文唯一抓取路径 = CDP `ServiceWorker.enable` + `workerErrorReported`**。
- **SW 语义**：push handler 前台抑制（`clients.matchAll` 任一 visible 即不弹）；`tag: payload.sessionId`（**只 sessionId 不带 kind**，同会话后到通知顶掉旧卡——review P2 修正）；notificationclick 有窗口 focus+navigate / 无窗口 openWindow（iOS 冷启）。
- **review 消化**：single-flight（PushKeyManager `readOrCreate`，防首启并发双生成密钥致内存/磁盘分叉 → 重签名全 403）；endpoint 限 https + 长度上限（盲 SSRF 纵深）；非 gone 失败补 warn；denied hint mount 时计算。记档不修：双份订阅态 local state、store 并发窗口（单用户低频）、服务端文案暂只中文、VAPID 换钥无自愈。

### 进度

- ✅ Spike 1/2（分支 C 定案；injectManifest 真修通）+ Phase 1 shared + Phase 2 api + Phase 3 web SW + Phase 4 设置 UI + Phase 5 测试
- ✅ 单测：api 新建 4 文件 + 扩展 2（+30，全量 985）；web 新建 `lib/push.test.ts` + `settings-notifications.test.tsx`（+10，全量 825）；shared 10
- ✅ e2e `pwa-installable.spec.ts` 扩展（SW 文本含 push/notificationclick handler）——1 passed；mobile-nav 6 + desktop-side 6 过
- ✅ 双 review（code + security，均无 P1）消化完毕
- ✅ commit `75890b2`（shared+api）+ `591da88`（web）；**未 push**
- ⏳ **本批真机清单（交用户，需 HTTPS tunnel 域名——LAN http 无法 subscribe）**：①添加到主屏幕 standalone 打开；②设置→通知开启权限弹窗 granted；③另一端触发审批 → 锁屏/后台收 blocked；④done / error 通知；⑤通知点击：后台聚焦跳深链、被杀冷启进深链；⑥前台正盯着不弹；⑦关「任务完成」开关后不再收 done（服务端读偏好）；⑧卸载 PWA 后 api 下次发送 404 自动清订阅；⑨iPhone + 桌面 Chrome 各自订阅互不影响；⑩发新 build autoUpdate 后 push handler 仍在
- ⏳ 历史挂起：前几批真机清单未验收；`PROJECT_GIT_IDENTITY_MISSING` 专属文案；ℹ 配置行 terminal 让位 / in-flight ensureRunning 竞态窗
- ⏳ 功能批候选：pi/acp/chat 会话推送（同款回调接入）/ mod 采集批 / 插件管理 UI

### 阻塞 / 风险

- 无。push 待用户指令（个人项目 main 直开，前批 push 均用户明示）。
- 真机验证**必须 HTTPS**（Web Push subscribe 要求 secure context）；LAN http 下设置页只会显示降级态。

## 易丢的关键上下文

- **本仓 jsdom 测试三坑**（`settings-notifications.test.tsx` 内注释）：①`window.matchMedia` 未实现须 stub；②模块顶层装 DOM 全局会被前序文件 afterEach 清掉（`mobile-sheet.test.ts` 删 globalThis.window/document）→ 模块加载期装一次 + beforeEach 再装；③**`@testing-library/react` 的 `screen` 不可用**——import 期绑定 document.body 快照，无 document 窗口首次求值即永久退化抛错（全量跑挂、单文件跑绿）→ 一律用 `render()` 返回 view 内查询。
- **探针/e2e/单测跑法**：`systemd-run --scope --user -p MemoryMax=2G bun …`；e2e 自起 vite dev（`bun run e2e <name>`，一次一个 spec 名）。
- **验证用 PROJECTS_ROOT/test 项目**，不在正式项目建 session。
- dev 服务：ar-dev tmux，web=prod build 端口 43012，api=dev 43011；改 vite.config 后必须 respawn web。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-17 10:40（PWA 通知批三 commit 已 push；触发原因：push 后状态同步）
