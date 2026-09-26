# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-27（**§6.12p 真机反馈修复完成 `0f3c882`**：sheet 拖拽 dismiss 从松手位置滑出不回弹 + 历史 sheet prompt 连带卸载结构修复。§6.12o 加载态 `5dd1113`/`ecf34cc` 已闭环。**下一步：真机复验清单（见下）**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

§6.12p 真机反馈修复（`0f3c882`，3 文件 +180/−83）：①拖拽 dismiss 修复——exit keyframes 无 from，保留 inline transform 作动画起点从松手位置继续滑出屏幕（inline 变量覆盖滑出距离/不 fade/200ms ease-in）；②历史 sheet renameDialog.holder 移出 MobileSheet 子树（Radix exit 卸载 Content 时不再连带杀 prompt）。探针 m5-sheets 扩至 51 断言全绿。

## 本 session 焦点

1. 用户真机反馈「sheet 下拉松手后回弹再消失」→ 根因 = dismiss 分支先清 inline transform（瞬跳回原位）再交 exit 动画。
2. 修复机制：tw-animate-css exit keyframes 只有 to 无 from → 起始值 = 当前计算样式 → 保留 transform 即从松手位置继续滑出；inline 覆盖 `--tw-exit-translate-y`（出屏距离）/`--tw-exit-opacity`（纯滑出不 fade）/时长 200ms ease-in。
3. 探针诊断中发现**结构 bug**：历史 sheet 的 renameDialog.holder 嵌在 MobileSheet Content 内 → 关 sheet 时 Radix Presence 卸载 Content 子树 → 嵌套 Portal prompt 连带卸载（input 消失、resolve 悬空）。
4. 全仓 holder 嵌套排查：仅 runtime-config confirm 属从属语义（父关=放弃操作）记档不修；其余顶层/页面级安全。

## 关键决策（本阶段不可丢）

- **嵌套浮层铁律（新）**：holder 模式的浮层（usePromptDialog/useConfirm/useInstanceInfoSheet）若承载**主操作流**，holder 必须渲染在 MobileSheet/DialogContent 子树外（Fragment 兄弟位/顶层）——Radix exit 动画播完即卸载 Content 子树，嵌套 Portal 的浮层被连带卸载，SHEET_UNMOUNT_DELAY_MS 只保护「holder 组件树」不保护「外层 Content 内的嵌套 Portal」。
- **拖拽 dismiss 动画范式（新）**：exit keyframes 无 from → inline transform 即动画起点；要改滑出形态用 inline 变量（`--tw-exit-translate-y`/`--tw-exit-opacity`/`--tw-animation-duration`/`--tw-ease`）覆盖 class。
- **dismiss 阈值不变**：≥96px 或 24-96px+速度 ≥0.5px/ms 甩动；<24px 点击 slop 不接管。
- **runtime-config confirm 嵌套不修**：从属语义（父 sheet 关 = 放弃操作，confirm 连带消失合理），非主操作流。
- **基线对照法再验证有效**：/tmp/ar-probe-baseline（39a8aca）+ 43099 独立端口——基线同挂证明 prompt bug 是 §6.12n 迁移引入的结构问题（非本轮/环境），与本轮改动解耦后定位到 holder 嵌套。
- **Playwright「prompt crash」实为 prompt 消失后的探针侧症状**：快速 locator 轮询/press 撞上元素消失 → detached retry/TargetClosed 误导性报错；先修产品 bug 再看探针报错。
- 加载态分层标准 / keepPreviousData 前提（同 observer in-place 换 key）/ 探针 mock 三铁律等沿用 §6.12o/§6.12n 记档。

## 进度（已完成 / 进行中 / 待办）

- ✅ §6.12o 全站加载态（`5dd1113` + `ecf34cc`）+ §6.12n sheet 收敛（`39a8aca`）全闭环
- ✅ **§6.12p 真机反馈修复（`0f3c882`）**：验证 = 四门禁 + CSS 硬闸 + token 机检 + e2e 24/24 + 单测 673 + 探针 m5-sheets 51/51（含 Part 5 拖拽几何 5 断言）
- ✅ handoff save（本文件）
- ⬜ **交用户真机复验**（§6.12p 清单见下 + §6.12n 浮层清单 + §6.12o 加载态清单仍待执行）
- ⬜ 记档不修：runtime-config confirm 从属嵌套；§6.12o 的 3 项（refsLoaded gate/keepPreviousData 行为探针/骨架单行变体）
- ⬜ 存量欠账（不在本轮）：rootBrowse 下沉；i18n 动词级 key 收敛；probe-chat-e2e 2 存量 FAIL

## 用户真机复验清单（§6.12p）

1. **任意移动 sheet 下拉收起**（重点验证项）：抓 grab 条/标题区下滑 → sheet 跟手 → 松手（超阈值或快速甩）→ **从松手位置继续滑出屏幕，不回弹、不闪回原位**；轻拖（<24px）松手回弹原位；中途松手（24-96px 慢速）也回弹
2. 下拉中途松手后 sheet 完全消失、scrim 同步退场，页面可正常点击
3. 同一 sheet 反复开关下拉，行为一致无残留
4. **历史 sheet closed 行点击**（顺带修复项）：命名 prompt 弹出后**稳定可见不消失**，输入确认 → resume 成功
5. 双主题下上述行为一致

（§6.12o 加载态 11 项 + §6.12n 浮层清单见前轮交付说明/handoff 快照）

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活 43011/43012；`0f3c882` 后已 rebuild（CSS 硬闸过，dist 01:32:25）。
- 本机 agent-browser 常驻 chrome 进程较多（202 个，内存 used 11G/16G）——探针/e2e 跑批变慢+偶发时序漂移，跑前留意。

## 易丢的关键上下文

- **探针跑法**：`bun scripts/probe-*.mjs`；跑前 touch main.tsx 完整 rebuild + sleep 16（核对 dist mtime）；e2e/单测 `systemd-run --scope --user -p MemoryMax=2G`。
- **基线对照法**：`git worktree add /tmp/ar-probe-baseline <commit>` + web build + tmux 43099 preview + `AR_WEB_ORIGIN` 指过去；stash 对照无效（dist 不随源码变）。
- **探针 stdout 缓冲**：进程被 timeout 杀时 stdout 缓冲丢失——诊断打点用 console.error（stderr）。
- **Playwright selector**：`text="..."` 带引号精确/无引号 substring；`.msheet` 系断言注意双 sheet 共存窗口（等目标标题）；`text-is` vs `has-text`。
- **Edit/Write 注入防护（持续）**：Edit 从最新 Read 逐字拷贝；Write 临时脚本有注入前科 → 诊断用「cp 探针 + 小 Edit + sed 打点」，跑完即删；rg 的 `-r` 是 replace 标志别误用（会改写输出显示）。
- **route mock LIFO** / preview 响应必带 mtimeMs / 右栏 InitScript 等沿用既往。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-27 01:53；触发原因：§6.12p 真机反馈修复 commit `0f3c882` + handoff save
