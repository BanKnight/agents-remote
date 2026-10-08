# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-08（**批 14 首版已 push（`305f4c6`）；真机反馈②「分割线带转角」已根治（.menu-sep 伪元素全宽直线），待 commit + push**）

## 一句话状态

批 14 首版（菜单统一样式）已 push（`305f4c6`）；用户真机反馈②「分割线怎么还带转角的」= design P2-2 被否决——**根治 = `.menu-sep` 伪元素负 inset 全宽直线**（v2-primitives 单源），divide 系分割线整体退役，验证全绿待 commit。

## 本 session 焦点（批 14 全流程）

### 关键决策（本阶段不可丢）

- **★ 分割线终版机制（真机反馈②）**：原型 `.row + .row` 是**全宽直线**（row 无圆角、容器无 padding）；divide 系 border 沿 item `rounded-lg` 圆角上翘 + Content `p-1.5` 内缩 = 「带转角的线」，真机否决。**`.menu-sep` 伪元素负 inset 全宽直线**（v2-primitives 单源；`--menu-pad-x` 抵消容器横内距：桌面 6px / sheet 0；`:not(.mh)` 排除头）。容器显式挂类 = 行式菜单语义：ActionMenu 桌面两分支 + 移动、OptionMenu 移动 + anchored；分区容器（实例切换）不挂。首版 divide 基线与两例外 hack（divide-y-0 / `[&>.mh]:border-b-0`）全部退役。**教训：线形差异不是「容器差异」可辩护项——线形本身即标尺**。
- **★ Tailwind v4 divide-y 语义变化（机制记档）**：v3 = `~` 兄弟 + border-top；v4 = `> :not(:last-child)` + border-bottom（`:where()` 零 specificity）。断言读 `borderBottomWidth`。本批末 divide 系已被伪元素方案替代，此条留作机制知识。
- **icon 单源兜底（code P2 消化）**：ShellIcon 内嵌 svg 恒 `size-full` 绕过 svg 兜底选择器，裸传 span 默认 size-4=16px——**35 处既有菜单图标实为 16px**。修 = ShellIcon span 加 `data-shell-icon` 锚点 + DropdownMenuItem/mobileSheetItemClasses 各加 `[&_[data-shell-icon]]:size-[17px]`（父 class+属性 (0,2,0) 稳赢），裸传消费点零改动统一 17px。契约：菜单 icon 不传尺寸，容器统一 17px（显式 size-[17px] 亦接受=冗余，剥除留后续批）。
- **取消项 mt-2**（design P2-1）：iOS action sheet 取消独立分组惯例——线制保留（线属业务组末行伪元素），分组间距由取消项自身 mt-2 恢复。
- **图标白名单 +3**：file-text（doc-text 映射）/ pause / play；重跑 build-icons 生成 50 图标。
- **记档不改**：显式 size-[17px] 冗余剥除留后续批（design P2-3）。

### 进度（已完成 / 待办）

- ✅ 批 0–13 + 追加反馈① 全部 push。
- ✅ 批 14 首版全流程已 push（`305f4c6`）。
- ✅ 批 14 真机反馈②（分割线带转角）：根治 = `.menu-sep` 伪元素全宽直线，divide 系退役；探针断言改伪元素（F2b 全宽直线 / 2d seps）+ 三探针注释同步；探针全绿（inspector-row-menus ALL PASS / batch13 18 / m5-sheets 83 / composer-toolbar H5·H6）+ 单测 734 + 门禁全绿（format/lint 0/typecheck 三包/tokens 0/CSS 硬闸）+ 记档更新。
- ⬜ commit + push（本 handoff 一并入库）。
- ⬜ 用户真机复验（清单见下）。

## 统一真机复验清单（批 13 8 条 + 批 14 追加）

1. **右栏文件树 mtime**：文件行右侧相对时间在场
2. **右栏 FAB**：右下角 ＋ FAB 新建/上传；地址栏行尾无「＋」钮（移动端同构）
3. **全局文件页地址栏**：与搜索框/卡片左右对齐
4. **检视面板 file tab**：渲染⇄源码 toggle 垂直居中；源码态 = CodeMirror
5. **md 内链**：渲染态点相对 .md 链接 → 新 tab 打开目标
6. **分屏**：分屏按钮 = 当前激活 tab 副本双窗格；无 console 报错
7. **插件作用域分段**：桌面标题行内右端固定宽 290、caret = Lucide；移动满宽正常
8. **检视面板底部文字链退役**：新建/上传统一 FAB；行菜单「上传文件…/上传到此」仍可用
9. **【批 14】菜单统一样式**：各菜单（文件行右键/长按、tab 右键、插件长按、wiki ⋯、FAB 添加菜单、composer 三选择器）条目间分割线 = **全宽直线**（无转角、两端贯通到菜单边）+ 全行带图标（插件菜单：查看详情/停用/启用/卸载图标语义）；实例切换菜单与 composer 选择器菜单头下无线；移动 sheet 取消项与业务项间有分组间距

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-08；触发原因：批 14 记档完成，commit 前Checkpoint
