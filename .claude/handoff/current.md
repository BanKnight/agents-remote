# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-30（**第九批收口，最新 `9bbf351`**。用户反馈「全局文件预览后返回的不是全局文件」→ MobileFileFocus back/✕ 写死 /projects/$key，pop 优先回来源 + 兜底 /files。探针 6 断言全 PASS。第八批 data-icon 静态水合 `3665264` 已收口等真机复验。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第九批「全局文件预览返回目标」收口（`9bbf351`）：`MobileFileFocus`（/files/file/$ 移动端浮窗预览）back/✕ 写死 navigate /projects/$key——注释声称「返回回全局文件树」但实现从未跟上。修法：`useWorkbenchBack` pop 优先（有来路 history.back() 回来源：/files push 进来→回 /files；项目工作台跨项目打开→回该项目），深链直达无来路兜底 /files。cwd 记忆（workbenchMobileGlobalFilesPathAtom）不经返回动作保持原位。探针 `probe-files-global-back`（移动 390×844）6 断言全 PASS。

第八批「data-icon 静态水合」（`3665264`）已收口：原型页图标 = window.ICONS 注册表 + 占位 + icons.js 运行时水合被 sandbox="" 阻断 → 内联管道 iconScriptJobs 静态替换（parseWindowIcons 容忍 /*! 头注释——startsWith 曾被挡住全静默跳过）。78 页真实占位残留 0、水合 svg 80。**第八、九批均等用户真机复验**。

## 本 session 焦点（第八 + 第九批）

1. 第八批：用户复验第七批反馈「有些使用图标的地方看不到了」→ 静态水合修复（`3665264`）。
2. 第九批：用户反馈「在全局文件中，预览文件后，返回的却不是全局文件」→ MobileFileFocus back 写死 /projects/$key（`9bbf351`）。

## 关键决策（本阶段不可丢）

- **返回类导航统一 pop 优先**（useWorkbenchBack）：有来路 history.back()（栈不留死记录），深链兜底 push 声称层级——MobileFileFocus 纳入该范式。
- **静态等效水合**（第八批）：sandbox 禁脚本是 v1.4「纯静态预览」既定口径不回退；水合内联阶段静态完成，JSON.parse 不 eval；`window.ICONS` 判定 = `WINDOW_ICONS_ASSIGN_RE` 赋值定位（非 startsWith，真实生成物带头注释）。
- **探针 srcdoc 断言纪律**：嵌套层产物在外层 srcdoc 属性值里经转义（" → &quot;），断言先解码再查；「data-icon 残留」计数必须剥 `<style>` 后再数（CSS 注释文字示例会误报）。
- 第七批决策继续有效：iframe 内联走 srcdoc、相对引用按嵌套文档自身目录、`INLINE_NESTED_HTML_MAX_DEPTH=2`、fetchPreview 注入、失败容错。
- **file tab 状态（用户拍板）**：桌面中栏 file tab **后续规划要恢复发挥作用，当前暂时保持没有**——不是弃案，是暂缓（已记入 §6.13 第八批段）。
- 历史拍板继续有效：三栏第一行同一水平线；跨页一致优先；多端同构；「侧边栏」= 检视面板。

## 进度（已完成 / 进行中 / 待办）

- ✅ 第八批 `3665264`（data-icon 静态水合）+ 记档 §6.13 第八批段（含 file tab 澄清）；单测 19→24、探针 1d+1c 全 PASS、真实链路 78 页残留 0
- ✅ 第九批 `9bbf351`（全局文件预览返回目标）+ 探针 probe-files-global-back 6 断言全 PASS
- ⬜ **交用户真机复验**（第八 + 第九批清单见下）
- ⬜ reviewer 补审：API 恢复后补审 `60dc9e3`+`d807ccb`+`b62d9d2`+`3665264`+`9bbf351`（第六~九批）
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行（iPad 热区只能真机）
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；右栏栏宽 352 vs 320；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（第八批 `3665264` + 第九批 `9bbf351`）

**第八批**（打开 agents-remote 项目 `docs/design/index.html` 渲染态，78 个 iframe 嵌套 75 页原型）：

1. **图标恢复**：嵌套原型页内原来看不到的图标（搜索框放大镜、行内功能图标）应显示
2. **手绘兜底不受影响**：`svg[data-symbol]` 图标保持原样（本就正常）
3. **嵌套功能回归**：第七批清单 1–5 项不受影响；md 渲染、编辑流转不受影响

**第九批**（移动端）：

4. **全局文件预览返回**：底部 nav「文件」→ 进项目 → 点文件预览 → 返回（◄/✕）→ 应回**全局文件页**且停在原目录（修复前落项目工作台）
5. **cwd 记忆保持**：返回后仍在刚才浏览的目录内

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过（183387 字节，content-type text/css）。
- **router22 残留进程待用户处理**：21 天前的 chromium 两棵进程树（PID 1989432/1989916，user-data-dir=/tmp/router22-fb31-diag3，remote-debugging-port=9781）——kill 被权限分类器拦截（跨项目资源），需用户自己清或授权；本项目探针无残留（headless-shell 跑完即 close）。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **pre-commit 快速通道**：staged 全为纯文档面 → 只跑 format:check+lint；任一命中代码面 → 全门禁（反向判定宁可漏放行）。
- **inlineLocalHtmlAssets 契约**（第七/八批）：可递归导出，`fetchPreview` 注入；四类 job 并行（stylesheet/img/iframe/iconScript）；`ICON_SCRIPT_TAG_RE`/`parseWindowIcons`/`rewriteIconPlaceholder`/`hydrateDataIconPlaceholders`/`WINDOW_ICONS_ASSIGN_RE` 均导出可测。
- **MobileFileFocus back 契约**（第九批）：pop 优先回来源 + 深链兜底 /files；探针场景 1 断言注意 cwd=proj1 时无根层 .gfrow 行（断言用 [data-list-row-title]）。
- 记档位置：§6.13「真机反馈修复」第六/七/八批三段（第九批待补）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-30；触发原因：第九批「全局文件预览返回目标」收口（`9bbf351`）+ /handoff save

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
