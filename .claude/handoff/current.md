# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-10（**两个全局文件问题处理完毕已 push（663ae59）：桌面布局已修对齐原型；iPhone 滚动转真机取证浮层——等用户读数回传定位根因**）

## 一句话状态

两个全局文件问题**双双修复完成**：②桌面 seg4 收进标题行（663ae59）✓；①iPhone 滚动死角根因实锤并修复（d067ba8）——**滚动容器全高延伸到屏幕底 + 自身 pb 让位 nav 的模式存在死角**：内容高 ∈（净区高 608, 容器高 712）时（22router ≈680）尾行侵入 nav 覆盖区被遮 + scrollHeight 判定无溢出零滚动量；Safari 视口矮 47px 同内容真溢出可滚——四象限现象（Safari 滚/PWA 不滚/agents-remote 滚/22router 不滚）全部闭合。修复 = GlobalFilesOverview 容器 max-lg:pb-[var(--shell-mobile-bottom-nav-space)] 把滚动链抬到 nav 顶上方 + FilesPanel 滚动容器恢复 pb-3。死角场景诊断 ALL PASS + 回归全绿（cwd-memory/m9-d 67/batch4 42/e2e file-browser 2）。**待用户真机确认滚动恢复后删取证浮层**（files-scroll-debug.ts + main.tsx 挂载点 + localStorage 键 files-scroll-debug-v3）。

## 本 session 焦点（两个全局文件问题）

### 关键决策（本阶段不可丢）

- **问题②修复形态**：`FilesScopeSeg(currentPath, onPathChange)` 导出组件（global-files-overview.tsx），GlobalFilesOverview 内部 scopeSeg 定义/渲染点已删（含残留 useAtom）；桌面 mainPage 用 `<FilesScopeSeg/> + <AddMenu/>` fragment 装配（原型顺序 seg4→mbtn）；移动端 MobileFilesOverview 路径不受影响（不走此组件）。类名 `seg4 mx-0 w-[280px]`（mx-0 清 .seg4 默认 `margin:10px 14px 0` 侧距）。
- **问题①取证通道字段语义（切分候选根因，文件头有全文）**：`sh/ch/st`=滚动容器 scrollHeight/clientHeight/scrollTop——sh≈ch=内容不溢出（「下方内容」属他层或错觉）；sh>ch 且 ts/tm 前进但 st 恒 0=引擎不响应；sh>ch 且 ts/tm 不前进=手势没到达滚动容器。`ts/tm`=落在滚动容器内 touchstart/touchmove 计数；`pv`=touchmove 传播结束后 defaultPrevented 计数（setTimeout 0 延迟读，JS preventDefault 拦截实锤）；`ih/mh`=innerHeight/main 实际高（mh≪ih=--app-viewport-height 链断，§1 家族）；`tg`=最后 touchstart 目标 class 摘要（手势落点）。
- **取证浮层技术形态**：fixed 顶部安全条（top:env(safe-area-inset-top)、z-index 2147483647、pointer-events:none、绿字黑底 mono 10px），250ms 轮询刷新；监听器 window/document capture+passive；主滚动容器 = main 内面积最大的 `.overflow-y-auto`（每 tick 重扫）；touch 落点判定 `closest(".overflow-y-auto")` 后比对主容器。
- **证据纪律（§22）**：真机反复失败的 bug 停止第 N+1 轮推理修复，先拿真机第一手数据；Chromium 探针只能证「修复在该路径生效」，不能证「命中真机断点」。用户的测试操作不是变量。

### 进度（已完成 / 待办）

- ✅（前段）设置二级 UI 换代 commit `602daef` 已 push；待用户真机验证清单 5 条（redesign-v2.md）。
- ✅ 问题②修复 + 问题①取证通道 commit `663ae59` 已 push（全门禁绿：format/lint/typecheck/单测 774/CSS 硬闸/落盘 content-type 双 text）。
- ✅ 问题①根因定案并修复（d067ba8 已 push）：v4 数据 + 用户截图几何实锤**死角**——容器全高延伸到屏幕底（y=132 ch=712）+ 自身 pb 让位（pb=104 生效，非失效）→ 净区 608；22router 内容 ≈680 ∈ (608, 712) → 尾行侵入 nav 区（nav y=740 h=104）被遮（package.json 半行实证）+ 内容底缘 680 < 712 → scrollHeight 无溢出零滚量（dy=152 白滑）。Safari 视口矮 47px 同内容真溢出可滚——四象限现象全部闭合。修复 = GlobalFilesOverview 容器 `max-lg:pb-[var(--shell-mobile-bottom-nav-space,0px)]`（滚动链抬到 nav 顶上方）+ FilesPanel 滚动容器恢复 `pb-3`。死角场景诊断（25 行 mock）ALL PASS（容器底=nav 顶、滚动量 236、滚到底尾行底 761 ≤ nav 顶 774）；回归 cwd-memory ALL PASS + m9-d 67 + batch4 42 + e2e file-browser 2 passed。
- ⬜ **等用户真机确认**：iPhone PWA 全局文件 → 22router → 上滑应正常滚动、滚到底最后行完全可见。确认后**删取证浮层**：`web/src/lib/files-scroll-debug.ts` 整文件 + main.tsx 挂载两处（import + mountFilesScrollDebug() 调用）+ 提示清 localStorage 键 `files-scroll-debug-v3`。
- ⬜（背景存量，同款死角候选）mobile-projects-home:198 / mobile-plugins-market / plugins-home 等移动 L1 页 = 同款「滚动容器自身 pb 让位」模式，内容高恰落窗口时同样触发；本轮 surgical 只修报告的文件页，其余待用户反馈或统一治理批次推广「父层截断」。
- ⬜（背景存量）取证浮层 v4 遗留观察：pv=69（pm=221 中 69 次 defaultPrevented）来源未查——若真机修复后仍偶发滚不动，沿 pv 切分 JS 拦截层。

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
