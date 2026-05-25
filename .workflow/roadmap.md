# roadmap

本文件是当前开发路线图：只记录仍在开发队列中的 versions、changes 队列和当前焦点。

已归档 version 不写在这里；归档后移动到 `.workflow/archive/roadmap.md`。

## 当前焦点

<!-- 当前正在推进的 version/change，用于让 Agent 快速知道当前工作入口。具体阶段读取 change 自己的 progress.md；技能路由由 step-change 决定。 -->

- 当前 version：v0.8-prototype-ui-alignment
- 当前 change：align-project-agent-workspace
- change 路径：.workflow/changes/align-project-agent-workspace/
- progress：.workflow/changes/align-project-agent-workspace/progress.md

## 活跃 Versions

<!--
每个 version 表示当前要开发的一组 changes。
roadmap 中列出的每个 change 都必须对应 `.workflow/changes/<change-id>/`。
roadmap 不保存活跃 change 的原始意图全文、不维护 change 阶段状态；完整来源见 change 自己的 intents.md，阶段状态见 change 的 progress.md。
-->

### version: v0.8-prototype-ui-alignment

- 目标：让真实 Web UI 的导航层级、路由结构、页面布局、组件边界、响应式规则和视觉基线与 `docs/design/prototype/` 原型体系一致，并为后续页面实现提供共享 UI architecture 上下文。
- 范围：
  - 做：先建立 frontend UI architecture / prototype alignment 设计上下文；对齐一级/二级导航 shell、路由层级、移动端返回模型、shared icon system 和基础视觉组件语言；再对齐 Home / Project entry、Project Agent workspace、Agent / Terminal instance detail、Files / Git / Terminal resource pages；最后用 prototype screenshots 和真实浏览器检查收口。
  - 不做：不追求像素级完全一致；不新增 Files/Git 写操作；不扩展 provider runtime 能力；不重构后端 runtime 协议；不把未验证设计直接沉淀为长期 docs。
- changes：
  - change-id：design-frontend-ui-architecture
    目标：建立前置 frontend UI architecture / prototype alignment 设计上下文，作为后续 UI/UX 对齐 changes 的共享依据。
    来源：用户意图
    路径：.workflow/changes/design-frontend-ui-architecture/
    intents：.workflow/changes/design-frontend-ui-architecture/intents.md
    progress：.workflow/changes/design-frontend-ui-architecture/progress.md
    依赖：无
  - change-id：align-ui-shell-foundation
    目标：对齐跨页面共享的 navigation shell、路由层级、移动端返回模型、shared icon system 和基础视觉组件语言。
    来源：用户意图
    路径：.workflow/changes/align-ui-shell-foundation/
    intents：.workflow/changes/align-ui-shell-foundation/intents.md
    progress：.workflow/changes/align-ui-shell-foundation/progress.md
    依赖：design-frontend-ui-architecture
  - change-id：align-home-project-entry
    目标：对齐 Home / Project entry 的一级导航、Project 列表、顶部文案和低频创建/采用入口。
    来源：用户意图
    路径：.workflow/changes/align-home-project-entry/
    intents：.workflow/changes/align-home-project-entry/intents.md
    progress：.workflow/changes/align-home-project-entry/progress.md
    依赖：align-ui-shell-foundation
  - change-id：align-project-agent-workspace
    目标：对齐 Project Agent workspace 的 Agent instance 列表、provider 创建入口和 session history 呈现。
    来源：用户意图
    路径：.workflow/changes/align-project-agent-workspace/
    intents：.workflow/changes/align-project-agent-workspace/intents.md
    progress：.workflow/changes/align-project-agent-workspace/progress.md
    依赖：align-ui-shell-foundation
  - change-id：align-instance-detail-workspaces
    目标：对齐 Agent / Terminal instance detail 的 terminal-first 工作区、快捷入口、Meta 浮窗和移动端输入抽屉。
    来源：用户意图
    路径：.workflow/changes/align-instance-detail-workspaces/
    intents：.workflow/changes/align-instance-detail-workspaces/intents.md
    progress：.workflow/changes/align-instance-detail-workspaces/progress.md
    依赖：align-ui-shell-foundation, align-project-agent-workspace
  - change-id：align-resource-inspection-pages
    目标：对齐 Files / Git / Terminal resource pages 的只读 inspection、实例列表和直接二级页/深层详情导航规则。
    来源：用户意图
    路径：.workflow/changes/align-resource-inspection-pages/
    intents：.workflow/changes/align-resource-inspection-pages/intents.md
    progress：.workflow/changes/align-resource-inspection-pages/progress.md
    依赖：align-ui-shell-foundation
  - change-id：verify-prototype-ui-alignment
    目标：用 prototype screenshots 和真实浏览器检查验证桌面端与移动端关键页面的 UI/UX 对齐结果。
    来源：用户意图
    路径：.workflow/changes/verify-prototype-ui-alignment/
    intents：.workflow/changes/verify-prototype-ui-alignment/intents.md
    progress：.workflow/changes/verify-prototype-ui-alignment/progress.md
    依赖：align-home-project-entry, align-project-agent-workspace, align-instance-detail-workspaces, align-resource-inspection-pages

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

- 推进 `.workflow/changes/align-project-agent-workspace/`，读取其 `progress.md` 判断当前阶段，并使用 `step-change` 路由到对应阶段技能；其前置 `align-ui-shell-foundation` 已完成，且 Home / Project entry 已完成。
