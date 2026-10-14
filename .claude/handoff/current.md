# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-14（**浮层关闭回焦蓝环修复已 commit `7b83976`，真机清单待用户复核**；同日早批：卡形制全对齐 `641e7d5`、空隙结构同构 `488ad68`、xterm 滚动条 + 发送按钮 `ae2397b`——发送按钮已验收 ✅）

## 一句话状态

用户反馈「▾ 切换浮层关闭后标题行出蓝色选中框，点空白消失」→ 成因实锤（Radix onCloseAutoFocus 回焦 × WebKit 对 tap 后脚本 focus 判 :focus-visible × 整行裸 button）→ 修法 = InstanceSwitchMenu + MobileSheet 基座统一 `onCloseAutoFocus` preventDefault（commit `7b83976`）。验证全绿（focus-policy 探针 6/6 含新关闭断言、header 探针 56/56、typecheck 0、单测 795、CSS 硬闸、tokens 机检）。**剩真机清单交用户**。

## 本 session 焦点

### 关键决策（不可丢）

- **浮层「关闭不回焦」已成文两族通用约定**（spec §5.0）：移动浮层关闭后焦点不程序化返还 trigger——WebKit 视觉蓝环 + 触屏无键盘焦点诉求，落 body 零感知。落点 = InstanceSwitchMenu（▾）+ **MobileSheet 基座**（⋯ sheet / AddMenu / ActionMenu 移动形态全部随之覆盖）；**桌面 Dialog/DropdownMenu 不拦**（键盘回焦是正确 a11y，Chromium 无视觉 bug）。
- **勿用 CSS outline 压制此类环**——症状端修复且扑灭键盘焦点指示；机制层修 = 拦回焦。
- **（沿用）composer 口径以 agent 为标尺**：卡形制/空隙结构已同构（`641e7d5`/`488ad68`），后续 composer 改动照抄 agent 结构。
- **（沿用）xterm 滚动条**：真身 = 内置 vscode 浮层滚动条（frontend-notes §32），CSS 双隐藏已落地，用户待多测。
- **（沿用）本 session Edit 写通道不稳**：小步 Edit + 写后回读；注释块缩进易差一空格，old_string 先 Read 实际内容。
- **（沿用）tokens.json Edit 与 PostToolUse oxfmt hook 冲突**：走 git checkout + /tmp patch + apply 路径。

### 进度

- ✅ 浮层关闭回焦蓝环 `7b83976`（mobile-project-header.tsx + mobile-sheet.tsx + 探针 A/B 关闭断言 + frontend-notes §33 + spec §5.0 + inbox）
- ✅ 卡形制全对齐 `641e7d5` / 空隙同构 `488ad68` / 滚动条+发送按钮 `ae2397b`（发送按钮真机验收 ✅）
- ⏳ **真机清单交用户**（见下）——唯一待办

### 阻塞 / 风险

- 无阻塞。

## 易丢的关键上下文

- **本批真机清单（交用户，PWA 强刷后）**：
  1. **▾ 切换浮层关闭后标题行无蓝色选中框**（本批主目标）。
  2. **⋯ sheet 关闭后 ⋯ 按钮无蓝环**（同机制推广面，未报但同修）。
  3. 终端 composer 与 agent 观感一致（空态卡高 108/76 + 圆角 12/sans/浮卡衬底）+ 快捷键条常驻（上上批遗留复核）。
  4. 滚动条复核（早批遗留）：终端跑一段时间输出后不再出现纵向滚动条。
  5. **PWA 强刷后复核**。
- 探针新断言：probe-sheet-focus-policy A/B「关闭不回焦 trigger」——B 关闭后 activeElement 的 tag（BODY vs 偶发 BUTTON）有非确定性时序漂移，但断言方向（非 FAB/非 INPUT）稳定，勿因 tag 漂移误判挂。
- 探针纪律（沿用）：`systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`；一次性诊断不入库用后删。
- composer 口径参照系（claude:3686 卡骨架 / :3698 textarea / :3756 底行）：终端侧已同构。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-14 10:10；触发原因：浮层关闭回焦批收尾（commit 7b83976 + handoff 滚动）
