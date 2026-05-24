---
name: archive-version
description: 在 verify 与 distill 完成后归档已完成 change/version 上下文。用户要求归档、冻结上下文或结束版本时使用。
---

# archive-version 技能

## 定位

`archive-version` 用于在一个 version 完成、验证并沉淀后，将该 version 从活跃 roadmap 中移出，并把它关联的 changes 迁入 archive。

归档以 version 为单位执行，不以单个 change 为单位执行。

`archive-version` 只负责冻结运行态上下文和更新归档索引；它不负责补做 verify、distill、实现或长期 docs 沉淀。

## version 参数

执行本技能时必须确定目标 version。

- 如果用户传入 version 名称，使用该名称。
- 如果用户没有传入 version 名称，先读取 `.workflow/roadmap.md`，列出当前活跃 versions，并询问用户要归档哪个 version。
- 如果上下文里似乎能推断 version，也不能直接猜测或自动选择；必须让用户确认。
- 不要在未确认 version 的情况下移动 change 或修改 roadmap。

选择 version 时，应展示：

- version 名称
- version 目标
- 包含的 changes
- 每个 change 的当前阶段 / 下一步（来自 `progress.md`）
- verify/distill 是否完成

## 主动触发

当满足以下情况时，AI 可以主动建议或进入 `archive-version`：

- 某个 version 下所有 changes 已完成 `verify-change` 和 `distill-change`。
- 用户要求“归档版本”“收口版本”“结束这一批”“清理活跃 roadmap”。
- `roadmap.md` 中存在已完成但仍停留在活跃区的 version。
- distill 完成后，需要冻结运行态上下文以便后续 roadmap 继续推进。

不要在以下情况强行进入：

- 目标 version 尚未确认。
- version 下存在未完成 change。
- 任一 change 缺少 verify 证据。
- 任一 change 存在未解决 CRITICAL。
- 任一 change 尚未完成 `distill-change`，但包含需要长期沉淀的知识。
- 用户仍在规划、设计、实现、验证或沉淀阶段。

## 输入

必须读取：

```text
.workflow/roadmap.md
.workflow/archive/roadmap.md
.workflow/changes/<change-id>/
.workflow/changes/<change-id>/progress.md
```

对目标 version 下每个 change，必须读取：

```text
.workflow/changes/<change-id>/intents.md
.workflow/changes/<change-id>/verify.md
```

按需读取：

```text
.workflow/changes/<change-id>/specs/
.workflow/changes/<change-id>/design/
.workflow/changes/<change-id>/plan.md
.workflow/changes/<change-id>/tasks.md
.workflow/changes/<change-id>/artifacts/
docs/project.md
docs/specs/
docs/design/
docs/architecture/
```

读取规则：

- `.workflow/roadmap.md` 是活跃 version/change 的来源。
- `.workflow/archive/roadmap.md` 是归档 version 索引，追加或更新归档记录。
- `.workflow/changes/<change-id>/` 是需要冻结的完整运行态上下文。
- `verify.md` 是归档前质量门禁。
- `docs/` 只用于确认 distill 是否已经完成；不要在 archive 阶段更新长期 docs。

## 不负责

`archive-version` 不负责：

- 执行实现。
- 运行测试或修复验证问题。
- 合并 specs 或提炼 design。
- 更新长期 `docs/`。
- 重新规划未完成 version。

如果发现这些工作尚未完成，应停止归档并提示回到对应技能。

## 归档前检查

确认目标 version 后，必须检查：

1. version 是否存在于 `.workflow/roadmap.md`。
2. version 下列出的每个 change 是否存在对应目录。
3. 每个 change 是否有 `verify.md`。
4. 每个 `verify.md` 是否不存在未解决 CRITICAL。
5. 每个 change 是否已完成 `distill-change`，或明确没有长期知识需要沉淀。
6. 每个 change 是否没有未完成 tasks，或未完成项已被明确转移到其他 change/version。
7. `.workflow/archive/changes/<change-id>/` 是否已存在；如果存在，停止并要求人工处理冲突。
8. `.workflow/archive/roadmap.md` 是否存在；不存在则创建。

