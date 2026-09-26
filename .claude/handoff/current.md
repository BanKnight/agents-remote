# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-26（**§6.12o 全站加载态体系完成 `5dd1113`**：加载态分层标准建立 + LoadingBlock 单源 + 伪空态修复 5 处 + keepPreviousData 推广，design-reviewer 9 条 + code-reviewer 7 条全消化（记档不修 3 条），验证全绿。§6.12n sheet 收敛 `39a8aca` 已闭环。**下一步：真机复验清单（见下）**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

§6.12o 全站加载态完成（`5dd1113`，20 文件 +759/−339）：分层标准 7 层记档 redesign-v2.md §6.12o；新建 LoadingBlock（ping 圆点+文案居中，双端同构）替换全部散写；伪空态修复 5 处（isPending 区分加载/空态）；keepPreviousData 推广至 history range 切换 + 4 组搜索 query（配套 isLoading 门含 placeholder 期）；新探针 probe-loading-states 13/13。全部门禁 + e2e 24/24 + 存量探针全绿。

## 本 session 焦点

1. 用户拍板「完善所有页面的加载态」→ 三路盘点出 7 种加载态模式并存（骨架/ping 圆点/纯文案/空白/伪空态/保持上一屏/scrim）。
2. 用户两拍板：①详情/预览类 = ping 圆点+文案居中（LoadingBlock 单源，移动 L3 与桌面同构）；②推广 keepPreviousData 到列表参数切换。
3. 四批落地：伪空态修复（5）→ 空白补骨架（3）→ 单源收敛（LoadingBlock + 散写替换 + 删 NavItemSkeleton）→ keepPreviousData 推广。
4. 双 reviewer 审查 16 条全消化（9 修复 + 3 记档不修 + 边界确认）。

## 关键决策（本阶段不可丢）

- **加载态分层标准**（redesign-v2.md §6.12o 表，成为后续标尺）：路由切换=保持上一屏（0 个 pendingComponent，2026-06 拍板固化不动）；列表首载=同形骨架；详情/预览单内容块=LoadingBlock；同 query 参数切换=keepPreviousData；加载 vs 空态=isPending 区分禁止伪空态。
- **骨架只在 isPending 显**，isFetching（后台刷新）不显——防陈旧缓存闪骨架。
- **keepPreviousData 推广前提 = 同 observer in-place 换 key**：history range 切换（in-place，有效）、搜索逐键（in-place，有效）；L3GitHistory 换 branch 是重挂载 → placeholder 按 observer 记忆无效 + 切项目跨项目陈旧负作用 → **不加**。
- **配套修复**：消费方 isLoading 门 = `isPending || isPlaceholderData`——上一份缓存为 `[]` 时切档，v5 把 [] 当 placeholder → isPending/isLoading 双 false → 空白/伪空态回归（code-reviewer P2，useHistorySessions 已修 + 注释守护）。
- **LoadingBlock 形态**：ping 双层圆（animate-ping 外圈 opacity-60 + 实心内圆 bg-primary）+ 12px/600 muted 文案，role="status"，label 必填 + className 透传；shell-primitives.tsx 单源。
- **语义 pulse 点不属 shimmer 收敛**：running/权限等待 animate-pulse 状态点是语义动画（ActiveDot/statusDot/tool-ui-registry/安装 .prog）。
- **保留私有**：TerminalStatusSpinner（终端 scrim 双档大圆）与 tool-head Spinner（流内语义点），非同构形态不强行归一。
- **语义 pulse 点边界**：running/权限等待的 animate-pulse 状态点是语义动画非骨架。
- **L3 详情早退形态**：`min-h-0 flex-1`（整页 flex item 撑满）让 LoadingBlock 内部 justify-center 垂直居中。
- **探针 mock 范式**：延迟 700ms route handler 拉出 pending 窗口 + `waitForSelector(scope + " .skeleton-shimmer")` 确认 pending 期再断言伪空态缺席（避免固定 sleep 竞速）；**global scope 实例 refs 由 overview candidates 派生**（candidates=[] 时 focus 被 prune 回空态，LoadingBlock 永不挂载）；mock LIFO 后注册先匹配；approvals/stream abort 铁律③。
- `docs/design2/` 是用户目录不动；rootBrowse 下沉/i18n key 收敛单独立项。

## 进度（已完成 / 进行中 / 待办）

