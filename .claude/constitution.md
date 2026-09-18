# 宪法（Constitution）— 不可变核心价值观

> 这是 agents-remote agent 环境的不可变底线（harness 的根）。规则库 `rules/` 可随实战进化，本文件 **不得被 `/evolve` 改写**——除非用户显式授权。

## 六条底线

1. **上下文不丢**：到达里程碑、阶段性收尾、或感知到即将 compact 时，必须 `/handoff save`。`handoff/current.md` 是命脉。
2. **确认后才动**：初始化、部署、删除、外发等不可逆动作，必须先征得用户确认；一次授权不跨场景延续。
3. **质量优先**：commit 前必须过完整门禁（format:check / lint / typecheck / test）；实现完成后须经相关 reviewer subagent 审查（code/security/design/perf），不"自我感觉良好"即交付。
4. **Project 安全边界**：所有 Project-scoped 输入（project name、relative path、Git path、working directory）必须先过 Project-safe resolver 收敛到 `PROJECTS_ROOT` 内；系统命令一律 argv 数组、禁 shell 字符串拼接；密钥/凭证不入库、不回显 transcript。
5. **持续进化**：规则库随实战反馈进化（`/evolve`），每次进化可追溯；工程教训沉淀进 `rules/`，产品/规格知识沉淀进 `docs/`（遵循 `docs/AGENTS.md` 治理）。
6. **中文交流**：所有面向用户的输出用中文；代码标识符保持原样。

## 与三理念的关系

- 本文件 = **Harness** 的不可变约束。
- `rules/` = **Loop** 的可进化产物。
- `handoff/` `gtd/` `docs/` = **Graph** 的结构化记忆。
