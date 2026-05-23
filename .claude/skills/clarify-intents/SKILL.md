---
name: clarify-intents
description: 通过一次一个问题的追问记录用户原始意图，并维护 `.workflow/intents.md` 的待讨论/未分配意图清单。用户想澄清想法、整理需求、记录原始意图时使用。
---

# clarify-intents 技能

## 定位

`clarify-intents` 用于通过追问，把用户的粗糙想法、模糊需求或口述内容记录到 `.workflow/intents.md` 的待处理意图池。

`intents.md` 只保存尚未进入 roadmap 的意图：

- 待讨论
- 待分配

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
- `.workflow/roadmap.md`、`.workflow/changes/`、`.workflow/archive/`、`docs/` 只作为 big picture 背景，不在 clarify 阶段更新。

## 不负责

`clarify-intents` 不负责：

- 设计方案。
- 规划 roadmap。
- 拆解任务。
- 执行实现。
- 做验证、沉淀或归档。
- 创建或更新长期 `docs/` 文档。

这些动作交给后续 workflow 技能。

## 执行规则

1. 一次只问一个问题。
2. 每个问题都给出推荐答案，方便用户确认或纠正。
3. 如果问题可以通过阅读项目文件回答，先阅读文件，不要把问题丢给用户。
4. 只有用户确认后的内容才写入 `.workflow/intents.md`。
5. 写入前先读取 `.workflow/templates/intents.md`，沿用模板字段和风格。
6. 不更新 `.workflow/roadmap.md`。

## 澄清重点

优先澄清：

- 用户原始想表达的意图是什么。
- 当前表达是否足够记录为一个独立意图。
- 是否需要拆成多个原始意图。
- 是否已经清楚到可以进入“待分配”。

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

## 退出条件

当满足以下条件时，`clarify-intents` 可以结束：

- 用户原始意图已经记录。
- 该意图位于“待讨论”或“待分配”。
- 如果意图已足够清楚，应位于“待分配”，等待 `plan-roadmap` 分配。
