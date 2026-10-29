# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-29 08:20（批次 F 已 commit `41b0dde`，codex 接入开发任务全部完成）

## 一句话状态

**批次 F 完成（已 commit `41b0dde`）：codex 会话历史列表——新模块 `api/src/codex-history.ts`
扫 `CODEX_HOME/sessions/**/rollout-*.jsonl`（流式按行解析 meta+首条用户消息、cwd 项目过滤、
mtime 倒序、mtime+size 缓存），api 项目级/全局端点三路合流（claude+omp+codex），web 分流
resume 透传 `codexThreadId`（移动端零改动即生效），e2e 列表面走真实 api。codex 接入的最
后一个开发任务完成。**

## 本 session 焦点

### 关键决策（不可丢）

- **rollout 解析走流式按行（readline）+ 早停**：session_meta 首行含 base_instructions
  全文十几 KB → 固定 HEAD_BYTES 读头部会截断（omp-history 的模式不可照抄）；threadId =
  `payload.id`（旧版 0.135 无 session_id 字段）；环境注入以 `<` 开头标签形态出现，跳过。
- **删除归属复核（security review P1 修复）**：rollout 是全局日期桶（无 per-project 目录），
  `deleteCodexHistoryEntry(threadId, projectPath)` 删除前用 `cwdBelongsToProject(partial.cwd,
  projectPath)` 复核——否则跨项目 threadId 传到本项目端点可绕过本项目 activeMap 的活跃
  保护（409 只查端点所属项目）删掉别家正在运行的会话文件。归属不符保守不删仍返回 true
  （omp 同契约：文件名候选命中即 true）。
- **keyset 游标 tiebreak（code review P1 修复）**：`agent-history.ts` 的 `historySessionId`
  补 `?? e.codexThreadId ?? ""`——codex 条目 tiebreak 恒 `"codex|"` 时同毫秒条目 (key,
  tiebreak) 全同，跨页边界 findIndex 严格小于会整行跳失。
- **startedAt 版本漂移兜底**：`payload.timestamp` 缺失时兜底行级 `entry.timestamp`（每行
  顶层恒有）。
- **e2e 列表面走真实 api**：`run-e2e.ts` 以 `CODEX_HOME` seam 种 fixture rollout（demo +
  other 两项目各一条），扫描/cwd 过滤/三路合流真实执行；resume POST 走 page 级 mock 捕获
  body（真实 POST 会拉起 codex CLI）。第二项目 "other" 对既有 spec 纯增量（断言全带过滤）。
- **已知限制记档**：项目改名后 codex 历史失联（rollout cwd 由 CLI 持有，不做迁移，
  `migrateAgentHistoryProject` 不适用）。

### 进度（批次 F 全落地，已 commit `41b0dde`）

- ✅ api：`codex-history.ts` 新模块（14 单测）+ 四处接线（registry 判活 map / 项目级三路
  合流 / 全局合流 / profile 翻转 `history: "native"`）+ `agent-history` tiebreak 兜底。
- ✅ web：`history-list.tsx`（entryNativeId/buildResumeInput/useResumeAgentSession codex
  分支）+ `use-history-query.ts` delete id 链 + `client.ts` provider 参数；mobile-sheets
  零改动（design review 确认同构成立）。
- ✅ e2e：`codex-history.spec.ts` 2/2（项目历史态 cwd 过滤 + resume POST body 断言 + 全局
  段项目限定符）；回归 desktop-side 6/6 + codex-session 4/4。
- ✅ 门禁：format / lint(0 warning) / typecheck / api 1220 + web 1005 + shared 11 全 pass /
  CSS 硬闸 / tokens 机检（仅 2 处既有 debug HEX 留观）。
- ✅ reviewer 三路：design 无发现；security 1 P1（删除归属，已修）+ 附注全局端点 N 次扫描
  留观；code 1 P1（tiebreak，已修）+ 2 P2（startedAt 兜底已修；`<` 启发式误跳以 `<` 开头
  的真用户消息留观——与 claude SKIP_FIRST_PROMPT_PATTERN 同类家族局限）。
- ✅ 交付：ar-dev api/web respawn、api health ok、CSS content-type text/css、产物含新代码
  （WorkbenchRoute chunk 有 codexThreadId）。

### 阻塞 / 风险

- 无阻塞。**留观**：①全局 `/api/agent-history` 现为 N 项目 × 全树扫描/请求（parse 有缓存
  摊薄、readdir×N 仍在；rollout 上万再考虑一次扫描按 cwd 分桶）；②`<` 启发式会误跳以 `<`
  开头的真用户消息（家族既有局限）；③真实 `~/.codex` 数据 / 外部 codex-tui 会话 resume
  全链未真机验（e2e 是 fixture + mock resume）。

## 下一步

1. **真机验收（批 D + E + F 一起交）**：见下方清单。
2. codex 接入开发任务**全部完成**（批 1/2/A–F）；后续按真机反馈修问题。

## 真机验收清单（批 D + E + F）

**批 F（历史列表）**：
1. 打开项目 → 左栏时钟「View session history」→ 真实 `~/.codex` 的会话出现在列表
   （首条用户消息做标题、今天/昨天等分组、文件大小副标题）。
2. 其它项目的 codex 会话不出现在本项目列表；「全部」段两项目行同列且带项目限定符。
3. 点结束的 codex 历史行 → 命名框 → Create → 新实例挂载且回放历史（thread/resume 全链，
   外部 codex-tui 创建的会话也要能 resume）。
4. 活跃中的 codex 会话历史行带脉动点，点击直接聚焦不新建。
5. 右键/长按 codex 历史行 → 删除（二次确认）→ 文件真删（`~/.codex/sessions/` 里 rollout
   消失）；活跃行删除被服务端 409 拒绝。
6. 已知限制确认：项目改名后旧 codex 会话在新项目名下不可见（预期行为）。

**批 D + E**（同前）：
7. codex 托管 CODEX_HOME 凭据在 chat/terminal 双形态同源；自动重试 provider 泛化。
8. 上下文占用浮层 → 「压缩上下文」→ 「Compacting」pill → 「Context compacted」块。
9. 运行中发消息并入当前轮（steer）；错误重连 pill；ChatGPT 登录显示额度段。
10. codex 切终端形态带 ar-hub MCP；claude 会话同浮层压缩走 `/compact`。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
