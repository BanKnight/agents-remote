---
name: gtd
description: GTD 任务管理。子命令 inbox（往收件箱加条目）、process（清空 inbox 拆解到 projects/next-actions/someday）、review（周期回顾，与 evolve 联动）。捕获新需求或回顾进度时用。
---

# gtd — 目录式 GTD（防走偏）

基地：`.claude/gtd/`（`inbox.md` / `projects/` / `next-actions.md` / `waiting.md` / `someday.md`）。

## /gtd inbox [文本]

- 把文本作为新条目追加到 `.claude/gtd/inbox.md`（加 `- [ ]` 与可选标签）。
- 不评估、不开干，只捕获。

## /gtd process

- 逐条处理 `inbox.md`：
  - 可执行且 <2 分钟 → 立即做，或转 `next-actions.md`。
  - 多步项目 → 建 `projects/<名>.md`（目标 / 动机 / 成果定义）。
  - 等待外部 → `waiting.md`。
  - 暂不做 → `someday.md`。
- 清空 inbox（保留未决项）。

## /gtd review

- 重评 `next-actions.md`（完成勾选、清理）、`waiting.md`（跟进）、`someday.md`（是否升级）。
- 若发现规则需更新 → 触发 `/evolve`。
- 收尾 `/handoff save`。

## 原则

- 任何新需求先进 inbox，不直接开干。
- 开干前必读 `next-actions.md`。
