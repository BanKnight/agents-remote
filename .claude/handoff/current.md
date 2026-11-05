# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-05 17:20（**▾ 菜单三组单源化**：同一会话「最近组 vs
> 项目组」时间不同步已修，`351635d`，探针 9 断言全绿；十三批 commit 未 push）

## 一句话状态

▾ 切换实例菜单的数据源收敛为**单一 /api/overview 管道**：最近组 / 当前项目组 /
foreign 组全部从 `foreignCandidates` 派生（`351635d`），同一会话在三组时间同值。
上一轮已定案「最近组 = 会话列表的唯一数据源」（`491f83d`）。

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **时间不同步根因（2026-11-05 用户真机反馈直接定位）**：菜单原先两条管道——
  - 最近组 / foreign 组 ← `useGlobalInstanceCandidates`（`/api/overview`）：
    WS session-shells 每帧 `setQueryData(["overview"])` 全量投影 + `refetchInterval`
    10s 轮询 → 秒级实时。
  - 当前项目组 ← `useProjectInstances`（agent-sessions / terminal-sessions）：
    `use-session-shells.ts` 的 `shellInvalidations` 只在候选**新增/移除**时失效
    列表 key，status / displayName 只失效 detail——**updatedAt 变化零失效通道**
    → 时间必滞后。
  - 结论：**同一个会话在两组里时间必然不同**，只能单源化解决。
- **单源化落点**：`InstanceSwitchMenu` 内 `projectCandidates = foreignCandidates
  .filter(c => c.ref.projectName === projectName)`；`focusedStatus` 也从 candidates
  查找；`instances` prop 从 MobileProjectHeader / InstanceSwitchMenu 整链删除。
  `mobile-workbench.tsx` 的 `useProjectInstances` 保留（自动聚焦 /
  runningCount 等其它消费），只是不再喂菜单。
- **数据源方向定案（2026-11-05 用户三轮打回）**：「最近」组 = 会话列表最近视图，
  唯一数据源 = /api/overview candidates，**不含任何 agent-history 文件管道条目**；
  fork 调查已停止，不再作为任务。
- **桌面端无同款问题**：web 中「最近」分组只存在于历史浮层（history-list /
  mobile-sheets），那是历史会话列表的分组（含已结束 = 本意），无需改。
- **探针 fixture 根因（持续有效）**：`page.route` 拦不了 WebSocket——session-shells
  WS 首帧 `applyShellsFrame` 会 setQueryData(["overview"]) 覆盖 route fixture，
  必须 addInitScript mock WebSocket（FakeWebSocket + on* no-op setter）。
- **探针总行数**：▾ 菜单 menuitem 总数 = 会话行 + 2 个底部操作项（本轮 18）。

### 进度

- ✅ 批次一 `106da79`：[项目] Tab 双列表收起+记忆（探针 15 断言）
- ✅ 「最近」组数据源改回 `491f83d`（candidates 派生，探针 8 断言）
- ✅ **本轮 `351635d`：三组单源化 + 探针 3b 单源回归断言（9 断言 ALL PASS）**
- ✅ `eaafd19` docs：handoff 滚动
- ❌ **十三批 commit 未 push**（等用户真机验收后确认）

## 下一步

1. 用户真机验收：▾ 菜单同一会话在「最近」组与项目组的时间**完全一致**且实时跟随；
   最近组 = 会话列表（5 个会话就 ≤5 条，无列表外条目）；项目组序稳定不跳位。
2. 验收通过后确认 push。
3. 遗留（用户未再提）：脱壳批真机 checklist；v1.7 真机清单；wiki/ git 归属；
   swap 扩容（建议级）。

## 易丢的关键上下文

- **探针 `scripts/probe-switch-menu-recent-group.mjs`**：/api/overview mock 9 候选
  5 项目（updatedAt 错开，前 7 进最近组，s-c2/s-e2 截断）；**agent-sessions route
  的 updatedAt 故意滞后到 2026-01-01**——断言 3b「同一会话最近组行 ≡ 项目组行
  逐字相同」是单源契约锚点，回退双源必挂。
- localStorage keys：`projectsHome.activityExpanded` /
  `projectsHome.projectsExpanded`；`lang`。
- api 重启会杀 CLI 子进程，必须用户确认（本轮纯 web，无需重启）。
- **写入可靠性教训（持续有效）**：长 new_string/old_string 有输出损坏风险——
  小步分次 + 读回验证 + 立即修复。
- bun test / e2e 内存限制用 systemd-run cgroup（2G / 4G）。
- 探针收尾：playwright 直跑（未用 agent-browser），无残留。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
