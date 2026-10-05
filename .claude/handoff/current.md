# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-05（**v1.5 换代批 0 + 批 1 已 commit + push**：批 0 `d1210f0` 设计包换代 / 批 1 `75a88f2` 单会话化；下一批 = 批 2 IA 三 Tab）

## 一句话状态

**v1.5 设计包换代 9 批计划推进中（2/9 完成）**：批 0 落 124 文件设计包 + 批 1 移动单会话化（行1 导航/▾ 实例切换菜单/⋯ 菜单收敛/迷你条退役）均已 commit+push；门禁/CSS 硬闸/tokens 机检/四探针（34+60+22+16）/全套 e2e 26/26/design-reviewer（P1×1+P2×7 消化）全绿。下一批 = 批 2 IA 三 Tab。

## 本 session 焦点（v1.5 换代 9 批计划）

Plan（已批准）：`/home/deploy/.claude/plans/toasty-sprouting-star.md`。批次 = 0 设计包换代✅ → 1 单会话化✅ → **2 IA 三 Tab（下一个）** → 3 预览矩阵·移动 → 4 预览矩阵·桌面 → 5 历史规模化 → 6 项目管理 → 7 多端骨架 → 8 微交互收尾（含双路径附件）。

**批 1（`75a88f2`）已落地**：
- 行1（44px 唯一常驻行）= ‹项目 + 标题（实例名 + runct ●n + ▾）+ [面板][⋯]；行2（pills+＋+ticon）退役；`MobileProjectHeader` 全量重写 + `InstanceSwitchMenu`（DropdownMenu 族A 锚定浮卡 250px：组头/实例列表 max-h 200 滚动/当前行 ✓+aria-current/钉底＋新建+⟲恢复历史；caret 两态）。
- ⋯ 菜单 = [会话历史, 实例信息]；`MobileFocusActions` 退役 → `useInstanceInfoActions` + acts footer 上移 `MobileProjectWorkbench` 装配（hooks 恒调用 + sessionType gate 零网络，holders 顶层提升）。
- 标题名派生链：活跃列表名 → detail query → `instanceNameMemoAtom` sidecar → id 兜底（深链/刷新 detail 未热时即刻有名）。
- 03b 迷你条全链退役（atom+组件+onScroll 判定+.mini CSS）→ 回底浮球承担。
- design-reviewer 消化：P1 terminal→square-terminal 图标单源（`terminal` 白名单条目已回退，icons.ts 净零 diff）+ P2×7（菜单顺序/caret 两态/.st.run 色/aria-current/⋯ 热区/死键×3/.mini 死 CSS）。

## 关键决策（本阶段不可丢）

- **9 批流程**（§6.13 v1.4 先例）：每批独立 commit + 全门禁 + CSS 硬闸 + tokens 机检 + 探针 + reviewer + redesign-v2.md §6.14 记档 + push；最后统一交真机复验清单。
- **恢复语义**（spec §8 规则1）：恢复历史会话 = resume agent 历史（壳常驻自动续，非 fork）；runtime `--resume` 已有，零改动。
- **批 1 Diverge 记档**（redesign-v2.md §6.14）：①skill tab 聚焦行为保持；②global scope 不动；③`MobileProjectSwitchSheet`（03l）保留但无入口——批 2 处理自然消亡；④▾ 空态灰行改提示文案 defer（原型无锚）；⑤⋯ 移动端 sheet 形态 vs 原型锚定浮卡 = 既有视口分流，待 ActionMenu 支持后统一。
- **v1.5 附件双路径**（用户拍板，批 8 实施）：小文本白名单（txt/md/csv/json/log）≤1MB 内联消息级；超限自动落 uploads/ 提及行。
- spec 内部残留不一致（正文未清洗）：§2 IA 图仍四 Tab、§4.5「行2 面板入口钮」——实现以最末定案为准（三 Tab/行1）。
- 历史拍板继续有效：密码自读不进上下文；禁截图/vision（DOM 几何硬数据）；探针只删自建数据、用 bun 跑；改 web 文件后必跑 ar-verify-css；format 只用 `bun run format`；React 前加载 vercel-react-best-practices；多端同构；tokens.json 唯一权威。

## 进度（已完成 / 进行中 / 待办）

- ✅ 批 0（`d1210f0`）：docs/design/ 落 v1.5 全部 124 文件 + index/规则引用换代 + §6.14 记档
- ✅ 批 1（`75a88f2`）：单会话化全量 + reviewer 消化 + 记档 + push；全套 e2e 26/26
- ⬜ **批 2 IA 三 Tab（下一个）**：tabbar 4→3（删工作台项，columns=3；project scope active 归项目）；`/` 跳板 = 直达上次会话（上次会话记忆 atom，对齐 lastProjectKey 范式）；e2e mobile-nav/middle-tab-left 适配；03l sheet 消亡处理
- ⬜ 批 3–8（预览矩阵移动/桌面 → 历史规模化 → 项目管理 → 多端骨架 → 微交互收尾）
- ⬜ 全部批次完成后：统一真机复验清单交用户
- ⬜ 前序遗留真机清单（待用户）：发图批 6 项 + 技能列表批/浮层聚焦批 9 项 + 第五批 reviewer 修复批

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012（web build 含批 1）；CSS 硬闸 187934 字节。
- router22 残留进程仍待用户处理（PID 1989432/1989916，跨项目资源 kill 被拦截）。
- 存量欠账（不动）：e2e pwa-installable 存量失败（本批 26/26 全绿说明已被修复或跳过——以最新运行为准）；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；`.tree`/`.growrow` 死代码；diff L3 位置架构项。

## 易丢的关键上下文

- **批 1 实施教训**：①`||` 与 `??` 混用 = esbuild 语法错误但 tsc 放行——**typecheck 过 ≠ build 过**，混用必加括号；②7 天老 vite build --watch watcher 失效（touch 不 rebuild）→ `tmux respawn-pane -k -t ar-dev:1.0` 重启，pane dead 后不带 -k；③探针 strict mode 双 sheet 窗口（菜单 exit 动画 + 新 sheet 共存）→ `getByRole("dialog", { name })` 收窄；④mock POST_ADDS 跨 context 残留 → setupMocks 开头复位；⑤max-h 200px 恰好 5 行×40 不溢出，断言滚动需 6 行 fixture。
- **探针跑法**：改 web 文件后 touch web/src/main.tsx + sleep 16 + ar-verify-css；探针 `bun scripts/*.mjs`；e2e/单测 systemd-run 2G。
- **e2e 移动创建入口已换代**：acp-session.spec.ts 用 `.empty-cta`（空态卡 CTA）打开 03j sheet；有实例时的入口 = ▾ 菜单钉底「＋ 新建实例…」。
- **评审器消化节奏**：批 1 reviewer 报告 P1 全修 + P2 与原型硬规格直接相关的修、无锚的 defer 记档（如空态灰行）。
- **Write/Edit 内容退化坑**：Read 回读修正；连续两次失败即停换路。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-05；触发原因：v1.5 换代批 1 收口（commit+push+reviewer 消化+记档），下一批 = 批 2 IA 三 Tab
