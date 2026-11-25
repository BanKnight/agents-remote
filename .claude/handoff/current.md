# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-25 21:20（**tmux -e 载体批 `5a5a462a` 落地并已推送**——臂2 实验
> 全过、用户 TUI pane 实测吃到新载体；泄漏会话/pane 全清理）

## 一句话状态

auto mode「TUI 恒弹审批」全案收官：真根因 = CLI env 消费视图建立在 spawn 时刻
process.env **快照键集合**上（getPreSettingsEnvSnapshot，bundle 实锤）——settings
文件 env 是后到叠加层、键不在集合里，分类器（兜底 Kj 读 OPUS env）对它恒不可见。
**分层问题非时序问题**（用户纠正「两个时机/合并」框架后定案）。载体换 tmux `-e`
（pane 真 environ）→ 臂2 破坏性任务（mkdir+rm -rf）自主执行零审批。已推送
`5a5a462a`（连同 `9275b392` settings 载体版）。

## 本 session 焦点（auto mode 插批终章）

- **臂1（证伪 9275b392）**：settings 载体 + 破坏性任务 → CLI 自证文案「the check
  isn't getting through」恒弹审批。echo 类无害任务被静态规则放行不经分类器——
  **echo 实验全是假绿**，真分类器任务需破坏性命令。
- **臂2（验证 5a5a462a）**：/proc/environ 六件套齐全（token 只验长度）；mkdir+rm -rf
  自主完成、turn done、零审批卡。唯一插曲 = CLI 一次性通知卡「网关不兼容新版
  auto mode 计费协议（classifier-billing），Nothing breaks: auto mode keeps
  working」——告知非审批，Enter 过一次即可；彻底消除需网关实现
  https://code.claude.com/docs/en/auto-mode-classifier-billing（挂账）。
- **CLI 凭证抹除行为**：CLI 起身后自行从 /proc/environ 抹掉 AUTH_TOKEN（读进内存
  后清 env 块副本）——查 environ 验 TOKEN 要在 spawn 早期，晚查只看到「消失」；
  不影响分类器（它要的 OPUS env 不被抹）。
- **user 会话 pane 实测**：切 TUI 重建 pane（agent_96abec）→ 五件套注入齐全，与
  buildAgentEnvOverrides 六键单源一致（GUI/TUI 同源无不等价）。
- **清理**：test 泄漏会话 ×3（agent_3b2bbfc73d7d4159 / agent_d16f998f8d614a08 /
  agent_6dcbd358c3b0489e）+ agents-remote 残留会话 agent_5c1d852521e44a10
  「测试auto mode」全部 close，pane 归零（仅剩当前会话 agent_96abecbfccfe4d4c）。

## 关键决策（本阶段不可丢）

1. **分层机制**：CLI env 消费 = spawn 时刻快照键集合；settings env 叠加层键不在
   集合 → 无论是否写回活 env 都不可见。与注入时机无关（用户拍板纠正框架）。
2. **载体 = tmux -e**：pane 进程真 environ，spawn 前就位 → 快照层必然可见。
   ps 暴露面权衡：键值短暂出现在 tmux client argv（~ms 级），换分类器可用性值得。
   settings 文件回归纯 hooks（出生职责）；codex 侧仍只放非机密值。
3. **echo 任务不能验 auto mode**：无害命令静态规则放行、不经 dangerous-tool-use
   分类器；实验任务必须破坏性命令（mkdir+rm -rf）。
4. **buildTuiAgentSettings 恢复纯 hooks 签名**：env 块从 settings 文件撤除，
   测试断言固化「settings 无 env 键 + env 经 startCommand 走 tmux -e」。

## 下一步

1. **用户实测确认**：本会话（agents-remote TUI）发需工具的任务 → 恒弹审批应消失
   （pane 已吃到新载体，无需再重启 api）。
2. **真机验证清单（T3 五批）**仍待用户（停止收口/队列冻结恢复放弃/auto mode/
   多端跟随）。
3. **trust 询问问题挂账**（用户明确不算结案）：22router 会话 headless spawn 卡
   trust folder 询问，回头立项排查。
4. classifier-billing 网关适配（可选）：实现后可消掉 CLI 一次性通知卡。

## 挂账（非本批）

- checkpoint 批 / settle 批（已推送）待真机验收。
- probe-fab.mjs 过期断言（5 FAIL）待拍板重构/退役。
- StatusDot/StatusMarker 休眠死代码待拍板。
- wiki 格式对齐批 → wiki Quartz（先 /check-deps）。
- 会话进行中调度 auto-retry pending 注入计时器（runtime 生命周期遗留）。
- mock 了 overview 的其它 e2e spec 未补 sessions-stream mock（实锤一条修一条）。
- pages 域 + 外部 MCP server 管理批待真机验证。
- t3code 调研 A 组可学习清单剩余项待拍板排期。
- **#9 回流编排**（跨会话委派）：血缘字段已埋，编排随 OPC 立项。
- **#3 重启恢复定案**：大批独立立项（systemd control-group 已隐式兜底）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

最后更新：2026-11-25 21:20 / 触发原因：tmux -e 载体批推送收官 + 泄漏清理完成。
