# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-05 13:20（**「最近」组行形修正** `b7f35a1`：行标题
> 改用会话名 displayName + 去项目名 chip；探针 10 断言 ALL PASS；
> **九批 commit 未 push**）

## 一句话状态

批次二「最近」组对齐桌面同款交付（`722369f`）后又按用户真机反馈修正
行形（`b7f35a1`）：行标题 = 会话名 displayName（活跃条目从全局候选按
sessionId 匹配，回退历史 title）、去项目名 chip。探针 10/10、门禁全过，
等用户真机验收后 push（共九批）。

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **用户打回与重做（2026-11-05）**：「最近分组，你应该参考我们桌面端中的
  最近分组做法，排序规则以及展示的内容理应是同一套。」原 v1（`782750a`）
  从 overview 活跃实例取 updatedAt 前 7——数据源、排序字段、内容三面都不
  对。v2（`722369f`）对齐桌面 05c / 移动历史浮层：useHistoryQuery 全局
  作用域（projectName=null）recent 组 = agent-history 端点 entries
  （服务端 lastActivityAt 倒序）slice(0,7)，含已结束会话。
- **行点击分流（桌面 activateEntry 同款）**：hasActiveSession →
  onSelectInstance 聚焦既有实例；已结束 → usePromptDialog 命名框（预填
  displayTitleOf）→ resume(buildResumeInput)。
- **行形修正（`b7f35a1`，用户真机反馈）**：①行标题 = 会话名 displayName
  优先（活跃条目从 foreignCandidates 按 sessionId 匹配 displayName，取
  不到或已结束回退 displayTitleOf）——用户问「为何用的不是会话名做标题」；
  ②去项目名 chip（「不用出现项目名」，项目归属不上行，同桌面历史浮层
  行形）——SwitchMenuRow/InstanceSwitchRow 的 projectName 字段与 chip
  渲染块连带清理。探针 fixture 活跃条目 title 改 raw-*（与 displayName
  故意分离）使标题语义可断言。
- **holders 必须在 menu/sheet Content 外**：Radix 关闭卸载 Content 子树
  会连带卸载嵌套其中的 prompt/confirm（Portal→body）→ resolve 悬空。解法
  = holder 渲染在 Fragment 兄弟位（mobile-sheets 同因同解）。
- **探针 fixture 根因（持续有效）**：`page.route` 拦不了 WebSocket——
  session-shells WS 首帧 applyShellsFrame 会 setQueryData(["overview"])
  覆盖 route fixture。任何 mock overview 的探针必须 addInitScript mock
  WebSocket（FakeWebSocket + on* no-op setter）。
- **frontend-notes §10 JS 变体（持续有效）**：改 i18n/组件后 watch 漏
  emit → touch main.tsx 完整 rebuild + `rg 特征串 web/dist/` 直查产物。
- **探针「总行数」教训**：▾ 菜单 menuitem 总数 = 会话行 + 2 个底部固定
  操作项（＋新建实例… / ⟲恢复历史会话…，同样 role="menuitem"）——断言
  total 别忘 +2（本轮 4b 假挂实抓）。

### 进度

- ✅ 批次一 `106da79`：[项目] Tab 双列表收起+记忆（探针 15 断言）
- ✅ 批次二 v2 `722369f` + 行形修正 `b7f35a1`：「最近」组对齐桌面（探针
  10 断言 + 门禁全过 + CSS 硬闸 + tokens 0 违例）；v1 `782750a` 的稳定
  排序部分仍有效保留
- ✅ handoff 快照归档（20261105-1257.md）
- ❌ **九批 commit 未 push**（`32e5703`…`b7f35a1`，等用户真机验收后确认）

### 阻塞 / 风险

- 无阻塞。

## 下一步

1. 用户真机验收两批（checklist 见下方易丢上下文）。
2. 验收通过 push 八批。
3. 遗留：脱壳批真机验证 checklist 反馈；v1.7 真机清单；wiki/ git 归属；
   swap 扩容（建议级）。

## 易丢的关键上下文

- **真机验证 checklist（两批）**：
  - 批次一：/projects 两列表收起态跨 PWA 刷新保持（展开→收起→刷新各自记忆）。
  - 批次二：工作台 ▾ 菜单①组序不随会话更新跳位（foreign 组按项目名字母序）
    ②「最近」组在菜单最顶、含已结束会话（灰点），排序与桌面历史浮层「最近」
    组一致 ③行标题 = 会话名（活跃会话与项目组行同名；已结束显示历史 title）、
    行内无项目名 chip ④最近组行点击分流：活跃行→跳转聚焦该实例；已结束行→
    弹命名框（预填标题）确认后恢复会话（取消不创建）。
- **批次二探针 fixture**：/api/agent-history mock 9 条（lastActivityAt
  倒序，前 7 进最近组：h-d1/h-a1/h-b1/h-c1/ended-task/h-e1/ended-old，
  第 8/9 条 ended-3/ended-4 截断）；/api/overview mock 9 候选 5 项目；
  当前项目 proj-a mock 两 sessions 端点。菜单 menuitem 总数 18 = 16 会话行
  + 2 固定操作项。
- localStorage keys：`projectsHome.activityExpanded` / `projectsHome.
  projectsExpanded`；`lang`。
- 探针收尾：agent-browser 未用（playwright 直跑）；5a 取消路径零 POST
  （探针绝不点命名框「确认」——会向真实服务器创建会话）。
- api/web 标准重启 = `respawn-pane -k -t ar-dev:0|1`；重启 api 前必须用户
  确认（杀 CLI 子进程）。
- **写入可靠性教训（持续有效）**：长 new_string/old_string 有输出损坏
  风险——小步分次 + 读回验证 + 立即修复；探针等已入库文件优先 git
  checkout 恢复再 Edit 小步改。
- bun test / e2e 内存限制用 systemd-run cgroup（2G / 4G）。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
