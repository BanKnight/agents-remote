# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-30（**第七批收口，最新 `b62d9d2`**。第六批真机复验反馈：md ✓、html 缺 iframe 嵌套本地 html/svg → `b62d9d2` 修复：IFRAME_TAG_RE + 内联管道抽成可递归 inlineLocalHtmlAssets（fetch 注入）+ iframe→本地 html 递归内联转 srcdoc / 本地 svg → dataUrl + 嵌套相对引用按嵌套文档目录解析 + 深度上限 2 防环 + sandbox 语义不变。单测 13→19、探针 1b/1c 嵌套真实渲染全 PASS、m4 70/70、e2e 2/2。**等用户真机复验（第七批清单）**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第七批「html iframe 嵌套本地文档」收口（`b62d9d2`）：第六批真机反馈 md ✓、html 渲染不支持 iframe 嵌套本地 html/svg。根因同 2026-09-10 修 img——srcDoc 无 base URL，HTML 内相对引用解析不出，当时只内联了 link/img 漏了 iframe。修法：`IFRAME_TAG_RE` + 内联管道抽成可递归 `inlineLocalHtmlAssets`（fetch 由调用方注入，可测）；iframe→本地 html 递归内联后转 srcdoc（属性转义）、本地 svg→dataUrl；嵌套文档内相对引用按**嵌套文档自身目录**解析；`INLINE_NESTED_HTML_MAX_DEPTH=2` 防环；单引用失败不阻塞；`sandbox=""` 语义不变。

## 本 session 焦点（第七批）

1. 用户真机复验第六批后反馈：md 渲染 ✓；html 渲染有问题——需要支持 iframe 嵌套另一个本地 html/svg。
2. 根因：`PreviewBody` 的 `inlineLocalAssets` 只内联 `<link stylesheet>` 与 `<img src>`；`<iframe src>` 不在范围，而 srcDoc 文档无 base URL → 嵌套 frame 空白。同 2026-09-10 修 img 那次根因（漏了标签类型）。
3. 修法：`IFRAME_TAG_RE` + 内联管道抽成可递归导出函数 `inlineLocalHtmlAssets`（fetch 注入）；iframe→本地 html 递归内联后转 srcdoc / 本地 svg→dataUrl；深度上限防环。

## 关键决策（本阶段不可丢）

- **iframe 内联走 srcdoc，不换渲染机制**：外层 iframe 仍 `sandbox=""`；嵌套 html 文档整体内联（其 img/css 也内联）后进 `srcdoc` 属性——嵌套 frame 继承同一沙箱语义（不执行脚本、不发请求），与 v1.4 批7「纯静态预览」口径一致。
- **相对引用基准 = 嵌套文档自身目录**（不是外层文档目录），深度优先递归；`INLINE_NESTED_HTML_MAX_DEPTH = 2` 防自引用/环状无限递归，超限文档原样进 srcdoc。
- **内联管道抽成可测纯函数**：`fetchPreview` 由调用方注入（运行时封装真 fetch、单测传 fake），使递归可单测、无网络依赖；单引用 fetch 失败保持原样不阻塞其余，整体抛错则 PreviewBody 退回原文渲染。
- 第六批决策继续有效（本 session 上半段）：PreviewBody 单源、编辑流转闭环、renderMode 随 path 重置收敛 hook、pre-commit 快速通道、回归裁剪 + getByRole 纪律。
- 历史拍板继续有效：三栏第一行同一水平线；跨页一致优先；多端同构；「侧边栏」= 检视面板。

## 进度（已完成 / 进行中 / 待办）

- ✅ 第七批单 commit：`b62d9d2`（html iframe 嵌套本地 html/svg 递归内联）+ 记档 §6.13 第七批段
- ✅ 验证：单测 file-browser.test.ts 13→19（嵌套递归/相对基准/svg 换 dataUrl/srcdoc 转义/深度上限/失败容错全绿）；探针 `probe-files-html-img-inline` 扩 1b（srcDoc 层 5 项）+ 1c（嵌套 frame 内真实渲染 2 项：`#nested-marker` 可见 + 内层 svg 40×20）全 PASS；回归 m4 70/70 + e2e file-browser 2/2；全门禁（web 677→683 单测）+ CSS 硬闸 183387 字节
- ⬜ **交用户真机复验**（第七批清单见下）
- ⬜ 第六批真机复验中已确认：md 渲染 ✓（其余项 html 相关已由本批覆盖）
- ⬜ reviewer 复审补跑：第六批 design/code 双审因 API 故障未完成（人工自审已做）——API 恢复可补审 `60dc9e3`+`d807ccb`+`b62d9d2`
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行（iPad 热区只能真机）
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；右栏栏宽 352 vs 320；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（第七批，`b62d9d2`）

1. **html 嵌套本地 html**：项目里有 `index.html` 内嵌 `<iframe src="nested/frame.html">` → 打开 index.html 渲染态，嵌套 frame 内应有内容（修复前空白）
2. **html 嵌套本地 svg**：`<iframe src="diagram.svg">` → 渲染态应显示该 svg（修复前空白）
3. **嵌套文档自身资源**：嵌套 frame 内的 img/css 相对引用应正常（按嵌套文档所在目录解析）
4. **外链 iframe 不误伤**：`<iframe src="https://...">` 保持原样（沙箱内不加载，符合纯静态预览口径）
5. **多级嵌套**：嵌套层数 ≤2 全部内联；超过 2 层的更深嵌套原样显示（防环上限，正常页面用不到）
6. 第六批 md 渲染、toggle、编辑流转不受影响（同一渲染器 PreviewBody）

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过（183387 字节，content-type text/css）。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **pre-commit 快速通道**：staged 全为纯文档面（.md/.claude/**/docs/** 等非代码）→ 只跑 format:check+lint（~2.5s）；任一文件命中 `web/ api/ packages/ scripts/ e2e/` 前缀或代码扩展名 → 全门禁。反向判定宁可漏放行；混合 commit 一律全门禁。
- **useFileEditor 契约**（第六批）：renderMode 随 path 重置进 hook（use-file-editor.test.tsx 三个契约测试守）；`defaultRenderMode` 现从 use-file-editor.ts 导出；`initialRenderMode` 参数已不存在。
- **inlineLocalHtmlAssets 契约**（第七批）：可递归导出函数，`fetchPreview` 注入；三类 job（stylesheet/img/iframe）并行；`IFRAME_TAG_RE` / `rewriteIframeSrcdoc` / `INLINE_NESTED_HTML_MAX_DEPTH` 均导出可测。
- 记档位置：§6.13「真机反馈修复·第六批」「第七批」两段。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-30；触发原因：第六批「md/html 预览优先」收口（`60dc9e3`+`d807ccb`）+ /handoff save
