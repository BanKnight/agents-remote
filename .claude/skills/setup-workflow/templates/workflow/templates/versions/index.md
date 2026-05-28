# versions index

本文件是当前活跃开发路线图入口：只记录仍在开发队列中的 versions、changes 队列、当前焦点、暂缓/放弃和全局阻塞。

已归档 version 不写在这里；归档后进入 `.workflow/archive/versions/`。旧归档结构如已存在，保持不改。

## 当前焦点

<!-- 当前正在推进的 version/change，用于让 Agent 快速知道当前工作入口。具体阶段读取 change 自己的 progress.md；技能路由由 step-change 决定。 -->

- 当前 version：（待补充）
- 当前 change：（待补充）
- change 路径：.workflow/versions/<version>/changes/<change-id>/
- context：.workflow/versions/<version>/changes/<change-id>/context.md
- progress：.workflow/versions/<version>/changes/<change-id>/progress.md

## 活跃 Versions

<!--
每个 version 表示当前要开发的一组 changes。
本文件中列出的每个 change 都必须对应 `.workflow/versions/<version>/changes/<change-id>/`。
本文件不保存活跃 change 的完整上下文、不维护 change 阶段状态；完整看板上下文见 change 的 context.md，阶段状态见 change 的 progress.md。
version 内多个 changes 需要共享的运行态材料放在 `.workflow/versions/<version>/shared/`。
-->

### version: 待命名

- 目标：（待补充）
- 范围：
  - 做：（待补充）
  - 不做：（待补充）
- shared：.workflow/versions/<version>/shared/
- changes：
  - change-id：（待补充）
    目标：（一句话说明这个 change 要改变什么）
    来源：（用户意图 / 主动规划 / 混合）
    路径：.workflow/versions/<version>/changes/<change-id>/
    context：.workflow/versions/<version>/changes/<change-id>/context.md
    progress：.workflow/versions/<version>/changes/<change-id>/progress.md
    依赖：（无 / change-id 列表）

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

<!-- 只记录跨 change / 跨 version 的全局阻塞；单个 change 的阻塞写入该 change 的 progress.md。 -->

- （无）

## 下一步

<!-- 当前全局最应该推进的 change；具体阶段读取该 change 的 progress.md，技能路由由 step-change 决定。 -->

- （待补充）
