# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-13（**桌面三栏批完成全套验证 + 双 reviewer 消化 + 记档，待 commit + 真机清单**）

## 一句话状态

三栏批完成：左栏可折叠（workbenchLeftOpenAtom + EdgeFoldButton 把手钮 + RailButton 唤出闭环）+ 右栏折叠钮挪左缘（clps「»」退役）+ 右栏交界双线收敛单线；调试实锤并修复 grid auto-placement 真 bug（双收态 section 塌进 0px 轨 → 中栏宽 0，显式 lg:col-start-1/2/3 钉位，教训沉淀 frontend-notes §30）；双 reviewer 消化（getOnInit / m9-d F12 反转 / 左钮 border-r 延续边界线 / touch:after 单向扩 / clps 死 CSS / 注释套件 / 探针几何断言×3 / 决策反转改口）。全套验证绿：probe-desktop-layout 34/34、probe-grid-panel 14/14、m9-d F11-F14、单测 795、typecheck、CSS 硬闸、tokens。待 commit + 真机清单交付。

## 本 session 焦点

### 关键决策（不可丢）

- **grid auto-placement 陷阱（本批最大发现）**：条件渲染移除 grid item 后剩余 item 自动重排进靠前轨道——aside 双双不渲染时中栏 section（唯一 item）被塞进第 1 轨 0px → 中栏宽 0 + hit-test 全哑；「RailButton 贴左缘 x=0」断言通过是塌缩巧合。修 = 显式 lg:col-start-1/2/3 钉位；防回归断言用容器量度（section 宽==视口宽）而非按钮位置。详见 frontend-notes §30。
- **EdgeFoldButton 形态**（用户 AskUserQuestion 拍板「栏内缘竖条把手钮」）：左右镜像（左钮 right-0 rounded-l + border-y-l-r；右钮 left-0 rounded-r + border-y-r），side 语义与 RailButton 相反（所在栏 vs 中栏哪一缘，注释已警告）。触屏热区只向所在栏内侧扩 8px（单向）。
- **暗色左把手可发现性**（design P1 记录不改）：fill 对比 ~1.0:1 依赖描边+chevron；真机必验，备选材质 bg-surface-inset + border-sep-strong 已记组件注释。
- **atomWithLocalOnlyStorage 加 options 透传**（code P1 消化）：getOnInit=true 时 atom 创建即同步读 localStorage——持久化折叠态刷新首帧生效（否则 post-paint 才落地=闪开+跑 query）。
- **clps「»」退役**：折叠入口唯一化为把手钮；m9-d F12/F12b 断言反转防回归；`.glabel2 .clps` 死 CSS 删。

### 进度

- ✅ 三栏批 9 文件（workbench-model / workbench-shell / WorkbenchRoute / right-panel-tabs / instance-area / zh+en / probe-desktop-layout）+ grid bug 修复 + 双 reviewer 消化 8 处 + 全套验证绿 + redesign-v2.md 三栏批小节记档 + §6.12k/design_spec 决策反转改口 + frontend-notes §30
- ⏳ commit → 真机清单交付（含暗色左把手必验项 + PWA 强刷）

### 阻塞 / 风险

- 无阻塞。Edit 写通道本 session 残字 ×5（大块重写+长中文串诱发）——后续编辑已固化「小步 ≤10 行 + 短串 + 读回」纪律，本批所有落盘内容已经读回验证无损。

## 易丢的关键上下文

- **真机清单（commit 后交用户）**：①左栏把手钮（右缘竖直居中）点击折叠 → 中栏吃满 + 中栏左缘唤出钮；刷新折叠态保持且无闪开动画；②右栏把手钮（左缘）折叠；行内「»」不再出现；③右栏↔中栏交界 1px 单线；左栏交界线连续；④右栏拖宽正常（把手覆盖段除外）；⑤**暗色主题左栏把手钮可发现性（必验，隐形则下批换材质）**；⑥iPad 触屏把手热区不吞中栏点击；⑦PWA 强刷。
- 用户已确认把手居中（sash 批）「非常棒」。
- 探针纪律：`systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`；脚本必须放 repo scripts/ 下（/tmp 跑会解析错 playwright 缓存）。
- probe-desktop-layout Part 6 断言 16 条含「中栏吃满视口」容器量度防回归——未来改三栏 grid 布局先看这条。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-13 14:38；触发原因：三栏批收尾（验证绿 + 记档完，commit 前）
