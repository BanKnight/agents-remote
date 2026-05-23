# roadmap

本文件是当前开发路线图：只记录仍在开发队列中的 versions，以及每个 version 对应的 changes。

已归档 version 不写在这里；归档后移动到 `.workflow/archive/roadmap.md`。

## 状态说明

### Version 状态

- 规划中：version 已创建，但 changes 仍可能调整。
- 进行中：version 下至少一个 change 已开始推进。
- 待归档：version 下 changes 已完成 verify / distill，等待 archive-version。

### Change 状态

- 待创建：roadmap 已规划，但 change 目录尚未补齐。
- 待规格：下一步是 specify-change。
- 待设计：下一步是 design-change。
- 待计划：下一步是 plan-change。
- 待实现：下一步是 implement-change。
- 待验证：下一步是 verify-change。
- 待沉淀：下一步是 distill-change。
- 已完成：change 已完成 distill，等待随 version 归档。
- 阻塞：存在阻塞项，暂不能继续。

## 当前焦点

<!-- 当前正在推进的 version/change，用于让 Agent 快速知道当前工作入口。 -->

- 当前 version：（待补充）
- 当前 change：（待补充）
- change 路径：.workflow/changes/<change-id>/
- 下一步命令：（待补充）

## 活跃 Versions

<!--
每个 version 表示当前要开发的一组 changes。
roadmap 中列出的每个 change 都必须对应 `.workflow/changes/<change-id>/`。
-->

### version: 待命名

- 状态：规划中
- 目标：（待补充）
- 范围：
  - 做：（待补充）
  - 不做：（待补充）
- changes：
  - change-id：（待补充）
    状态：待创建
    来源：用户意图
    来源意图：
      - 编号：（待补充）
        原始意图：（待补充）
    规划原因：（为什么这个 change 应该存在）
    路径：.workflow/changes/<change-id>/
    下一步：specify-change

## 暂缓 / 放弃

<!--
记录已从 `.workflow/intents.md` 处理、但不进入活跃 roadmap 的意图。
这些意图不再留在 `.workflow/intents.md`。
-->

- 编号：（待补充）
  状态：暂缓 / 放弃
  原始意图：（待补充）
  原因：（待补充）

## 阻塞项

<!-- 记录影响活跃 versions/changes 推进的问题。 -->

- （无）

## 下一步

<!-- 当前最应该推进的下一步，通常指向某个 version/change。 -->

- （待补充）
