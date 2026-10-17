# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-18（terminal 行首残留根因修复 + 推送语义化 + 横幅样式恢复，三 commit 已 push）

## 一句话状态

**terminal 行首残留 bug 取证闭环并修复**：字节级三步取证（live 对照 → reset+回放 0 分歧复现 → refresh-client 愈合）定案根因 = **tmux client 增量 diff 发射与自身屏幕模型失同步**（pane 恒干净、帧流被污染、turn 期间持续再种子）；修复 = `tmux-runtime.ts` attach 三层防护（600ms churn 全重绘 + **5s 周期 × 15s 活动窗 refresh-client**），实测 settle 内容分歧归零。同批交付用户 mid-turn 两需求：推送 title 语义化「项目 · 会话」+ `.done→.complete` 横幅类名漏改补齐。

## 本 session 焦点

### 关键决策（不可丢）

- **残留根因链**（取证定案，勿再重查）：①残留 = 捕获字节流的确定函数（reset+回放同流 0 分歧复现，跨实例可复现、与分帧方式无关）；②pane（server 模型）恒干净 → 污染在 tmux client 发射层；③仅全重绘愈合（resize/折叠 composer = 同机制）；④失同步在 turn 输出流期间持续再种子 → 一次性 refresh 无效；⑤残留集中在 col1-2 margin = tmux diff「跳过未变前缀」优化盲区。Bun PTY 读路径 20MB raw 测试零丢失（排除 api 侧）。
- **双解析器对照的几何伪差陷阱**：回放 pane 是 40 行（status 占 1 行）而帧流写给 41 行 client（`ESC[1;41r`），「1 行偏移」不是解析器分歧——排查时必须先核对两侧几何再下结论。
- **推送 title** = `{projectName} · {sessionName}`，无 sessionName 回落项目名（`pushTitle`，`e365ded`）。
- **横幅样式丢失根因**：`541099c` 把裸类 `.done` 改名 `.complete`（让位 `.dot` 状态点变体）时消费点清点漏了 `ClaudeSessionDetailRoute.tsx` 的 `done mt-2`（提交声称 1 个消费点实际 2 个）——frontend-notes §34 的「改名 rg 清点」教训反例，`8cbe266` 补齐。

### 进度

- ✅ `63fae51` fix(api): tmux attach 周期 refresh-client 自愈（行首残留根因修复）
- ✅ `e365ded` feat(api): 推送通知 title 语义化「项目 · 会话」
- ✅ `8cbe266` fix(web): 完成横幅样式恢复（.complete 类名补齐）
- ✅ 教训沉淀 `.claude/rules/claude-debugging.md`「tmux attach 渲染失同步」节
- ✅ web 交付 checklist：CSS 硬闸 + content-type text/css + `.complete` 规则在 prod 产物
- ⏳ **待用户真机验收**：terminal 残留自愈体感（中途瞬时残留 ≤5s 愈合，不再驻留）；推送通知 title 是否达意；气泡「✓ 完成 · N 轮…」样式恢复
- ⏳ 历史挂起：PWA 通知真机清单剩余项（③-⑪）；ℹ 配置行 terminal 让位 / in-flight ensureRunning 竞态窗
- ⏳ 功能批候选：mod 采集批 / 插件管理 UI / PTY+OSC 7501 / pi/acp 推送

### 阻塞 / 风险

- 无阻塞。修复类小 commit 直接 push 节奏沿用。
- 中途瞬时残留仍会出现（≤5s 窗口）——周期 refresh 是自愈不是阻断；若真机体感仍差，可调小 `ATTACH_REFRESH_INTERVAL_MS`（带宽代价 ~全屏/次）。

## 易丢的关键上下文

- **诊断方法论**（下次类似问题直接复用）：live xterm vs capture-pane 对照 → 捕获 WS 帧史（Playwright `framereceived`，帧是 `{type:"output", data}`）→ 同实例 reset+回放 → refresh-client 愈合实验。一次性诊断脚本不进 scripts/（`_diag-` 前缀，用后删）。
- **api 侧 5s 周期 refresh 已加载**（respawn 过）；参数在 `tmux-runtime.ts` 顶部三个导出常量。
- **本仓 jsdom 测试三坑**（`settings-notifications.test.tsx` 内注释）：matchMedia stub / 顶层 DOM 全局被清 / 无 `screen`。
- **探针/e2e/单测跑法**：`systemd-run --scope --user -p MemoryMax=2G bun …`；探针用 `bun` 跑不用 node。
- 验证用 PROJECTS_ROOT/test 项目；web=prod build 43012、api=dev 43011（ar-dev tmux）；改 vite.config 后 respawn web。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-18 03:20（三 commit push + 规则沉淀；触发原因：terminal 残留批闭环）
