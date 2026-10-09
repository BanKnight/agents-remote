# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-10（**v1.6 设计包优化全流程完成并 push（至 `2b25a6c`）：六批实施 → 全套 e2e → reviewer 双审消化（改 17 + 记档 2）→ 文档回填——等用户统一真机复验**）

## 一句话状态

v1.6 设计包（57 改 + 4 新增，120 页原型）五项点名 + 全量 diff 盘点收敛六批全部落地（`6444332`→`29505bd` + e2e 连锁 `0b24908` + 双审消化 `2b25a6c`，均已 push）：置顶会话条（hash 色板）/ ⋯ 菜单三区上收 / 实例信息瘦身 + retry 控件化 / 点正文编辑 pencil 全退役 / 全局文件·插件布局统一 / 终端 composer send2。e2e 27/27 + 单测 1681 + 门禁全绿 + 探针 9 组全绿。**全部里程碑完成，统一真机清单已交付用户。**

## 本 session 焦点（v1.6 设计包优化）

### 关键决策（本阶段不可丢）

- **用户三拍板（v1.6 决策日志，redesign-v2 §v1.6）**：①置顶色板 = sessionId FNV-1a 哈希 + 撞色顺延，零持久化（同会话颜色永久稳定，偏离 spec §8 持久化方案）；②实例信息「累计（N 轮·$x·N tok）」不落（AgentSession 无跨回合累计数据源，不伪造）；③终端 composer ⚙ 键位自定义不落；④`.sw` 手绘件不落（Lucide 单轨 §15）。
- **双审消化定案（改 17 + 记档 2，详见 redesign-v2 §v1.6 reviewer 段）**：CR-P1 串行化（retry commit 单飞链）/ ~ 缩写链路（api `homePath` + web `shortenHomePath`）/ diff 入口承接；DR-P1 crumb 根名文字（批 11「纯图标根段」退役）/ toggle 绿收敛（三处共享 helper）；记档 = 菜单线制误报 + focus gate（plan 批准行为）。
- **探针适配 4 件教训**：retry-config 串行链 PUT 渗出被「未 mock 深层 query → 404 → React Query 重试退避（1s/2s/4s）」拖慢 → catch-all route 兜底 + 轮询断言替代固定窗口（**固定 waitForTimeout 在串行链/退避下必 race**）；desktop-instance-info 的 TabChip ℹ v1.5 批 4 已退役 → ⋯ 菜单入口；cwd-memory 根态判定（根态 `<b>{rootLabel}</b>` 后「无段按钮 = 回根」）；batch4-desktop `.seg4` 容器限定（页内首处项目名 = 侧栏行，会误点）。
- **批 18 残留（键盘取证）**：`keyboard-debug.ts` 浮层过渡关闭（`dcd62f0` `DEBUG_ENABLED=false`），批 18 取证操作（清单最优先项）需先 `DEBUG_ENABLED=true` 重建恢复。

### 进度（已完成 / 待办）

- ✅ v1.6 六批全部实施 + 每批 commit（`6444332`→`29505bd`）+ e2e 连锁修复（`0b24908`）。
- ✅ 全套 e2e 27/27（3.2m）；单测 1681（api 905 + web 771 + shared 10，web 含 shortenHomePath +5）。
- ✅ code-reviewer + design-reviewer 双审 → 20 项发现逐条核对现场/原型/i18n → 消化 17 改 + 2 记档（`2b25a6c`）。
- ✅ redesign-v2.md §v1.6 reviewer 结论回填；探针 9 组全绿（pinned/retry/composer/header/instance-info/batch3/batch4/plugins/cwd-memory/batch7）。
- ✅ `/handoff save` 本文档 + push。
- ⬜ **用户统一真机复验**（清单见下节，v1.6 新增项 + 批 13-18 存量项）。
- ⬜ 批 18 键盘取证（用户读浮层数据 → 按层修复 → 删通道）。