如果任一检查失败，不移动文件，不修改 roadmap。

## progress.md 归档前规则

`archive-version` 不推进单个 change 阶段，但归档前必须读取目标 version 下每个 change 的 `progress.md`。

可归档条件：

- 每个 change 的 `当前阶段` 为 `已完成`，或 `progress.md` 明确说明无需继续推进且可归档。
- 每个 change 不存在未解决局部阻塞。
- 每个 change 的 verify/distill 证据满足归档前检查。

如果 `progress.md` 与 verify/distill 证据冲突，停止归档并提示先用 `step-change` 或对应阶段技能校正。

## distill 完成判断

`archive-version` 不重新执行 `distill-change`，但必须确认它已经完成。

可接受的证据包括：

- change 的 `progress.md` 显示 `当前阶段：已完成` 且 `下一步技能：archive-version`。
- change 记录或 verify/distill 输出中明确说明长期知识已沉淀。
- 相关 `docs/` 已包含该 change 需要保留的长期 WHAT/HOW/project knowledge。
- 该 change 明确没有长期知识需要沉淀。

如果证据不足，应提示先执行 `distill-change`。

## 执行规则

1. 确认目标 version。
2. 读取 `.workflow/roadmap.md` 和 `.workflow/archive/roadmap.md`。
3. 找出目标 version 下全部 changes。
4. 对每个 change 执行归档前检查。
5. 若检查通过，更新 `.workflow/archive/roadmap.md`：追加该 version 的归档记录。
6. 将目标 version 下全部 change 目录移动到：

```text
.workflow/archive/changes/<change-id>/
```

7. 从 `.workflow/roadmap.md` 移除该 version。
8. 如果 roadmap 中仍有活跃 versions，更新当前焦点和下一步。
9. 验证归档后的目录和 roadmap 状态。
10. 汇报归档结果。

## archive roadmap 写入规则

归档记录写入：

```text
.workflow/archive/roadmap.md
```

每个归档 version 至少记录：

- version 名称
- 归档日期
- version 目标
- 包含的 changes
- verify 结论摘要
- distill 结论摘要
- 归档路径

归档记录是历史索引，不是活跃计划。不要把它写成下一步任务清单。

## change 移动规则

移动 change 时：

- 保留完整目录内容。
- 不重写 change 内部文件。
- 不删除 artifacts。
- 不重新编号或重命名 change-id。
- 如果目标 archive 路径已存在，停止并要求人工处理。

目标路径：

```text
.workflow/archive/changes/<change-id>/
```

## 活跃 roadmap 更新规则

归档成功后，更新：

```text
.workflow/roadmap.md
```

规则：

- 删除目标 version 的活跃记录。
- 删除该 version 下 changes 的活跃索引。
- 如果当前焦点指向被归档 version/change，重新选择下一个活跃焦点；如果没有活跃项，标记为空。
- 不把归档历史复制回活跃 roadmap。

## 完成后输出

完成后简短汇报：

- 已归档 version。
- 移动了哪些 changes。
- 更新了 `.workflow/archive/roadmap.md`。
- 从 `.workflow/roadmap.md` 移除了哪些活跃项。
- 当前剩余活跃 version / change。
- 是否有跳过、冲突或需要用户处理的事项。

## 退出条件

当满足以下条件时，`archive-version` 可以结束：

- 目标 version 已确认。
- version 下所有 changes 已通过归档前检查。
- `.workflow/archive/roadmap.md` 已记录该 version。
- version 下所有 changes 已移动到 `.workflow/archive/changes/`。
- `.workflow/roadmap.md` 已移除该 version。
- 当前活跃焦点已更新或明确为空。
- 未修改长期 `docs/`。
- 如有未归档内容，已明确说明原因和下一步。
