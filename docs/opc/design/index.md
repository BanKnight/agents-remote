# OPC 专题 · design 索引

OPC（一人公司）多 agent 产品线的产品决策文档：PRD 定义做什么、讨论中枢记录为什么与怎么选。

## 文档

- [multi-agent-prd.md](./multi-agent-prd.md) — 产品需求说明书（PRD，产品决策文档，面向决策与对齐）：三个核心概念（角色 = 名字 + 宽能力倾向 / 任务 / 房间）+ 看板全局视角；第一期范围（角色 + 任务 + 看板 + 审批闭环）与第二期圆桌（含 4 条协议硬约束：沉默即成功 / 串行轮次队列 / claim 硬约束 / Drop vs Queue）；7 组产品决策 1-8（含每 agent 独立 identity / 按需唤醒 / 被允许沉默 checklist）；8 条边界（不重写 runtime / 不做共享记忆池等）。不涉及技术实现细节。
- [opc-product-discussion.md](./opc-product-discussion.md) — PM 讨论中枢（讨论中收敛后搬入 PRD）：三层模型（同事层 = agent 身份 / 项目层 = workspace / 协作层 = 关系网 + 协作状态机）、角色是什么（name 承载累积协作史，不写死职能）、编排老师拼图（任务状态机 / 通信媒介 / 审批门控 / AX / 长记忆等维度的参考产品对照）、共性收敛（10+ 条独立印证）、单品爆款 vs 编排平台形态分野、待定 / 开放项。证据底座见 `../research/`。
