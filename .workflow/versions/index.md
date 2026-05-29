# versions index

本文件是当前活跃开发路线图入口：只记录仍在开发队列中的 versions、changes 队列、当前焦点、暂缓/放弃和全局阻塞。

已归档 version 不写在这里；归档后进入 `.workflow/archive/versions/`。旧归档结构如已存在，保持不改。

## 当前焦点

<!-- 当前正在推进的 version/change，用于让 Agent 快速知道当前工作入口。具体阶段读取 change 自己的 progress.md；技能路由由 step-change 决定。 -->

- 当前 version：v0.9-prototype-assets-guidelines
- 当前 change：refine-prototype-assets-guidelines
- change 路径：.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/
- context：.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/context.md
- progress：.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/progress.md

## 活跃 Versions

<!--
每个 version 表示当前要开发的一组 changes。
本文件中列出的每个 change 都必须对应 `.workflow/versions/<version>/changes/<change-id>/`。
本文件不保存活跃 change 的完整上下文、不维护 change 阶段状态；完整看板上下文见 change 的 context.md，阶段状态见 change 的 progress.md。
version 内多个 changes 需要共享的运行态材料放在 `.workflow/versions/<version>/shared/`。
-->

### version: v0.9-prototype-assets-guidelines

- 目标：规范化 HTML prototype 资产、总览展示、截图基线和设计规范，使后续 UI alignment 能依赖明确的页面结构、viewport、token、组件和跨页面公共抽象。
- 范围：
  - 做：调整 `docs/design/prototype/overview.html` 为按页面分组展示 desktop/mobile iframe pair 的总览；在现有 `guidelines.md` 中补齐颜色、尺寸、阴影、间距、圆角、字体、组件形态、desktop/mobile 标准分辨率和响应式要求；将跨页面复用的 prototype 结构、样式、组件或 token 合理抽象为公共基础；按最新规范更新 `docs/design/prototype/screenshots/`。
  - 不做：不把 `overview.html` 作为正式截图依据；不修改 Web app React 业务 UI；不新增多主题实现；不改写已归档 `v0.8-prototype-ui-alignment` 运行态证据。
- shared：.workflow/versions/v0.9-prototype-assets-guidelines/shared/
- changes：
  - change-id：refine-prototype-assets-guidelines
    目标：重构 prototype overview 展示结构并补齐现有 prototype 设计规范、截图和公共抽象。
    来源：用户意图
    路径：.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/
    context：.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/context.md
    progress：.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/progress.md
    依赖：无

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

- 使用 `step-change` 推进当前焦点 `refine-prototype-assets-guidelines`，先进入 `specify-change` 补齐 prototype asset/guideline refinement 的可验证 WHAT。
