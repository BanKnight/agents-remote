# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-28 19:27（批次 D「terminal 形态凭证 + codex 自动重试」全门禁绿，待 commit）

## 一句话状态

**批次 D 完成：①codex 凭据走「托管 CODEX_HOME」方案（chat 与 terminal 双形态同源）——
竞品调研（hapi/orca）共识 + 源码实证（codex 0.163 运行期不读 OPENAI_API_KEY、
OPENAI_BASE_URL 无效）→ `api/src/codex-home.ts` 单源生成 `runDir/codex-home/`
（auth.json 0600 原子写 + config.toml/sessions 软链 + `-c openai_base_url` 非机密 argv）；
②自动重试从 claude 专属泛化为 provider 无关的 `AutoRetryWatch`（`agent-auto-retry.ts`，
git mv），codex 接 `turn/completed status:"failed"` 信号源，前端 `AutoRetryBanner` 抽成
共享组件两端复用。三 reviewer（security 无 P0 / code 无 P1 / design 无 L1）报告已消化。
全门禁绿：format / lint(0 warning) / typecheck / api 1193 pass / web 993 pass /
CSS 硬闸 / codex e2e 3/3。**

## 本 session 焦点

### 关键决策（不可丢）

- **凭证方案 = CODEX_HOME 重定向**（用户 AskUserQuestion 拍板）：codex 真实凭据链是
  `CODEX_API_KEY` env（门控）→ `CODEX_ACCESS_TOKEN` → 持久化 store（auth.json/keyring），
  **运行期不读 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 无效**（源码+实测双证）。因此 terminal
  形态（tmux 内 `codex resume` TUI）唯一可行通道 = 让 tmux 进程继承 `CODEX_HOME`
  （非机密路径可进 argv，key 永不出现在 ps）。
- **baseUrl 依附 apiKey**（security P2-2）：只填 baseUrl 不填 key 时整体忽略 —— 否则
  codex 会把全局 login token 发往手填端点。清空 apiKey → 删除自建 auth.json（吊销后
  旧 key 不留盘）。
- **AutoRetryWatch 泛化**：`handleStdoutLine`（claude 协议行）保留为 claude 便捷入口；
  codex 直接调 `notifyNormal/notifyError`。`gen` 代数 + 身份校验作废 in-flight 调度
  （cancelPending/destroySession 都递增 gen，否则 await getConfig 窗口内的取消形同虚设）；
  `fire` 失败回滚记账。
- **HTTP 面按 metadata 派发**：`sessionRegistry.getAutoRetryTarget()` 返回
  `{runtimeKey, provider}`，claude 恒可、codex 需 `codexThreadId && mode!=="terminal"`。

### 进度（批次 D 全落地）

- ✅ 竞品调研：hapi / orca 均「托管 CODEX_HOME + auth.json 文件」；tmux `-e` 传 key 会
  短暂进 client argv（ps 可见）→ 否决。
- ✅ 服务端：`codex-home.ts`（新）+ `codex-runtime.ts` 接线（`CODEX_ENV_KEYS` 含
  CODEX_HOME）+ `agent-tui.ts` terminal 形态注入 env + `tmux-runtime.ts` `startCommand`
  支持 `env`（仅供非机密路径）。
- ✅ 自动重试：`agent-auto-retry.ts`（git mv 自 claude-auto-retry）+ codex 信号源 +
  index 路由派发 + 前端 `components/workbench/auto-retry-banner.tsx`（共享）+ i18n
  `session.autoRetry.*`。
- ✅ 测试：`codex-home.test.ts`（6 例）、`agent-auto-retry.test.ts` 新增「in-flight 取消/
  销毁作废调度」「inject 抛错回滚记账」「message 超长截断」、`codex-runtime.test.ts`
  新增「窗口上限」「用户介入取消」、`session-registry.test.ts` terminal 负例。

### 阻塞 / 风险

- 无阻塞。**留观/待办（后续批次）**：①terminal TOCTOU 窗口（claude 同基线）；②pi-stream
  images 校验；③settings update() 串行化；④apiKey/baseUrl 长度上限；⑤CredentialsCardSection
  抽取；⑥design L2-1（`.count .btns .btn` padding 漂移，设计包单源缺口）。

### 易丢的关键上下文

- **批 D 交付形态**：chat（app-server）与 terminal（tmux TUI）**同源**读 settings 凭据 ——
  两者都通过 `CODEX_HOME`；此前 handoff 记的「terminal 不继承 settings 注入」已修复。
- **已 commit**：`d3e5c6b`（handoff docs）、`da5c9ba`（批次 A/B/C feat）。
- **用户三条指令剩余部分**：③「系统性检查 codex vs claude 功能缺失全清单」的补齐范围已
  拍板（compact UI / MCP 注入 / 历史列表 / P2 小项打包）→ 批 E、批 F。
- **测试内存**：systemd-run --scope --user -p MemoryMax=2G；探针 bun 跑；编辑内置工具；
  e2e 入口 `bun scripts/run-e2e.ts <spec>`（只接受 argv[2]）。

## 下一步

1. commit 批 D（标准 `git add && git commit`，尾行 Co-Authored-By）。
2. **批 E**：compact UI、MCP 注入（先探针验证 `thread/start` config 通道）、P2 小项
   （turn/steer、rateLimits/usage、model reroute/authRecovery 通知）。
3. **批 F**：codex 历史列表（扫 `~/.codex/sessions/**/rollout-*.jsonl` + resume 分流）。

## 真机验收清单（批 D，交用户）

1. Settings → Codex 卡填 apiKey（可加 baseUrl）→ 新建 codex 会话能正常对话（自定义端点生效）。
2. ⋯ 菜单「切到终端」→ tmux 内 `codex resume` **同样能跑**（凭据走 CODEX_HOME，不再掉凭据）。
3. `ps aux | grep codex` 期间确认 **key 不出现在任何进程 argv**（只看得到 `codex-home` 路径）。
4. 清空 apiKey 保存 → 新建会话回退官方登录态（auth.json 已删）。
5. codex 会话触发上游失败（断网/坏 key）→「将在 xx:xx 后重试」条出现 → 取消 / 立即重试两键可用
   → 到点自动注入「请继续」并继续跑；claude 会话同一套条回归不受影响。

---
最后更新：2026-10-28 19:27（触发原因：批次 D 收尾——全门禁绿 + handoff save；待 commit）
