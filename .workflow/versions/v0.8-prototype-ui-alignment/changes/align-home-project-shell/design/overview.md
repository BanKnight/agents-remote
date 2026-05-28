# Design Overview

本文件汇总本 change 的设计范围、子域选择和整体设计结论。

## Change

- change-id：align-home-project-shell
- 所属 version：v0.8-prototype-ui-alignment

## 输入依据

- context：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/context.md
- specs：.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/specs/home-project-shell-alignment/spec.md
- version shared：.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md；design-system-note.md；follow-up-gaps.md
- 相关长期 docs：docs/project.md；docs/design/prototype/home.html；docs/design/prototype/project-detail.html；docs/design/prototype/guidelines.md；docs/design/frontend-ui-architecture.md；docs/design/console-shell.md
- 当前前端入口：web/src/routes/HomeRoute.tsx；web/src/routes/ProjectConsoleRoute.tsx；web/src/components/shell/shell-primitives.tsx；web/src/components/shell/shell-layout.tsx；web/src/components/shell/shell-navigation.tsx；web/src/components/ui/button.tsx；web/src/components/ui/badge.tsx；web/src/components/ui/card.tsx；web/src/components/ui/input.tsx；web/src/routes/console-model.ts；web/src/routes/router.tsx

## 设计范围

### 本次覆盖

- 对齐 Home / Projects 一级 shell 到 `home.html` 的桌面端左侧一级导航与移动端底部一级导航。
- 对齐 Project Agent workspace 到 `project-detail.html` 的桌面端 Project 二级导航与移动端带 Back 的二级底部导航。
- 收紧 Home Project rows、Agent instance rows、创建入口、状态面板和 copy，使真实页面更接近原型的可扫读密度。
- 保留真实 Project、Agent Session、Claude/Codex 创建、loading/empty/error/disabled/dangerous confirmation 行为。
- 为后续实现明确 artifacts：Home 与 Project Agent workspace 的 prototype/app desktop/mobile screenshot 和 browser check log。

### 本次不覆盖

- 不新增 Agent history API、provider resume、recent output、task summary 或 provider-native metadata。
- 不改 Files/Git/Terminal workspace 细节，只保护它们作为 Project 二级导航入口。
- 不改 Agent/Terminal detail 页面、input drawer、quick keys 或 deep detail 返回模型。
- 不重写 Project/session API、TanStack Query 数据流、route state 或 shared DTO。
- 不提前安装 shadcn/ui、lucide-react 或其他依赖；如实现需要新增依赖，implementation 需按 shared design system note 重新检查并选择安全窗口外兼容版本，只添加当前 change 实际消费的 source components。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 用户目标和非目标已由 context/spec 覆盖，本 change 不新增用户能力。 |
| ui-ux | 是 | 需要明确 Home/Project shell 的页面结构、导航层级、密度、状态和移动端可用性。 |
| frontend | 是 | 需要结合现有 React route/component 边界说明如何小改动接入，不重写数据流。 |
| architecture | 否 | 不改变 web/api/shared 分层、路由模型或 runtime 架构。 |
| api | 否 | 不定义新 API 或 DTO。 |
| data | 否 | 不定义数据模型或迁移。 |
| business-rules | 否 | 不改变 Project/Agent 业务规则，只对齐展示。 |
| error-handling | 否 | 错误/空/禁用状态写入 ui-ux/frontend，未形成独立错误设计。 |
| risks | 是 | 需要收口密度、伪造数据、shared 回写、移动端遮挡和过度抽象风险。 |

## 总体设计结论

- 以现有 `HomeRoute.tsx`、`ProjectConsoleRoute.tsx` 和 `web/src/components/shell/` 为基础做局部结构、layout、navigation 和密度调整，不重建页面或路由；如使用 shadcn source component，必须由 shell primitive 包装而不是 route 直接散用。
- Home 主任务是扫描并打开已有 Project；`ProjectSetupPanel` 继续作为低频入口，仅在空态、提交中或错误恢复时提升。
- Project Agent workspace 主任务是创建/进入当前 Agent instances；history/future restore 保留为 staged/future 区域，不混入当前 instances。
- Desktop 继续使用左侧导航 + 工作区；mobile 继续使用底部导航层级，直接二级 Project Agent 页顶部不重复 Back。
- 本 change 可以调整 copy、padding、surface、list row 和 status density，但不能扩展真实数据字段或承诺缺失能力。

## 关键决策

- 保留 `workspace=agents|files|git|terminal` 的 URL-visible Project workspace 状态，不引入新 route state。
- 保留 TanStack Query 获取 Projects 和 Agent Sessions 的 server state，不把 API 数据转换抽进通用 UI primitive。
- 继续使用已有 shell primitives，但允许按 shared design system note 收紧 `IconMarker`、`NavItemContent`、`StatusPill`、`ListRow` 的密度和状态一致性。
- `home.html` 和 `project-detail.html` 是本 change 的主验收原型；截图既要保存 prototype，也要保存 app。

## 开放问题

- 实现阶段已按安全窗口规则引入 `lucide-react@1.16.0`，但本 change 暂未在页面中使用 lucide 图标；后续图标接入仍应走统一 icon primitive。
- 实现阶段已初始化 shadcn/ui source setup，并把 `Button`、`Badge`、`Card`、`Input` 纳入 shell wrapper：action/navigation/list row、status pill、shell surface、shell input；shadcn 默认 light tokens 已改为项目 dark-only shell 基线。
- Project row 中 Git branch / counts 等 metadata 的最终保留数量应以真实数据和移动端密度验证为准。

## 后续沉淀候选

- 经验证后的 Home/Project shell 密度、低频创建入口和 Agent history future 区域边界，可由 distill-change 提炼到 docs/design/frontend-ui-architecture.md。
