# prototype-ui-alignment-baseline spec

本文件记录单个 change 对 `prototype-ui-alignment-baseline` 的行为契约增量。

## Change context

- change-id：establish-prototype-alignment-baseline
- 所属 version：v0.8-prototype-ui-alignment
- context：.workflow/versions/v0.8-prototype-ui-alignment/changes/establish-prototype-alignment-baseline/context.md

## 来源上下文摘要

- 用户原始意图：本轮 prototype UI alignment 需要先建立跨 change 共享基线，再逐页还原 Home/Project、Agent/Terminal detail、Files/Git/Terminal workspace；真实页面应尽可能贴近 HTML 原型，但不能伪造功能、重写现有数据流或追求 DOM/pixel-perfect。
- 主动规划上下文：共享基线必须把验收口径和实现口径集中到 version shared，供后续页面 change 继承、引用和按需回写。
- 当前已知边界：本 change 只定义并产出共享基线，不直接修改业务页面、不新增 API、不沉淀长期 docs；后续页面实现和最终 verify 通过 shared 材料协作。

## ADDED Requirements

### Requirement: Shared alignment contract

系统 SHALL 在本 version shared 中提供一份原型对齐验收契约，作为后续所有页面还原 change 与最终 verify change 的共同判断口径。

#### Scenario: Contract created for downstream changes

- **WHEN** `establish-prototype-alignment-baseline` 完成规格、设计和实现
- **THEN** `.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md` 存在
- **AND** 该契约包含 HTML 原型主参考、prototype screenshots 辅助参考、desktop `1440x1000` 与 mobile `390x844` viewport、Prototype Map、页面 artifacts 要求、可接受差异、不可接受差异和结构断言边界
- **AND** 该契约说明 HTML 原型与 React/shadcn 实现不要求 DOM 节点树、class 名或 pixel-perfect 完全一致，验收优先判断视觉、布局、交互和状态语义等价

#### Scenario: Contract defines future and gap handling

- **WHEN** 页面还原发现原型区域缺少真实功能、API 或与长期能力边界冲突
- **THEN** alignment contract 要求页面 change 使用 empty、staged 或 future 状态表达现有能力
- **AND** 不得伪造不存在的数据、provider metadata、history、Git 写操作、Files 写操作或 runtime 能力
- **AND** 相关缺口必须记录到 `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`

### Requirement: Shared design system note

系统 SHALL 在本 version shared 中提供一份薄设计系统说明，作为后续 React UI 实现、组件抽象和 review 的共同实现口径。

#### Scenario: Design system note created for implementation

- **WHEN** `establish-prototype-alignment-baseline` 完成规格、设计和实现
- **THEN** `.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md` 存在
- **AND** 该说明覆盖暗色 Server Agent Console 主题、颜色语义、字体层级、间距密度、surface 层级、状态色、圆角/边框、terminal 面板、input drawer、移动端导航、safe-area、copy 气质、loading/empty/error/disabled/dangerous 状态和 responsive 节奏
- **AND** 该说明定义从原型提炼的共享 console primitives 与组件抽象规则
- **AND** 该说明明确“不抽象清单”，至少包括页面专属文案、一次性布局细节、只出现一次的组合、业务数据转换、API/query 逻辑和路由状态逻辑

#### Scenario: shadcn and icon constraints are explicit

- **WHEN** 后续 React 前端或 prototype UI alignment 的 `implement-change` 被执行
- **THEN** shared design system note 要求先加载 `vercel-react-best-practices` skill
- **AND** 要求 `shadcn/ui` 通过标准 CLI 初始化或添加本轮实际需要的最小组件集
- **AND** 要求保留 shadcn 的交互语义和可访问性结构，通过 tokens、variants、className 和 wrapper primitives 适配原型视觉
- **AND** 要求图标体系优先统一使用 `lucide-react`，并通过统一 icon primitive、尺寸、颜色、容器和状态规则管理

### Requirement: Follow-up gaps registry

系统 SHALL 在本 version shared 中提供一份后续缺口登记材料，用于保留本轮发现但不在本 version 解决的问题。

#### Scenario: Follow-up gaps file exists and is usable

- **WHEN** `establish-prototype-alignment-baseline` 完成规格、设计和实现
- **THEN** `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md` 存在
- **AND** 该文件提供记录原型缺口、长期 docs 冲突、缺失功能/API、真实能力不足和后续版本候选问题的格式
- **AND** 后续页面 change 可以向该文件追加缺口，而不需要把缺失能力塞进本轮实现范围

### Requirement: Downstream change inheritance

系统 SHALL 让后续页面还原 changes 显式继承共享基线，而不是各自重新解释原型还原标准。

#### Scenario: Page changes consume shared baseline

- **WHEN** `align-home-project-shell`、`align-runtime-detail-workspaces` 或 `align-resource-inspection-workspaces` 进入规格、设计、计划、实现或验证阶段
- **THEN** 对应 change 必须读取 `alignment-contract.md` 与 `design-system-note.md`
- **AND** 对应 change 的验收必须包含其相关页面的 prototype desktop/mobile 截图、app desktop/mobile 截图和浏览器检查日志
- **AND** 如页面实现发现共享基线不准确、不完整或不适用于真实页面，必须回写修正共享材料或记录需后续处理的缺口

### Requirement: Version scope protection

系统 SHALL 保护本轮 prototype UI alignment 的范围，避免把原型还原扩展成能力新增或架构重写。

#### Scenario: Scope boundary is enforced

- **WHEN** 本 version 中任何 change 发现原型与长期 docs、现有功能边界或真实能力不一致
- **THEN** 安全、Project-safe path、session/runtime、Files/Git 只读、真实 API 和不伪造数据的边界优先于原型视觉
- **AND** 纯布局、密度、导航、返回模型、状态表达、copy 气质和视觉结构冲突时优先按 HTML 原型对齐
- **AND** 不得在本 version 中新增缺失 API、Git 写操作、Files 写操作、light mode、PWA 离线/通知/service worker 或大规模 API/client/query/session 重写

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
