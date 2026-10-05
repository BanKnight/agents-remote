# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-06（**v1.5 批 5 历史规模化已收口 commit+push**；下一批 = 批 6 项目管理）

## 一句话状态

**v1.5 换代 9 批计划推进中（6/9 已 commit）**：批 5 历史规模化已完成——契约层（api 游标分页/删除端点/全局端点 + shared 五档分组 + web 共享管道 useHistoryQuery）+ 三 subagent 并发（移动 03n sheet / 桌面 05c + iPad 04g / 批 2-3 reviewer 修复）+ design review P1×2+P2×3 全消化 + §6.14 记档。下一批 = **批 6 项目管理**。

## 本 session 焦点（v1.5 换代 9 批计划）

Plan（已批准）：`/home/deploy/.claude/plans/toasty-sprouting-star.md`。批次 = 0✅ → 1✅ → 2✅ → 3✅ → 4✅ → 5✅ → **6 项目管理（下一个）** → 7 多端骨架 → 8 微交互收尾（含双路径附件）。

### 批 5 契约层（已落地，未提交）
- **api**（`api/src/agent-history.ts` + `session-routes.ts` + `index.ts`）：
  - `paginateAgentHistory` 纯函数管线：search → counts 聚合 → filter → 游标切片（`HISTORY_PAGE_SIZE=20`，keyset 游标 = base64url([sortKey, tiebreak])，失真回首页）。
  - `parseHistoryFilter` 单源 agent-history.ts（session-routes 与 index 共用）。
  - GET `/api/projects/:name/agent-history` 新契约（filter/search/cursor；响应 `{entries, counts, nextCursor, filter}`）；DELETE 同路径 `:sessionId?provider=`（uuid 白名单、hasActiveSession 409、ENOENT 幂等 false→200）。
  - **全局端点 GET /api/agent-history**：枚举项目逐个两路合流 + 预填 projectName + 统一分页；单项目 fs 错误跳过。
  - api 单测 +9（paginate 五档管线 + delete 三态）；`agent-history.test.ts` 33/33 绿。
- **shared**：`AgentHistoryFilter/Counts/ListAgentHistoryResponse/DeleteAgentHistoryResponse/GroupKey` + `AGENT_HISTORY_GROUP_ORDER` + `agentHistoryGroupKey` 纯函数（五档分组边界测试 10 断言）；`ApiErrorCode` 加 `SESSION_HISTORY_ACTIVE/INVALID_ID`。
- **web client**：`listAgentHistory(projectName, query)` 新签名 + `listGlobalAgentHistory` + `deleteAgentHistory`。
- **i18n**（zh/en 各 15 键）：historySearchPlaceholder / historyGroupToday..Earlier / historyEndOfList / historyLoadFailed / historyDelete / historyMenuResume / historyMenuDelete / historyDeleteConfirm{Title,Body,Cta} / api.agentHistoryDeleteFailed。
- **共享 hook** `web/src/components/workbench/use-history-query.ts`：`useHistoryQuery({projectName|null, enabled})` → `{filter,setFilter,search,setSearch,entries,counts,groups,isLoading,isError,refetch,hasNextPage,isFetchingNextPage,fetchNextPage,deleteEntry,isDeleting}`；
  useInfiniteQuery + 300ms search debounce + groups 五档派生 + delete invalidate。groups 派生 in hook（服务端倒序入桶保序）。

### 三 subagent 并发（已完成，随批 5 commit）
- **A（移动面）**：mobile-sheets.tsx 03n 重构 + HistorySwipeRow 左滑删除 + v2-primitives 03n 件；探针 m5-sheets 82/82。
- **B（桌面/iPad 面）**：history-list.tsx 05c 对齐（seg4 mini 三段/搜索/五档组头/右键删除）+ workbench-side.tsx 04g 作用域分段 + desktop-side e2e 6/6。
- **C（批 2/3 reviewer 修复）**：P1×2+P2×3 全修复（pencil 条件渲染/wikiread ⋯ 对齐原型/pre-line/aux 贴底/死键清理）；batch3-preview 55/55。
- **design review（批 5）**：P1×2+P2×3 全消化（seg4 mini 形态改对 / --c-danger 悬空 var web+原型同源修 / copyLinkInBody=false / .hend 独立类 / 03n 搜索框 36px 记档 diverge）。
- **现成键**：`workbench.scopeSegmentProject/All` 与 `workbench.historyFilterAll/Running/Closed` zh/en 已有——复用零新键。

## 关键决策（本阶段不可丢）

