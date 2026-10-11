# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-11（**sheet 下滑手势分档③ canScrollBack + .frow 按压回归修复 + 1b7 假挂修复，双 review 消化完成，待 commit + 真机清单交付；下一任务 = 桌面中栏 file tab 切回变全局预览 bug（已预研定位）**）

## 一句话状态

真机反馈「⚙ 设置浮层列表下滑误触发下拉关闭」修复落地：根因 = `.msheet` 根自身即滚动容器而 `hasScrollableContent` 只扫后代判 false → 整面可拖档误劫持列表回滚。修复 = `canScrollBack(target, root)` 手势时刻状态分档（已滚离顶下滑归列表、回顶才交 sheet）。伴生两笔：①批 11 `.frow` 化丢按压三件套回归修复（probe Part 5 复绿）；②probe-mobile-motion 1b7「预置假设漂移」假挂修复（拖距按实时高度自适应）。验证链全绿：单测 786（+canScrollBack 5）+ 探针 quick-keys 44/44 + mobile-motion 45/45 + 门禁/e2e 全过。code（P1×1/P2×5）+ design（P2×4/记档×2）双 review 全消化。

## 本 session 焦点

### 关键决策（不可丢）

- **三档起手面判定全景**（mobile-sheet.tsx）：①enter 升起中整面可拖（stop 接管）；②播完后 `hasScrollableContent` 结构分档——结构可滚（后代 pane）恒窄热区**含回顶后**（canScrollBack 对它短路不可达，1b4 锁定的既有行为，本轮未动）；③根内滚长内容 sheet（`.msheet` 根自身滚，②判不可滚）起手点在已滚离顶部滚容器内 → 下滑归列表不接管，回顶恢复整面可拖。
- **两段式交接已知边界**（design review 实抓）：web 无 iOS 原生滚动手势交接——已滚离顶时 pending 不建立，原生滚动接管后指针流中断，滚回顶后需**松手再拖**才收起（iOS 是同一次手势连续交接）。真机若反馈「拉到顶继续拉不收起」= 已知取舍非回归。已记 redesign-v2.md + 待真机复验清单。
- **`.frow` 按压统一补齐**（v2-primitives.css）：`transition: scale var(--duration-fast) var(--ease-standard)` + `:active:not(:has(input)) { scale: 0.98 }`——`:has(input)` 排除 rename 编辑行（input 内按下/拖选不让整行回缩）。写法与 `.srow2` 家族逐字同构。
- **探针两教训记档 frontend-notes §29**：①CDP 合成 touch 在本环境不可靠（事件送达但 hit-test/原生滚动异常），手势断言一律 `page.mouse` + `page.mouse.wheel`；②「预置假设漂移」假挂——探针拖距/阈值不得取自编写时刻几何，按运行时实测自适应。
- **M22d 拖距公式**（code review P2-3 修正）：慢拖投影 ≈ dy×2.25（位移+窗口速度×300ms），`dy = 0.4×阈值` → 投影 0.9×阈值（reviewer 建议的 0.5 会越阈误 dismiss，已按速度投影实算修正为 0.4）。

### 进度

- ✅ canScrollBack 实现 + 单测 5 + M22 探针五断言（quick-keys 44/44）
- ✅ probe-mobile-motion 45/45（1b7 自适应 + Part 5 复绿 + ListRow 标签过期修正）
- ✅ 全门禁：format/lint/typecheck/test 786 + CSS 硬闸 + tokens + content-type + e2e terminal-session
- ✅ 双 review 消化：code P1-1（注释语义错位——保持最小改动只修注释）+ P2 守卫/探针健壮性/注释；design 两段式边界记档 + 待真机复验补条 + 「全覆盖」措辞收敛 + 段落日期补齐
- ✅ 记档：redesign-v2.md 手势链段两段 + frontend-notes §29
- ⬜ **commit（下一动作）→ 真机清单交用户**
- ⬜ 开工用户排队任务：桌面中栏 file tab 切回变全局文件预览 bug

### 阻塞 / 风险

- 无阻塞。分档③手势手感与两段式边界 Chromium 探针覆盖不了（合成 touch 不可靠），靠真机清单验证。

## 易丢的关键上下文

- **下一任务已预研（用户排队：「中栏中打开的文件，点击其他标签，然后又点击回文件标签，会整个变成全局文件中的预览」）**：机制链已定位——`mainPageActive`（WorkbenchRoute.tsx:454-460）= `scope=global && leftMode∈{files,plugins,settings} && (!focusId || (leftMode=files && focusId 前缀 file_))` → `filesPushActive` → 中栏被 `FilesPushPreview`（10m2 全局文件推入预览）抢占（`desktopMainPage ?? instanceArea` 互斥卸载）。`/files/file/$` 的 `deriveWorkbenchRouteContext` 分支 **leftMode 不强制、继承透传**（workbench-model.ts:719-730「从 /files 进来=files 保文件树」）+ `navigateToFile` 全局分支 sticky 透传 leftMode + 中栏 tab 切换 onSelectTab→navigateToFile——**leftMode=files 残留 + file_ focusId = 切回 file tab 时中栏变推入预览**（用户描述「整个变成全局文件中的预览、整个页面发生变化」精确吻合）。**尚未实锤用户的具体操作路径**（哪一步把 leftMode 变 files），下一步写一次性诊断脚本实测候选路径（page.goto /files/file/X + 左栏树点文件 + 活动栏切换 + tab 往返），dump 每步 URL + 中栏 DOM 形态。
- **本批真机清单（待交用户）**：①⚙ 面板滚到中段下滑 = 列表回滚、浮层不收起；②滚回顶部后下滑 = 浮层收起（两段式：滚回顶后需松手再拖，连续拉不交接）；③grab 热区（标题条）任意滚动位下拉收起；④文件树/全局文件行按住有 0.98 回缩反馈（批 11 回归补齐）；⑤（v2 两域分离 5+1 条仍待复验，见 snapshots/20261011-2017.md）。
- 本 session 依旧高发写入损坏（诊断脚本 rm 3 个）；插桩改正式文件 + git checkout 兜底。**CDP dispatchTouchEvent 不可靠勿再走**（frontend-notes §29）。
- 设置二级 5 条 + 第二轮重写版 5 条真机清单仍待用户复验（历史挂起）。
- vite watch 漏 CSS：改 v2-primitives.css 后需 touch web/src/main.tsx 才落盘 preview（本轮又实锤一次，§10）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-11 20:30；触发原因：sheet 手势分档③批双 review 消化完成，commit 前检查点
