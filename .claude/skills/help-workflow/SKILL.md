---
name: help-workflow
description: 介绍整套 workflow 技能体系、目录结构、阶段链路与推荐下一步。用户询问如何开始、有哪些 workflow 能力、当前应该用哪个技能时使用。
---

# help-workflow 技能

## 定位

`help-workflow` 用于介绍整套工作流，并根据用户描述推荐合适的 workflow 技能。

它是工作流说明和分流入口，不是项目状态诊断技能。

## 负责

`help-workflow` 只负责两件事：

1. 解释当前工作流体系。
2. 根据用户描述推荐下一步可以使用哪个技能。

## 不负责

`help-workflow` 不负责：

- 读取项目状态。
- 判断当前项目进展。
- 恢复上下文。
- 更新 `.workflow/` 或 `docs/`。
- 创建、修改或移动任何 artifact。
- 代替其他 workflow 技能执行实际工作。

如果用户询问“当前项目现在到哪了”或“现在具体该做哪个 change”，不要自行读取 versions/change/archive 做状态恢复；应说明这不是 `help-workflow` 的职责，并建议用户进入对应技能或明确要求状态检查。

## 主动触发

当用户询问以下内容时，可以主动使用 `help-workflow`：

- 这套工作流怎么用。
- 每个阶段是什么意思。
- `.workflow/` 和 `docs/` 分别放什么。
- intent、roadmap、version、change 是什么关系。
- 我应该调用哪个技能。
- 某个技能是干什么的。

不要在用户已经明确要求执行具体技能时插入 `help-workflow`。

## 输入契约

### 标准输入

每次执行只需要理解用户当前问题或描述：

```text
用户关于 workflow 阶段、目录结构、技能职责或下一步技能选择的问题
```

标准输入规则：

- 根据本技能正文内的阶段链路、目录说明和技能分流规则回答。
- 不读取 `.workflow/`、`docs/`、archive、代码或 git 历史来判断项目当前状态。
- 不把用户的“当前项目到哪了”“现在具体该做哪个 change”解释为普通帮助问题；这类问题需要状态检查或进入对应 workflow 技能。

### 条件输入

通常无条件输入。只有这些情况需要额外处理：

- 如果用户明确要求解释某个技能的职责，只使用本技能正文中的职责和分流规则做概括。
- 如果用户明确要求执行某个技能，不继续补充说明，直接交给对应技能。
- 如果用户询问项目当前状态、当前焦点、具体 change 进度或归档情况，说明 `help-workflow` 不做状态诊断，并建议用户明确要求状态检查或使用对应 workflow 技能。

## 输出契约

### 标准输出

根据用户问题输出简短说明，通常包含：

- 当前问题属于哪个 workflow 阶段或哪类技能职责。
- 推荐的一个最合适 workflow 技能。
- 推荐理由。
- 用户下一步可以怎么说。

### 条件输出

根据用户问题按需输出：

- 当用户问“工作流怎么用”时，输出阶段链路、`.workflow/` 与 `docs/` 分工、常用技能列表。
- 当用户问“我该用哪个技能”时，只推荐一个最合适技能；如确有必要，最多给一个备选技能。
- 当用户问目录结构时，说明 `.workflow/intents.md`、`.workflow/versions/index.md`、version shared、change `context.md` / `progress.md`、archive 和 `docs/` 的职责。
- 当问题超出 `help-workflow` 职责时，说明边界并推荐下一步，不读取或修改项目状态。

## 工作流阶段说明

当前阶段链路：

```text
Intent（原始意图）
→ Roadmap（版本与变更编排）
→ Step（读取 context/progress 并分发阶段技能）
→ Specify（what）
→ Design（how）
→ Build（实现）
→ Verify（一致性）
→ Distill（长期沉淀）
→ Archive（版本归档）
```

阶段含义：

