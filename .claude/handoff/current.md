# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-14（**终端 composer 修已 commit `a5ffdfe`，真机清单待用户复核**；上一批三栏可点性修已全部落地，其真机清单用户表示「暂时先这样，后续再来检查」）

## 一句话状态

终端 composer 修（真机反馈两条，**均针对输入框**）已 commit `a5ffdfe`：①宽度对齐 agent——快捷键条 + composer 卡整组限宽 `max-w-2xl`（672px）居中（agent 同款 `mx-auto w-full max-w-2xl`），不再横跨全宽；②输入框滚动条口径修——textarea 补 `min-h-[2.5rem]` 基线 + 删 `leading-[1.35]`（18.9px 非整数行高是 1px 级滚动量的首要嫌疑，agent 侧 text-sm 捆绑整数行高无此现象），行高走 text-sm 捆绑（整数 20px）。诊断探针改后实测（桌面 1440×900 + iPad 1180×820）：card=672 居中（leftGap=rightGap）、lh=20px、正常步骤滚动量全 0（600 字符 roll=32px 为 max-h 封顶预期）。验证：typecheck 0、probe-v15-batch7-skeleton 44/44、m9-d 68/68、单测 795、CSS 硬闸（200307 字节 + content-type text/css）、tokens 机检、pre-commit 全门禁绿。**剩真机清单交用户复核**（PWA 强刷后）。

## 本 session 焦点

### 关键决策（不可丢）

**本批（终端 composer 修）：**

- **两处 composer 同库异构**：终端 SessionInputDrawer 与 agent（assistant-ui ComposerPrimitive.Input）都用 react-textarea-autosize 8.5.9——差异全在用法参数与样式。agent composer 口径（「刚刚好」参照，零改动）：外层 padding 全宽 + 内容 `mx-auto w-full max-w-2xl`（672px）居中 + textarea `min-h-[2.5rem] max-h-32 sm:min-h-[4.5rem]`、行高 text-sm 捆绑整数 20px。
- **滚动条首要嫌疑与处置**：非整数行高 18.9px 下 autosize 写入的 inline height 与 WebKit 整数化的 scrollHeight/clientHeight 可差 1px → 唯一 overflow:auto 的 textarea 出滚动条；折叠 = `!collapsed` 条件渲染卸载 → 展开重挂 autosize 重新初始化 → 消失——与用户描述吻合。Chromium 探针滚动量恒 0 不可复现（WebKit 特有），按口径对齐消除嫌疑 + 交真机复核（不装 WebKit）。
- **宽度对齐结构决策**：快捷键条 + form 一起进 `mx-auto w-full max-w-2xl min-w-0` 内容组（与 agent「整块 composer 限宽」同构），不用「只限 form」避免上宽下窄断裂；展开钮随内容组（中栏不很宽时居中可接受，真机反馈再调）。
- **max-h-32 封顶滚动是预期行为**：内容 160px > 128px 上限时 roll>0（600 字符折行 roll=32px）符合「封顶后内容滚动」设计意图，非 bug。
- **collapse 分族不动**（spec 既定）：terminal 默认收起 / agent 默认展开；快捷键条常驻（收起态也在，展开时上移不消失）。

**上一批（三栏可点性修，全部落地）：**

- **折叠钮图标形制三轮演进**：文字字形「‹」「»」（可点区 4.7px）→ 图标化双角 chevron → 用户真机复核定 **panel-*-close**。tokens.json icon.mapping 同步。
- **RailButton 22×56**：命中=视觉拍板（44×56）后被真机复核「宽度太离谱，至少剪一半」→ `h-14 w-5.5` 定案。
- **hover 反馈（design review P1）**：`bg-on-surface/5` 是替换背景非叠加，深色主题 hover 沉底；改表面阶梯 `hover:bg-surface-inset` → `active:bg-elevated3`。
- **折叠钮色与 cursor 契约**：`.clps{color:var(--ink-2)}`（#8E8E93 中性，「不要用蓝色」）；cursor 走 UA 默认箭头（删 `cursor-pointer`，不设手型）。探针守卫：p6a/p6c `cursor === "default"`、m9-d F12c 中性参照断言。
- **tokens.json 与 PostToolUse oxfmt hook 冲突**：Edit tokens.json 必被 hook 全量重排。解法 = `git checkout HEAD --` 恢复 + 手写零上下文 patch 到 /tmp + `git apply --unidiff-zero`。**系统性问题**，下次改 tokens.json 优先沿用此路径。

### 进度

- ✅ 终端 composer 修 `a5ffdfe`：SessionDetailRoute.tsx（SessionInputDrawer wrapper + textarea 口径）+ design_spec §4.7 记档 + inbox.md 记档；诊断脚本 `_diag-composer-scroll.mjs` 已删（一次性不入库）
- ✅ 上一批三栏可点性修全部落地：`5fabc9b` + `06e004e` + `595100b`，37/37 + 68/68 + 单测 795 全绿；真机清单用户回复「暂时先这样，后续再来检查」（搁置）
- ⏳ **本批真机清单交用户**（见下）——唯一待办

### 阻塞 / 风险

- 无阻塞。滚动条根因是 WebKit 特有 sub-pixel 假设（静态分析 + 口径对齐消除），Chromium 桌面侧不可复现——若真机复验仍有滚动条，需按 §22 纪律埋真机诊断通道取第一手数据，不盲猜第 N+1 轮。

## 易丢的关键上下文

- **本批真机清单（交用户）**：①终端 composer 宽度与 agent 一致（672px 限宽居中，不再横跨全宽；含快捷键条整组）；②输入框不再出现纵向滚动条（含输入多行→删除、键盘弹起收起后）；③高度手感与 agent 一致（min-h 基线 40px/宽端 72px、max-h-32 封顶后内容滚动是预期）；④**PWA 强刷后复核**。
- 上一批三栏清单 9 项（中性灰折叠钮 / 原生箭头 / 行首行尾镜像 / 22×56 小舌 / 第一行水平线 / 折叠唤出闭环 / 触屏热区 / 浅色小舌可发现性 / PWA 强刷）——用户已说「暂时先这样，我后续再来检查」，搁置待用户主动复核。
- 探针纪律：`systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`；脚本必须放 repo scripts/ 下；一次性诊断（无断言价值）不入库、用后删。
- React 受控 textarea 探针设值：`Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set` + `dispatchEvent(new Event("input", { bubbles: true }))`；Playwright `evaluate` 只收 1 个 arg，多参数须包对象。
- probe-desktop-layout Part 6 现含 divider 方向身份断言（`M9 3v18`/`M15 3v18`）+ cursor default 断言——未来换折叠图标/加手型必须同步该断言。
- session-input 的 composer 断言只在 probe-v15-batch7-skeleton.mjs（44/44）；m9-d 无 composer 断言。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-14 02:05；触发原因：终端 composer 修收尾（commit a5ffdfe + docs/inbox 记档 + 删诊断脚本 + handoff save + 真机清单交付前）
