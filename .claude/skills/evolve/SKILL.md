---
name: evolve
description: 规则库进化。回顾实战反馈，更新 .claude/rules/ 下的可进化规则。绝不改 constitution.md。里程碑或回顾时用。
---

# evolve — 规则库进化（Loop 核心引擎）

## 流程

1. **Observe**：从近期 handoff / GTD review / reviewer 反馈 / 用户指示中，收集"规则没覆盖"或"规则错了"的信号。
2. **Evaluate**：逐条判断——是否值得改？改成什么？影响哪些文件？
3. **Update**：改写对应 `.claude/rules/*.md`（保持"触发条件 → 动作"，简洁可执行），标注来源与日期。
4. **Verify**：确认改动与相邻规则、`docs/` 长期文档不冲突。

## 沉淀路径分流

- **工程教训**（怎么写代码、怎么调试、怎么跑服务）→ 本规则库 `rules/`。
- **产品/规格/设计知识**（系统该做什么、长什么样）→ `docs/`，严格遵循 `docs/AGENTS.md` 治理（分层 index 同步、先读后写描述等）。

## 红线

- **绝不修改 `.claude/constitution.md`**——除非用户显式授权。
- 进化是增量的，改写时标注来源。

## 触发时机

- 里程碑回顾、`/gtd review` 发现规则缺口、用户给出新指导、reviewer 反复指出同一类问题。
