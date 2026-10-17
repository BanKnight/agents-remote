# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-17（PWA 通知真机排障闭环：`e58d1a6` TUI 推送链 + `ecf5be9` VAPID sub 修复，已 push；api 已 respawn）

## 一句话状态

**PWA 通知真机排障闭环 + TUI 期间推送补齐（`e58d1a6` + `ecf5be9` 已 push，api 已 respawn）**：真机「开启成功但收不到通知」根因 = **VAPID sub 的 `mailto:...@localhost` 域名被 APNs 拒 403 BadJwtToken**（与 Node/Bun、签名实现、fetch/curl 全无关，换域名同密钥同订阅立即 201；用户真机已收到测试推送，端到端全通）。另补齐 terminal 形态 done/blocked 推送（hooks 状态文件 watcher 加 `onStatusChanged` 出口 → 与 GUI 同一 `notifyPushStatus` 出口）。排障途中误诊「web-push 在 Bun 下签名无效」已证伪回退（验签方法错：raw 签名直接喂期待 DER 的 crypto.verify 恒 FAIL）。

## 本 session 焦点

### 关键决策（不可丢）

- **技术路线 = Web Push 服务端推送**（前端 `new Notification()` 在 iOS PWA 切后台被 WebKit 冻结，否决）。web-push 只取 `generateRequestDetails` 加密产物（aes128gcm 密文 + VAPID headers），HTTP 由 Bun fetch 承担（sendNotification 内置走 node:https，Bun 下不可用——Spike 1 实证）。
- **偏好存服务端**（settings.yaml `notifications` 域，non-optional normalize 补默认全 true，**不 bump schemaVersion**）——页面冻结时服务端推送必须能读偏好。
- **injectManifest 迁移四坑 + dev SW 两坑**（全在 redesign-v2.md 记档）：strategies 必须显式；`srcDir: "src"`；`includeAssets: ["icons/**/*"]` 补 public 静态件；**webmanifest 绝不能列 includeAssets**（conflicting-entries → SW evaluate 失败）；dev SW 是 ESM → `devOptions.type: "module"`；dev `__WB_MANIFEST` 为 `[]` → `devOptions.navigateFallback: "index.html"`。**SW evaluate 失败原文唯一抓取路径 = CDP `ServiceWorker.enable` + `workerErrorReported`**。
- **SW 语义**：push handler 前台抑制（`clients.matchAll` 任一 visible 即不弹）；`tag: payload.sessionId`（**只 sessionId 不带 kind**，同会话后到通知顶掉旧卡——review P2 修正）；notificationclick 有窗口 focus+navigate / 无窗口 openWindow（iOS 冷启）。
- **review 消化**：single-flight（PushKeyManager `readOrCreate`，防首启并发双生成密钥致内存/磁盘分叉 → 重签名全 403）；endpoint 限 https + 长度上限（盲 SSRF 纵深）；非 gone 失败补 warn；denied hint mount 时计算。记档不修：双份订阅态 local state、store 并发窗口（单用户低频）、服务端文案暂只中文、VAPID 换钥无自愈。

### 进度

- ✅ Spike 1/2 + Phase 1-5 + 双 review 消化 + 三 commit push（`75890b2`/`591da88`/`c37ccf8`）
- ✅ 小项：`PROJECT_GIT_IDENTITY_MISSING` 专属文案（`6021ae7`）
- ✅ 真机排障闭环：②开关开启已通；测试推送真机已收到（「判别/变体实验」弹窗）= 端到端全通
- ✅ **根因修复（`ecf5be9`）**：VAPID sub `mailto:...@localhost` 被 APNs 拒 403 BadJwtToken → 换 `mailto:notify@bannight.com`（`push-notifier.ts` VAPID_SUBJECT 常量）
- ✅ **TUI 推送链补齐（`e58d1a6`）**：`AgentTuiController.onStatusChanged` 出口 + index.ts `notifyPushStatus` 共享函数（GUI done/error 与 terminal done/blocked 同一出口；GUI blocked 仍走 approval-center 防双通知）
- ⏳ **本批真机清单剩余（api 已 respawn 加载全部修复，可验）**：③GUI turn 完成 + PWA 后台 → 收 done；④TUI 模式 turn 完成 → 收 done（新链路）；⑤TUI 审批提示 → 收 blocked（payload 无 toolName，文案「等待审批：工具调用」）；⑥点击通知深链；⑦关「任务完成」开关不收；⑧卸载清订阅；⑨多设备；⑩autoUpdate 后 handler 仍在；⑪前台正盯着不弹（设计行为）
- ⏳ 历史挂起：前几批真机清单未验收；ℹ 配置行 terminal 让位 / in-flight ensureRunning 竞态窗
- ⏳ 功能批候选：mod 采集批 / 插件管理 UI / PTY+OSC 7501

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
