# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-08（**批 14 菜单统一样式实现 + 双 reviewer 消化完成，commit + push 后待用户真机复验**）

## 一句话状态

批 14（真机反馈第五轮①：菜单统一样式——条目间分割线 + 全量 icon）实现、验证、双 reviewer 消化全部完成并记档（redesign-v2.md §6.14 批 14 段）。批 13（`606fb1a`）+ 追加反馈①（`5d4e495`）已 push。

## 本 session 焦点（批 14 全流程）

### 关键决策（本阶段不可丢）

- **divide 单源**：桌面 = DropdownMenuContent 基线 `divide-y divide-sep`（ActionMenu 两分支 + OptionMenu 桌面全经此）；移动 = ActionMenu/OptionMenu role=menu 容器同类。`DropdownMenuSeparator` 无直用消费点。
- **★ Tailwind v4 divide-y 语义变化**：v3 = `~` 兄弟 + border-top；**v4 = `> :not(:last-child)` + border-bottom**，且包在**零 specificity 的 `:where()`** 里。断言必须读 `borderBottomWidth`（除末项 1px）；零 specificity 正是两处覆盖修复（divide-y-0 / `[&>.mh]:border-b-0`）能稳赢的机制基础。
- **icon 单源兜底（code P2 消化）**：ShellIcon 内嵌 svg 恒 `size-full` 绕过 svg 兜底选择器，裸传 span 默认 size-4=16px——**35 处既有菜单图标实为 16px**。修 = ShellIcon span 加 `data-shell-icon` 锚点 + DropdownMenuItem/mobileSheetItemClasses 各加 `[&_[data-shell-icon]]:size-[17px]`（父 class+属性 (0,2,0) 稳赢），裸传消费点零改动统一 17px。契约：菜单 icon 不传尺寸，容器统一 17px（显式 size-[17px] 亦接受=冗余，剥除留后续批）。
- **两个分区容器例外**（divide 基线的 hazard class）：①`mobile-project-header` 实例切换菜单（标题/滚动列表/钉底三分区）= `divide-y-0`；②OptionMenu anchored `.mh` 头（原型 .mh 非 .row 不参与线链）= `[&>.mh]:border-b-0`。
- **取消项 mt-2**（design P2-1）：iOS action sheet 取消独立分组惯例——线制保留（线属业务组末行），分组间距由取消项自身 mt-2 恢复。
- **图标白名单 +3**：file-text（doc-text 映射）/ pause / play；重跑 build-icons 生成 50 图标。
- **记档不改**：divide 线内缩 6px vs 原型全宽线形 = 容器差异已知差异（design P2-2）；显式 size-[17px] 冗余剥除留后续批（design P2-3）。

### 进度（已完成 / 待办）

- ✅ 批 0–13 + 追加反馈① 全部 push。
- ✅ 批 14 全流程：原型标尺三页取证 → 24 消费点盘点 → divide 单源 + 4 消费点 10 项 icon → 三轮探针排障（v4 divide 语义 / 长按合成 / 取消项图标惯例）→ 验证全绿 → 双 reviewer 消化（4 修 + 2 记档）→ redesign-v2 §6.14 批 14 段记档。
- ✅ 验证：探针 inspector-row-menus 25 ALL PASS（含 F2b 分割线/F2c 图标/F2d 17px 几何）/ m5-sheets 83（含三分区回归）/ batch13 18（含 2d 移动 sheet 长按）/ composer-toolbar H5·H6（含 .mh 无线）/ project-plugins 19 / v2-m6-plugins 92；单测 734；e2e 27/27；门禁全绿 + CSS 硬闸 + tokens strict 0。
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
9. **【批 14】菜单统一样式**：各菜单（文件行右键/长按、tab 右键、插件长按、wiki ⋯、FAB 添加菜单、composer 三选择器）条目间分割线在场 + 全行带图标（插件菜单：查看详情/停用/启用/卸载图标语义）；实例切换菜单与 composer 选择器菜单**头下无多线**、实例切换菜单无双线叠加；移动 sheet 取消项与业务项间有分组间距

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-08；触发原因：批 14 记档完成，commit 前Checkpoint
