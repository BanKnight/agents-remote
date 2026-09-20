# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-21（M4 工具与深度页完成并 commit `1891a43`；下一步 M5 浮层与审批。触发：里程碑完成）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

UI v2 重构 M4（工具与深度页）已完成：三工具态（files/git/wiki 原位高亮）+ 六个 L3 详情页 + D13 wiki 注入协议落地；design-reviewer 审查「修复后通过」（P1 L3/工具互斥 + P2×4 全修，P3 7 项记档）；探针 41/41、四门禁全绿、e2e 29/29；已 commit `1891a43`。M3 在 `944aa03`。下一步 **M5 浮层与审批**（服务端聚合审批中心，security-reviewer 必过）。

## 本 session 焦点

M5：sheet/popover 浮层体系（03 系列浮层原型 + sw▾/⋯ 菜单 + pill 长按菜单——M3/M4 两处记档的「留 M5」入口）；审批中心（**服务端聚合**：api 新增注册表 + WS 推送，批量允许=逐个转发，spec §5.4）；security-reviewer 必过。

## 关键决策（本阶段不可丢）

- 全部决策见 `docs/design/redesign-v2.md` §2（D1–D23）+ **§6.2 M4 开工摊牌**（L3 双通道形态、D13 stdin prompt + 客户端引用 atom、03q 只读、03w rename 带路径）+ **§6.3 M4 收口补记**（落地清单 + 记档 8 条 + reviewer 审查记录）。
- **L3 双通道**（M4 核心）：显式子路由（history/branches/commit/wiki → focusId 前缀 `githistory`/`gitbranches`/`gitcommit_`/`wiki_`，**不写 layout**）+ 保活层分流（file/git ref 仍写 layout，渲染层按 kind 分流移动 L3 组件）；back 全回工具态（`navigateWorkbench(scope, undefined, { tab })`）。
- **H1 effect L3 守卫**：focusId 为 L3 前缀时跳过「退工具」effect——`onTabChange` 会把 L3 focusId 透传进 session 路由（曾实测 URL 变 `/session/githistory`）。L3 focusId 前缀判定目前三处字符串重复（reviewer P3，待提 `isL3FocusId()` 单源）。
- **D13**：注入走 REST `injectUserPrompt`（claude-stream.ts，与 WS user 帧同一 stdin 管道，会话未打开也能注入）；引用状态 = `workbenchWikiRefsAtom`（客户端 localStorage，per-session），流顶引用卡 + wiki 面板 refnote 消费；服务端元数据化归 M8 再议。
- gitchip b = 分支名 + `↑n ↓n`（数据源 `gitDiffForChip.data.branch`，detached 降级「Git 检视」）。
- 03w 触屏可达：touch 长按计时路径（500ms + 10px slop + 合成 click 抑制）——iOS Safari 不派发 contextmenu。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0（`3bd16cb`）→ M1（`ba8ddca`）→ M2（`2a4d9e1`）→ M3（`944aa03`，含范围裁决 §6.1）→ **M4（`1891a43`，含 §6.2/§6.3）**
- ⬜ **M5 浮层与审批** → M6 插件市场 → M7 设置登录 → M8 缺口功能 → M9 多端 → M10 总验收（总纲 §6 滚动；M8 缺口清单已从各里程碑记档累积：merged 置灰、✦ 提交来源、文件搜索、.count 取消端点、wiki 引用服务端元数据化等）

## 阻塞 / 风险

- 无阻塞。
- **大段生成垃圾行注入仍是高危**（已沉淀 `.claude/rules/verification.md`：python 锚点整段替换 + 写完必读回/机检）——本 session 继续用该范式，零事故。
- M5 审批中心牵动服务端聚合注册表 + WS 推送协议（新协议面）——开工前先写协议设计进 redesign-v2.md（像 §6.2 一样摊牌），security-reviewer 全程参与。

## 易丢的关键上下文

- **M4 关键文件**：`mobile-l3.tsx`（6 组件 ~630 行）/ `mobile-project-tools.tsx`（3 工具面板）/ `mobile-workbench.tsx`（l3Route 派生 + toolChip + 保活分流 + MobileWikiRefBar）/ `claude-stream.ts`（injectUserPrompt）/ `project-git-diff.ts`（R7a/R7b + log 分页）/ 探针 `probe-v2-m4-tools-l3.mjs`（41 断言，mock 基座可复制）。
- **query key 同源纪律**：移动工具面板与桌面左栏完全同 key（diff=`[projects,name,WORKBENCH_GIT_LEFT_QUERY_SCOPE,"diff"]`、log/branches/agent-sessions/wiki 同）——新增查询先查桌面 key。
- `getProjectGitFileDiff(projectName, scope, path)` 参数序 scope 在前。
- e2e 纪律：cgroup 2G（`systemd-run --scope --user -p MemoryMax=2G bun run e2e`）；run-e2e.ts 只透传 spec 路径；探针用 bun 跑。
- md 不进 format 门禁；改 web 包后必跑 `node scripts/ar-verify-css.mjs`；token 机检 report 模式基线 11 处 HEX（存量）。
- rounded-full computed ≈ 3.35e7px（断言 parseFloat>20）；v2 radius 档 sm8/md10/lg12/xl16/2xl20。
- 用户 Q17 约定：所有里程碑完成后跑新 e2e 才交用户验证；期间每里程碑 reviewer + 四门禁。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
