# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-05 16:50（**「最近」组数据源定案**：改回会话列表同源
> `foreignCandidates` 派生，探针 8 断言全绿；十二批 commit 未 push）

## 一句话状态

用户三轮打回后定案：▾ 菜单「最近」组 = **会话列表的最近视图**（唯一数据源 =
/api/overview candidates，`updatedAt ?? createdAt` 降序前 7），不含任何
agent-history 文件管道条目。v2 的 agent-history 方向（`722369f`/`b7f35a1`）
整体废弃；`3ba2b4d` 服务端活跃条目时间修复保留（对历史浮层语义仍正确）。

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **数据源方向定案（2026-11-05 用户三轮打回，最终）**：「我们的最近分组，是对
  『会话列表』的分组，这是唯一数据源，不需要考虑什么鬼文件！」——用户系统只有
  5 个会话，agent-history 管道（104 条：99 ended + 5 active）必然混入列表外
  条目（已结束历史 + resume fork 幽灵行）。▾ 菜单最近组 = foreignCandidates
  （与项目组/foreign 组同一管道）时间倒序前 7；行点击只聚焦既有实例（删除
  useHistoryQuery / useResumeAgentSession / usePromptDialog 命名框分流）。
- **桌面端排查结论**：桌面端**没有对会话列表的「最近」分组**——web 中 recent
  分组消费点仅历史浮层（history-list.tsx，桌面 05c）与移动历史浮层
  （mobile-sheets.tsx），二者是**历史会话列表**的分组（含已结束 = 设计本意），
  不属同款数据源错误，无需改动。
- **fork 调查已停止**：用户明确不耐烦（「为什么你老是要查 fork 的？我都无语了」）。
  不再把 fork 对账当本轮任务；若未来要修历史浮层的 fork 副本条目，需用户显式
  拍板后单独立项（风险面在 resume 链，勿擅自动）。
- **行形修正（`b7f35a1`，保留有效部分）**：行标题 = 会话名（candidates 原生
  displayName，天然满足）；行内无项目名 chip。
- **探针 fixture 根因（持续有效）**：`page.route` 拦不了 WebSocket——session-shells
  WS 首帧 applyShellsFrame 会 setQueryData(["overview"]) 覆盖 route fixture，必须
  addInitScript mock WebSocket（FakeWebSocket + on* no-op setter）。
- **frontend-notes §10 JS 变体（持续有效）**：改 i18n/组件后 watch 漏 emit →
  touch main.tsx 完整 rebuild + `rg 特征串 web/dist/` 直查产物。
- **探针「总行数」教训**：▾ 菜单 menuitem 总数 = 会话行 + 2 个底部固定操作项
  （＋新建实例… / ⟲恢复历史会话…，同样 role="menuitem"）——本轮 total=18。

### 进度

- ✅ 批次一 `106da79`：[项目] Tab 双列表收起+记忆（探针 15 断言）
- ✅ 批次二 `722369f` + `b7f35a1` + `3ba2b4d`（历史保留）→ **数据源改回**本轮
  commit：「最近」组 = candidates 派生（探针 8 断言 ALL PASS）
- ❌ **十二批 commit 未 push**（等用户真机验收后确认）

## 下一步

1. 用户真机验收：▾ 菜单「最近」组 = 会话列表（5 个会话就 ≤5 条、时间同会话
   列表、无列表外条目）；项目组序稳定不跳位。
2. 验收通过后确认 push。
3. 遗留（用户未再提）：脱壳批真机 checklist；v1.7 真机清单；wiki/ git 归属；
   swap 扩容（建议级）。

## 易丢的关键上下文

- **本轮探针 fixture**：/api/overview mock 9 候选 5 项目（updatedAt 错开，
  前 7 = s-d1 > s-a1 > s-b1 > s-c1 > s-a2 > s-b2 > s-e1；s-c2/s-e2 截断）；
  proj-a 两 sessions 端点；无 agent-history fixture。断言 8 条含「最近组每行
  都来自 candidates」（`2c` 核心回归）。
- localStorage keys：`projectsHome.activityExpanded` /
  `projectsHome.projectsExpanded`；`lang`。
- api 重启会杀 CLI 子进程，必须用户确认（本轮无需重启——改动纯 web）。
- **写入可靠性教训（持续有效）**：长 new_string/old_string 有输出损坏风险——
  小步分次 + 读回验证 + 立即修复。
- bun test / e2e 内存限制用 systemd-run cgroup（2G / 4G）。
- 探针收尾：playwright 直跑（未用 agent-browser），无残留。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
