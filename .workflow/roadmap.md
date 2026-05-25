# roadmap

本文件是当前开发路线图：只记录仍在开发队列中的 versions、changes 队列和当前焦点。

已归档 version 不写在这里；归档后移动到 `.workflow/archive/roadmap.md`。

## 当前焦点

<!-- 当前正在推进的 version/change，用于让 Agent 快速知道当前工作入口。具体阶段读取 change 自己的 progress.md；技能路由由 step-change 决定。 -->

- 当前 version：v0.5-mobile-ux-polish
- 当前 change：compact-inspection-mobile-views
- change 路径：.workflow/changes/compact-inspection-mobile-views/
- progress：.workflow/changes/compact-inspection-mobile-views/progress.md

## 活跃 Versions

<!--
每个 version 表示当前要开发的一组 changes。
roadmap 中列出的每个 change 都必须对应 `.workflow/changes/<change-id>/`。
roadmap 不保存活跃 change 的原始意图全文、不维护 change 阶段状态；完整来源见 change 的 intents.md，阶段状态见 change 的 progress.md。
-->

### version: v0.5-mobile-ux-polish

- 目标：把人工 QA 后暴露的核心 UI/UX 问题收敛为移动端优先、接近原生 App 的控制台体验，并保持后续平板/桌面适配方向。
- 范围：
  - 做：移动端 App-like shell 与页面密度基线、首页低频入口收敛、Project 工作区移动布局、Terminal/Agent Session 详情页移动控制台、Files/Git 移动端信息密度优化。
  - 不做：新增 Agent/Terminal 后端 runtime 能力、provider history/resume、完整 terminal emulator、离线/PWA service worker、桌面专属重设计、用户自定义快捷键配置。
- changes：
  - change-id：align-mobile-app-shell
    目标：建立移动端优先的 App-like shell、全局视口不溢出基线、原型术语映射和首页低频入口收敛。
    来源：用户意图 1、2、3、4
    路径：.workflow/changes/align-mobile-app-shell/
    intents：.workflow/changes/align-mobile-app-shell/intents.md
    progress：.workflow/changes/align-mobile-app-shell/progress.md
    依赖：无
  - change-id：rework-project-mobile-workspace
    目标：将 Project 详情页重排为移动端工作区主界面，包含功能区、Agent 区、Terminal 区和返回入口，并移除不合理常驻输入。
    来源：用户意图 5、6
    路径：.workflow/changes/rework-project-mobile-workspace/
    intents：.workflow/changes/rework-project-mobile-workspace/intents.md
    progress：.workflow/changes/rework-project-mobile-workspace/progress.md
    依赖：align-mobile-app-shell
  - change-id：rework-session-mobile-console
    目标：重做 Terminal/Agent Session 详情页的移动端控制台布局、输入区、快捷键、返回、重连恢复和选择输入体验。
    来源：用户意图 7、8、9、11
    路径：.workflow/changes/rework-session-mobile-console/
    intents：.workflow/changes/rework-session-mobile-console/intents.md
    progress：.workflow/changes/rework-session-mobile-console/progress.md
    依赖：align-mobile-app-shell
  - change-id：compact-inspection-mobile-views
    目标：优化 Files/Git 移动端只读查看的信息密度和列表/详情表现，减少空间浪费。
    来源：用户意图 10
    路径：.workflow/changes/compact-inspection-mobile-views/
    intents：.workflow/changes/compact-inspection-mobile-views/intents.md
    progress：.workflow/changes/compact-inspection-mobile-views/progress.md
    依赖：align-mobile-app-shell、rework-project-mobile-workspace

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

- 推进 `compact-inspection-mobile-views`：在 Project 工作区与 Session detail 移动端控制台完成后，优化 Files/Git 移动端只读查看的信息密度和列表/详情表现。