- ✅ §6.12n 移动 sheet 收敛（`39a8aca`）+ 深度优化四批 + 死 UI 两轮全闭环
- ✅ **§6.12o 全站加载态（`5dd1113`）**：验证 = 四门禁（format/lint/typecheck/test 673）+ CSS 硬闸 + token 机检 exit 0 + e2e 24/24 + probe-loading-states 13/13 + 存量探针 m4 43/43 / m9-b 16/16 / m9-c / m9-d / m9-e / m10 / inspector / desktop-instance-info 全绿
- ✅ handoff save（本文件，§6.12o 条目已回填 hash）
- ⬜ **交用户真机复验**（加载态清单见下 + §6.12n 浮层清单仍待执行）
- ⬜ 记档不修（§6.12o 内，不在本轮）：refsLoaded settled gate / EmptyInstanceArea 错误态卡；keepPreviousData 行为探针（history range 二次响应时序，代码注释守护）；ListRowSkeleton 单行 lines 变体
- ⬜ 存量欠账（不在本轮）：rootBrowse 下沉；i18n 动词级 key 收敛；probe-chat-e2e 2 存量 FAIL

## 用户真机复验清单（§6.12o 加载态）

**加载态场景（需在慢网络/首次加载或 devtools 限速下观察）：**
1. 移动项目 `?tab=git`：pending 显骨架行（不闪「没有变更」），数据到后显真实改动行
2. 移动 `?tab=wiki`：pending 显骨架（不闪「暂无页面」）
3. 移动 `/git/history`：pending 显骨架（不闪「HEAD · 共 0 次提交」），数据到后 meta 显真实计数
4. 移动 `/plugins`：MCP 段/技能段 pending 显骨架（不闪「暂无 MCP 服务器」）；market 搜索 pending 同款（无「…」）
5. 桌面点开会话：中栏显「加载会话…」ping 圆点居中（原空白点）；终端 tab 同款
6. 移动 L3 文件预览/git diff/分支页：LoadingBlock ping 圆点（diff 分支页是行骨架）+ 文案居中
7. 历史列表 range 切换（近一周↔全部）：平滑换数据不闪骨架（keepPreviousData）
8. files/wiki/技能/MCP 市场搜索逐键输入：列表不闪骨架
9. chat 总览/移动项目 tab/目录列表：pending 显骨架不空白
10. 双主题下 LoadingBlock ping 圆点形态正常（bg-primary 两态）
11. reduced-motion 下骨架 shimmer/ping 有兜底（prefers-reduced-motion）

**§6.12n 浮层清单（上轮遗留，仍待执行）**：见 git log `39a8aca` 交付说明或上轮汇报（悬浮卡片 sheet 形态/下拉收起/scrim 纯压暗/检视换装/编辑链）。

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活 43011/43012；`5dd1113` 前已复验 CSS 硬闸过（dist mtime 23:25:13）。
- token 机检 report 模式存量 HEX（`SessionDetailRoute.tsx (9)`）非本轮引入，M1 收紧时清。

## 易丢的关键上下文

- **探针跑法**：`bun scripts/probe-*.mjs`；跑前 touch main.tsx 完整 rebuild + sleep 16（后核对 dist mtime 确认真 build 了）；e2e/单测用 `systemd-run --scope --user -p MemoryMax=2G`。
- **agent-browser 密码**：`PW=$(awk '/password:/ {print $2; exit}' ~/.agents-remote/config.yaml)` 进 shell 变量，不进上下文；探针须设 locale zh-CN。
- **Edit 注入防护（持续有效）**：Edit 前从最新 Read 逐字拷贝；new_string 写入后 rg 机检 + typecheck 兜底；大块删除用 sed 行号区间删 + rg 验证；临时脚本用 `bun -e` 内联（Write 临时文件有注入前科）。
- **Playwright selector 陷阱**：`text="..."` 带引号=精确匹配（整行不中），`text=...` 无引号=substring。
- **route mock LIFO**：后注册先匹配；探针 mock 别挂宽泛 `git/.*`。preview 响应必带 mtimeMs。
- **右栏默认收起**：探针/e2e 加 InitScript `localStorage.setItem("workbenchRightCollapsed","false")`。
- **基线对照法**：`git worktree add /tmp/ar-probe-baseline <旧 commit>` + 43099 独立端口 preview；stash 对照无效。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-26 23:42；触发原因：§6.12o 全站加载态 commit `5dd1113` + review 16 条消化完成 + handoff save
