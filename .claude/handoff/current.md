# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-05 19:39（**会话元信息全端同步**：壳帧写扩散到列表/详情缓存 +
> 历史浮层真实状态，`c3b3f23`，探针 8 断言全绿；十四批 commit 未 push）

## 一句话状态

会话元信息（标题 / 状态 / 时间 / provider / mode）收敛为**前端唯一权威 = /api/overview**：
WS 壳帧与 10s 轮询都走同一条**字段写扩散**通道，把变化的字段原地 patch 进项目列表
（agent/terminal-sessions）与 detail 缓存副本，任何展示点不再出现旧值（`c3b3f23`）。

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **用户本轮原话**：「虽然我们聊的时间，但是我认为你应该按照是会话元信息来考虑，至少
  包含状态和标题，而这些内容在很多地方都有出现，例如桌面端左栏，还有项目页面。」
  → 不定点修 updatedAt，而是把元信息整体当一份数据同步。
- **服务端是干净的**：overview / agent-sessions / terminal-sessions / sessions-stream /
  detail 全部投影自同一个 `SessionMetadata` 内存索引（`api/src/session-registry.ts:1221`
  `metadataToCandidate`、`:1237` `agentSessionFromMetadata`、`:1256`
  `terminalSessionFromMetadata`）。缺陷全在前端缓存副本刷新节奏不同。
- **原缺陷**：`use-session-shells.ts` 的 `shellInvalidations` 只比 status/displayName 且只
  失效 **detail**（invalidate 前缀方向不可逆 → 列表永远不失效）；updatedAt / provider /
  mode 零处理；历史浮层用 `hasActiveSession` 布尔伪造成 working（活跃但 idle → 绿点）。
- **修复 = 写扩散**：`diffShells(prev, shells)` 纯函数产出 `{ changed:[{shell,patch}],
  invalidate:[[key]] }`；`applyShellDiff` 用 `setQueryData` 原地 merge 列表
  `{...old, sessions: map}` 与 detail `{...old, session: {...}}`；缓存不存在返回原引用
  （TanStack 不通知 → 零请求零副作用）。新增/移除仍失效列表 key。
- **轮询自愈**：`subscribeOverviewSync()` 订阅 `queryCache`，overview data 引用变化且
  ≠ 模块级 `syncedCandidates` 快照时走同一 diff+patch → WS 断线期间 10s 轮询也能同步。
- **读取优先级统一 overview 权威**：`instance-area.tsx` `cachedSessionFromLists`（overview
  优先、miss 再查列表）、`mobile-workbench.tsx` `focusDisplayName` / `focusProvider`
  补 overview 档。
- **历史浮层真实状态**：`history-list.tsx` 与 `mobile-sheets.tsx` 顶层只读 overview 缓存
  （`useQuery({enabled:false, queryKey:["overview"]})`）建 sessionId→status Map，行内
  `activeStatusById.get(activeSessionId) ?? (hasActiveSession ? "working" : "closed")`。
  标题保持 `displayTitleOf(entry)`（历史文件标题语义，不受 registry displayName 影响）。
- **明确不改**：服务端零改动；`inferSessionTypeFromId` 双轨；chat 资源；localStorage
  `instanceNameMemoAtom`（仅冷启动兜底）。
- **探针教训（延续有效）**：`page.goto` 到会话路由会整页重载 → queryClient 内存清空，
  写扩散断言必须**先在 SPA 内点开 tab（detail 缓存拉热）再推帧**；断言「某文本出现 N 处」
  前先确认页面在该 scope 下究竟渲染几条路径（桌面项目 scope 左栏只有项目段，overview
  源不重复渲染同一会话名）。
- **探针 fixture 根因（持续有效）**：`page.route` 拦不了 WebSocket，必须 addInitScript
  mock FakeWebSocket（保留实例 + on* 访问器），本轮加了 `window.__emitSessionsFrame`
  主动推壳帧。

### 进度

- ✅ 批次一 `106da79`：[项目] Tab 双列表收起+记忆（探针 15 断言）
- ✅ 「最近」组数据源改回 `491f83d`（candidates 派生）
- ✅ 三组单源化 `351635d`（探针 9 断言）
- ✅ **本轮 `c3b3f23`：会话元信息全端同步**（单测 12 项 + 探针 8 断言；全门禁 +
  CSS 硬闸 + tokens 机检全绿）
- ❌ **十四批 commit 未 push**（等用户真机验收后确认）

## 下一步

1. 用户真机验收：
   - 桌面左栏项目段实例行 vs「全部」组同一会话：名字 / 状态点 / 时间一致；
   - 打开会话 Tab 的 TabChip 标题与状态点同值；
   - 移动 header 标题 / provider 与 ▾ 菜单一致；
   - 任一端改名或状态变化后，各端秒级同步（详情页停留时也同步）；
   - 历史浮层活跃但 idle 的会话显示 idle 空心点（不再伪 working 绿点）；
   - 拔网/断 WS 后约 10 秒内左栏仍能跟上 overview 轮询值。
2. 验收通过后确认 push。
3. 遗留（用户未再提）：脱壳批真机 checklist；v1.7 真机清单；wiki/ git 归属；
   swap 扩容（建议级）。

## 易丢的关键上下文

- 探针 `scripts/probe-session-meta-sync.mjs`（8 断言）：fixture overview 2 条
  （agent_1「旧名」idle、agent_2「会话二」idle），项目 agent 列表 / detail / agent-history
  同源旧值；流程 = 初始状态点 → 历史浮层真实状态 → **SPA 点开 tab**（detail 拉热）→
  推壳帧（新名/working/新时间）→ 断言旧名消失、新名 ≥2 处、状态点变绿 → 改 route
  fixture 等 12s 断言轮询自愈。
- 探针 `scripts/probe-switch-menu-recent-group.mjs`：agent-sessions route 的 updatedAt
  故意滞后，3b「最近组行 ≡ 项目组行逐字相同」是单源契约锚点。
- localStorage keys：`projectsHome.activityExpanded` / `projectsHome.projectsExpanded`；`lang`。
- api 重启会杀 CLI 子进程，必须用户确认（本轮纯 web，未重启）。
- **写入可靠性教训（持续有效）**：长 new_string/old_string 有输出损坏风险——小步分次 +
  读回验证 + 立即修复。
- bun test / e2e 内存限制用 systemd-run cgroup（2G / 4G）。
- 交付 checklist：`curl -sI localhost:43012/assets/<css>` 必须 `text/css`（本轮
  `style-2jZ3hp6T.css`，注意前缀是 style- 不是 index-）。
- 探针收尾：playwright 直跑（未用 agent-browser），无残留。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
