# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-11（**真机反馈第三轮提交 `c0e48d5`，验证链全绿 + 双 reviewer 消化完成，待交真机清单**）

## 一句话状态

第三轮真机反馈（4+1 条）全部落地并提交：① 编辑态首次光标落点击中处（坐标透传 + posAtCoords 映射）、② .emeta 36px 对齐 .fmeta 零跳变、③ ⚙ 改 .iicn.gear（28×28 无衬底恒显，含桌面 display:none 回归的探针实抓与例外类修复）、④⑤ 快捷键增删改（union 类型 + custom atom + 面板 UI + 行重排 grip 行首/删除收表单）。code/design 双 reviewer 报告全消化（agent 会话 gate / 草稿清理 / maxLength / v2 token 族 / pencil 热区）。**下一步 = 真机清单交用户复验**（清单见「易丢的关键上下文」）。

## 本 session 焦点

### 关键决策（不可丢）

- **光标落点机制**：源码态只读与编辑态 CodeEditor 是两个独立 CodeMirror 实例——`useTapToEdit(onEnter)` 带点击视口坐标 → `pendingCursorRef` 暂存 → 编辑态 `onCreateEditor` 时 `applyPendingCursor(view, ref.current)`（`view.posAtCoords({x,y})` 返回 `number | null` 直接用，非对象）。`applyPendingCursor` 导出于 mobile-l3.tsx，MobileL3FilePreview + FilePreviewPane 两容器全覆盖。
- **`.iicn.gear` 例外类**（v2-primitives.css）：`.iicn` 家族带 `@media(min-width:1024px){display:none}`（v1.4 窄端 iicn/宽端 ipill 切换）——⚙ 中性入口不能绑死该家族，`.iicn.gear`（specificity 0,2,0 胜 media 内 0,1,0）恒显 + 无衬底 ink-2。探针曾实抓桌面 `display:"none"` 回归（D0 断言锁住：28×28 无衬底恒显）。
- **SessionQuickKey union**（console-model.ts）：`BuiltinQuickKey`（labelKey/ariaLabelKey i18n，不可删改）| `CustomQuickKey`（裸文本 label）。判别必须 `"labelKey" in key` / `"label" in key`（TS union 窄化）。`quickKeyLabel`/`quickKeyAria` helper 单源。自定义键发送尾补 `\n`（常用命令一键执行；内置控制序列不补）。id = `custom-${randomUUID}`。order/hidden 残留死 id 由消费端过滤天然忽略。
- **自定义键仅终端域**（review 修复）：`allQuickKeys` 合并加 `sessionType === "terminal"` gate——否则泄漏进 agent 会话 composer（无 ⚙ 可管理、点按注入 prompt）。
- **面板行重排**（用户 mid-turn 反馈）：grip 行首（与行尾 toggle 隔整行宽）、删除收进编辑表单左下红字（危险动作显式化）、行尾 pencil 36px 热区（-m-2 p-2.5 同 grip）+ ml-1 缝。表单展开时添加行隐藏。
- **v2 token 族纪律**（design review）：新代码禁 v1 桥接族（text-on-surface 系，index.css :456 注释明令）——表单已全换 text-ink-1/ink-2 + hover:bg-ink-1/5；字段形态 = settings-dialog 单源「bg-elevated2 内嵌 + sep-strong 描边」（容器无底色）。

### 进度

- ✅ 第一轮 6+1 条：`8114ae9` + `c6b1047`。第二轮收尾：`936b1ed` + `5ff5d29`。
- ✅ 第三轮：`c0e48d5`（11 文件 +418/−36）——4+1 条全落地 + 双 reviewer 消化。
- ✅ 验证链：format/lint/typecheck 0w + CSS 硬闸 + content-type text/css + tokens 0 违例 + 单测 778 + 探针 quick-keys-editor 29/29 / keyboard-inset 10/10 + e2e terminal-session 1 passed。
- ✅ redesign-v2.md §6.12o 段尾第三轮记档（含 review 消化）。
- ⬜ **真机清单交用户**（下一动作）。

### 阻塞 / 风险

- 无阻塞。光标落点的 posAtCoords 在真机（软键盘弹出、visualViewport 偏移）下的表现 Chromium 探针覆盖不了，靠真机清单第 1 条验证。

## 易丢的关键上下文

- **第三轮真机清单（待交用户，iPhone PWA）**：
  1. **编辑光标落点**：文件源码态（segc 切「源码」）→ 点正文任意处进编辑 → 光标应落在点击处、键盘弹出可直接输入。
  2. **行高零跳变**：预览⇄编辑切换，元信息行高度无轻微变化。
  3. **⚙ 按钮**：终端 composer 展开输入抽屉 → 控制行左端 ⚙ = 28×28 无衬底灰图标，与发送钮同高（不再是蓝色大按钮）。
  4. **快捷键增删改**：⚙ 面板 → 「＋ 新建快捷键」（居中蓝字）→ 填名称+内容 → 保存 → 快捷键条出现新键，点它 = 发送内容并回车；行尾铅笔改名；进表单左下「删除快捷键」删除；拖拽 = 行首手柄（与开关隔开了，不易误触）；重启保持。
  5. **面板开关行为**：填了一半表单直接下滑关面板 → 重开不应残留半填内容。
- 本 session 写入损坏顽疾高发（Edit new_string/old_string 乱码、heredoc 噪声、编造 old_string）——修乱码前先 Read/hexdump 确认精确文本；探针脚本经 PostToolUse formatter 落盘较可靠。
- 设置二级换代真机清单 5 条（任务 A）+ 第二轮重写版真机清单 5 条仍待用户复验。
- agent-browser CLI 可用（iPhone 16 设备模拟），一次性 UI 验证优先用它。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-11 11:55；触发原因：第三轮反馈提交 `c0e48d5` + 双 reviewer 消化 + handoff save
