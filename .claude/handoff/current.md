# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-13（**settle 注意力语义批已 commit `16c9911`，全门禁 + 双探针 +
> e2e 42 全绿，待 push（用户确认）+ 真机验收**）

## settle 注意力语义批（T3 Code 学习点②，2026-11-13）

- **缘起**：会话列表「完成的会话堆积」——「agent 说完 ≠ 事办完」。契约
  `docs/design/session-attention.md`（v1.0 已拍板）：settle 正交于 status、可逆、
  移出注意力≠隐身；底部「已了结 · N」折叠组默认收起；⋯ 菜单动作区入口与置顶相邻；
  7 天 done/error 自动 settle；settle 自动取消 pin；任何活动自动 unsettle。
- **数据落点**：`SessionMetadata.settledAt?: string`（跟会话走，close 即消）——
  `patchMetadata → onMetadataChanged` 自动推 `/api/sessions/stream` 壳帧（跨设备实时）；
  清除收敛到 `recordActivity` 单一入口（claude/codex/acp/terminal/approval 全路径）。
- **api**：registry `setSessionSettled`（并发同向 settle 回读当前投影仍幂等 200）+
  `recordActivity` 清标记 + sweeper `session-settle-sweeper.ts`（每 60 分钟扫 done/error
  且 7 天不活跃）；`/settle` 路由（agent/terminal 两前缀同 handler，非法/null body 400，
  settle=true 时先从 `state.yaml` `overview.pinnedSessions` 摘除，未置顶不写盘）。
- **web**：`useSetSessionSettled()` mutation（无乐观更新，壳帧 + invalidate 兜底）；三处
  菜单（桌面 ⋯/移动 ⋯/会话行菜单）动作项按 `Boolean(settledAt)` 翻转文案（**动作态 ≠
  分组谓词**——settled 但在跑的会话仍在活跃组，菜单须显「恢复关注」）；桌面侧栏 +
  移动 ▾ 菜单「已了结」折叠组；`isSettledView(c)` 谓词单源（settled && !countsAsRunning）。
- **关键修复（reviewer 消化）**：
  - **P1 `SHELL_META_FIELDS` 漏 `settledAt`** → settle/unsettle 与自动清除只经壳帧到达
    列表/详情缓存，漏字段 = 第二真相（发过消息的会话跑完一轮被弹回「已了结」组）。已补 +
    单测（含清空 `undefined` 的 `toStrictEqual`）。
  - 移动 ▾ 组头 `<details>/<summary>` → 可聚焦 `DropdownMenuItem`（Radix `role="menu"`
    roving focus 只遍历 menuitem，`<summary>` 键盘不可达/ARIA 非法）+ `useState` +
    `onOpenChange` 关闭复位（折叠态不持久化）。
  - `mobile-workbench` 聚焦会话 settle 态派生修正：先选定权威 session 再读字段
    （`?.settledAt ?? candidate.settledAt` 会把「detail 明确未 settle」误落回候选旧值）。
- **已知未做（v1 挂账，见 `docs/design/session-attention.md` §3.3 / inbox）**：本地筛选
  不纳入 settled（有 query 时才纳入 + 弱标，需产品确认）；折叠组无显式 chevron。
- **验证**：format/lint 0 warning/typecheck/全量单测（api 1326 + shared 16 + web 1087）/
  CSS 硬闸/tokens 机检全绿；`probe-settle` **17/17**（桌面 13 生命周期 + 移动 4 折叠组）、
  `probe-mobile-project-header` **56/0**；e2e 全量见下。

### 本批踩坑（教训，别再走）

- **`vite build --watch` 假死实锤**：dist 里的 `WorkbenchRoute-*.js` 停在旧实现（collapsible
  分支仍渲染 `details`），而我用 `rg '"details"'`（双引号）判定「产物是新的」——rolldown
  产物是**反引号字符串** `` `details` ``，双引号 grep 恒 0 命中 = 假阴性。判定产物新旧必须用
  ASCII 标识符（`collapsible`、`aria-expanded`）或反引号形态，且**第一动作 = `respawn-pane -k`
  全量重建**（dev-environment 规则），不要长轮询 touch。
