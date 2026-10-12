# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-12（**反馈②③④⑤ 四联修全绿已记档待 commit；用户新补桌面中栏排版三联在 inbox 待开工**）

## 一句话状态

真机反馈四联修（②编辑后回源码 / ③切换浮层钉底档 / ④文件树·git 轮询 / ⑤换行分档）实现 + reviewer 消化（无 P0；2 P1 + 3 P2 全修）+ 探针 7/7 + 全门禁/双闸全绿 + redesign-v2.md 记档完成。**待 commit → 真机清单交用户 → ①（sheet 下拉热区）拍板问题一并交**。用户新补三条桌面中栏排版反馈（面板居中/标签贴边距+预览顶间隔/gutter 图标偏右）已记 inbox。

## 本 session 焦点

### 关键决策（不可丢）

- **reviewer P1-2 实锤**：refetchInterval 只 gate document 可见性（v5.100 queryObserver 源码），CSS invisible 保活容器仍轮询；移动检视关闭态经 `pollingEnabled={panelVisible && active}` 停，桌面非激活标签接受（切回即新）。轮询常量单源 `lib/query-client.ts` 的 `PANEL_POLL_MS = 10_000`（4 消费点：FilesPanel files / FilesToolPanel listing+diff / GitToolPanel diff+log）。
- **滚动还原两个衍生坑（探针实抓）**：①同步设 scrollTop 会被 CodeMirror 异步首帧 measure clamp（481→7）——必须 `view.requestMeasure({read, write})`；②查看态 CodeEditor value 必须 `editor.editValue`（草稿优先）而非 `data.content`——refetch 未回时旧 content 触发整篇 replace 冲掉还原（曲线恒 0）。还原值可能小于记录值 = 物理 clamp（.emeta→.fmeta + pb 变化视口变高），内容锚点无更优解，记档接受。
- **探针定位实标**：push 预览（/files）是 editingActions="nav"——完成/放弃在 nav 栏非容器内（meta 模式才在 .emeta）；断言 scope `[data-role="file-preview-pane"]`、按钮 scope `.nav`、sheet confirm scope `.msheet` 三向分离。

### 进度

- ✅ ②③④⑤ 实现 + 新探针 probe-files-live-refresh 7/7
- ✅ code-reviewer 完成（无 P0；2 P1 + 3 P2 全部消化修复并复验）
- ✅ 全门禁（format/lint/typecheck/test 793）+ CSS 硬闸 + tokens 机检全绿
- ✅ redesign-v2.md 记档（:1841 后新段）+ handoff 快照 20261012-1333.md
- ⬜ **commit（下一动作）→ 真机清单 + ①拍板交用户**
- ⬜ 新批：桌面中栏排版三联（inbox，含「改主标题那次范围扩大」回归排查线索）

### 阻塞 / 风险

- 无阻塞。

## 易丢的关键上下文

- **① 拍板材料（commit 后与真机清单一并交用户，AskUserQuestion）**：技术事实 = iOS UISheetPresentationController 默认即「不可滚 sheet 整面可拖 + 可滚 sheet 滚到顶续拉 dismiss」，grabber 只是视觉指示非唯一热区；当前分档（e1ae5a6）正对齐该默认；「grabber-only 全量窄热区」是合法变体但会复发 2026-10-03 真机取实的「打开即下拉」bug（人的「打开→按下拖」反应必然超过 450ms enter 窗口）。选项：A 保持现状（对齐 iOS 原生，推荐）/ B 全量 grabber-only（不建议，复发 e1ae5a6 已修 bug）。
- **新批三联（inbox 已记）**：①桌面端面板排版应居中（怀疑改主标题批次范围扩大波及，与全局文件/插件布局差异回归）；②桌面中栏标签工作区两侧贴边距 + 文件预览内容距顶部元信息行奇怪间隔（iPhone 也有后者）；③桌面中栏 group 间 gutter 图标偏右。
- **历史挂起真机清单**：终端 ⚙ 面板换代 5 条（869e62a 已交）+ ①③ 三联修 6 条（527d1b9 已交）+ 更早批次（snapshots/）。
- vite watch 漏 CSS：改 web 包后 touch web/src/main.tsx 重建 + `node scripts/ar-verify-css.mjs`；探针用 bun + systemd-run 2G。
- 本批工作区 9 路径：mobile-l3.tsx（②+滚动还原）/ mobile-project-header.tsx（③）/ file-browser.tsx + project-tool-panels.tsx + mobile-workbench.tsx + query-client.ts（④）/ editor-languages.{ts,test} + CodeEditor.tsx（⑤）/ 探针新文件 / redesign-v2.md + inbox.md（记档）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-12 13:33；触发原因：反馈②③④⑤ 收尾记档 + handoff 滚动，commit 前检查点
