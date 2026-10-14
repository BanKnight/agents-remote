# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-15（**上下文占用权威化批已 commit `fe5e396`**——get_context_usage 控制通道 + resume 恢复 + 占位过滤；同日上线：环形仪表重做批 `6904d94`）

## 一句话状态

上下文占用指示权威化批已交付（`fe5e396`）：修复用户测试会话 39efb784 实测两 bug（resume 后不显示、live 对话中不更新），路径升级为 **CLI 原生 `get_context_usage` 控制通道**（用户指路 + 探针实证）。全门禁绿（api 单测 911 含新增用例、code-reviewer P1×2/P3×2 全消化），api dev 已 respawn。**待真机验收**。

## 本 session 焦点

### 关键决策（不可丢）

- **【本批核心】get_context_usage 权威通道**：CLI 2.1.299 原生支持 `control_request{subtype:"get_context_usage", detail:"summary"}`（与 set_model 同一条 stdin/stdout 控制通道），应答 `{totalTokens, maxTokens, rawMaxTokens?, percentage, model, categories[], gridRows[], autocompactSource}`。**探针实证：--resume 后、首条用户消息前即应答**（CLI 不主动吐 stdout，但控制请求是 stdin 输入会得到应答——手写诊断脚本别再「等 init」死锁）。`totalTokens`=CLI /context 口径已用量；`maxTokens`=**autocompact 感知真实窗口**（settings 配 buffer 时 > 模型裸窗口，如 230000 = 200k+30k），比 `[1m]` 后缀推断的 `resolveContextWindow` 权威；summary 不调 token-count API、不带 usage 明细（input/cache 分解）。
- **resume 恢复两段式（review P1 后定形）**：①JSONL 尾部位读（`readLastContextUsageFromJsonl`，1MB 窗 openSync/readSync **不整文件读**、占位行同款过滤）同步先行 → seed 零等待；②控制请求 fire-and-forget → `refreshContextUsageFromControl` 覆盖权威 `contextTokens/contextWindow` 并广播（**绝不在 addSubscriber 前同步 await**——CLI mid-turn 排队/不支持时 WS 首字节被拖到 5s 超时）。
- **占位 usage 过滤**：网关（chatcmpl-* 消息 ID）对流式中间消息（stop_reason 缺省的 thinking/tool_use/text 中间块）发占位 usage `{input_tokens:1, output_tokens:1, cache:0}`，真实 usage 只在收尾行——「最后一条胜出」被拉成 0%。修 = `MIN_VALID_CONTEXT_TOKENS=1000`（真实上下文至少整条 system prompt，与占位值隔数量级）；stdout 折算保留为中途渐进更新，占位过滤是防线。
- **turn 结束权威刷新**：`result` 帧触发 `refreshContextUsageFromControl`——异步控制请求，成功则覆盖 + 广播 `context_usage` 帧；dedupe 条件 = contextTokens 与 contextWindow **双同**才跳过（窗口独变也要广播）。
- **waiter 机制**：`contextUsageWaiters` Map（request_id → {resolve, timer}），stdin **直写**（绕开 `write()` 的 autoRetry.cancelPending——控制探测不是用户输入）；captureControlResponseFromLine 只结算有 waiter 的应答（客户端 set_model 应答安全 no-op）；结算/超时双路径 clearTimeout。
- **（沿用）架构共识**：采集层 → 统一会话标量 state（api）→ WS 单管道 → 前端统一组件；协议双形态 `seed_init.contextUsage`（嵌套恢复）/ `context_usage` 帧平铺（live 广播）；环形仪表 + 三档 + 浮层显示端已交付（`6904d94`），右组成组、`.u-lvl-*` 只管 color。

### 进度

- ✅ **权威化批** `fe5e396`：两 bug 修复 + 控制通道 + JSONL 回填 + 占位过滤；code-reviewer 消化（P1×2：stream 不同步 await / 位读尾窗；P3×2：total≤0 不渲染 / timer 清理；测试补 JSONL 读取三态）
- ✅ 环形仪表重做批 `6904d94`（前批，显示端已就绪）
- ⏳ **真机清单（合并两批）**：①resume 测试会话 39efb784 应立即显示 ~41% 环形指示（230k 窗口，JSONL 先行 → 权威值毫秒级覆盖）；②live 对话一轮：数值随收尾行渐进更新、turn 结束权威刷新、不再闪 0%；③控制行右组形态/环弧与百分比一致/浮层明细/双形态（沿用前批清单）
- ⏳ **下一批候选（已拍板方向待排期）**：①双模式切换；②mod 采集批；③插件管理 UI；④浮层升级素材：get_context_usage 的 `categories[]`（System prompt/tools/Messages/Skills/Memory 分解）可做浮层分类明细展示（本批未动 UI）

### 阻塞 / 风险

- 无阻塞。真实 WS 端到端链路（分类器拦）继续由真机复验兜底。

## 易丢的关键上下文

- **探针结论**（CLI 二进制 strings + 实跑实证）：`get_context_usage` 在 vTo set（`get_usage/mcp_status/get_context_usage/stop_task/background_tasks`——疑似空闲期白名单）；zod schema `zo=` 处；应答经 `sendControlRequest` 通道。categories 项形如 `{name:"System prompt", tokens:9025, color, kind:"used"|"buffer"|"free"}`，used 之和 = totalTokens。
- **关键落点**（api/src/claude-runtime.ts）：`MIN_VALID_CONTEXT_TOKENS`(:152 附近)、`readLastContextUsageFromJsonl(File)`(位读+按路径核心可测)、`extractContextUsageFromControlResponse`(total≤0 无效)、`getContextUsage`/`captureControlResponseFromLine`/`refreshContextUsageFromControl`、processStdoutLine 挂载序（…contextUsage → controlResponse → result 触发 refresh）、stream() 两段恢复块。
- **JSONL 路径规则**：`claudeJsonlPath`（session-routes.ts:506）= `~/.claude/projects/<slug>/<claudeSessionId>.jsonl`，slug=cwd 非字母数字全转 `-`。
- **探针纪律**（沿用）：`systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`；一次性诊断不入库（本批 `/tmp/_diag-get-context-usage.mjs` 已删）；CLI 子进程在 cgroup 内时 MemoryMax 放宽到 4G。
- **会话清理端点** = `POST /api/projects/<p>/agent-sessions/<id>/close`（不是 DELETE）；验证用 PROJECTS_ROOT/test 测试项目。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-15 01:30；触发原因：上下文占用权威化批收尾（commit fe5e396 + handoff 记档）
