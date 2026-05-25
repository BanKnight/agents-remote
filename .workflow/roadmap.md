# roadmap

本文件是当前开发路线图：只记录仍在开发队列中的 versions、changes 队列和当前焦点。

已归档 version 不写在这里；归档后移动到 `.workflow/archive/roadmap.md`。

## 当前焦点

<!-- 当前正在推进的 version/change，用于让 Agent 快速知道当前工作入口。具体阶段读取 change 自己的 progress.md；技能路由由 step-change 决定。 -->

- 当前 version：v0.4-project-inspection-tools
- 当前 change：implement-git-diff-viewer
- change 路径：.workflow/changes/implement-git-diff-viewer/
- progress：.workflow/changes/implement-git-diff-viewer/progress.md

## 活跃 Versions

<!--
每个 version 表示当前要开发的一组 changes。
roadmap 中列出的每个 change 都必须对应 `.workflow/changes/<change-id>/`。
roadmap 不保存活跃 change 的原始意图全文、不维护 change 阶段状态；完整来源见 change 的 intents.md，阶段状态见 change 的 progress.md。
-->

### version: v0.4-project-inspection-tools

- 目标：在 Project 内提供只读文件浏览/预览和只读 Git diff 查看能力，让远程观察不仅限于会话输出。
- 范围：
  - 做：目录浏览、文本预览、图片预览、文件大小限制、隐藏文件展示、工作区/staged diff 文件列表与单文件 unified diff。
  - 不做：文件编辑、删除、重命名、上传、下载；Git 写操作；复杂 diff 筛选；PC 双栏 diff 增强。
- changes：
  - change-id：implement-file-browser-preview
    目标：提供 Project 内只读目录浏览、文本预览和手机适配图片预览。
    来源：用户意图
    路径：.workflow/changes/implement-file-browser-preview/
    intents：.workflow/changes/implement-file-browser-preview/intents.md
    progress：.workflow/changes/implement-file-browser-preview/progress.md
    依赖：implement-project-model-and-safe-paths, build-responsive-pwa-console-shell
  - change-id：implement-git-diff-viewer
    目标：提供 Project 内工作区和 staged 变更文件列表，以及单文件 unified diff 只读查看。
    来源：用户意图
    路径：.workflow/changes/implement-git-diff-viewer/
    intents：.workflow/changes/implement-git-diff-viewer/intents.md
    progress：.workflow/changes/implement-git-diff-viewer/progress.md
    依赖：implement-project-model-and-safe-paths, build-responsive-pwa-console-shell

## 暂缓 / 放弃

<!--
记录已从 `.workflow/intents.md` 处理、但不进入活跃 roadmap 的意图。
这些意图不再留在 `.workflow/intents.md`。
-->

- （无）

## 阻塞项

<!-- 只记录跨 change / 跨 version 的全局阻塞；单个 change 的阻塞写入该 change 的 progress.md。 -->

- （无）

## 下一步

<!-- 当前全局最应该推进的 change；具体阶段读取该 change 的 progress.md，技能路由由 step-change 决定。 -->

- 继续推进 `.workflow/changes/implement-git-diff-viewer/`；依赖 `implement-project-model-and-safe-paths` 与 `build-responsive-pwa-console-shell` 已完成，当前阶段见 `.workflow/changes/implement-git-diff-viewer/progress.md`，技能路由由 `step-change` 决定。
