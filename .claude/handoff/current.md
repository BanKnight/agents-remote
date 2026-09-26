# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-27（**§6.12p 第二轮真机反馈修复 `52af7aa`**：sheet 拖拽对抗 WebKit 滚动手势 pointercancel——「拖不动/不跟手」根因 = .msheet 滚动容器内 touch-action:none 判定不稳。首轮 `0f3c882`（回弹 + holder 嵌套）已闭环。**下一步：真机复验清单（见下）**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

§6.12p 两轮真机反馈修复（`0f3c882` + `52af7aa`）：①拖拽 dismiss 从松手位置滑出不回弹（exit keyframes 无 from + inline 变量覆盖）；②历史 sheet renameDialog.holder 移出 MobileSheet 子树（不再被连带卸载）；③non-passive touchmove 手势期 preventDefault 对抗 WebKit 滚动判定（「拖不动/不跟手」）。探针 m5-sheets 54 断言全绿（CDP touch 序列 + 跟手断言）。

## 本 session 焦点

1. 用户反馈「下拉松手回弹再消失」→ dismiss 分支清 transform 瞬跳回原位 → 保留 transform 作 exit 起点（keyframes 无 from）+ inline 变量（出屏距离/不 fade/200ms ease-in）。
2. 探针诊断发现 holder 嵌套结构 bug（历史 sheet prompt 被关 sheet 连带卸载）→ Fragment 兄弟位修复 + 全仓排查。
3. 用户再反馈「更差了，不跟手，经常拖不动」→ 根因 = **WebKit 对滚动容器（.msheet overflow-y:auto）内触摸的 touch-action:none 判定不稳**，把手势当滚动启动并 pointercancel；起步 6px 窗口被 cancel = 手势死在 pending。修复 = non-passive touchmove 手势期（非 idle）preventDefault，从第一个 touchmove 就拦。
4. 探针 Part 5 升级 CDP touch 序列 + 逐步跟手断言。

## 关键决策（本阶段不可丢）

- **嵌套浮层铁律**：holder 模式浮层承载主操作流时必须在 MobileSheet/DialogContent 子树外（Fragment 兄弟位）——Radix exit 播完即卸载 Content，嵌套 Portal 连带卸载，SHEET_UNMOUNT_DELAY_MS 不保护嵌套层。runtime-config confirm 从属语义不修。
- **拖拽 dismiss 动画范式**：exit keyframes 无 from → inline transform 即动画起点；滑出形态用 inline 变量覆盖（--tw-exit-translate-y/--tw-exit-opacity/--tw-animation-duration/--tw-ease）。
- **iOS 拖拽手势铁律（新）**：滚动容器内的拖拽手势必须 non-passive touchmove preventDefault 从第一个 move 就拦（touch-action:none 在 WebKit 滚动容器内不可靠）；prevent 覆盖整个手势期（非 idle）——起步窗口被 cancel = 手势永久死在 pending。纯 tap 无 touchmove 不受影响。
- ** dismiss 阈值**：≥96px 或 24-96px+速度 ≥0.5px/ms；<24px slop 不接管。
- **基线对照法有效**：39a8aca worktree + 43099——基线同挂证明问题非本轮引入。
- **Playwright「prompt crash」实为 prompt 消失后的症状**（detached retry/TargetClosed 误导），先修产品 bug。
- **探针 stdout 缓冲**：timeout 杀进程丢缓冲，诊断打点用 console.error。
- 加载态分层标准 / keepPreviousData 前提 / 探针 mock 三铁律沿用 §6.12o/§6.12n 记档。

## 进度（已完成 / 进行中 / 待办）

- ✅ §6.12o 加载态（`5dd1113`+`ecf34cc`）+ §6.12n sheet 收敛（`39a8aca`）+ §6.12p 两轮反馈修复（`0f3c882`+`52af7aa`）
- ✅ 验证 = 四门禁 + CSS 硬闸 + token 机检 + e2e 24/24 ×2 + 单测 673 ×2 + 探针 m5-sheets 54/54
- ⬜ **交用户真机复验（重点：拖拽手感——preventDefault 是 iOS 标准做法，WebKit 判定 Chromium 模拟不出，以真机为准）**
- ⬜ 若真机仍拖不动 → 下一手：无标题菜单 sheet 热区增高（现 grab 40×5 + 12px 行，真机易 miss；增高有菜单首行下移的视觉代价需拍板）/ 拖拽热区扩展到内容区非滚动带（iOS 惯例，冲突面大需设计）
- ⬜ 记档不修：runtime-config confirm 从属嵌套；§6.12o 3 项
- ⬜ 存量欠账：rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL

## 用户真机复验清单（§6.12p 两轮）

1. **拖拽手感（重点）**：抓 sheet 头部下滑——**起步即跟手**（无迟滞、无「拖不动」）；拖拽全程跟手；快速轻扫也能抓住
2. 松手（>96px 或快速甩）→ 从松手位置滑出屏幕，不回弹；轻拖回弹原位
3. 热区按钮 tap 不受影响：审批「全部允许」、菜单项、行按钮点击正常（preventDefault 无误伤）
4. sheet 内列表滚动正常（内容超高的 sheet，如历史列表）
5. 历史 sheet closed 行 → 命名 prompt 稳定可见，确认后 resume
6. 同一 sheet 反复开关下拉行为一致；双主题一致

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；`52af7aa` 已 rebuild（CSS 硬闸过，dist 05:25:55）。
- 真机若仍「拖不动」→ 备选方案已列进度节（热区增高需拍板）。

## 易丢的关键上下文

- **探针跑法**：touch main.tsx + sleep 16 + 核对 dist mtime + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **基线对照**：worktree 43099 + AR_WEB_ORIGIN；stash 对照无效。
- **Playwright**：`text="..."` 精确/无引号 substring；双 sheet 共存窗口等目标标题；CDP touch 派生 pointer events 可驱动 React 手势。
- **Edit/Write 注入防护**：Write 临时脚本有前科 → 「cp 探针 + 小 Edit + sed 打点」；rg `-r` 是 replace 别误用。
- route mock LIFO / preview 带 mtimeMs / 右栏 InitScript 沿用。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-27 05:35；触发原因：§6.12p 第二轮反馈修复 commit `52af7aa` + handoff 滚动

