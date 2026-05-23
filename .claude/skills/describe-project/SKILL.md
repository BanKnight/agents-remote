---
name: describe-project
description: 交互式建立或更新项目长期认知 big picture，并沉淀到 `docs/project.md`。用户描述项目定位、用户场景、领域概念或长期准则时使用。
---

# describe-project 技能

## 定位

`describe-project` 用于交互式建立或更新项目认知 big picture，并写入：

```text
docs/project.md
```

`docs/project.md` 是项目级长期认知入口，回答：

- 这个项目是什么。
- 服务谁、解决什么问题。
- 有哪些核心领域概念。
- 技术、架构、API、UI、数据、测试、安全等基本准则是什么。
- 新成员或 Agent 参与讨论和任务前需要共享哪些前提。

它与 `.workflow/roadmap.md` 分工不同：

- `.workflow/roadmap.md` 是 workflow big picture：当前有哪些 versions / changes，下一步怎么接活。
- `docs/project.md` 是 project big picture：项目本身是什么，按什么认知和准则参与。

## 渐进式补全

`docs/project.md` 是渐进式补全的文件，不要求一次写完整。

每次调用 `describe-project` 时，只补齐当前已经确认的项目认知：

- 用户明确说出的项目定位、领域概念或开发准则。
- 从现有 docs/code/roadmap 中可以可靠推导出的项目事实。
- change 完成后经过验证、值得长期保留的项目认知。

不要为了完整而编造未知信息。未知内容可以保留为空或标记为待补充。

## 任意阶段调用

`describe-project` 可以在任意阶段调用。

适合调用的情况：

- 项目刚开始，需要建立基础项目认知。
- 用户补充了项目定位、用户场景、领域概念或协作准则。
- roadmap/spec/design/implementation 中暴露出项目认知缺口。
- change 完成后，需要把验证过的长期认知提炼回 `docs/project.md`。
- 新成员或 Agent 参与前，需要补齐项目 big picture。

不要把 `docs/project.md` 当成需求池、任务列表或 roadmap。它记录稳定的项目认知，不记录单次任务过程。

## 主动触发

当 AI 发现用户表达的是稳定项目认知，而不是单次需求时，可以主动建议进入 `describe-project`。

示例：

- “这个项目主要服务内部运营人员。”
- “我们的 API 一律保持向后兼容。”
- “所有 UI 都优先服务移动端。”
- “这个领域里订单和交易不是一回事。”
- “change 完成后，这个模式应该沉淀成项目共识。”

如果用户只是提出一次性功能需求，不要强行进入 `describe-project`。

## 输入

执行前读取：

```text
docs/project.md
docs/templates/project.md
```

按需读取：

```text
docs/
.workflow/roadmap.md
.workflow/changes/
.workflow/archive/changes/
.claude/commands/workflow/
```

读取规则：

- `docs/project.md` 是主要写入目标。
- 如果文件不存在，先从 `docs/templates/project.md` 创建。
- 读取现有 `docs/project.md` 后再讨论变更，不要直接覆盖。
- 如果新认知与现有内容冲突，先指出冲突并要求用户确认。
- 从 change 提炼时，只写入已经验证或用户确认的长期认知。

## 不负责

`describe-project` 不负责：

- 记录单次功能需求。
- 编排 roadmap。
- 创建 change。
- 写 spec/design/plan/tasks。
- 执行实现。
- 做验证或归档。

这些动作交给后续 workflow 技能。

## 交互规则

1. 一次只讨论一个项目认知主题。
2. 每个问题都给出推荐答案，方便用户确认或纠正。
3. 如果项目认知可从已有项目文件推断，先读取文件，不要直接问用户。
4. 写入内容必须稳定、可复用，能帮助后续讨论或任务。
5. 当用户确认后，再写入 `docs/project.md`。
6. 如果变更会影响现有 roadmap/spec/design/plan/implementation，应在写入后列出可能受影响的 artifact。

## 内容质量要求

写入 `docs/project.md` 的内容应尽量满足：

- 稳定：适用于多个 change，不是一次性任务。
- 有上下文：说明项目是什么，而不仅是孤立规则。
- 可参与：能帮助新成员或 Agent 参与讨论和任务。
- 可约束：能为后续 spec/design/plan/implementation 提供边界。
- 不伪造：未知内容明确待补充。

## 写入规则

更新：

```text
docs/project.md
```

写入前：

1. 读取现有 `docs/project.md`。
2. 判断是新增项目认知、修改既有认知、删除过时认知还是澄清措辞。
3. 保留已有内容，不整文件重写，除非用户明确要求重构 `docs/project.md`。
4. 如果来自已完成 change，应只提炼长期有效内容，不复制运行态过程。

## change 完成后的提炼

change 完成并通过 verify 后，应考虑是否有内容需要提炼到 `docs/project.md`。

适合提炼的内容：

- 新确认的项目定位或用户场景。
- 新稳定下来的领域概念。
- 跨多个 change 都应遵循的开发准则。
- 被验证过的 API、UI、数据、测试、安全或文档原则。
- 影响后续讨论和任务理解的项目背景。

不适合提炼的内容：

- 单次实现细节。
- 临时问题和临时决策。
- 已经过期的任务状态。
- 只对某个 change 有意义的过程记录。

## 与其他技能的关系

后续技能都可以把 `docs/project.md` 作为项目认知来源：

- `clarify-intents`：判断用户意图是否与项目定位或领域概念冲突。
- `plan-roadmap`：规划 version/change 时理解项目方向和长期约束。
- `specify-change`：避免 spec 与项目基本认知冲突。
- `design-change`：设计方案应符合项目技术、架构、API、UI、数据、安全等基本准则。
- `plan-change`：plan/tasks 可引用需要遵守的项目准则。
- `implement-change`：实现时遵守项目代码、测试、安全、文档准则。
- `verify-change`：可把 `docs/project.md` 作为一致性检查来源。
- `distill-change`：change 完成后可把稳定项目认知提炼回 `docs/project.md`。

## 完成后输出

完成后简短汇报：

- 新增或修改了哪些项目认知。
- 是否来自用户确认、现有文档推导或已完成 change 提炼。
- 哪些现有 artifact 可能需要同步检查。
- 下一步建议继续当前 workflow 阶段，或回到受影响的技能。

## 退出条件

当满足以下条件时，`describe-project` 可以结束：

- 已确认的项目认知已写入 `docs/project.md`。
- 内容稳定、可复用，能服务后续讨论和任务。
- 与既有 `docs/project.md` 的冲突已处理或记录。
- 可能受影响的 artifact 已列出。
- 不混入单次需求、roadmap 编排或实现任务。
