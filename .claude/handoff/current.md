# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-06（**v1.5 批 7 多端骨架与杂项已收口待 commit**；下一批 = 批 8 微交互收尾）

## 一句话状态

**v1.5 换代 9 批计划推进中（8/9 已实现）**：批 7 多端骨架与杂项已完成——①iPad 状态栏零改动确认 + `.aprow` 橙行退役（审批入口收敛状态栏审批段）②终端输入默认收起（atomFamily 按 sessionType 分族 + 常驻快捷键条 + 「Expand input」钮）③子 agent 概览条（回合边界 + 单 chip/计数条+列表卡分流 + 一次性跳转信号）④会话类型图标统一（`sessionMarker` 去 provider 分支 + 孤儿链清理）⑤puzzlepiece 插件图标（+生成器 oxfmt 风格治本）。全门禁 + 探针（新 batch7 探针 40 断言）+ e2e 适配全绿；design-reviewer 三次环境失败后代行审查实抓两处修复（done 行 ink-3 色值 + 死键删除）。§6.14 已记档，随本批 commit。

## 本 session 焦点（v1.5 换代 9 批计划）

Plan（已批准）：`/home/deploy/.claude/plans/toasty-sprouting-star.md`。批次 = 0✅ → 1✅ → 2✅ → 3✅ → 4✅ → 5✅ → 6✅ → **7✅（本 commit）** → 8 微交互收尾。

### 批 7 实现摘要（§6.14 记档已落）

- **iPad 状态栏（spec §9:327）**：`status-bar.tsx` 已用 `useIsDesktopViewport`（1024px）→ iPad ≥1024 天然同构，零改动；真实改动 = workbench-side `.aprow` 橙行退役 + `workbench.approvalRow` i18n 死键清 + 注释换代。
- **终端输入默认收起（spec §4.7）**：`inputDrawerCollapsedAtom` 改 atomFamily（key `inputDrawerCollapsed:${sessionType}`，terminal 默认 true / agent 默认 false；旧全局 key 不迁移一次性重置）；SessionInputDrawer = 常驻行（`.qkey`×8 + `.xbtn` aria-expanded + expand/shrink 图标）+ 条件双行 composer；展开时快捷键条上移不消失。e2e `terminal-session.spec` 适配（先点 Expand input 再填）。
- **子 agent 概览条（spec §4.1）**：新组件 `web/src/routes/claude-subagent-overview.tsx`——`useSubagentOverview()`（JSON 签名 + useMemo parse，useAuiState selector 引用稳定）；**回合边界** = index > lastUserIndex（新 user 落地自动清空）；分流 = 0/null 不渲染 / 单 running 保留旧 `.subbar` chip 逐字节同款 / ≥2 `.sub` 计数条 + `.slist` 列表卡（`.subrow`，running 前置完成置底，全完自动折叠保留入口）；行点按 = `agentCardExpandSignalAtom` 一次性信号 + scrollToMessage。`.subrow` 避让 03j `.srow`。done 行状态字色 = `--ink-3`（初版误写 ink-2，代行审查修复 + 探针 P3-15 hex→rgb 归一断言）。
- **会话类型图标统一（spec §6.2）**：`sessionMarker(type, size)` 去 provider 分支（4 调用点收窄）；孤儿链清理 = `InstanceNameEntry.provider` 删除（instance-area.tsx 三处 + workbench-model.ts + 测试 fixture）。
- **puzzlepiece（spec §3.5）**：build-icons.mjs 白名单 +puzzle/expand/shrink（46 图标）+ TO_LUCIDE 映射 + 底部 nav/桌面 footnav 换代；**生成器治本** = `quote()`/`keyOf()` 序列化对齐 oxfmt（最少转义引号 + 合法标识符 key 去引号），生成物直接过 format:check。

### 批 7 验证面

- 门禁全绿：format:check / lint 0 warning / typecheck 三包 / test 1639（api 905 + shared 10 + web 724）/ CSS 硬闸 194828 字节 / tokens strict 0 违例。
- 探针全绿：**probe-v15-batch7-skeleton.mjs 新增（40 断言**：P1 移动终端抽屉 13 + P2 桌面图标统一 11 + P3 概览条 16 含 P3-15 色值锁）+ m9-d 67（G 段换代：aprow 退役 + 状态栏审批段 + G18/G19 iPad 档）+ perf 16（seed 顺序修正：agent 注入移末条 user 后）+ m9-c 15 + m9-b 19 + batch4 36 + tri-column。
- e2e 20 tests 全绿（8 spec；terminal-session 适配 +1 步）。

## 关键决策（本阶段不可丢）

- **9 批流程**（§6.13 v1.4 先例）：每批独立 commit + 全门禁 + CSS 硬闸 + tokens 机检 + 探针 + reviewer + redesign-v2.md §6.14 记档 + push；最后统一真机复验清单。
- **批 7 拍板**：inputDrawerCollapsed 旧全局 key 不迁移（一次性重置 < 迁移代码）；终端键位集保留现状 8 功能键 vs 原型 8 键不同（现状真机验证过）；mock id 前缀契约 `agent_`/`terminal_`（`inferSessionTypeFromId` 只认这两个）；单 agent 非 running 不渲染概览（避免常驻残条）。
- **历史拍板继续有效**：密码自读不进上下文；禁截图/vision（DOM 几何硬数据）；探针只删自建数据、用 bun 跑；改 web 文件后必跑 ar-verify-css；format 只用 `bun run format`；React 前加载 vercel-react-best-practices；多端同构；tokens.json 唯一权威；快通道文档 commit 只跑 format+lint；max-sm 是本仓移动断点（sm=1024 覆写）禁 max-md。

