# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-12（**文件编辑态三联修全绿落地：光标落点击处 + 撤销/重做可用性联动 + 放弃钮红；待 commit + 真机清单交付；下一批 = 终端设置浮层 Apple 重设计（②，方案待定）**）

## 一句话状态

真机反馈①③（②另批）修复完成：根因同源 = 源码态⇄编辑态 CodeEditor 三元切换被 React 复用实例，`onCreateEditor` 仅首建触发 → 容器 `editorView` 恒 null（光标映射宿主缺失 + 旧 `disabled={!view}` 恒真）。修复三件：① tapToEdit 点击时旧实例就地 `posAtCoords` 映射 doc 位置存 `pendingCursorRef`，进编辑后消费；② 撤销/重做绑 `@codemirror/commands` 的 `undoDepth/redoDepth`（`onHistoryChange` 逐事务上抛，容器按值 bail-out）；③ historyEpoch 实例重建清 undo 栈（放弃/完成边界，探针 Part 2b 实抓驱动）+ 放弃钮改 `var(--c-danger)`（用户拍板推翻原型 ink-2）。探针 batch3 70/0（Part 2b 12 断言）+ batch4 60/0，全门禁/CSS 闸/tokens/单测 790 绿。**reviewer 四连 API 故障（unexpected EOF）**，自查覆盖等价问题域（含 onCreateEditor 时序源码收口：@uiw 自身 passive setContainer 晚一拍注入 → onCreateEditor 恒晚于容器 [path] 置空，结构性安全）。

## 本 session 焦点

### 关键决策（不可丢）

- **①光标 = doc 位置而非视口坐标**：tapToEdit 仅绑源码态（`!editing && !isRenderView`）→ tap 时旧只读实例必然存活 → 就地 `posAtCoords(click)` 映射成 doc 位置（跨态视口坐标会漂移，doc 语义保真；行号区 null 退视口坐标兜底走 applyPendingCursor）→ `pendingCursorRef` → 进编辑后 `useEffect([editing, editorView])` 消费。
- **②撤销/重做 = hist 不依赖 view**：CodeEditor `onHistoryChange`（@uiw onUpdate 逐事务）上抛 `{canUndo, canRedo}`；按钮 disabled 绑 hist；样式分档 enabled `text-ink-1 cursor-pointer` / disabled `text-ink-3 cursor-default`。
- **③historyEpoch 会话边界**：CodeMirror 无 reset API → `key = name@historyEpoch` 递增重建实例清栈；容器 `editSession` 在 finish/discard +1。不清栈 = 放弃的内容还能撤回（不可逆承诺破产）+ 完成后撤销退回草稿态（与磁盘不一致）。代价：放弃/完成瞬间源码态实例重建（闪帧 + 滚动丢失），记档可接受。
- **放弃钮红**：`.emeta .fact .giveup` / `.nav .fact .giveup` → `var(--c-danger)`（用户拍板推翻原型 ink-2 规格）；`--c-danger-text` 悬空引用不用；原型 danger 裸文字先例充足（ctxm .mrow.red / mac-settings / .diffhead .del）。
- **onCreateEditor 时序安全（review 遗留收口）**：@uiw view 创建在 `useLayoutEffect([container, state])`，container 由其自身 passive effect 晚一拍注入 → onCreateEditor 恒晚于容器 `[path]` passive 置空 → 挂载置空命中 bail-out、换文件置空先于新 view。**勿再给该时序加防御代码。**
- **file-browser.tsx FilesPanel 编辑路径**（:922 CodeEditor）无 EditorToolButtons/tapToEdit，不在本批范围；FilePreviewPanel 无活跃消费者（遗留）。

### 进度

- ✅ CodeEditor：`onHistoryChange` / `historyEpoch` / `key=name@epoch` / onUpdate 上抛 undoDepth/redoDepth
- ✅ mobile-l3 双容器（MobileL3FilePreview + FilePreviewPane）同构接线：editorView / hist / editSession / pendingCursorRef / path effect / enterEditing / 消费 effect；finish/discard 递增 editSession
- ✅ v2-primitives.css giveup 红（emeta + nav 两处）
- ✅ 探针：batch3 Part 2b 12 断言（70/0）+ batch4 ⑦c/d/e（60/0）
- ✅ 记档：redesign-v2.md「文件编辑态三联修」段（:1816 起，附录之前）
- ✅ handoff save（本文件；快照 20261012-0710.md）
- ⬜ **commit（下一动作）→ 真机清单交用户**

### 阻塞 / 风险

- reviewer 四连挂均为 API 故障（unexpected EOF），非代码问题；已以自查收口（记档有载）。reviewer 留下的 `web/src/tmp-effect-order.test.tsx` 已确认消失（其自清理）。
- ②（终端设置浮层不符 Apple 设计）= 重设计任务，用户明确「你需要重新设计我才能根据新设计来测试」——对象 ⚙ 面板（quick-keys-editor.tsx 385 行双 tab + quick-commands-tab.tsx 245 行），候选方向（iOS inset grouped 分组形态 / switch 对齐 components.css `.toggle` 44×26 r13 / 预置键语义分组 / 桌面 Dialog 形态）待与用户确认后出方案再实现。

## 易丢的关键上下文

- **本批真机清单（commit 后交用户，同 redesign-v2.md 记档段）**：①移动 L3 文件源码态点某行 → 进编辑光标落在点击处；②编辑中撤销/重做初始灰、输入后亮、点撤销回退；③完成保存后再进编辑 → 撤销灰；④放弃后再进编辑 → 撤销灰；⑤放弃红 / 完成蓝；⑥桌面中栏 file tab 与全局推入态同①②③。
- **②摸底结论（供重设计方案用）**：键盘 tab = hint + 「条上按键」区（grip 拖拽 + switch 行 + ↑↓ 换位）+「可用按键」区（24 预置键未启用）；命令 tab = 分组列表 + tap 执行 + 长按/右键 ActionMenu；容器 = 移动 MobileSheet（无内滚）/ 桌面居中 Dialog（内滚 max-h-[85vh]）。
- 历史挂起真机清单：任务 A 5 条（sheet 手势分档，snapshots/20261011-2017.md）、设置二级 5 条、第二轮重写版 5 条。
- vite watch 漏 CSS：改 web 包后 touch web/src/main.tsx 重建 + `node scripts/ar-verify-css.mjs`（本轮已做）；探针用 bun 跑（勿 node）。
- 本 session reviewer API 高发故障：派 reviewer 失败勿反复重试，记档 + 自查覆盖后照常收尾。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-12 07:10；触发原因：文件编辑态三联修记档 + handoff 滚动，commit 前检查点
