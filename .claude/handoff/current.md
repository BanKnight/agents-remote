# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-12（**桌面 file tab 切回变全局推入预览 bug 修复全绿落地：view 维度消歧同形 URL + 双 review 消化完成 + 探针 57/57；待 commit + 真机清单交付**）

## 一句话状态

真机 bug「中栏 file tab 切走再点回 → 整页变全局文件推入预览」修复完成：根因 = 同形 URL 两态歧义（推入态与中栏 file tab 激活同为 `/files/file/$?leftMode=files`，leftMode 粘性透传残留时点回 file 标签被 mainPageActive 误判推入态）。修复 = 新增 URL search 维度 `view=preview`（推入入口 pushToFilePreview 单点写，其余导航默认工作台），判定收敛 `isFilePushPreview` 纯函数。两轮否定方案（layout activeTabId 判据被 probe Part 5 实抓否定）已记档。双 review（code P2×2 + design P1×1/P2×3）全消化：cast 补齐、focus effect deps 加 view、⌘F gate `!filesPushActive`、probe Part 6 扩到 15 断言（含 ⑧裸深链按工作台 + ⑨推入态内 .md 内链换目标保 view——首版误用 .ts 链接实抓 isRelativeMdHref 只接管 .md 的既有边界）。验证链全绿：单测 790 + 探针 57/57 + e2e file-nav/desktop-side + 全门禁 + CSS 闸/tokens。

## 本 session 焦点

### 关键决策（不可丢）

- **`view` URL search 维度**：`view=preview` 由推入入口 `pushToFilePreview` 单点写入（推入态显式声明）；其余一切导航（17 个 stickyWorkbenchSearch 调用点）不带 view = 默认按工作台 file tab 解释。sticky 语义下「漏带即丢」正是期望行为（推入态是 exceptional 态，标记必须在每次导航中重申）。
- **isFilePushPreview 四元组判据**：`leftMode === "files" && scope.kind === "global" && focusId?.startsWith("file_") && view === "preview"`；focus effect gate 与 mainPageActive 两处消费共用（语义同源不得单点改）。
- **行为变更（已记档 redesign-v2.md）**：裸 `/files/file/$?leftMode=files`（旧推入态书签/历史）现按工作台解释，focus effect 自动开 tab；推入态只能经列表/树点行进入。
- **否定方案记档**：①layout activeTabId 判据——probe Part 5 实抓否定（文件 tab 恰为活动 tab 时列表点行也命中 → 推入态被误判掉）；②正确修法 = exceptional 态显式标记，非再找间接信号。
- **md 内链边界（本批实抓）**：`isRelativeMdHref` 只接管相对 **.md** 内链（MarkdownLinkContext → pushToFilePreview 保 view）；非 .md 相对链接走浏览器默认导航 = 既有语义。推入态内 .md 内链换目标保 view 探针 ⑨ 已守卫。
- **⌘F gate**：`mainPageActive && leftMode === "files" && !filesPushActive`——推入态主区单文件预览无搜索框，此前 ⌘F 劫持空转 + 回放陈旧 bump（既有问题，本批伴生修复）。

### 进度

- ✅ view 维度实现（validator 白名单 / stickyWorkbenchSearch 透传 / WorkbenchRouteContext.view / isFilePushPreview / pushToFilePreview 单点写 / focus gate + mainPageActive 消费）
- ✅ 单测 105（workbench-model.test.ts：view 语义改写 + 3 组新增）+ web 全量 790
- ✅ probe-v15-batch4-desktop 57/57（Part 6 15 断言 + ⑦b 过期 38→36px 修复）
- ✅ 双 review 消化：code P2-1（derive cast 补 view + branch/approvals/marketTab 对齐 validator 白名单）+ P2-2（focus effect deps 加 view）；design P1-1（真机清单⑤ + probe ⑨）+ P2-2（Part 6 注释改指 isFilePushPreview）+ P2-3（⑧裸深链断言）+ P2-4（⌘F gate）
- ✅ 全门禁 + CSS 硬闸 + tokens + content-type + e2e（file-nav 1 + desktop-side 6）
- ✅ 记档：redesign-v2.md「view 维度消歧同形 URL」段（根因/修复/否定方案/数字/伴生修复/真机清单①-⑤）
- ⬜ **commit（下一动作）→ 真机清单交用户**

### 阻塞 / 风险

- 无阻塞。推入态内非 .md 相对链接（.ts/.png 等）走浏览器默认导航会落工作台——既有语义非本批范围，探针注释已记。

## 易丢的关键上下文

- **本批真机清单（待交用户，见 redesign-v2.md 记档段）**：①全局文件页点文件 → 推入预览不变；②「在工作台打开」→ 中栏 tab 不变；③**中栏 file tab 切走（session/terminal tab）再点回 → 保持工作台 tab（修复主断言）**；④推入态左栏点会话回工作台再点回 file 标签 → 同③；⑤推入态内点正文 .md 相对链接换文件 → 仍是推入预览（h1 换名、无 tabstrip）。
- **任务 A 真机清单仍待复验**：①⚙ 面板中段下滑不收起；②回顶后下滑收起（两段式需松手再拖）；③grab 热区收起；④文件树/全局文件行按压回缩；⑤v2 两域分离 5+1 条（snapshots/20261011-2017.md）。
- 设置二级 5 条 + 第二轮重写版 5 条真机清单仍待用户复验（历史挂起）。
- 本 session 依旧高发写入损坏：插桩改正式文件 + git checkout 兜底；**CDP dispatchTouchEvent 不可靠勿再走**（frontend-notes §29）。
- vite watch 漏 CSS：改 web 包后需 touch web/src/main.tsx 重建（本轮已做）+ `node scripts/ar-verify-css.mjs`。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-12 00:54；触发原因：桌面 file tab 切回 bug 修复全绿 + 双 review 消化完成，commit 前检查点