## 进度（已完成 / 进行中 / 待办）

- ✅ 批 0 `d1210f0` / 批 1 `75a88f2` / 批 2 `36b2195` / 批 3 `3ace270` / 批 4 `bb083af` / 批 5 `7f949aa` / 批 6 `4f6ad1a` / **批 7（本 commit，hash 见 git log）**
- ⬜ **批 8 微交互收尾（最后一个）**：§7.2 指针规范（ptabs/tabstrip/chips 滚轮纵向→横向映射 passive:false + 溢出边缘 12px 渐隐 mask + 尾部控件可达）；浮层两族对齐核查（ActionMenu 标准档 45px 行/14 字/17 图标/gap14、sheet 近贴边 10pt 侧距、push 四边零距）；附件双路径（小文本 txt/md/csv/json/log ≤1MB 内联消息级不落库 / 超限落 uploads/ 提及行 + 桌面 ⌫ 删 chip）；09b 行高对齐标准档；02c 菜单材质核查；全套探针/e2e 回归查漏补缺 + redesign-v2.md 总记档。
- ⬜ 全部批次完成后：统一真机复验清单交用户（批 7 追加：iPad 状态栏审批段点击开审批中心 + 终端收起手感（Expand input/收回/reload 保持）+ 子 agent 概览条（计数条展开/行点按跳转/回合边界清空）+ 会话图标 + 插件图标）。
- ⬜ 前序遗留真机清单（待用户）：发图批 6 项 + 技能列表批/浮层聚焦批 9 项 + 第五批 reviewer 修复批。

## 阻塞 / 隐患

- 无阻塞。dev 存活 43011/43012（web build 含批 7；CSS 194828 字节）。
- **design-reviewer 环境失败累积（批 2 三次 + 批 3 三次 + 批 7 三次）**：均为 `API Error: unexpected EOF` 传输层错误；三批均由主 agent 代行审查 + 记档留待环境恢复后补复审。
- router22 残留进程仍待用户处理（PID 1989432/1989916，跨项目资源 kill 被拦截）。
- chat-idle-recycler 定时扫描测试一次 flaky（时序敏感，非本批面）。
- 存量欠账（不动）：**probe-desktop-instance-info.mjs（批 7 新识别：基于批 4 已退役的 TabChip ™ 按钮，存量过期非本批回归）**、probe-v2-m8-gaps Part 2-7、桌面「点第二个实例丢 leaf」、DialogTitle a11y、rootBrowse 下沉、i18n key 收敛、probe-chat-e2e 2 存量 FAIL、probe-m10 H 段 3 处、probe-files-tree-bugs「05e 五项序」、`.tree`/`.growrow` 死代码、diff L3 位置架构项、jotai atomFamily deprecation（v3 移除，需 /check-deps 换 jotai-family）。
- omp-realchain 真实链路探针留真机复验。

## 易丢的关键上下文

- **批 7 范式**：`useSubagentOverview` 的 selector 必须返回 JSON 签名字符串（useSyncExternalStore 引用稳定）+ useMemo parse；一次性展开信号 atom 消费后必须置 null（防跨会话泄漏）；mock id 前缀必须 `agent_`/`terminal_`（term_/codex_ 不判类型，两次踩坑）。
- **生成器纪律（批 7 治本）**：build-icons.mjs 输出必须直接过 format:check（`quote()` 最少转义 + `keyOf()` 标识符 key 去引号）——不允许「提交前 bun run format 覆盖」掩盖（68b030c 先例）。
- **run-e2e.ts 只吃 `process.argv[2]` 单 spec**——多 spec 逐个跑。
- **诊断脚本必须放项目 scripts/ 内跑**（/tmp playwright 版本冲突）。
- **探针跑法**：改 web 文件后 `touch web/src/main.tsx` + `sleep 18` + `node scripts/ar-verify-css.mjs`；icons.ts 重生成会触发 JS 重建窗口（旧 HTML 引新 chunk），必要时再 touch + sleep 20；探针 `bun scripts/*.mjs`；e2e/单测 `systemd-run --scope --user -p MemoryMax=2G`。
- **原型核查方法**：docs/design/*.html 同页内联私样式 + assets/components.css 单源两处都看。
- **Edit 纪律**：old_string 必须从最新 Read 精确复制；hook formatter 可能改过文件导致失配——失配就重读再改；连续两次失败就停。
- **a11y role 改动破探针定位器**：role="menuitem"/role="checkbox" 覆盖隐式 button role → getByRole("button") 不再命中。
- **批 3 遗产**（继续有效）：`useImperativeHandle` factory 短路通则；探针 mock 必须给全契约字段；`.meta`/`.done` 撞名解撞。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-06 17:44；触发原因：批 7 多端骨架与杂项收口（实现 + 全验证链 + 代行审查修复 + §6.14 记档，随本批 commit），下一批 = 批 8 微交互收尾（9 批最后一个）
