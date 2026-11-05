# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-05 02:05（**诊断悬浮球落地** `a6e03ec` + `2db1b7a`：
> 可拖拽球 + 二级页 + down 即 capture 手势修复；探针 18 断言 ALL PASS；
> 前四批均未 push）

## 一句话状态

用户拍板诊断入口形态：可拖拽悬浮球（位置记忆）+ 点击开二级页（移动
MobileSheet / 桌面 Dialog）。落地完成，探针实抓一个真实手势 bug（快速
拖第一步出界手势死）已修。共 5 批 commit 未 push，等用户真机验收。

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **设置 IA 规则（用户拍板）**：「root 值行 → 专属 detail」统一范式；
  诊断日志按同规则。`32e5703` + `89fa12e`（review 修复：桌面 detail
  顶部节奏按态分施 + SegmentedDetail 抽取 + §6.16 记档）。
- **诊断胶囊避让** `8482db2`：max-w 60vw 居中收窄（已被悬浮球批取代，
  保留 commit 记录）。
- **诊断悬浮球**（用户拍板形态）`a6e03ec`：DiagFab 替代常驻胶囊——
  位置 {side,top} 持久化 `ar-diag-fab`（localStorage），松手按球心贴
  左右缘 + resize 重 clamp；二级页内容单源 DiagPanel 双端投影
  （useIsMobile → MobileSheet / Dialog）；图标 bug 进 build-icons 白名单。
- **手势新教训（已沉淀 frontend-notes §23）**：小尺寸拖拽目标 capture
  推迟到阈值 move 会死锁（快速拖第一步出界→收不到界外 move→永远到不了
  接管阈值）；tap 判定走 pointerup phase 分支（不依赖 click）时 down 即
  capture，§23 残留窗口结构性消失。两种模式按「tap 是否依赖 click」二选一。
- **探针坑（§29 家族再实证）**：拖拽断言的拖距要按运行时几何算（从左缘
  拖 120px 球心仍在左半区，吸附 left 是正确行为——断言错非产品错）。
- **探针语言坑**：playwright 新 context 默认语言走 system，中文断言前
  `localStorage.setItem("lang","zh")` + reload。

### 进度

- ✅ 五批 commit（未 push）：`32e5703` IA 重构 / `89fa12e` review 修复 /
  `8482db2` 胶囊避让 / `a6e03ec` 悬浮球 / `2db1b7a` down 即 capture
- ✅ 门禁全过（每批 pre-commit 全门禁）+ CSS 硬闸 + tokens 机检 0 违例
- ✅ 探针：IA 21 断言 + 胶囊避让 9 断言 + 悬浮球 18 断言 ALL PASS；
  探针已删、localStorage 还原
- ✅ frontend-notes §23 补「down 即 capture」分支；handoff 已更新
- ❌ **五批均未 push**（等用户真机验收悬浮球后确认）

### 阻塞 / 风险

- 无阻塞。

## 下一步

1. 用户真机验收悬浮球：设置 → 诊断日志 → 开 → 屏上悬浮球（默认右上）
   → 拖拽/吸附/位置记忆 → 点击开二级页看全文 → copy/upload/clear。
2. 验收通过 push 五批。
3. 遗留：脱壳批真机验证 checklist 反馈；v1.7 真机清单；wiki/ git 归属；
   swap 扩容（建议级）。

## 易丢的关键上下文

- **diag-log localStorage keys**：`ar-diag-log`（缓冲）/ `ar-diag-enabled`
  （开关）/ `ar-diag-fab`（悬浮球位置 {side,top}）/ `lang`（语言）。
- **api /api/diag**：落盘 `~/.agents-remote/diag-uploads/`；校验拒绝不截断。
- **web chunk 布局**：diag-fab 打进 entry chunk（App shell 挂载）；
  settings-dialog 独立 chunk；产物验证 `rg "特征串" web/dist/assets/` 直查。
- api/web 标准重启 = `respawn-pane -k -t ar-dev:0|1`；重启 api 前必须用户
  确认（杀 CLI 子进程）。
- **写入可靠性教训（持续有效）**：长 new_string/old_string 有输出损坏
  风险——小步分次 + 读回验证 + 立即修复。
- bun test / e2e 内存限制用 systemd-run cgroup（2G / 4G）。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
