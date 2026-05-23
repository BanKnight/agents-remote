# roadmap

本文件是当前开发路线图：只记录仍在开发队列中的 versions，以及每个 version 对应的 changes。

已归档 version 不写在这里；归档后移动到 `.workflow/archive/roadmap.md`。

## 当前焦点

<!-- 当前正在推进的 version/change，用于让 Agent 快速知道当前工作入口。 -->

- 当前 version：workflow-formalization
- 当前 change：migrate-workflow-docs
- change 路径：.workflow/changes/migrate-workflow-docs/

## 活跃 Versions

<!--
每个 version 表示当前要开发的一组 changes。
roadmap 中列出的每个 change 都必须对应 `.workflow/changes/<change-id>/`。
-->

### version: workflow-formalization

- 状态：进行中
- 目标：将项目运行态与长期文档结构迁移到已正式化的 workflow skill 模型。
- changes：
  - change-id：migrate-workflow-docs
    状态：进行中
    来源意图：用户指出 `.workflow` 与 `docs` 仍按旧结构排布，需要迁移到当前正式模型。
    路径：.workflow/changes/migrate-workflow-docs/
    下一步：verify-change

## 暂缓 / 放弃

<!-- 记录从待分配意图中判断为暂缓或放弃的内容，以及原因。 -->

- （无）

## 阻塞项

<!-- 记录影响活跃 versions/changes 推进的问题。 -->

- （无）

## 下一步

<!-- 当前最应该推进的下一步，通常指向某个 version/change。 -->

- 检查 `.workflow/` 与 `docs/` 新结构是否完整，并视需要提交迁移变更。

## 迁移注记

- 旧文件 `.workflow/progress.md` 已保留为历史参考；后续活跃路线图写入本文件。
