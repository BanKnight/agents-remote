# context

本文件记录单个 change 的看板上下文：它为什么存在、承接了哪些来源、当前已知边界是什么，以及需要如何通过 version shared 与其他 changes 协作。

不要把本文件写成 spec、design、plan 或任务清单；本文件只提供后续阶段开始前必须知道的上下文。

## 来源上下文

### 用户原始意图

本 change 是本 version 的主动收口验证 change，不直接承接新的用户原始意图，而是汇总验证已进入本 version 的全部 prototype UI alignment 意图。

### 主动规划上下文

- 背景：用户要求原型还原不是一次性主观判断，而是每个页面 change 都要留下 prototype/app desktop/mobile 对照 artifacts，同时最终需要整体检查是否仍然一致。
- 需要解决的问题：单页 verify 可能无法发现跨页面的导航层级、surface、状态、terminal/input drawer、移动端底部导航和 follow-up gaps 一致性问题。
- 支撑的后续目标：确认本 version 可以进入 distill/archive，并把缺失功能/API、原型冲突和后续版本候选留存在 shared 中供下一轮 roadmap 使用。

## 当前已知边界

- 做：读取 alignment contract、design system note、follow-up gaps 和各页面 change artifacts；按 `docs/design/prototype/*.html` 主参考与 screenshots 辅助参考，汇总检查 desktop/mobile 视觉与交互等价性；确认可接受/不可接受差异；补齐后续缺口清单；保存最终整体验收 artifacts。
- 不做：不新增页面实现；不把缺失功能/API 直接塞进本 version；不做 pixel-perfect 或 DOM/class 完全一致要求；不沉淀长期 docs（沉淀由 distill-change 负责）。
- 尚不确定：最终需要哪些截图组合和结构断言，取决于前置页面 changes 的 artifacts 和共享 contract。

## 协作与共享上下文

### 同 version 间共享

#### 需要写入 shared

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md
- 内容：补齐最终发现的缺失功能/API、原型与长期边界冲突、后续版本候选问题。
- 供谁使用：后续 `plan-versions` 和用户查验。

#### 需要读取 shared

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md
- 用途：作为整体验收口径，确认 Prototype Map、viewport、可接受/不可接受差异和 artifacts 要求是否被满足。

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md
- 用途：检查最终 UI 是否遵守 design system、shadcn/lucide、tokens、primitives、不抽象清单和 dark console 气质。

- 路径：.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md
- 用途：确认不在本版解决的缺口都已留存，且不会被误当成本版失败。

### 跨 version 间共享

- 需要继承的 docs：docs/project.md；docs/design/prototype/index.md；docs/design/prototype/guidelines.md；docs/design/frontend-ui-architecture.md
- 需要追溯的 archive：无
- 用途：收口验证时确认本版仍符合长期 UI 架构和项目边界。

### 长期沉淀候选

- 候选 docs 路径：docs/design/frontend-ui-architecture.md；可能的后续 design system 长期文档
- 预计沉淀内容：经验证后的原型还原口径、设计系统基线和页面结构结论。

## 背景引用

- version shared：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md；design-system-note.md；follow-up-gaps.md
- docs：docs/design/prototype/index.md；docs/design/prototype/guidelines.md；docs/design/frontend-ui-architecture.md
- archive：无
- 外部调研：vercel-react-best-practices skill（相关实现 review 时必须加载）
