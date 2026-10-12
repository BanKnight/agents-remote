# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-13（**真机反馈第二轮五联修已 commit，真机清单 5 条已交，等用户复验**）

## 一句话状态

真机反馈第二轮五联修（浮层行高/收起键盘退役/diff 空态/cursor 双主题/两段加载单源）实现 + 双 reviewer（9 条全消化：删两处死分支、@layer 归层、cursor 三把手全量、标尺三处同步等）+ probe-ui-polish **13/13** + 回归两探针 16/16、14/14 + 全门禁绿 + redesign-v2.md 记档（含 ：1846 旧拍板修正）+ inbox 清空 + handoff 滚动，commit 后交真机清单。

## 本 session 焦点

### 关键决策（不可丢）

- **③ 只分流的可达面 = 4 处**：服务端 NOT_CHANGED 只从 fileDiff :133/:157、getCommitFileDiff :354/:366、compareFileDiff :513/:534 发射；**getCommitDetail（commit 总览）与 listDiff（git 总览）从不发**——初版在两处总览加的分流是死代码，review 实锤后删。**mock 探针打虚构场景也能全绿，先核服务端发射点再写断言**。NOT_CHANGED 真实 HTTP status = 400（`projectGitDiffErrorResponse` 默认分支）。
- **③ 治本位 = fetchJson**：`ApiClientError extends Error { code? }` + 非 2xx 解析 body.error.code 透传（非 JSON 体 code undefined 同旧行为；401 两条路径同批对齐 ApiClientError）。message 保持本地化文案不变，全站错误渲染零变化。
- **① 实例行 `h-[40px] min-h-[40px]` 双写**：单写 min-h 会被 DropdownMenuItem 基线 py-2.5 + preflight 行高 1.5 撑破到 40.24（design review 实测），h 锁死后实测 39.99。gap 对齐原型 9px（`gap-[9px]`）。redesign-v2.md :1846 旧拍板（45px「有意升档不改」）已记档修正 = 真机否决回归原型。
- **④ cursor 三把手全量**：自定义 SVG data-URI cursor 双主题（暗=黑衬线白主/亮=白衬线黑主，热点 12 12，fallback 原生关键字），SplitGutter / 桌面 shell ColumnResizeGutter / shell-primitives ResizeGutter 全换 `cursor-split-col`/`cursor-split-row`；规则包 `@layer components`（同名 layer 块合并语义）；Safari 不渲染 SVG cursor 静默回退原生（WebKit 限制，graceful degradation 记档知情）。
- **⑤ `chatScrollPaddingClasses` 单源**（shell-primitives 导出，`px-3 py-4 sm:px-5`）：detail 骨架壳 + VirtualizedThreadContent scroller + FullscreenReader 展开阅读滚区三处消费——两段加载骨架几何一致（探针实测 x/y 全等 1271.0/64.0）。

### 进度

- ✅ 五联修实现：①浮层 40px/9px 回归原型；②收起键盘整链退役（mobile-l3 + i18n zh/en + design_spec.md 两处 + iPad 原型 .pvaux 同批同步）；③错误码透传 + 4 可达消费点分流（mobile-l3 单文件/commit 单文件 + git-diff-viewer + …… 见记档）；④cursor 三把手 + v2-primitives.css 归层；⑤chatScrollPaddingClasses 三消费点
- ✅ 双 reviewer 消化：code（7 P2：死分支×2 删、401 对齐、navigator stub helper、shell cursor、Safari 知情、hasApiCode 不采纳）+ design（4 P1 + 3 P2：标尺三处同步、@layer 归层、出处标注、h 锁死、FullscreenReader 收编、注释同步、mock 400 对齐）
- ✅ 验证矩阵：format/lint 0 warning/typecheck/test web **795**（含 client.test 2 新 case：code 透传 + 非 JSON 体）/ CSS 硬闸 / tokens 0 违例 / probe-ui-polish **13/13** / probe-desktop-layout **16/16** / probe-grid-panel **14/14**
- ✅ redesign-v2.md 记档（五联修段 + :1846 旧拍板修正）+ inbox 清空 + 快照 20261013-0152.md
- ✅ commit（13+ 文件；pre-commit 全门禁绿）→ 真机清单 5 条已交用户

### 阻塞 / 风险

- 无阻塞。

## 易丢的关键上下文

- **真机清单 5 条（交付用户）**：①切换浮层实例行 40px 收紧（行间空白不松散）；②编辑辅助条无「收起键盘」（undo/redo 保留）；③查看 diff 与远端一致时显「没有变更」（git 面板文件行 → 单文件 diff、commit 内单文件两路）；④明亮主题拖拽把手 cursor 深色可见（中栏分屏缝 + 桌面左右栏边缝三处）、暗色白色不变、**Safari 仍原生白（WebKit 不支持 SVG cursor，已知降级）**；⑤两段加载骨架无跳变。
- **写路径 NOT_CHANGED 挂起**（code review 顺带发现，批次范围外）：`project-git-write.ts:210` commit/discard 时勾选文件已被外部提交仍以通用错误呈现——如需同款「没有变更」体验另开条目（inbox）。
- **上一批（db77df4 + b941d3d 已交真机清单 4 条）**：桌面中栏排版三联修 + 源码态追批；再上一批四联修（6cbf80d）。
- vite watch 漏 CSS：改 web 包后 touch web/src/main.tsx 重建 + `node scripts/ar-verify-css.mjs`；探针用 `systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`。
- 本批工作区路径：mobile-project-header / mobile-l3 / zh+en / client.ts+test / git-diff-viewer / project-tool-panels / shell-primitives / workbench-shell / instance-area / ClaudeSessionDetailRoute / v2-primitives.css / design_spec.md / ipad-tool-files-preview-edit.html / probe-ui-polish.mjs（新）/ redesign-v2.md / inbox.md / handoff。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-13 01:52；触发原因：五联修收尾记档 + handoff 滚动，commit 前检查点
