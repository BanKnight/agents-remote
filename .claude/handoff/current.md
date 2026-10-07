# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-08（**批 13 实现 + 双 reviewer 消化完成，待 commit + push + 真机复验**）

## 一句话状态

批 12（`97c66c7`）push 完毕。**批 13（真机反馈第四轮 7 条）实现 + 探针 + e2e + 双 reviewer（code 3P1+4P2 / design 2P1+5P2）消化完成**，工作区就绪待 commit。七条修复：①右栏 mtime 恢复 ②右栏 FAB 统一 ③crumb 对齐 ④segc 居中 + 源码 CodeMirror 化 ⑤md 内链 per-panel ⑥分屏复制语义 + renderKey 防重 ⑦插件作用域分段对齐 09m（固定宽 290）。

## 本 session 焦点（批 13 全流程）

### 关键决策（本阶段不可丢）

- **⑥ 拍板 renderKey 去重**（code review P1-1）：splitLeafWithActiveTab 复制语义 → 同 ref 双挂 → 裸 tabId key duplicate。**否决复合 key**（`${groupId}:${tabId}` 会让所有 tab 跨 group 移动重挂，回归 frontend-notes §3 铁律——WS 断/scrollback 丢）；FlatPanel 新 renderKey 字段（首份=tabId 恒稳、双挂副本 `${tabId}@${leafId}`），移动 projectTabStrip 去重（一 tab 一 pill 保首 leaf）。单测双挂/解除断言。
- **⑤ per-panel 下沉**（code P1-2 + design 同发现）：删中栏顶层 Provider（activeTabRefLeaf 基准在 split 多窗格下解析错目录 + 误罩 session pane）。MarkdownLinkContext 包 PanelRouter file 分支（panelRef.path 基准），onOpenFile 沿 InstanceArea→WorkspaceTree→PanelRouter 透传。push 态/移动接线不动。
- **⑤ 右栏检视预览接线**（code P1-3）：FilesPanel previewPanel 容器包 Provider（selectedFilePath 基准 + onOpenFile 通道 + useMemo 防 churn）；SkillTabPreview 记档已知限制（全局 skill 无项目绑定）。
- **⑦ 固定宽 290**（design P1-1）：max-w 只是上限，短名缩到内容宽（实测 126px）违原型 width:290px 字面值；修 = `w-[290px]` + 探针 7w 短名断言。
- **components.css `.segc .caret` 暂留恢复**（design P1-2）：两原型页仍是消费点，实现侧已 Lucide 化；随原型页迁移再删。
- **e2e dispatchEvent 修正**（batch-4 flaky 排障，frontend-notes §26 沉淀）：playwright 对 fixed+transform 弹层动画期 in-viewport 判定不稳 + 弹层随输入序列漂移；三处 menuitem click 换 dispatchEvent("click")。

### 进度（已完成 / 待办）

- ✅ 批 0–12 全部 push（最新 `97c66c7`）。
- ✅ 批 13 全流程：实现 → 探针 16/16 → 单测 734（+2）→ e2e 27/27 → 门禁全绿（format/lint 0/typecheck/CSS 硬闸/tokens strict 0）→ 双 reviewer 报告消化（全修 + 记档）→ redesign-v2 §6.14 批 13 段补双 reviewer 消化 bullet。
- ⬜ **commit + push**（提交面见下）。
- ⬜ 用户真机复验（清单见下）。

### 工作区提交面（20+ 文件）

- 核心修复：v2-primitives.css / components.css / file-browser.tsx / right-panel-tabs.tsx / WorkbenchRoute.tsx / mobile-l3.tsx / markdown-components.tsx / relative-md-link.ts（新）/ mobile-plugins-home.tsx / scope-popover（⑦ 组件）+ instance-area.tsx / flatten-layout.ts / workbench-model.ts（⑥ review 修复）
- 记档：redesign-v2.md / frontend-notes.md（§26）
- 测试：probe-v15-batch13.mjs（新）/ e2e/file-browser.spec.ts / flatten-layout.test.ts / workbench-model.test.ts
- `docs/agents-remote-design-v1.5.zip` untracked 不提交（长期约束）。

## 统一真机复验清单（批 13）

1. **右栏文件树 mtime**：文件行右侧相对时间（「x 分钟前」）在场
2. **右栏 FAB**：右下角 ＋ FAB 新建/上传；地址栏行尾无「＋」钮（移动端同构）
3. **全局文件页地址栏**：与搜索框/卡片左右对齐（16px 内容线）
4. **检视面板 file tab**：渲染⇄源码 toggle 垂直居中；源码态 = CodeMirror（与编辑态同画布零跳变）；编辑态容器无圆角矩形遗留
5. **md 内链**：md 渲染态点相对 .md 链接 → 新 tab 打开目标（split 多窗格下按本窗格文件目录解析）；右栏检视预览同理
6. **分屏**：分屏按钮 = 当前激活 tab 副本双窗格（不再新建终端）；双窗格同 tab 无 console 报错（React key）
7. **插件作用域分段**：桌面 = 标题行内右端固定宽 290（短名也对半分、长名截断）、caret = Lucide chevron；移动满宽正常

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-08；触发原因：批 13 实现 + 双 reviewer 消化完成，待 commit + push 交真机清单
