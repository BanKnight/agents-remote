# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-14（**xterm 滚动条隐藏 + 发送按钮两端统一已 commit `ae2397b`，真机清单待用户复核**；前两批「终端 composer 宽高 + 三栏清单」用户均已搁置待主动复核）

## 一句话状态

滚动条归因修正批（用户指出前批把 xterm 区域滚动条理解成输入框问题）已 commit `ae2397b`：①xterm 滚动条隐藏——诊断实证滚动条真身 = **xterm 6 内置 vscode 浮层滚动条**（`.xterm-scrollable-element > .scrollbar`，scrollback 有滚动量时 slider 浮现；灌 300 行实测 se roll=128px / slider 14×89 op=1），修复 = CSS 双隐藏（scrollbar display:none + viewport scrollbar-width:none/::-webkit-scrollbar none），内部滚动机制不动；②agent composer 发送按钮两端统一——三处 `showSend` 删 `isMobileComposer` 条件（claude/pi/acp 桌面也有输入即显示 Send），isMobileComposer 保留驱动 Enter 键分族。验证全绿（batch7 45/45 含新 P1-12b 守卫、composer-enter/toolbar 探针反转+校准后全 PASS、typecheck 0、单测 905+10+795、CSS 硬闸 200463 字节、tokens 机检 0 违例、pre-commit 全门禁）。**剩真机清单交用户复核**。

## 本 session 焦点

### 关键决策（不可丢）

- **滚动条真身 = xterm 6 滚动重构的内置滚动条，非 `.xterm-viewport`**：xterm 6 DOM = `.xterm-viewport`（遗留层，内部空、恒等于容器高，滚动量恒 0）+ `.xterm-scrollable-element`（vscode ScrollableElement 移植，**真实滚动发生地**）+ WebGL canvas。滚动条 = 内置浮层 `.scrollbar.vertical > .slider`（有滚动量时浮现，slider 背景色由 xterm **运行时注入 `<style>`**）。旧版认知元素 `.xterm-rows`/`.xterm-scroll-area` 均不存在（WebGL 渲染器无 rows 容器）。诊断三轮扑空 → dump DOM 结构才定位。记档 frontend-notes §32。
- **display:none 与注入 style 无源序竞争**：注入 `<style>` 只写 slider 的 `background`，我们隐藏用 `display`——不同属性，不对抗（同属性 CSS 对抗注入 style 必输，因其永远在文档最后）。
- **「折叠 composer 后滚动条消失」= 数值巧合非修复**：区域变高 → customFit rows 变多 → 消化少量 scrollback 溢出 → roll 归 0；scrollback 多时仍会出，故隐藏指示器本身才是稳定修法。
- **内部滚动机制不动**：`.xterm-viewport` 的 overflow-y 保持（非 mouse-mode 滚轮兜底保留），只藏指示器；产品滚动语义本就全走 tmux copy-mode（frontend-notes §6），本地 buffer（scrollback 5000）滚动条纯视觉噪音。
- **发送按钮统一改动面最小化**：mobile 分支行为恒等（isMobileComposer 在 mobile 恒 true），只有桌面 0→1 变化；「多余的代码」= 三处 `&& isMobileComposer` 条件。**isMobileComposer 保留**——仍驱动 Enter 键分族（移动 Enter 换行 / 桌面 Enter 发送 / Mac Cmd+Enter 换行）。
- **预期行为变化**：桌面 running + 有草稿时 Send 压过 Stop（`showStop` 含 `!showSend`），与移动端同规则。
- **探针 H4 基线校准 3→4**：「3 个 selector trigger」断言写于批 8（`565868e` 附件双路径）之前，附件菜单 ActionMenu trigger 加入后基线变 4——git stash 基线对照实锤非本批引入，按「基线必须绿」纪律校准断言口径。
- **（沿用）本 session Edit 写通道不稳**：乱码 ×1 被拒、损坏写入 ×1 已 git checkout 恢复——写后必须 Read 回读；连续两次失败就停，恢复后再试。
- **（沿用）tokens.json Edit 与 PostToolUse oxfmt hook 冲突**：改 tokens.json 走 `git checkout HEAD --` + /tmp 零上下文 patch + `git apply --unidiff-zero`。

### 进度

- ✅ xterm 滚动条隐藏 + 发送按钮两端统一 `ae2397b`（12 files：v2-primitives.css + 3 route + composer-enter.ts 注释 + SessionDetailRoute.tsx 注释修正 + design_spec §4.7 + frontend-notes §32 + inbox.md + 3 探针）；诊断脚本 `_diag-xterm-scrollbar.mjs` 已删（一次性不入库）
- ✅ 前批终端 composer 修 `a5ffdfe` + handoff 滚动 `d1d066e`（真机清单用户搁置待主动复核）
- ⏳ **本批真机清单交用户**（见下）——唯一待办

### 阻塞 / 风险

- 无阻塞。xterm 滚动条机制已在 Chromium 探针闭环（修复前后数据对照），但隐藏效果的最终视觉复核在 WebKit 真机（PWA）；不为复现 WebKit 装 WebKit。

## 易丢的关键上下文

- **本批真机清单（交用户，PWA 强刷后）**：
  1. **终端区域不再出现纵向滚动条**——跑一段时间等输出积累（scrollback 超一屏）后复核；此前「折叠 composer 后消失」的偶然现象不再依赖。
  2. **桌面 agent composer（claude/pi/acp）有输入时发送按钮出现**（与移动端一致）；桌面 Enter=发送行为不变（移动 Enter 仍换行）。
  3. **running + 输入框有草稿时 Send 压过 Stop**——统一规则后的预期变化（非 bug）。
  4. **PWA 强刷后复核**。
  5. 搁置项：上一批（终端 composer 宽高 672px + 输入框滚动条口径）与三栏清单 9 项——用户说「暂时先这样，后续再来检查」，待主动复核。
- xterm 6 滚动条调试要点：量滚动要看 `.xterm-scrollable-element` 的 scrollTop/scrollHeight，不是 `.xterm-viewport`（恒 0）；slider 可见性 = `.scrollbar.vertical > .slider` 的 rect/opacity。
- batch7 P1-12b 守卫：`.xterm .xterm-scrollable-element > .scrollbar` display=none + `.xterm-viewport` scrollbar-width=none——未来若改 xterm 版本/配置导致滚动条回潮，此断言会抓。
- 探针纪律（沿用）：`systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`；一次性诊断不入库用后删；探针跑 bun 不跑 node。
- mock 终端流探针写法：`page.routeWebSocket(/\/stream/, ...)` 灌 `{type:"output",data}` / `{type:"status",status:"connected"}` 帧（heartbeat pong 同款）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-14 08:42；触发原因：滚动条归因修正批收尾（commit ae2397b + 删诊断脚本 + handoff save + 真机清单交付）
