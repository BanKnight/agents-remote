# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-10（**设置二级 UI 换代完成（未 commit）：detail 四段 + 预设编辑弹窗全量 v2 化——三探针全绿 + e2e 2 spec 绿 + 全门禁绿，待 commit + push + 用户真机验证**）

## 一句话状态

用户真机反馈「设置二级 UI 不遵守 Apple 设计语言 / 不遵循 token 规范」，授权原型缺位部分按 Apple Settings 语言 + v2 token 自行设计（后续原型到位再校准）。detail 四段（通用/Claude/Pi/ACP）全量从 v1 Card 块状表单换代为 sect/sgroup/setrow 分组语言（与一级 07 同构）；三件弹窗（PresetDialog/PiPresetDialog/ModelsListDialog）移动 MobileSheet / 桌面居中 Dialog 分流 + 控件 v2；显式保存语义零变化（用户拍板）。验证：typecheck / lint（404 files 0w）/ CSS 硬闸 / tokens 机检 / web 单测 774、探针 3 件全绿（m7 69/69 + acp 10/10 + pi 32/32）、e2e mobile-nav 6 + desktop-side 6。

## 本 session 焦点（设置二级 UI 换代）

### 关键决策（本阶段不可丢）

- **改造范围 = settings-dialog.tsx 单文件主战场**（~2036 行内）：表单原语常量（settingsInputClasses/settingsPrimaryButtonClasses/settingsGhostButtonClasses/settingsTextButtonClasses/settingsHintClasses）文件头单源；ActionButton/ListGroup/ListRow/SegmentedControl/ShellInput/ShellSectionLabel/listGroupClasses/shellSurfaceClasses/Card/CardContent 在本文件退役（组件本体有其它消费者不退役）。
- **行型态三种**（detail 分组内）：值选择行 = OptionMenu 整行 trigger（asChild 直接子为原生 button——props 直接落地，无需 forwardRef）；开关行 = 整行 button role="switch" + aria-hidden toggle span；输入行 = `setrow h-auto flex-col items-stretch gap-1.5 py-2.5`。保存行 = sgroup 末行 setrow 左状态右主色钮。
- **行分隔边界**：`.setrow + .setrow` 是相邻兄弟选择器——隔滚动容器（预设列表 max-h-72）的添加行需手动 `border-t border-sep-row`。
- **弹窗分流**：`isMobile ? <MobileSheet> : <Dialog>`，form 抽 JSX 变量两端共享（多端同构铁律）；桌面 v2 弹窗面 = DialogContent 内层自绘面（`rounded-[20px] border border-sep bg-elevated p-5`）——Radix content 外壳默认类不动，探针 v2 断言锚内层 `> div`（外壳默认类非断言目标）。
- **容器边距连锁**：sect/sgroup 自带 margin 0 16px → SettingsRoute/SettingsMainPage 的 detail 容器 px 必须去除（否则 36px 双重边距）。
- **陈旧探针适配**（非本轮回归）：probe-settings-acp-dialog / pi-dialog 入口锚 M2 时代 ActivityBar+SettingsDialog（M9 已退役）——适配为 footnav Settings 路由导航 → SettingsMainPage；断言文案全保留（acpHint 子串/Not configured/Save disabled 语义不变）；pi 探针预设列表断言改真实数据分档（空态/非空都绿）。
- **diverge 记档**：原型未覆盖二级，按 Apple 语言 + token 自行设计，后续用户出新原型再校准（redesign-v2.md §设置二级换代段）。

### 进度（已完成 / 待办）

- ✅ 改造全部落地（settings-dialog.tsx + SettingsRoute.tsx 容器边距）。
- ✅ 探针 3 件全绿：m7 69/69（Part 2 适配 .segc / Part 3 适配 .msheet 移动分流）、acp 10/10、pi 32/32（新增 Part 4b 弹窗 v2 形态断言）。
- ✅ e2e 连锁：mobile-nav 6 + desktop-side 6 全绿（壳导航/深链不受影响）。
- ✅ redesign-v2.md 记档（§设置二级 UI 换代段，diverge 标注）。
- ⬜ commit + push（下一步动作；标准 git add && git commit，尾注 Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>）。
- ⬜ 用户真机验证（清单见 redesign-v2.md 真机清单 5 条：二级分组同构 / segc 活动块 / 预设列表行+添加行+⋯ / 预设编辑 sheet/Dialog 分流 / 显式保存语义）。
- ⬜（用户 mid-turn 指派，commit 后立即转入）两个全局文件问题：① iPhone 端全局文件无法滚动；② 桌面端全局文件布局与原型（mac-files-global-preview）差别巨大。

## 易丢的关键上下文

- 探针跑前照例 touch main.tsx 等 rebuild（本轮探针直接跑绿 = rebuild 已含改动）。
- probe-v2-m7 Part 3 锚 .msheet（移动视口 useConfirm 走 MobileSheet，data-slot 结构仅桌面存在）。
- pi 探针 Part 4b v2 面断言锚 `[data-slot="dialog-content"] > div`（内层自绘面）。
- 真实后端 pi 预设非空（探针 Part 3 走「已有预设行渲染」分支）。
- 批 18 键盘取证恢复方法：`web/src/lib/keyboard-debug.ts` `DEBUG_ENABLED=true` → touch main.tsx 重建。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-10 09:41；触发原因：设置二级 UI 换代完成（探针 3 件 + e2e 2 spec + 全门禁绿），commit 前检查点