- Intent：记录尚未进入 roadmap 的用户原始意图。
- Roadmap：从 big picture 视角把意图和必要工程工作编排成 versions / changes；如果 big picture 不足，可以先规划调研、设计、验证、CI/CD 或文档治理类 change。
- Step：读取当前焦点或指定 change 的 `context.md` / `progress.md`，判断阶段并分发到对应阶段技能。
- Specify：为单个 change 写清楚 what，即可验证行为契约。
- Design：为单个 change 写清楚 how，即设计方案、边界、取舍和风险。
- Build：根据 plan/tasks 完成实现。
- Verify：验证实现是否符合 spec/design/tasks。
- Distill：把已验证的长期知识沉淀到 `docs/`。
- Archive：以 version 为单位冻结上下文并归档。

## 目录说明

```text
.workflow/    # 运行态：意图池、活跃 versions、change 执行、verify 证据、archive
docs/         # 长期态：project big picture、长期 specs、长期 design、architecture、runbooks
.claude/      # Claude Code 技能、技能与工作流模板资源
```

核心文件：

- `.workflow/intents.md`：只保存尚未进入 roadmap 的原始意图。
- `.workflow/versions/index.md`：当前活跃 versions / changes 的索引、当前焦点、全局阻塞和下一步入口。
- `.workflow/versions/<version>/shared/`：同一 version 内多个 changes 共享的运行态材料。
- `.workflow/versions/<version>/changes/<change-id>/context.md`：单个 change 的看板上下文，记录来源上下文、已知边界、协作与共享上下文、背景引用。
- `.workflow/versions/<version>/changes/<change-id>/progress.md`：单个 change 的阶段状态、局部阻塞、产物检查和进展记录；阶段到技能的路由由 `step-change` 决定。
- `.workflow/archive/versions/`：已归档 version 和 change 上下文；旧归档结构如已存在，保持不改。
- `docs/project.md`：project big picture。
- `docs/specs/`：长期 WHAT。
- `docs/design/`：长期 design。
- `docs/architecture/`：长期 HOW / architecture / ADR。
- `docs/runbooks/`：运维、故障、迁移、发布等操作手册。

## 技能分流规则

根据用户描述推荐技能：

| 用户描述 | 推荐技能 |
|---|---|
| 初始化或修复 `.workflow/` / `docs/` 结构 | `setup-workflow` |
| 介绍或补充项目整体认知 | `describe-project` |
| 想法还模糊，需要聊清楚 | `clarify-intents` |
| 已有原始意图，需要安排进开发路线图 | `plan-roadmap` |
| 已有 roadmap/current change，想继续推进下一步 | `step-change` |
| 某个 change 需要写清楚 what / 行为契约 | `specify-change` |
| 某个 change 需要设计 how / 架构 / UI / API / 数据等 | `design-change` |
| 某个 change 需要制定实现计划和任务 | `plan-change` |
| 某个 change 要开始或继续实现 | `implement-change` |
| 某个 change 要验证实现是否符合承诺 | `verify-change` |
| change 通过验证后，要沉淀长期文档 | `distill-change` |
| 一个 version 完成后要收口归档 | `archive-version` |

## 推荐规则

输出推荐时：

1. 先用一句话概括用户当前描述属于哪个阶段。
2. 只推荐一个最合适的技能。
3. 如确有必要，最多给一个备选技能。
4. 说明为什么推荐该技能。
5. 不自动执行推荐技能，除非用户明确要求。

## 输出格式

根据用户问题选择简短输出。

如果用户问“工作流怎么用”，输出：

- 阶段链路。
- `.workflow/` 与 `docs/` 分工。
- 常用技能列表。

如果用户问“我该用哪个技能”，输出：

- 推荐技能。
- 推荐理由。
- 备选技能（如有）。
- 用户下一步可以怎么说。

## 退出条件

`help-workflow` 完成时应满足：

- 用户理解当前工作流阶段或技能职责。
- 已根据用户描述推荐合适技能。
- 没有读取或修改项目状态。
- 没有替代其他 workflow 技能执行实际工作。
