# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-06（**v1.5 批 6 项目管理已收口 commit+push**；下一批 = 批 7 多端骨架与杂项）

## 一句话状态

**v1.5 换代 9 批计划推进中（7/9 已 commit）**：批 6 项目管理已完成——契约层（rename 端点 / delete 双路径 / detached 名单）+ slug 碰撞防护（security P1，三测试锁定）+ state.yaml 串行化（security P2）+ UI 单源（行菜单/影响提醒/删除双容器 + useProjectRowFlow 编排单源）+ 两端接入（右键/长按同构 + scope 兜底导航）+ security/code/design 三 reviewer 全消化（P1×3 + P2×11 + P3 择修）+ §6.14 记档。下一批 = **批 7 多端骨架与杂项**。

## 本 session 焦点（v1.5 换代 9 批计划）

Plan（已批准）：`/home/deploy/.claude/plans/toasty-sprouting-star.md`。批次 = 0✅ → 1✅ → 2✅ → 3✅ → 4✅ → 5✅ → **6✅（本 commit）** → 7 多端骨架 → 8 微交互收尾。

### 批 6 契约层（已提交）
- **api**（`api/src/projects.ts` + `state-store.ts` + `agent-history.ts` + `index.ts`）：
  - rename：POST `/api/projects/:name/rename`（关全部实例 + 磁盘 mv + 历史 slug 目录跟迁 claude/omp 双目录 + detached 同步；失败不产生副作用——冲突/非法名校验在关实例之前）
  - delete 双路径：`deleteFiles` 默认 false = 移出管理保留文件（关实例 + 清历史 + 清置顶 + detach 名单），true = rm -rf + 防御性 attach；铁律 2 唯一例外 = 用户显式销毁
  - slug 碰撞防护 `hasSharedHistorySlug`（realpath 派生比对 + excludeName 排除自身；deleteProject 调用点**必须传 excludeName** 否则恒命中自己 = 永不清理——独占对照组测试锁定）；原始 readdir（含 detached）供防护
  - state.yaml writeQueue 串行化 + 临时名 randomUUID
- **web**（`project-row-actions.tsx` 单源 ~430 行）：
  - `ProjectRowMenu`（max-sm 250px / 桌面 176px + role menu + 分隔线 + r14）+ `ProjectRenameImpactDialog`（renameTitle 带项目名 + workspace surface）+ `ProjectDeleteDialog`（isMobile 分流 MobileSheet+✕ / Alert）+ `useProjectRowActions`（onSettled invalidate）+ `useProjectRowFlow`（编排单源）
  - 两端接入：workbench-side（scope 兜底导航 onRenamed/onDeleted + 侧栏 error 卡 + 触发行 ring）/ mobile-projects-home（flow 一行接入 + 列表区 error 卡）
- **i18n**：projects.* 15 键（含 renameTitle / deleteCloseAria）
- **探针**：probe-desktop-project-row-menu.mjs（20 断言）+ probe-projects-home-row-menu.mjs（22+1 iPad 竖屏 820px 断点锁 B1）
- **记档**：redesign-v2.md §6.14 批 6（含铁律 2 例外 + detached 名单决策 + 重命名=mv 摊牌 + slug 碰撞防护 + 三 reviewer 消化 + diverge 两项：影响提醒字号随 RenameDialog 收口统一 / attach-detach 并发竞态等 P3 记档项）

## 关键决策（本阶段不可丢）

- **9 批流程**（§6.13 v1.4 先例）：每批独立 commit + 全门禁 + CSS 硬闸 + tokens 机检 + 探针 + reviewer + redesign-v2.md §6.14 记档 + push；最后统一真机复验清单。
- **契约先行 → 两端并发**（用户并发策略）：主会话串行落契约层 → subagent 并发接入（文件面零交集）→ 主会话收口。review 靠后集中消化。
- **批 6 拍板**：删除默认 = 移出管理保留文件（detached 名单显式记录）；重命名 = 目录 mv + 历史 slug 跟迁；slug 碰撞跳过目录级历史操作（宁可保留不清理）；max-sm 是本仓移动断点（sm=1024 覆写），**禁用 max-md 判移动形态**（iPad 竖屏 768–1023 会错落）。
- **max-sm 断点铁律（批 6 新增）**：本仓 `--breakpoint-sm:1024px` 覆写，移动/桌面分界 = 1024px；Tailwind 默认 md=768 不是分界——判移动形态用 max-sm 或 useIsMobile，禁 max-md。
- **历史拍板继续有效**：密码自读不进上下文；禁截图/vision（DOM 几何硬数据）；探针只删自建数据、用 bun 跑；改 web 文件后必跑 ar-verify-css；format 只用 `bun run format`；React 前加载 vercel-react-best-practices；多端同构；tokens.json 唯一权威；快通道文档 commit 只跑 format+lint。

