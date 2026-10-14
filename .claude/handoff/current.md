# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-14（**终端 composer 卡形制全对齐 agent 已 commit `641e7d5`，真机清单待用户复核**；本日早批：空隙结构同构 `488ad68`、xterm 滚动条隐藏 + 发送按钮统一 `ae2397b`——发送按钮已获用户真机验收 ✅，滚动条用户待多测）

## 一句话状态

用户拍板「故意保留的差异，除快捷键条外都应对齐 agent」→ 卡形制全对齐 commit `641e7d5`：圆角 rounded-2xl→rounded-xl（16→12px）、font-mono→sans、code 面描边→agent 卡骨架逐字同款（border-on-surface/10 + bg-surface-raised/60 + 毛玻璃 + focus-within 亮边）；min-w-0 窄面板约束保留。快捷键条常驻不参与对齐（功能行）。验证全绿（batch7 46/46、typecheck 0、单测 795、CSS 硬闸、tokens 机检）。**剩真机清单交用户复核**。

## 本 session 焦点

### 关键决策（不可丢）

- **「min-h 逐字同款 ≠ 高度同款」**：空态渲染高度由「min-height 与自带 padding 的关系」决定——agent 把 14px padding 装进 72px min-h 里，终端把 72px 全给内容区再把空隙放卡片上。数值相同的类名掩盖了结构分叉。修法选**结构同构**而非数值补偿（min-h 改 calc）：未来 agent 调口径终端照抄同一结构，不再有隐性两套数值。
- **「保留刻意差异」已被用户反转（2026-10-14）**：圆角/字体/卡形制三项全对齐 agent（`641e7d5`），**唯快捷键条常驻保留**（整区比 agent 高 ~40px 是功能行，spec §4.7 既定）——后续 composer 口径改动以 agent 为标尺同步终端，勿再以「原型 03f 形制」为由保留终端特有形制。
- 原型复核：改后终端卡空隙（10/14/8）≈ workspace-terminal-input `.composer{padding:10px 12px 8px}`，形制不背叛。
- **（沿用）发送按钮统一已验收**：showSend = `hasInput && !inputDisabled` 三处（claude/pi/acp），isMobileComposer 仅驱动 Enter 分族。
- **（沿用）xterm 滚动条**：真身 = 内置 vscode 浮层滚动条（frontend-notes §32），CSS 双隐藏已落地，用户待多测。
- **（沿用）本 session Edit 写通道不稳**：小步 Edit + 写后 Read/sed 回读。
- **（沿用）tokens.json Edit 与 PostToolUse oxfmt hook 冲突**：走 git checkout + /tmp patch + apply 路径。

### 进度

- ✅ 终端 composer 空隙结构同构 agent `488ad68`（SessionDetailRoute.tsx + batch7 P1-9b 守卫 + design_spec §4.7 + inbox.md；handoff current.md 随批入库）
- ✅ 终端 composer 卡形制全对齐 agent `641e7d5`（圆角 12 / sans / agent 浮卡骨架；P1-7e 文案同步）
- ✅ xterm 滚动条隐藏 + 发送按钮统一 `ae2397b`；发送按钮真机验收 ✅
- ⏳ **真机清单交用户**（见下）——唯一待办

### 阻塞 / 风险

- 无阻塞。

## 易丢的关键上下文

- **本批真机清单（交用户，PWA 强刷后）**：
  1. **终端展开态输入框与 agent 观感一致**：高度（空态卡高 108/76）+ 卡形制（圆角 12 / sans 字体 / 浮卡衬底 + focus 亮边）。
  2. **快捷键条仍常驻**（终端整区比 agent 高 ~40px 是功能行，预期保留）。
  3. 滚动条复核（上批遗留）：终端区域跑一段时间输出积累后不再出现纵向滚动条——用户说要多测试才能测试到位，待用户结论。
  4. **PWA 强刷后复核**。
- batch7 P1-9b 守卫：card-pt=0px / textarea pt=10px pb=4px / 底行 36px——未来若有人往卡上加回 padding 会抓。
- 探针纪律（沿用）：`systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`；一次性诊断不入库用后删。
- composer 口径参照系（claude:3686 卡骨架 / :3698 textarea 类串 / :3756 底行）：终端侧已同构，后续 composer 口径改动以 agent 为标尺同步终端。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-14 09:30；触发原因：卡形制全对齐批收尾（commit 641e7d5 + handoff 滚动）
