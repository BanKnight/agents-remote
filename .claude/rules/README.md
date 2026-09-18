# 规则库（Rules）— 可进化

> agents-remote 的可进化规则库（Loop 的固化产物）。与不可变的 `../constitution.md` 相对。用 `/evolve` 在里程碑/回顾时更新，每次改动可追溯（记入本文件来源标注或 handoff 记录）。

## 索引

| 文件 | 范围 |
| --- | --- |
| `agent-workflow.md` | handoff 节奏、GTD 节奏、reviewer 触发时机、compact 前必做 |
| `frontend.md` | 前端实现约定：DESIGN.md token 标尺、原型对齐、组件抽象契约 |
| `data-flow.md` | 全栈数据流设计原则：UI=f(state)、单一管道、Pass 1/Pass 2、语义优先 |
| `claude-debugging.md` | Claude Session 数据流调试：三层管道检查点、常见陷阱、第一手信息核对 |
| `engineering.md` | 通用工程原则：克制新增、理解机制再调参、第三方库 bug 调试顺序、参考实现研究法 |
| `dev-environment.md` | dev 服务纪律：tmux 命名、固定端口、web=prod/api=dev、进程归属 |
| `verification.md` | 验证纪律：每增量 self-check、commit 前全门禁、E2E 时机、CSS 落盘硬闸 |

## 进化流程（/evolve）

1. **Observe**：从实战 / handoff / 回顾中收集"规则没覆盖"或"规则错了"的信号。
2. **Evaluate**：判断是否值得改、改成什么、影响面多大。
3. **Update**：改写对应规则文件（保持简洁、可执行），标注来源。
4. **Verify**：确认改动与相邻规则、`docs/` 长期文档不冲突。

> 宪法 `../constitution.md` **不在此流程内**——不可变，除非用户显式授权。

## 沉淀路径

- **工程教训**（怎么写代码、怎么调试、怎么跑服务）→ 沉淀进本规则库。
- **产品/规格/设计知识**（系统该做什么、长什么样）→ 沉淀进 `docs/`，遵循 `docs/AGENTS.md` 治理与索引规则。

## 规则书写原则

- 每条规则写成 **触发条件 → 动作**，可执行，不抽象。
- 标注来源（实战教训 / 用户指示 / 调研结论）。
