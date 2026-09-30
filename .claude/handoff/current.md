# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-30（**第八批收口，最新 `3665264`**。第七批真机复验反馈：iframe 嵌套 ✓ 但「有些使用图标的地方看不到了」→ 根因 = 原型页 data-icon 占位靠 icons.js 运行时水合、sandbox 禁脚本阻断 → 静态水合进 inlineLocalHtmlAssets 管道（iconScriptJobs + parseWindowIcons 头注释容忍）。78 页真实占位残留 0、水合 svg 80。单测 24、探针 1d+1c 全 PASS。**等用户真机复验（第八批清单）**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第八批「嵌套原型页 data-icon 图标消失」收口（`3665264`）：原型页图标 = `window.ICONS` 注册表 + `<i data-icon>` 空占位 + icons.js 运行时水合（DOMContentLoaded），第七批内联后嵌套文档在 `sandbox=""` 下禁脚本 → 水合不发生 → 图标空白（svg[data-symbol] 手绘兜底能显示，data-icon 占位不能——「有些看不到」精确对应）。修法：内联管道加 `iconScriptJobs`——fetch 本地 script → `parseWindowIcons`（定位 `window.ICONS = {` 赋值 + 括号配对提取平衡对象 + JSON.parse 不 eval，**容忍 `/*! */` 生成头注释**——首版 startsWith 被头注释挡住全部静默跳过）→ `hydrateDataIconPlaceholders` 按 icons.js apply 规则静态替换占位（viewBox 24/stroke currentColor/strokeWidth 2/class 继承）。script 标签保留无害；认不得格式跳过；svg[data-symbol] 不动。

## 本 session 焦点（第八批）

1. 用户真机复验第七批反馈：嵌套 html ✓，但「有些使用图标的地方，很奇怪的，不知道为什么看不到了」。
2. 根因实锤：一次性诊断（真实 API + 真实 index.html 跑真实管道）——嵌套文档有 `<script src="assets/icons.js">`、仅 4 个内联 svg；icons.js 运行时水合被 sandbox="" 禁脚本阻断。
3. 修法 + 两个过程实锤：① `parseWindowIcons` 首版 `startsWith("window.ICONS")` 被真实生成物的 `/*! 头注释 */` 挡住 → 水合全静默跳过（单测无注释输入故绿，探针 mock 复刻头注释形态锁死）；② 诊断正则把 CSS 注释文字里的 `<i data-icon="search">` 示例误报成 33 处残留——剥 `<style>` 后复核 78 页真实占位残留 0、水合 svg 80。

## 关键决策（本阶段不可丢）

- **静态等效水合**：sandbox 禁脚本是 v1.4 批7「纯静态预览」既定口径（不回退），水合改为内联阶段静态完成——fetch icons.js 消费其注册表替换占位，等价于运行时 hydrate 的最终 DOM 效果；JSON.parse 不 eval，认不得格式的脚本跳过。
- **`window.ICONS` 判定 = 赋值语句定位**（`WINDOW_ICONS_ASSIGN_RE = /window\.ICONS\s*=\s*\{/`），非文件头 startsWith——真实生成物带头注释；纯读取型引用不命中。
- **占位替换复刻 icons.js apply 规则**：`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="stroke-width:2" [class继承] aria-hidden="true">`；未知名保持原样；`svg[data-symbol]` 手绘兜底不动。
- **script 标签保留**（禁脚本不执行、无害），不删。
- 第七批决策继续有效：iframe 内联走 srcdoc、相对引用按嵌套文档自身目录、`INLINE_NESTED_HTML_MAX_DEPTH=2`、fetchPreview 注入、失败容错。
- **file tab 状态（用户拍板）**：桌面中栏 file tab **后续规划要恢复发挥作用，当前暂时保持没有**——不是弃案，是暂缓（已记入 §6.13 第八批段）。
- 历史拍板继续有效：三栏第一行同一水平线；跨页一致优先；多端同构；「侧边栏」= 检视面板。

## 进度（已完成 / 进行中 / 待办）

- ✅ 第八批单 commit：`3665264`（data-icon 静态水合）+ 记档 §6.13 第八批段（含 file tab 澄清）
- ✅ 验证：单测 file-browser.test.ts 19→24（水合/头注释/读取型引用/class 继承/格式跳过全绿）；探针扩 1d 段 4 断言 + 1c 水合 svg 真实渲染（284×284）全 PASS（22 断言）；真实链路诊断 78 页残留 0 + 水合 svg 80；web 全量 688 绿；CSS 硬闸 183387 字节
- ⬜ **交用户真机复验**（第八批清单见下）
- ⬜ reviewer 补审：API 恢复后补审 `60dc9e3`+`d807ccb`+`b62d9d2`+`3665264`（第六/七/八批）
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行（iPad 热区只能真机）
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；右栏栏宽 352 vs 320；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（第八批，`3665264`）

打开 agents-remote 项目 `docs/design/index.html` 渲染态（78 个 iframe 嵌套 75 页原型）：

1. **图标恢复**：嵌套原型页内原来看不到的图标（如搜索框放大镜、行内功能图标）应显示——`<i data-icon>` 占位已静态替换成 svg
2. **手绘兜底不受影响**：自带 path 的 `svg[data-symbol]` 图标保持原样（本就正常）
3. **嵌套功能回归**：第七批清单 1–5 项（iframe 嵌套 html/svg、嵌套资源、外链不误伤、深度上限）应全部不受影响
4. **外层索引页**：index.html 自身渲染、md 渲染、编辑流转不受影响（同一 PreviewBody 渲染器）

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过（183387 字节，content-type text/css）。
- **router22 残留进程待用户处理**：21 天前的 chromium 两棵进程树（PID 1989432/1989916，user-data-dir=/tmp/router22-fb31-diag3，remote-debugging-port=9781）——kill 被权限分类器拦截（跨项目资源），需用户自己清或授权；本项目探针无残留（headless-shell 跑完即 close）。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **pre-commit 快速通道**：staged 全为纯文档面 → 只跑 format:check+lint；任一命中代码面 → 全门禁（反向判定宁可漏放行）。
- **inlineLocalHtmlAssets 契约**（第七/八批）：可递归导出，`fetchPreview` 注入；四类 job 并行（stylesheet/img/iframe/iconScript）；`ICON_SCRIPT_TAG_RE`/`parseWindowIcons`/`rewriteIconPlaceholder`/`hydrateDataIconPlaceholders`/`WINDOW_ICONS_ASSIGN_RE` 均导出可测。
- **探针 srcdoc 断言纪律**：嵌套层产物在外层 srcdoc 属性值里经转义（" → &quot;），字符串断言先解码再查（1d 段范式）；「data-icon 残留」计数必须剥 `<style>` 后再数（CSS 注释文字里的示例标签会误报）。
- 记档位置：§6.13「真机反馈修复」第六/七/八批三段。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-30；触发原因：第八批「data-icon 静态水合」收口（`3665264`）+ /handoff save
