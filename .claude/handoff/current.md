# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-15（**上下文占用分类明细批已 commit `dbbf669`**——categories[] 分段堆叠条 + 图例替换式；同日早前：权威化批 `fe5e396`）

## 一句话状态

分类明细批已交付（`dbbf669`）：get_context_usage 应答的 `categories[]` 上浮浮层——**替换式**（有分类 = 分段堆叠条 + 9 行图例；无分类回退 usage 四行；帧缺分类保留上一次防闪变）。design-reviewer P0/P1/P2 全消化，探针 9/9 全绿，全门禁绿，web/api dev 已 respawn。**待真机验收**。

## 本 session 焦点

### 关键决策（不可丢）

- **【本批】替换式明细**：`categories?.length` → 分段堆叠条（`.u-bar-seg` width=tokens/window%，free 段不渲染 = track 底）+ 图例行（`.u-row-cat` 色点 + i18n 名 + formatContextTokens）；无 → 原 usage 四行。`context_usage` 帧 `categories: frame.categories ?? prev?.categories` 保留上次（防 stdout 折算帧打掉分类闪变）。
- **八类色映射**（v2-primitives.css `.u-cat-*`，CLI 终端 color 名不采）：System prompt `--ink-2` / System tools `--c-primary` / Custom agents `--c-pin` / Memory files `--c-success-text` / Skills `--c-warning-text` / Messages `--c-session-5` / **buffer `--ink-3` 全不透明**（design review P1 数值实算：原 sep-strong@0.45 叠 track 双主题每通道差仅 7-9 不可辨，改定方案）/ free 空心描边。未知名原样透传 + `u-cat-sysprompt` 中性兜底。
- **design review P0（险些漏网）**：`.u-bar` 原无 `display:flex`，块级 `.u-bar-seg` 竖排堆叠被 height+overflow:hidden 裁到只剩第一段，**width 断言测不出该塌法**——已修 flex + 探针补「各 seg top 与 .u-bar 对齐」几何断言（aligned=true 顺带证明新 CSS 真实落盘生效）。
- **（沿用权威化批 `fe5e396`）**：CLI 原生 `get_context_usage` 控制通道（stdin 直写 + waiter 5s 超时）；resume 两段式（JSONL 尾部位读先行 + 控制请求 fire-and-forget）；`MIN_VALID_CONTEXT_TOKENS=1000` 占位过滤；result 帧触发权威刷新。
- **P2 已知取舍（记入 spec）**：保留分类期间图例数值滞后于头部已用汇总，至下一次控制应答收敛——非 bug。

### 进度

- ✅ **分类明细批** `dbbf669`：shared/api/adapter/组件/CSS/i18n/spec/单测/探针全链路；design-reviewer P0×1/P1×1/P2×1/P3×3 消化（P3 未知名兜底同灰、free 冗余行已顺手删、zh 夹英文名属诚实兜底不动）
- ✅ 权威化批 `fe5e396` + 环形仪表批 `6904d94`（前批）
- ⏳ **真机清单（三批合并）**：①resume 测试会话 39efb784 立即显示 ~41%（230k 窗口）；②live 对话渐进更新 + turn 结束权威刷新、不闪 0%；③分类批：浮层分段堆叠条/图例色点双主题可辨（**重点看 buffer 段 --ink-3 与 free 底是否分得开**）、resume 四行 → 权威帧到达分类的平滑切换；④控制行右组形态/三档变色（沿用）
- ⏳ **下一批（已拍板待开工）**：**agent 状态点 5 态化**——working/waiting/idle/done/error 取代会话行单一绿点（用户原话「遵守标准，做成 5 个状态」）；涉及 api 状态推导管道 + 协议 + 列表/详情 UI；**开工前进 plan mode**。

### 阻塞 / 风险

- 无阻塞。真实 WS 端到端链路（分类器拦）继续由真机复验兜底。

## 易丢的关键上下文

- **探针结论**：CLI 应答 categories 项 `{name, tokens, color, kind:"used"|"buffer"|"free"}`，used 之和 = totalTokens，全体之和 = maxTokens；`gridRows`/单项 `percentage` 不采。
- **探针 mock 结构坑**：routeWebSocket handler 里 `if (index === 1) { …; return; }` 的 **return 不可丢**——丢了连接 1 也执行 seed 块，89% 提前覆盖全部帧时序（本次改造曾弄丢导致 3 断言假挂，靠 git diff 对照 HEAD 找回）。
- **探针 close 时序**：连接 1 ws.close 延迟（现 2500ms）必须覆盖断言 5/6 浮层交互窗口，否则 seed_init 抢先覆盖成 89% 假挂。
- **关键落点**：`CONTEXT_USAGE_CATEGORY_STYLES`（composer-controls.tsx，name → dotClass + i18nKey）；`categoryDotClass` kind 优先于 name；`.u-cat-*`（v2-primitives.css u-pop 块）；adapter context_usage 分支。
- **JSONL 路径规则**：`~/.claude/projects/<slug>/<claudeSessionId>.jsonl`，slug=cwd 非字母数字全转 `-`。
- **探针纪律**（沿用）：`systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`；一次性诊断不入库；验证用 PROJECTS_ROOT/test。
- **会话清理端点** = `POST /api/projects/<p>/agent-sessions/<id>/close`（不是 DELETE）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-15（分类明细批 commit dbbf669 + handoff 记档）