## 进度（已完成 / 进行中 / 待办）

- ✅ 批 0 `d1210f0` / 批 1 `75a88f2` / 批 2 `36b2195` / 批 3 `3ace270` / 批 4 `bb083af` / 批 5（hash 见 git log）/ **批 6（本 commit，hash 见 git log）**
- ⬜ **批 7 多端骨架与杂项（下一个）**：iPad 底部状态栏 + Sidebar 橙行退役；终端输入默认收起（inputDrawerCollapsedAtom 默认 true + QuickKeyBar 常驻 + 「展开输入」钮）；子 agent 计数条「▾ n 个子 agent · m 运行中」展开列表卡；会话类型图标统一核查（Agent=sparkles/终端=terminal/Chat=message 行首 + 状态点移名称后）；puzzlepiece 插件图标（build-icons 白名单加 puzzle）
- ⬜ 批 8 微交互收尾（§7.2 指针规范滚轮横滚+渐隐 mask / 浮层两族对齐 / 附件双路径 + ⌫ 删 chip / 09b 行高 / 02c 材质 / 全套回归 + 总记档）
- ⬜ 全部批次完成后：统一真机复验清单交用户（批 6 追加：iPad 长按项目行菜单 / 删除 sheet 手感 + ✕ 放弃 / rename 影响提醒流转 + error 卡；批 5 追加：iPad 长按行菜单 / 全局行 subtitle 限定符 / 左滑删除手感）
- ⬜ 前序遗留真机清单（待用户）：发图批 6 项 + 技能列表批/浮层聚焦批 9 项 + 第五批 reviewer 修复批

## 阻塞 / 隐患

- 无阻塞。dev 存活 43011/43012（web build 含批 6；CSS 193118 字节）。
- router22 残留进程仍待用户处理（PID 1989432/1989916，跨项目资源 kill 被拦截）。
- **chat-idle-recycler 定时扫描测试一次 flaky**（全量跑 1 fail、单独跑与复跑全绿——时序敏感，非批 6 面）。
- 存量欠账（不动）：probe-v2-m8-gaps Part 2-7 存量过期定位器；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；probe-m10 H 段 3 处；probe-files-tree-bugs「05e 五项序」；`.tree`/`.growrow` 死代码；diff L3 位置架构项。
- omp-realchain 真实链路探针留真机复验。

## 易丢的关键上下文

- **批 6 hook 消费范式**：两端 `const flow = useProjectRowFlow({ onRenamed?, onDeleted? })` 一行接入；ProjectDeleteDialog prop = `onConfirm(deleteFiles?)`（布尔 = 确认 / undefined = 放弃）；「继续」契约 = ProjectRenameImpactDialog 先 onOpenChange(false) 再 onContinue() → flow.closeImpact(true)；closeImpact(false) 不清行（继续路径靠行预填），行统一在 RenameDialog 关闭/提交后清。
- **run-e2e.ts 只吃 `process.argv[2]` 单 spec**——多 spec 逐个跑。
- **诊断脚本必须放项目 scripts/ 内跑**（/tmp playwright 版本冲突）。
- **探针跑法**：改 web 文件后 `touch web/src/main.tsx` + `sleep 18` + `node scripts/ar-verify-css.mjs`；探针 `bun scripts/*.mjs`；e2e/单测 `systemd-run --scope --user -p MemoryMax=2G`。
- **原型核查方法**：docs/design/*.html 同页内联私样式 + assets/components.css 单源两处都看。
- **Edit 纪律**：本 session 又出 2 次 token 污染（`callback:` / `两端` 渗入 old/new_string——old_string 必须从最新 Read 精确复制、new_string 写完自查一遍再发）。
- **a11y role 改动破探针定位器**：role="menuitem"/role="checkbox" 覆盖隐式 button role → getByRole("button") 不再命中；改 a11y 语义时同步 grep 探针定位器。
- **批 3 遗产**（继续有效）：`useImperativeHandle` factory 短路通则；探针 mock 必须给全契约字段；push/面板 fact 字号档刻意不同；`.meta`/`.done` 撞名解撞。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-06；触发原因：批 6 项目管理收口（契约层 + UI 单源 + 两端接入 + 三 reviewer 全消化 + 记档，随本批 commit），下一批 = 批 7 多端骨架与杂项
