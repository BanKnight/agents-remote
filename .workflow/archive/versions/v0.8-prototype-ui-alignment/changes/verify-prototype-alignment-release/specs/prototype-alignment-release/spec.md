# prototype-alignment-release spec

本文件记录单个 change 对 `prototype-alignment-release` 的行为契约增量。

## Change context

- change-id：verify-prototype-alignment-release
- 所属 version：v0.8-prototype-ui-alignment
- context：.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/context.md

## 来源上下文摘要

- 用户原始意图：本 change 不直接承接新的用户原始意图；它汇总验证本 version 中所有 prototype UI alignment 意图是否被前置 changes 真实满足。
- 主动规划上下文：单页 verify 可能无法发现跨页面的导航层级、surface、状态、terminal/input drawer、移动端底部导航和 follow-up gaps 一致性问题，因此需要最终 release 级收口验证。
- 当前已知边界：本 change 只验证和整理证据，不新增页面实现、不伪造缺失能力、不做 pixel-perfect 或 DOM/class 完全一致要求；缺失功能/API 或后续版本候选应写入 shared follow-up gaps。

## ADDED Requirements

### Requirement: Release verification SHALL cover the full prototype map

系统 SHALL 对 `alignment-contract.md` 中 Prototype Map 覆盖的本 version 页面进行 release 级验证，确认 Home、Project Agent workspace、Agent detail、Terminal detail、Files workspace、Git workspace 和 Terminal workspace 均具备前置 change 留下的 prototype/app desktop/mobile artifacts 与浏览器检查日志。

#### Scenario: All required page artifacts are present

- **WHEN** 本 change 执行 release verification
- **THEN** 验证应检查每个 responsible change 的 `artifacts/` 目录
- **AND** 每个 prototype map 条目都应具备 `1440x1000` desktop 与 `390x844` mobile 的 prototype/app 截图或等价可审查 artifact
- **AND** 每个 responsible change 都应具备 browser check log，记录访问路径、viewport、关键结构检查和是否存在 blocking difference
- **AND** 缺失 artifact 必须被记录为 release verification 问题，不能静默通过

### Requirement: Release verification SHALL check cross-page navigation layers

系统 SHALL 以 release 级结构断言和人工可审查截图确认一级应用 shell、Project 直接二级 workspace、深层/contextual detail 三层导航模型在所有页面中保持一致。

#### Scenario: Mobile direct secondary and deep detail navigation are mutually exclusive

- **WHEN** 验证 mobile Home、Project Agent workspace、Files direct、Git direct、Terminal direct、Agent detail、Terminal detail、Files preview detail 和 Git diff detail
- **THEN** 一级页面只显示一级 bottom navigation
- **AND** Project 直接二级 workspace 显示带 Back 的 Project 二级 bottom navigation，且顶部不重复 deep detail 返回
- **AND** Agent/Terminal runtime detail、Files preview detail 和 Git diff detail 显示顶部返回，不显示 Project 二级 bottom navigation
- **AND** Terminal direct workspace 不显示 runtime input/output/quick keys，Terminal detail 才显示 runtime shell input/output

### Requirement: Release verification SHALL check shared design system consistency

系统 SHALL 汇总检查本 version 的实现是否继承 `design-system-note.md` 中的 shared shell/navigation/surface/list/status/action/input/terminal/code 语言，并确认没有页面私有化另一套与原型冲突的视觉体系。

#### Scenario: Shared shell primitives remain the visual boundary

- **WHEN** release verification 检查前置 changes 的实现与截图
- **THEN** Home、Project Agent workspace、Agent/Terminal detail、Files/Git/Terminal resource workspace 应共享同一套 dark console shell、navigation、surface、list row、status pill 和 action affordance
- **AND** shadcn/ui source components 只应通过项目 shell wrappers 间接消费，不应在 route 中散用默认 dashboard 视觉
- **AND** 可点击 navigation/list/action 的 cursor、hover、selected、focus、disabled 和 safe-area 行为应保持一致
- **AND** 如发现跨页面视觉 drift，应记录为 release verification 问题或 shared follow-up gap

### Requirement: Release verification SHALL preserve real capability boundaries

系统 SHALL 确认本 version 的原型对齐没有通过伪造数据、伪造能力或扩大 API/runtime 范围来获得视觉完整度。

#### Scenario: Unsupported prototype-only capabilities are not faked

- **WHEN** 验证 Agent/Terminal runtime detail、Files/Git/Terminal resource workspace 和 Home/Project Agent workspace
- **THEN** Agent workspace 不应伪造 provider history、task summary、recent output 或 provider-native metadata
- **AND** Files/Git 不应出现写操作或伪造 file content/diff 数据
- **AND** Terminal direct workspace 不应渲染 runtime output、textarea composer、quick keys 或 shell command composer
- **AND** Agent/Terminal detail 不应伪造缺失 quick key mode/selection、runtime history 或 provider capability discovery
- **AND** 不在本 version 解决的原型-only 能力必须通过 truthful empty/future/not-rendered 表达或记录到 `follow-up-gaps.md`

### Requirement: Release verification SHALL summarize follow-up gaps

系统 SHALL 在最终验证中读取 `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`，汇总 unresolved gaps，并判断它们是否阻塞本 version release 或应由后续 roadmap 承接。

#### Scenario: Open gaps are classified without blocking valid alignment

- **WHEN** follow-up gaps 中存在 open 条目
- **THEN** release verification 应列出每个 open gap 的来源 change、页面/原型、缺口类型和当前表达方式
- **AND** 如果 gap 属于明确不在本 version 解决的 missing capability/API/future enhancement，且真实 UI 没有伪造该能力，则不应阻塞 release conclusion
- **AND** 如果 gap 暴露 shared baseline 不准确、当前页面验收缺失或 blocking difference，则应作为 release verification 问题并给出回流建议

### Requirement: Release verification SHALL produce a final release evidence package

系统 SHALL 为本 version 生成最终 release 级验证产物，使用户可以审查整轮 prototype UI alignment 的结论、证据、可接受差异、blocking differences 和后续缺口。

#### Scenario: Final release evidence is written

- **WHEN** release verification 完成
- **THEN** 本 change SHALL 产出 `verify.md`，记录验证范围、harness、Trace/Delta/Scenario/Evidence 结果、问题分级、follow-up gaps 汇总和最终结论
- **AND** 本 change artifacts SHALL 保存最终 browser check log 或等价汇总证据，引用或汇总前置 changes 的 prototype/app screenshots
- **AND** 如果无 CRITICAL，progress SHALL 推进到待沉淀
- **AND** 如果存在 CRITICAL 或证据不足，progress SHALL 保持当前阶段或进入阻塞，并记录应回流的 change/技能

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
