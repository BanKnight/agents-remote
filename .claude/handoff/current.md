# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-14（**终端 composer 空隙结构同构 agent 已 commit `488ad68`，真机清单待用户复核**；本日早批 xterm 滚动条隐藏 + 发送按钮统一 `ae2397b`——发送按钮已获用户真机验收 ✅，滚动条用户待多测）

## 一句话状态

用户复核「终端 composer 高度明显比 agent 高」→ 对比实证：min-h 数值前批已逐字同款（2.5rem/sm:4.5rem），但**空隙结构不同构**——agent 的 72px 含 textarea 自带 `px-3.5 pt-2.5 pb-1`（14px 纵向 padding），终端 72px 是纯内容区（空隙在卡片 `px-3 py-2` 上），空态卡高 120 vs 108px（宽端）/88 vs 76（窄端）、文字下方空白 52 vs 38px。修正 = 结构同构（卡去 px-3 py-2，空隙移交 textarea + 底行 `h-9`/`px-2.5 pb-2 pt-0.5`，agent 逐字同款），改后空态卡高两端逐像素一致。验证全绿（batch7 46/46 含新 P1-9b、typecheck 0、单测 905+10+795、CSS 硬闸、tokens 机检、pre-commit 全门禁）。**剩真机清单交用户复核**。

## 本 session 焦点

### 关键决策（不可丢）

- **「min-h 逐字同款 ≠ 高度同款」**：空态渲染高度由「min-height 与自带 padding 的关系」决定——agent 把 14px padding 装进 72px min-h 里，终端把 72px 全给内容区再把空隙放卡片上。数值相同的类名掩盖了结构分叉。修法选**结构同构**而非数值补偿（min-h 改 calc）：未来 agent 调口径终端照抄同一结构，不再有隐性两套数值。
- **对比后保留的刻意差异（非口径偏差，勿再「对齐」）**：圆角 rounded-2xl（16px，原型 03f 形制）vs agent rounded-xl（03a）；font-mono vs sans（终端输 shell 命令）；code 面卡背景 vs 浮卡；快捷键条常驻（整区比 agent 高 40px 是功能行，spec §4.7 既定）。
- 原型复核：改后终端卡空隙（10/14/8）≈ workspace-terminal-input `.composer{padding:10px 12px 8px}`，形制不背叛。
- **（沿用）发送按钮统一已验收**：showSend = `hasInput && !inputDisabled` 三处（claude/pi/acp），isMobileComposer 仅驱动 Enter 分族。
- **（沿用）xterm 滚动条**：真身 = 内置 vscode 浮层滚动条（frontend-notes §32），CSS 双隐藏已落地，用户待多测。
- **（沿用）本 session Edit 写通道不稳**：小步 Edit + 写后 Read/sed 回读。
- **（沿用）tokens.json Edit 与 PostToolUse oxfmt hook 冲突**：走 git checkout + /tmp patch + apply 路径。

### 进度

- ✅ 终端 composer 空隙结构同构 agent `488ad68`（SessionDetailRoute.tsx + batch7 P1-9b 守卫 + design_spec §4.7 + inbox.md；handoff current.md 随批入库）
- ✅ xterm 滚动条隐藏 + 发送按钮统一 `ae2397b`；发送按钮真机验收 ✅
- ⏳ **真机清单交用户**（见下）——唯一待办

### 阻塞 / 风险

- 无阻塞。

## 易丢的关键上下文

- **本批真机清单（交用户，PWA 强刷后）**：
  1. **终端展开态输入框高度手感与 agent 一致**（空态对比——文字下方空白不再多一截）。
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
最后更新：2026-10-14 09:05；触发原因：终端 composer 口径对齐批收尾（commit 488ad68 + handoff save + 真机清单交付）
