# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-10（**两个全局文件问题处理完毕已 push（663ae59）：桌面布局已修对齐原型；iPhone 滚动转真机取证浮层——等用户读数回传定位根因**）

## 一句话状态

用户 mid-turn 指派两个全局文件问题（v1.6 真机反馈）：① iPhone 端全局文件无法滚动（agents-remote 项目能滚、22router 不能，看得到下方还有内容）；② 桌面端布局与 mac-files-global 原型差别巨大。**②已修**：作用域分段从满宽第二行收进 mhead 标题行内 280px 胶囊（原型 :66），抽 `FilesScopeSeg` 单源组件由 WorkbenchRoute mainPage 装配进 header actions；诊断几何实锤 seg4 x=1104 w=280 两段 137px 与原型完全对齐；三探针回归全绿（cwd-memory / m9-d 67 / batch4 42）。**①转真机取证**：Chromium 移动视口实测滚动链全健康（根层/子目录层 sh=2750/ch=759/canSetScroll ✓、父链每层 flex/min-h-0 核对齐、touch-action/sticky/content-visibility 全排除）→ iOS WebKit 专属 → 按 frontend-notes §22 证据纪律停止推理修复，埋取证浮层 `web/src/lib/files-scroll-debug.ts`（main.tsx 已挂载，DEBUG_ENABLED=true 已进 entry chunk）。commit 663ae59 已 push。

## 本 session 焦点（两个全局文件问题）

### 关键决策（本阶段不可丢）

- **问题②修复形态**：`FilesScopeSeg(currentPath, onPathChange)` 导出组件（global-files-overview.tsx），GlobalFilesOverview 内部 scopeSeg 定义/渲染点已删（含残留 useAtom）；桌面 mainPage 用 `<FilesScopeSeg/> + <AddMenu/>` fragment 装配（原型顺序 seg4→mbtn）；移动端 MobileFilesOverview 路径不受影响（不走此组件）。类名 `seg4 mx-0 w-[280px]`（mx-0 清 .seg4 默认 `margin:10px 14px 0` 侧距）。
- **问题①取证通道字段语义（切分候选根因，文件头有全文）**：`sh/ch/st`=滚动容器 scrollHeight/clientHeight/scrollTop——sh≈ch=内容不溢出（「下方内容」属他层或错觉）；sh>ch 且 ts/tm 前进但 st 恒 0=引擎不响应；sh>ch 且 ts/tm 不前进=手势没到达滚动容器。`ts/tm`=落在滚动容器内 touchstart/touchmove 计数；`pv`=touchmove 传播结束后 defaultPrevented 计数（setTimeout 0 延迟读，JS preventDefault 拦截实锤）；`ih/mh`=innerHeight/main 实际高（mh≪ih=--app-viewport-height 链断，§1 家族）；`tg`=最后 touchstart 目标 class 摘要（手势落点）。
- **取证浮层技术形态**：fixed 顶部安全条（top:env(safe-area-inset-top)、z-index 2147483647、pointer-events:none、绿字黑底 mono 10px），250ms 轮询刷新；监听器 window/document capture+passive；主滚动容器 = main 内面积最大的 `.overflow-y-auto`（每 tick 重扫）；touch 落点判定 `closest(".overflow-y-auto")` 后比对主容器。
- **证据纪律（§22）**：真机反复失败的 bug 停止第 N+1 轮推理修复，先拿真机第一手数据；Chromium 探针只能证「修复在该路径生效」，不能证「命中真机断点」。用户的测试操作不是变量。

### 进度（已完成 / 待办）

- ✅（前段）设置二级 UI 换代 commit `602daef` 已 push；待用户真机验证清单 5 条（redesign-v2.md）。
- ✅ 问题②修复 + 问题①取证通道 commit `663ae59` 已 push（全门禁绿：format/lint/typecheck/单测 774/CSS 硬闸/落盘 content-type 双 text）。
- ⬜ **等用户真机（取证 v2 已部署 435d224）**：首组数据 sh=ch=712 + ts=0/tg=- → 所选容器不溢出（选错目标）且转录在触摸前的静置态。v2 已改全列容器 + 全局手势计数——用户操作：杀 PWA 重开 → 全局文件 → 进 22router → **等列表渲染完** → 上滑 → **手势做完/进行中读数**发回（c0..c2 行 + doc 行 + ts/tm/pv/dy 行 + ih/mh/tg 行）。
- ⬜（取证数据回传后）按字段语义切分候选根因 → 定位 → 修复问题① → 删 files-scroll-debug.ts + main.tsx 挂载点。

## 易丢的关键上下文

- **取证浮层临时开关**：`web/src/lib/files-scroll-debug.ts` `DEBUG_ENABLED=true`（当前常开）——取证完成整文件连 main.tsx 挂载点一并删除（同 keyboard-debug.ts 先例）。
- main.tsx 挂载点在 `restoreLastPath()` 之后：`mountFilesScrollDebug()` + 注释两行。
- dist entry = index-BjNWqDQe.js（含 2147483647 浮层特征 + defaultPrevented×4），已 curl 验证 content-type。
- 问题②的桌面诊断脚本 `/tmp/diag-desktop-files-layout.mjs`、移动滚动诊断 `/tmp/diag-mobile-files-scroll.mjs`（一次性不入库，mock overview 形状必须 `{candidates, projectNames}` 否则 error boundary）。
- 设置二级换代真机清单 5 条 + 批 18 键盘取证（keyboard-debug DEBUG_ENABLED=true → touch main.tsx）仍是背景存量。
- 真实后端 22router 项目存在且文件多（用户「看得到下方还有东西」）——取证时 sh 必然 > ch，重点看 st/ts/tm 三者组合。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-10 10:40；触发原因：两个全局文件问题收尾——桌面布局修复 + iPhone 取证浮层部署，commit 663ae59 已 push，转用户真机取证
