# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-27（**v1.4 批1 `62cb980` + 批2 `c684738` 已 commit**。批2 = 检视面板·状态层 + 移动 IA，双 reviewer 全消化。**下一步：交用户真机复验批1+批2，然后批3（桌面 ptabs + 链接直达）**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

v1.4 设计包对标进行中：批1（图标管线 + composer 单源 `62cb980`）、批2（检视面板 InspectionPanel + 移动 IA `c684738`）已 commit；四门禁 + token strict + CSS 硬闸 + 单测 1511/0 + e2e 24/24 + 探针 4 个全绿；记档 redesign-v2.md §6.13 批1/批2 段（含 diverge 清单 8 项）。

## 本 session 焦点（批2 完整闭环）

1. **结构**：`PanelTab` union + 三 atom（panelTabs/panelActive per-projectKey 持久化、panelOpen 内存级）；新 `inspection-panel.tsx`（fixed 全屏常驻挂载、translate+visibility 开合零销毁）；row2 ticon×3 退役单检视 ticon；旧 `?tab=` 深链渲染期映射不写回。
2. **双 reviewer 消化**（design M1/M2/m1-m6/n3/n4 + perf M1/m1/m2）：滑出动画 `transition-[transform,visibility]`；panelOpen 卸载复位；`panelEverOpened` 首开门控；**标签叠层保活**（panelTabs 全渲染非激活 invisible + L3 改不透明覆盖层）；activatePanelTab 幂等守卫；ptabs ＋ 热区 / ✕ 重构 div[role=tab]+独立 button / FAB「添加」+disabled；fab prop 收敛；.ptabs 滚动条；bg-surface-base；.ticon.hl 孤儿删除。
3. **探针适配**（叠层保活的语义变化）：L3 内容查询限定 `[data-role="l3-page"]`、叠层容器 `[data-panel-tab-body=…]`、ptab 改 `[role="tab"][aria-label=…]`。

## 关键决策（本阶段不可丢）

- **面板语境真相链**：panelOpen 内存 atom（卸载复位 effect 兜底）> URL 无 tab（面板开合不写 URL）> panelTabs/panelActive per-projectKey localStorage。旧 `?tab=` 深链 = 渲染期一次性映射（不写回），残留复开是拍板 f 固有代价（批3 收敛）。
- **叠层保活范式**（perf-review m1 产物）：children 里 panelTabs 全渲染、非激活 `visibility:hidden`（保布局保滚动位；不用 display:none——丢 scrollTop）+ absolute inset-0 叠层；L3 = 覆盖层 `absolute inset-0 z-10 bg-surface-base` 盖住 children（打开 L3 不卸载标签面板）。
- **panelEverOpened 门控**：invisible 只免 paint 不免渲染/布局/网络——面板从未打开不挂载工具面板；三个 open 路径（ticon/handleToolChange/URL effect）统一走 `openInspectionPanel`。
- **探针铁律**：面板常驻挂载（closed 时 DOM 在）→ 全局查询必须限定面板根/叠层容器；ptab 是 div role=tab 非 button。
- **diverge 8 项**记档 §6.13（ℹ/⋯ 不渲染、三基础标签不可关、iPad 竖屏中间态、FAB 色取舍、「文件」命名、file/git 预览重建过渡态、toolChip gap、存量 SVG 未迁）。

## 进度（已完成 / 进行中 / 待办）

- ✅ 设计包换代 `8f1da09`；9 批计划批准；批1 `62cb980`；批2 `c684738`（含双 reviewer 消化 + 记档 §6.13）
- ✅ 验证：四门禁 + CSS 硬闸 + token strict + 单测 829+9+673 全绿 + e2e 24/24 + 探针（m4-tools-l3 62/0 全量重写、header 25/0、cwd-memory ALL PASS、m10 全过）
- ⬜ **交用户真机复验（清单见下）**：批1 composer/图标 + 批2 检视面板
- ⬜ 批3（桌面 ptabs + 链接直达）→ 批4（文件操作）→ 批5（Git 写，security 必过）→ 批6（插件重排+停用）→ 批7（预览矩阵）→ 批8（密度，perf 必过）→ 批9（收尾）
- ⬜ sheet 拖拽 bug 真机复验（§6.12p 挂起）；存量欠账（rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL）

## 用户真机复验清单（批1 + 批2）

**批1 composer**：
1. 底部输入区控制行：窄屏 3 个彩色小图标（权限/模型/深度）→ 点弹出上方锚定菜单，✓ 即点即生效；≥1024 宽屏变 3 个 pill
2. 发送键 = Lucide ↑ 圆角方形；运行中变停止键；Agent 运行时 chips 行不再出现（配置在控制行 + ℹ）

**批2 检视面板**：
3. row2 单个「检视面板」图标 → 点开全屏滑入（300ms）；‹ 工作台 关闭应**滑出**（非硬切消失）
4. 标签条：默认「文件」；＋ 菜单加 Git/Wiki 标签；切标签内容保留（回来不闪骨架/滚动位不掉）；file 标签 ✕ 可关（仅 file 有 ✕）
5. 文件树：crumb 地址栏点段返回（无「..」行）；进子目录再关面板重开仍停留；点文件 → 面板内预览 → back 回文件树（内容瞬间恢复）
6. Git 标签：chip 显示分支态势；全部历史/分支 → 面板内 L3 页 → back 回标签条
7. FAB 右下半透明（disabled 桩，批4 启用）；深链 `?tab=git` 直达面板 Git 标签
8. 双主题过一遍（面板底色浅色应为暖白 #F2F2F7 系）；sheet 拖拽四轮修复一并复验（§6.12p 清单）

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；批2 已 rebuild（CSS 硬闸过）。
- 风险：面板滑出动画依赖 visibility 离散插值（Chrome/Safari 均支持），真机 WebKit 表现待复验；探针 Chromium 已验证。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + 核对 dist mtime + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **探针选择器（面板语境）**：面板根 `[data-inspection-panel="open"]`、L3 内容 `[data-role="l3-page"]`（含 file/git 预览分支）、标签叠层 `[data-panel-tab-body="files|git|wiki"]`、ptab `[role="tab"][aria-label="文件|Git|Wiki"]`。
- **本 session 生成损坏高发**（~7 次）：大段 Edit/中文注释易混入垃圾 token——对策 = 小段 Edit、失败即 Read 实际内容、不硬试第三次。
- route mock LIFO / preview 带 mtimeMs / 右栏 InitScript 沿用；panelFileTab 预留给批3 链接直达消费。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-27 17:17；触发原因：v1.4 批2 commit `c684738` + handoff save