- **9 批流程**（§6.13 v1.4 先例）：每批独立 commit + 全门禁 + CSS 硬闸 + tokens 机检 + 探针 + reviewer + redesign-v2.md §6.14 记档 + push；最后统一真机复验清单。
- **契约先行 → 三面并发**（用户并发策略）：主会话串行落契约层（shared/api/client/i18n/hook）→ 三 subagent 并发（文件面零交集）→ 主会话收口。i18n/hook 归主会话，subagent 只消费不添加。
- **range 退役**：五档分组需 30 天+ 数据 = 恒全窗 "all"；防慢动机由分页取代。`AgentHistoryRange` 类型保留（listAgentHistory/listOmpHistory 内部签名仍用，handler 恒传 "all"）。
- **counts 口径**：search 后 filter 前聚合（切段不重拉计数）；游标 = keyset 二元组 base64url；删除 409 = hasActiveSession；uuid 白名单防路径逃逸；omp 前缀匹配删除；ENOENT 幂等。
- **删除入口分容器**：iPhone 左滑行 / Mac 右键行菜单 / iPad 长按行菜单（均 Radix 二次确认）；hasActiveSession 行不提供删除入口。
- **历史拍板继续有效**：密码自读不进上下文；禁截图/vision（DOM 几何硬数据）；探针只删自建数据、用 bun 跑；改 web 文件后必跑 ar-verify-css；format 只用 `bun run format`；React 前加载 vercel-react-best-practices；多端同构；tokens.json 唯一权威。

## 进度（已完成 / 进行中 / 待办）

- ✅ 批 0 `d1210f0` / 批 1 `75a88f2` / 批 2 `36b2195` / 批 3 `3ace270` / 批 4 `bb083af` / **批 5（本 commit，hash 见 git log）**
- ⬜ **批 6 项目管理（下一个）**：api 项目重命名端点（关全部实例 + 历史归属更新）+ 删除语义改造（关会话 + 清置顶/活动 + 历史清除 + `deleteFiles` 默认 false）；project-row-menu（长按/右键）+ rename 影响提醒 + delete 贴底 sheet（☐ 磁盘文件 + 按钮文案升级）；铁律 2 例外记档
- ⬜ 批 7 多端骨架 / 批 8 微交互收尾（含双路径附件）
- ⬜ 全部批次完成后：统一真机复验清单交用户（批 5 追加：iPad 长按行菜单 / 全局行 subtitle 限定符 / 左滑删除手感）
- ⬜ 前序遗留真机清单（待用户）：发图批 6 项 + 技能列表批/浮层聚焦批 9 项 + 第五批 reviewer 修复批

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012（web build 含批 5；CSS 192210 字节）。
- router22 残留进程仍待用户处理（PID 1989432/1989916，跨项目资源 kill 被拦截）。
- **批 5 新增存量欠账**：probe-v2-m8-gaps.mjs Part 2-7 存量过期定位器（03y MoveSheet v1.4 起换代、探针停在原始版——stash 实测 HEAD 同样中断，纯基线欠账），另开探针还债任务。
- 存量欠账（不动）：桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；probe-m10-feedback-fixes H 段 3 处 + probe-files-tree-bugs「05e 五项序」——均为已记档基线失败；`.tree`/`.growrow` 死代码；diff L3 位置架构项。
- **omp-realchain 真实链路探针**：批 5 静态确认兼容（?range= 加参不破），真机复验时跑通。

## 易丢的关键上下文

- **批 5 hook 消费范式**：`useHistoryQuery({ projectName: null = 全局, enabled })`；全局行删除走 `entry.projectName` 归属项目端点。
- **run-e2e.ts 只吃 `process.argv[2]` 单 spec**——多 spec 逐个跑。
- **诊断脚本必须放项目 scripts/ 内跑**（/tmp playwright 版本冲突）。
- **探针跑法**：改 web 文件后 `touch web/src/main.tsx` + `sleep 16` + `node scripts/ar-verify-css.mjs`；探针 `bun scripts/*.mjs`；e2e/单测 `systemd-run --scope --user -p MemoryMax=2G`。
- **原型核查方法**：docs/design/*.html 同页内联私样式 + assets/components.css 单源两处都看。
- **Edit 纪律（本 session 6 次+ 污染）**：短 Edit ≤10 行、old_string 从最新 Read 精确复制、写后立即回读。
- **批 3 遗产**（继续有效）：`useImperativeHandle` factory 短路通则；探针 mock 必须给全契约字段；push/面板 fact 字号档刻意不同；`.meta`/`.done` 撞名解撞。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-06；触发原因：批 5 历史规模化收口（契约层 + 三 agent 并发 + review 消化 + 记档，随本批 commit），下一批 = 批 6 项目管理
