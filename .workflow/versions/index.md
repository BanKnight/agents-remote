# versions index

本文件是当前活跃开发路线图入口：只记录仍在开发队列中的 versions、changes 队列、当前焦点、暂缓/放弃和全局阻塞。

已归档 version 不写在这里；归档后进入 `.workflow/archive/versions/`。旧归档结构如已存在，保持不改。

## 当前焦点

<!-- 当前正在推进的 version/change，用于让 Agent 快速知道当前工作入口。具体阶段读取 change 自己的 progress.md；技能路由由 step-change 决定。 -->

- 当前 version：v0.8-prototype-ui-alignment
- 当前 change：align-home-project-shell
- change 路径：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/
- context：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/context.md
- progress：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/progress.md

## 活跃 Versions

<!--
每个 version 表示当前要开发的一组 changes。
本文件中列出的每个 change 都必须对应 `.workflow/versions/<version>/changes/<change-id>/`。
本文件不保存活跃 change 的完整上下文、不维护 change 阶段状态；完整看板上下文见 change 的 context.md，阶段状态见 change 的 progress.md。
version 内多个 changes 需要共享的运行态材料放在 `.workflow/versions/<version>/shared/`。
-->

### version: v0.8-prototype-ui-alignment

- 目标：在不重写现有功能和数据流的前提下，建立原型对齐共享基线，并逐页把真实 React UI 更细致地还原到 HTML 原型的桌面端与移动端体验。
- 范围：
  - 做：提炼 version 共享的 alignment contract、design system note 和 follow-up gaps；初始化/约束 shadcn/ui、lucide-react、tokens 与 console primitives；按顺序还原 Home/Project shell、Agent/Terminal detail、Files/Git/Terminal workspace；为每个页面 change 保存 prototype/app 的 desktop/mobile 截图和浏览器检查日志。
  - 不做：不新增缺失 API 或伪造数据；不改变 Project-safe path、session/runtime、Files/Git 只读等能力边界；不重写 API/client/query/session 逻辑；不设计 light mode；不新增 PWA 离线、通知或 service worker 能力；不追求 DOM/class/pixel-perfect。
- shared：.workflow/versions/v0.8-prototype-ui-alignment/shared/
- changes：
  - change-id：establish-prototype-alignment-baseline
    目标：产出跨 change 共享的原型对齐验收口径和设计系统实现口径。
    来源：混合
    路径：.workflow/versions/v0.8-prototype-ui-alignment/changes/establish-prototype-alignment-baseline/
    context：.workflow/versions/v0.8-prototype-ui-alignment/changes/establish-prototype-alignment-baseline/context.md
    progress：.workflow/versions/v0.8-prototype-ui-alignment/changes/establish-prototype-alignment-baseline/progress.md
    依赖：无
  - change-id：align-home-project-shell
    目标：按共享基线还原 Home 与 Project Agent workspace 的 shell、导航、列表密度和创建入口。
    来源：用户意图
    路径：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/
    context：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/context.md
    progress：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/progress.md
    依赖：establish-prototype-alignment-baseline
  - change-id：align-runtime-detail-workspaces
    目标：按共享基线细还原 Agent detail 与 Terminal detail 的 terminal-first 工作台、输入抽屉和移动端返回模型。
    来源：用户意图
    路径：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/
    context：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/context.md
    progress：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/progress.md
    依赖：establish-prototype-alignment-baseline, align-home-project-shell
  - change-id：align-resource-inspection-workspaces
    目标：按共享基线还原 Files、Git 与 Terminal workspace 的 inspection/list-detail 结构和移动端层级。
    来源：用户意图
    路径：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/
    context：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/context.md
    progress：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/progress.md
    依赖：establish-prototype-alignment-baseline, align-home-project-shell, align-runtime-detail-workspaces
  - change-id：verify-prototype-alignment-release
    目标：汇总检查整轮 prototype UI alignment 的 desktop/mobile 视觉与交互等价性，并整理后续缺口。
    来源：主动规划
    路径：.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/
    context：.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/context.md
    progress：.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/progress.md
    依赖：establish-prototype-alignment-baseline, align-home-project-shell, align-runtime-detail-workspaces, align-resource-inspection-workspaces

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

- 使用 `step-change` 推进当前焦点 `align-home-project-shell`，在已完成的 shared 基线基础上补齐 Home/Project shell 页面还原规格。