- 重启 web 后 build 真失败：`instance-area.tsx` 里我插入的注释写进了 JSX 属性列表
  （`{/* */}` 落在 `<SessionRowMenu ... />` 内）→ rolldown 报 `` Expected `...` but found `}` ``；
  **`bun run typecheck` 不报这个错**（tsc 侧放行/未覆盖），只有真 build 才挂——所以「typecheck
  绿」不能替代「build 绿」，改 web 后必须看 dist 真的重建成功。
- 探针移动段首次跑失败全部源于旧产物，代码本身是对的（证据纪律：先分辨「环境旧 vs 代码错」）。

## 一句话状态

settle 注意力语义（学习点②）已 commit `16c9911`（pre-commit 全门禁过），待 push（用户
确认）+ 真机验收。

## 本 session 焦点

### 关键决策（不可丢）

- settle 落 `SessionMetadata`（不是 `state.yaml`）：自动 WS 推送 + 清标记单入口。
- 分组谓词 `isSettledView` 与动作态（`Boolean(settledAt)`）**必须分离**——否则 settled 但在跑
  的会话行菜单无法恢复关注。
- `SHELL_META_FIELDS` 是壳元信息单源：新增任何「列表/详情都要同步」的字段必须加进去。
- Radix 菜单内不要放 `<details>/<summary>`：用可聚焦 menuitem 做 disclosure 组头。

### 进度

- ✅ P1-P5 全实现（shared/api/web/文档/探针）
- ✅ code-reviewer（7 发现：P1-P7）+ design-reviewer（2 发现：P2-1、P3-1）全消化
- ✅ 全门禁 + 探针 17/17 + 56/0 + e2e 42/42
- ✅ commit `16c9911`（pre-commit 全门禁过）
- ⏳ push（用户确认后）+ 真机验收清单交用户

### 易丢的关键上下文

- **bun test 全量必须 `systemd-run --scope --user -p MemoryMax=2G`**；e2e 用 4G。
- web 产物疑似旧码：先 `tmux list-windows -t ar-dev` 确认 pane 死活 → `respawn-pane -k
  -t ar-dev:web 'scripts/ar-dev-web.sh'` → 等 preview 200 → 再验产物的 **ASCII** 特征串。
- 探针 Playwright 用 `bun scripts/X.mjs`（node 会被分类器拒）；诊断脚本必须放 `scripts/` 内跑
  （/tmp 下会解析到别的 playwright-core 缓存报 chrome-headless-shell 缺失），用完即删。
- `site/`（pages 根内容）untracked 不入库——commit 勿顺手 add。

### 下一步

1. push（用户确认）；真机验收清单：①桌面侧栏 ⋯「标记已了结」→ 行移入底部「已了结 · 1」
   折叠组（默认收起、降饱和、行尾「N 天前了结」）→ 展开点行回会话 → ⋯「恢复关注」回
   活跃组 ②移动 ▾ 同链路（组头点按展开、重开复位）③settle 后给会话发消息 → 自动回
   活跃组 ④已 settle 的会话菜单文案翻转 ⑤置顶会话 settle 后置顶同时消失。
2. 挂账推进：学习点③ Turn 级 checkpoint（隐藏 git refs）。

## 挂账（非本批）

- settle 搜索结果不含 settled（v1 挂账，`.claude/gtd/inbox.md` 2026-11-13 条目）。
- probe-fab.mjs 过期断言（5 FAIL）待拍板重构/退役。
- 技能更新检测服务端慢（逐 repo 串行拉 GitHub Trees）：可考虑并发 fetch 或短 TTL 缓存。
- StatusDot/StatusMarker（shell-primitives）休眠死代码待拍板。
- wiki 格式对齐批 → wiki Quartz（先 /check-deps）。
- 会话进行中调度 auto-retry pending 注入计时器，随形态切换的清理属 runtime 生命周期（#8 范畴）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