## 统一真机复验清单（全部完成后统一交付）

**【批 18 取证操作，最优先】**：进入文件编辑态 → 反复收起弹开键盘直到工具条被挡出现 → 把屏幕左上角绿色浮层最后几行读给 Claude（格式 `#N src ih=… vv=…+… v=… off=… root=…`）。**注意：浮层当前过渡关闭（`dcd62f0`），取证前需恢复 `DEBUG_ENABLED=true` 并重建。**

**v1.6 新增项（本阶段重点）**：
1. **置顶条**：工作台行1 之下色点出现；颜色 unpin/再 pin 稳定；点击一步切换零销毁；白环跟随当前会话；长按 500ms 出名字气泡；0 置顶整行隐藏。
2. **⋯ 菜单三区**：导航（会话历史›/实例信息›）→ 动作（置顶✓/重命名…/自动重试✓ 即点即改）→ 销毁（关闭… 红）；桌面 tabstrip ⋯ 同构。
3. **实例信息**：纯信息面板无动作行；「会话目录」行带 `~` 缩写（agent 型）；retry「编辑」→ 半屏 sheet 控件（toggle 绿轨/stepper 边界防呆/间隔选档/文案防抖即存）；桌面 = 居中 Dialog。
4. **点正文编辑**：文件预览查看态点正文任意处进编辑（拖选/滚动不误触）；MD/HTML 渲染态点击切源码进编辑；pencil 全无（6 处）；「查看 diff」在 ⋯ 菜单（files 预览态 DetailBackBar 右端）。
5. **全局文件/插件布局**：一级页行2 = crumb 地址框（根态 = folder + **agents-remote** 根名文字）+ 收缩搜索钮；插件页域行单行化 + 项目段 folder + 纯项目名（无「本项目 ·」前缀）。
6. **终端 composer**：发送钮 = send2 主色方形（↑ 图标）；无 $ 提示符；无 ⚙。
7. **toggle 绿色**：设置页 1M 开关 / retry sheet 自动重试开关 = 绿轨白钮（原蓝底）。
8. **行1 类型图标**：agent 会话 = ✨ / terminal = ⌨ / 空态 = 📁；skill tab 聚焦无图标（标题 = skill 名）。
9. **crumb 地址栏**：34px/13px/r10 升格形态；子目录层根段 = 纯图标回根钮。

**批 13-16 存量 19 条 + 批 17 五条**：见快照 `20261010-0345.md`（20-24 编号续接）。

## 易丢的关键上下文

- **v1.6 基线 = `2b25a6c`**（双审消化后）；范围基准 `git diff 4e8caa8..29505bd`。
- useAutoRetryToggle 现签名 `(projectName, sessionId, sessionType = "agent")`——两调用点已接线（mobile-workbench focusKind gate / SessionTabStripActions sessionType）；AutoRetryHeaderButton/AutoRetrySheetAction 内部调用不传 = 默认 "agent" 合法（二者渲染面本就 gate 在 agent）。
- info-sheet `open` 签名 4 参 `(title, fields, variant?, status?)`——**footer 参数已删**，调用点全部 4 实参。
- FileCrumb 根态 = 图标 + `<b>{rootLabel}</b>`（files.root = "agents-remote"）；子目录层根段 = 纯图标回根钮。
- retry 编辑器 = 即点即存 + commitQueueRef 串行链——**探针断言 POST 时用轮询（waitForPosts）不用固定窗口**。
- 探针跑前照例 touch main.tsx 等 rebuild + 特征串验证（本轮「Back to preview 消失 + agents-remote 在」双特征确认过）。
- 批 17/18 键盘 inset 单源与诊断浮层设计详见快照 `20261009-1507.md` / `20261010-0345.md`。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-10 03:45；触发原因：v1.6 全流程（六批 + e2e + 双审消化 + 文档回填）完成并 push（2b25a6c），交付统一真机清单
