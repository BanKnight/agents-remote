# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-02 21:15（v1.7 行形批 + 用户 5 点反馈全部落地，全门禁 + 5 探针绿，待 commit）

## 一句话状态

**v1.7 统一行形批 + 用户真机 5 点反馈全部实现完毕**：7 行面统一行形（品牌标→名→状态点→时间，
状态文字退出、置顶 pin 退出列表行）；桌面左栏会话行（SideInstanceRow + 05g）接入右键/长按菜单
（SessionRowMenu 单源，对齐项目区）；置顶组行去项目名 chip、去 pin。全门禁绿（format/lint/
typecheck/test 1012 pass）+ CSS 硬闸 + tokens 机检 + 5 探针全绿（m5-sheets 94、mobile-project-header
56、batch7 46、provider-icons 11、新 probe-session-row-menu 14）。**待 commit → 用户 push 确认。**

## 本 session 焦点

### 关键决策（不可丢）

- **§4.8 统一行形契约**（spec 已落）：行 = ①品牌件/类型标 ②名字 flex-1 truncate ③状态圆点
  ④时间。**置顶标识退出列表行**（行尾 pin + ▾ 菜单行 pin 退役）；置顶语义 = 05g 置顶分组头 +
  移动置顶条 + 项目 Tab 活动行 pin（保留）+ ⋯ 菜单 ✓。
- **置顶组行不显示项目名 chip**（用户拍板：置顶即用户关心的，项目名冗余）。
- **桌面左栏会话行交互**（用户拍板平板触屏对齐项目区）：右键 + 触屏长按 → SessionRowMenu
  （族A 锚定浮卡 176px），动作 = useInstanceRowActions 单源（置顶 ✓ keepOpen / 重命名预填 /
  关闭红）；触发行 dashed ring（PROJECT_ROW_TRIGGER_RING）。
- **时间口径（API 管线门控）**：terminal 不发 createdAt（metadataToCandidate），agent=
  updatedAt ?? createdAt；历史行= lastActivityAt ?? startedAt。
- **instanceDot2 单源归位 shell-primitives**（消 history-list ↔ instance-area 循环 import）。
- **本 session 教训（Edit 编造连环损坏，复发 5+ 次）**：长 new_string 凭记忆写必坏——先 Read
  精确字节 → old_string verbatim → 小步单目的编辑 → 大段替换后 Read 回读。连续失败即停恢复。

### 进度

- ✅ 设计文档先行：design_spec §4.8（行槽位/置顶退出/会话行交互段/时间口径管线门控）+ §4.2
- ✅ #1 桌面左栏「全部」行靠右对齐（flex-1 名字 + trail 右推）
- ✅ #2 置顶组行删项目名 chip + #3 桌面行尾 pin 退役（SideInstanceRow + 05g）
- ✅ #4 移动 ▾ 浮层列表 pinnedIds 链全撤（mobile-project-header + mobile-workbench）
- ✅ #5 会话行右键/长按菜单：SessionRowMenu 新组件（workbench-side + 05g 两消费点 + 单实例 +
  renameHolder）；useRowContextMenu/useLongPressActions 接线；closeInstance 透传 WorkbenchRoute
- ✅ reviewer 修复：P1 flex-1、P2 管线根修（session-registry）、P2-1 历史行 dot2 档、P3-3 骨架
  action="meta"、P3-6 mobile-sheets 名兜底改 displayTitleOf 单源消费
- ✅ instanceDot2 挪 shell-primitives 单源
- ✅ 新探针 probe-session-row-menu.mjs（14 断言：右键/三项/ring/Esc/keepOpen+✓/terminal 行/
  05g 置顶组无 chip 无 pin/05g 右键）
- ✅ 全门禁 + CSS 硬闸 + tokens 机检全绿；真实环境 pinned 污染已清理（agent_srm-1）

### 阻塞 / 风险

- 未 commit（全绿即 commit）；**未 push（外发，须用户逐次确认）**。
- commit 尾行：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 长按（pointerType=touch）路径 Playwright 触发不了（mouse 被显式排除，frontend-notes §29），
  已交真机清单。
- 遗留（未拍板）：`?? wiki/` 目录 git 归属。

## 下一步

1. commit（`git add && git commit`，禁 --only/--git-dir）→ 交用户真机清单 + push 确认。
2. 真机清单：桌面行靠右对齐观感 / 置顶组无 chip 无 pin / ▾ 行无 pin / 会话行右键菜单三项 /
   **平板触屏长按菜单**（探针盲区）/ 移动 ▾ 列表行形。
3. 遗留：wiki/ 目录归属待用户拍板。

## 易丢的关键上下文

- 探针 mock 铁律新增：**pinned-sessions route 正则不可带 `$` 锚**——POST/DELETE 是
  `/pinned-sessions/<id>` 子路径，带 `$` 会穿透 mock 打真实 api 污染 state.yaml（本 session
  实锤 + 已清理 + 探针注释记录）。
- 探针跑法 `bun scripts/probe-X.mjs`（dev web 43012 tmux ar-dev）；单测限内存
  `systemd-run --scope --user -p MemoryMax=2G bun run test`。
- 05g/SideInstanceRow 菜单接线模式：`useRowContextMenu` + `useLongPressActions(openAt)` +
  `menuId` state + 列表尾 SessionRowMenu 单实例（id 回查 candidates 取 panelRef/displayName）+
  onClick 首行 `guardClick()` 抑制长按合成 click。
- batch7 探针 anchors 排序 comparator：`a.compareDocumentPosition(b) & FOLLOWING ? -1 : 1`。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
