---
name: clarify-intents
description: 持续通过一次一个问题的追问挖掘用户设计意图，并维护 `.workflow/intents.md` 的待讨论/待分配意图池。用户想澄清想法、整理需求、记录原始意图或要求 grill 时使用。
---

# clarify-intents 技能

## 定位

`clarify-intents` 是 workflow 版的 grilling 会话：持续追问用户，尽可能挖掘完整设计意图，并把已经稳定下来的用户原始意图记录到 `.workflow/intents.md`。

它参考 `grill-with-docs` 的工作方式：

- relentlessly interview 用户，直到形成 shared understanding。
- 一次只问一个问题。
- 沿设计树逐个分支追问，先解决依赖关系。
- 如果问题可以通过阅读项目文件回答，就先读文件，不把问题丢给用户。

`intents.md` 只保存尚未进入 roadmap 的意图：

- 待讨论
- 待分配

`clarify-intents` 不是“一次记录一个意图”的工具。记录一条意图后，除非满足暂停或退出条件，否则必须继续追问下一个高价值问题。

big picture 不从 `intents.md` 获取。需要理解项目全局状态时，AI 应现场读取 `docs/`、`.workflow/roadmap.md`、`.workflow/changes/` 与 `.workflow/archive/`。

## 主动触发

当用户提出模糊需求、粗糙想法、方向不清的问题，或表达“聊清楚 / 澄清一下 / 整理想法 / 帮我问清楚 / grill 一下”时，AI 可以主动进入 `clarify-intents`。

不要在以下情况强行进入：

- 用户只是问概念或资料。
- 用户已经给出清晰实现指令。
- 用户明确要求直接设计、规划或实现。

## 输入

执行前读取：

```text
.workflow/intents.md
.workflow/templates/intents.md
```

如果存在，执行前也必须读取：

```text
docs/project.md
```

按需读取全局上下文：

```text
.workflow/roadmap.md
.workflow/changes/
.workflow/archive/
docs/
```

读取规则：

- `.workflow/intents.md` 是主要写入目标。
- `.workflow/templates/intents.md` 用于确定写入字段与格式。
- `docs/project.md` 如果存在，是 clarify 阶段的项目 big picture 输入，必须先读取再追问或记录意图。
- `.workflow/roadmap.md`、`.workflow/changes/`、`.workflow/archive/`、`docs/` 只作为 big picture 背景，不在 clarify 阶段更新。
- 如果当前问题可以通过读取项目文件、现有 docs、roadmap、change 或代码回答，先读取相关文件，再决定是否还需要问用户。

## 不负责

`clarify-intents` 不负责：

- 设计方案。
- 规划 roadmap。
- 拆解任务。
- 执行实现。
- 做验证、沉淀或归档。
- 创建或更新长期 `docs/` 文档。

这些动作交给后续 workflow 技能。

## 核心执行循环

每轮都按以下循环执行，直到满足暂停或退出条件：

1. 读取必要输入，理解当前项目 big picture、已有待处理意图和最近上下文。
2. 选择当前设计树中信息增益最高的一个问题。
3. 一次只问一个问题，并给出推荐答案，方便用户确认、改写或反驳。
4. 等待用户回答，不在同一轮连续抛出多个问题。
5. 用户回答后，判断是否形成：
   - 新的原始意图；
   - 对已有原始意图的补充；
   - 需要继续澄清的模糊点；
   - 应推迟到 `specify-change`、`design-change`、`plan-roadmap` 的后续问题。
6. 当一条原始意图已经稳定时，立即写入或更新 `.workflow/intents.md`。
7. 写入后继续追问下一个高价值分支，不因为单条意图已记录就结束。

## 追问策略

追问时优先沿设计树逐步覆盖这些方面，但不要一次全部询问：

- 用户原始目标：用户真正想改变什么，为什么现在要做。
- 使用者与场景：谁会用，在什么设备、环境和频率下用。
- 首期核心闭环：最小可用路径从哪里开始，到哪里算完成。
- 非目标：首期明确不做什么，避免 roadmap 被隐性需求污染。
- 领域术语：用户使用的词是否和 `docs/project.md` 或现有 docs 中的概念一致。
- Agent 生命周期：会话如何创建、运行、暂停、取消、结束、恢复。
- 控制能力边界：用户希望能执行哪些控制动作，哪些动作需要保护。
- 状态与输出：用户需要看到哪些状态、日志、结果、历史和错误信息。
- 多 Agent 统一语义：Claude、Codex 的差异哪些应暴露，哪些应被统一控制面隐藏。
- 响应式与 PWA：移动端、安装、离线、通知、后台恢复等预期是什么。
- 权限与安全：谁能访问、如何防误操作、是否涉及敏感输出或服务器权限。
- 并发与多会话：是否支持多个 agent、多个任务、多个用户或多设备同时操作。
- 失败与异常：断线、进程失败、agent 卡住、输出过大、服务器重启时用户期望什么。
- 可观测性与回溯：用户需要哪些记录来判断 agent 做过什么。

遇到模糊、冲突或过载术语时，应立即指出并给出更精确的候选表达。

## 大文件处理规则

`intents.md` 可能随着项目长期演进变得很大，因此必须遵循：

1. 阅读 `.workflow/intents.md` 时，优先从文件后部往前读，先查看最近追加的待处理意图。
2. 新增意图前，必须先在 `.workflow/intents.md` 中搜索关键词，确认是否已有相同、相近或冲突的意图。

如果发现相近意图，优先更新已有意图或向用户确认差异，不要直接追加重复意图。

## 写入规则

当用户提出或确认原始意图时，更新：

```text
.workflow/intents.md
```

写入位置：

- 还不清楚的意图写入“待讨论”。
- 已经清楚但尚未进入 roadmap 的意图写入“待分配”。

写入内容只包括：

- 编号
- 原始意图

写入要求：

- 只有用户确认后的内容才写入 `.workflow/intents.md`。
- 写入前先读取 `.workflow/templates/intents.md`，沿用模板字段和风格。
- 不更新 `.workflow/roadmap.md`。
- 不把 design、任务拆解、验收标准或实现方案写进 `intents.md`。
- 如果一轮回答同时暴露多个意图，先记录已经清楚的意图，再继续逐个追问剩余意图。

## 暂停与退出条件

`clarify-intents` 不应因为记录了一条意图就结束。

只有满足以下任一条件时，才可以暂停或退出：

- 用户明确表示“够了 / 暂停 / 先到这里 / 进入 roadmap / 不用再问了”。
- 当前设计树的主要分支已经覆盖，且没有新的模糊点或冲突点。
- 剩余问题已经明显属于后续 workflow 阶段，而不是 intent clarify：
  - 排期和版本编排交给 `plan-roadmap`。
  - 行为契约交给 `specify-change`。
  - HOW、架构、UI、API、数据、异常处理交给 `design-change`。
  - 实施步骤交给 `plan-change`。

暂停或退出前，应简短说明：

- 已记录哪些意图。
- 哪些仍在“待讨论”或“待分配”。
- 推荐下一步使用哪个 workflow 技能。
