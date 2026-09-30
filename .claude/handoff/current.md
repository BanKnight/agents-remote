# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-30（**第十批收口，最新 `5e06b5d`**。用户反馈「桌面端右栏折叠后展开按钮不见了」→ headless DOM 全场景在场实锤为**视觉不可发现性**（浅色主题 `bg-surface-raised/60` 半透明白叠浅色中栏 ≈ 隐形）→ RailButton 改实底+描边+实色图标+24×80 热区，getComputedStyle 两主题复测高对比。第八批 `3665264`、第九批 `9bbf351` 已收口等真机复验。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第十批「桌面右栏折叠唤出钮不可见」收口（`5e06b5d`）：排除法定位——装配点/panelOpen/断点均正确、headless DOM 4 视口×循环开合×reload×切 scope 按钮恒在场且命中自身 → **视觉不可发现**（AskUserQuestion 确认 Mac/桌面浏览器、完全没有按钮）：原 `bg-surface-raised/60` 半透明白在浅色主题与中栏几乎同色 + 图标 rgb(142,142,147) 浅灰。改实底 `bg-surface-raised` + `border-neutral-line` + `shadow-sm` + `text-on-surface-soft`，热区 w-5→w-6/h-16→h-20。两主题复测：dark 底 rgb(28,28,30)/图标 rgb(242,242,247)、light 底 rgb(255,255,255)/图标 rgb(28,28,30)。probe-v2-m9-multi-device 13 断言全绿（Part 2/3 真实点击 RailButton 唤出）。**教训：headless `visible=true` 只证 DOM 非隐藏，不证人眼可辨**。

第八批「data-icon 静态水合」（`3665264`）+ 第九批「全局文件预览返回目标」（`9bbf351`）已收口等真机复验。

## 本 session 焦点（第八 + 第九 + 第十批）

1. 第八批：嵌套原型页图标看不到 → 静态水合（`3665264`）。
2. 第九批：全局文件预览返回不是全局文件 → MobileFileFocus back pop 优先（`9bbf351`）。
3. 第十批：桌面右栏折叠后展开按钮不见了 → 视觉可发现性（`5e06b5d`）。

## 关键决策（本阶段不可丢）

- **视觉验证局限**：headless DOM `visible=true`/命中检测只能证「DOM 在场且可点」，不能证「人眼可辨」——半透明底叠同色系背景是盲区；视觉问题要用 getComputedStyle 色值对比（按钮 vs 所在背景）判可发现性。
- **返回类导航统一 pop 优先**（useWorkbenchBack）：有来路 history.back()（栈不留死记录），深链兜底 push 声称层级——MobileFileFocus 纳入该范式。
- **静态等效水合**（第八批）：sandbox 禁脚本是 v1.4「纯静态预览」既定口径不回退；`WINDOW_ICONS_ASSIGN_RE` 赋值定位（非 startsWith，真实生成物带头注释）。
- **探针 srcdoc 断言纪律**：嵌套层先解码（&quot;→"）再断言；「data-icon 残留」计数剥 `<style>` 后再数。
- 第七批决策继续有效：iframe 内联 srcdoc、按嵌套文档自身目录、`INLINE_NESTED_HTML_MAX_DEPTH=2`、失败容错。
- **file tab 状态（用户拍板）**：桌面中栏 file tab 后续规划要恢复发挥作用，当前暂时保持没有——暂缓非弃案。
- 历史拍板继续有效：三栏第一行同一水平线；跨页一致优先；多端同构；「侧边栏」= 检视面板。

## 进度（已完成 / 进行中 / 待办）

- ✅ 第八批 `3665264`（data-icon 静态水合）+ 第九批 `9bbf351`（全局文件返回）+ 第十批 `5e06b5d`（RailButton 视觉可发现性）
- ✅ 记档 §6.13 第九/十批段已补（含第八批引入的重复「§7」标题修复）+ handoff 滚动
- ⬜ **交用户真机复验**（第八/九/十批清单见下）
- ⬜ **待用户拍板**：ColumnResizeGutter 死代码——`{rightOpen ? null : <ColumnResizeGutter/>}` 位于仅 rightPanel 非空才渲染的 aside 内，rightPanel 非空 ⟹ panelOpen=true ⟹ rightOpen=true → gutter 恒不渲染 = **右栏宽度拖拽疑似失效**（workbench-shell.tsx :140；与「右栏栏宽 352 vs 320」欠账可能同源）。修法方向：gutter 移出条件或挂到 rightOpen 分支内。
- ⬜ reviewer 补审：API 恢复后补审 `60dc9e3`+`d807ccb`+`b62d9d2`+`3665264`+`9bbf351`+`5e06b5d`（第六~十批）
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行（iPad 热区只能真机）
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；右栏栏宽 352 vs 320；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（第八批 `3665264` + 第九批 `9bbf351` + 第十批 `5e06b5d`）

**第八批**（打开 agents-remote 项目 `docs/design/index.html` 渲染态，78 个 iframe 嵌套 75 页原型）：

1. **图标恢复**：嵌套原型页内原来看不到的图标（搜索框放大镜、行内功能图标）应显示
2. **手绘兜底不受影响**：`svg[data-symbol]` 图标保持原样（本就正常）
3. **嵌套功能回归**：第七批清单 1–5 项不受影响；md 渲染、编辑流转不受影响

**第九批**（移动端）：

4. **全局文件预览返回**：底部 nav「文件」→ 进项目 → 点文件预览 → 返回（◄/✕）→ 应回**全局文件页**且停在原目录（修复前落项目工作台）
5. **cwd 记忆保持**：返回后仍在刚才浏览的目录内

**第十批**（Mac 桌面浏览器，项目工作台）：

6. **唤出钮可见**：折叠右栏（行内「»」）后，中栏**右缘垂直中部**应出现实底竖条按钮（白底描边 + 深色 ›，24×80 热区）——修复前浅色主题下几乎隐形；深浅两主题都确认一下
7. **唤出功能**：点击后右栏展开如常；折叠/展开循环几次无异常

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过（183426 字节，content-type text/css）。
- **router22 残留进程待用户处理**：21 天前的 chromium 两棵进程树（PID 1989432/1989916，user-data-dir=/tmp/router22-fb31-diag3，remote-debugging-port=9781）——kill 被权限分类器拦截（跨项目资源），需用户自己清或授权；本项目探针无残留（headless-shell 跑完即 close）。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **pre-commit 快速通道**：staged 全为纯文档面 → 只跑 format:check+lint；任一命中代码面 → 全门禁（反向判定宁可漏放行）。
- **inlineLocalHtmlAssets 契约**（第七/八批）：可递归导出，`fetchPreview` 注入；四类 job 并行（stylesheet/img/iframe/iconScript）；`ICON_SCRIPT_TAG_RE`/`parseWindowIcons`/`rewriteIconPlaceholder`/`hydrateDataIconPlaceholders`/`WINDOW_ICONS_ASSIGN_RE` 均导出可测。
- **MobileFileFocus back 契约**（第九批）：pop 优先回来源 + 深链兜底 /files；探针场景 1 断言注意 cwd=proj1 时无根层 .gfrow 行（断言用 [data-list-row-title]）。
- **RailButton 回归覆盖**：probe-v2-m9-multi-device Part 2/3 真实点击唤出（`getByRole` name 不吃几何，样式改动无需同步断言）；e2e file-browser/git-diff 均走右栏自动展开不经 RailButton。
- 记档位置：§6.13「真机反馈修复」第六~十批五段齐。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-30；触发原因：第十批「桌面右栏折叠唤出钮视觉不可见」收口（`5e06b5d`）+ /handoff save
