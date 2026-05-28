---
name: archive-version
description: 在 verify 与 distill 完成后，将已完成 version 从 `.workflow/versions/` 归档到 `.workflow/archive/versions/`。用户要求归档版本、冻结上下文、结束版本或清理活跃 versions index 时使用。
---

# archive-version 技能

## 定位

`archive-version` 用于在一个 version 完成、验证并沉淀后，将该 version 从活跃区 `.workflow/versions/` 移入归档区 `.workflow/archive/versions/`，并更新 `.workflow/versions/index.md`。

归档以 version 为单位执行，不以单个 change 为单位执行。

`archive-version` 只负责冻结运行态上下文、移动 version 目录和更新活跃 index；它不负责补做 verify、distill、实现或长期 docs 沉淀。

目标结构：

```text
.workflow/archive/versions/<version>/
├── shared/
├── artifacts/
└── changes/
    └── <change-id>/
```

旧归档结构如果已经存在，保持不改；不要为了迁移历史归档而改写旧 archive。

## 主动触发

当满足以下情况时，使用 `archive-version`：

- 某个 version 下所有 changes 已完成 `verify-change` 和 `distill-change`。
- 用户要求“归档版本”“收口版本”“结束这一批”“清理活跃 versions index”。
- `.workflow/versions/index.md` 中存在已完成但仍停留在活跃区的 version。
- distill 完成后，需要冻结运行态上下文以便后续 roadmap 继续推进。

不要在以下情况强行进入：

- 目标 version 尚未确认。
- version 下存在未完成 change。
- 任一 change 缺少 verify 证据。
- 任一 change 存在未解决 CRITICAL。
- 任一 change 尚未完成 `distill-change`，但包含需要长期沉淀的知识。
- 用户仍在规划、设计、实现、验证或沉淀阶段。

## version 参数

执行本技能时必须确定目标 version。

- 如果用户传入 version 名称，使用该 version。
- 如果用户传入 `.workflow/versions/<version>/` 路径，使用该 version。
- 如果用户没有传入 version，先读取 `.workflow/versions/index.md`，列出当前活跃 versions，并询问用户要归档哪个 version。
- 如果上下文里似乎能推断 version，也不能直接猜测或自动选择；必须让用户确认。
- 不要在未确认 version 的情况下移动目录或修改 index。

选择 version 时，展示：

- version 名称
- version 目标
- version 路径
- shared 路径
- 包含的 changes
- 每个 change 的当前阶段（来自 `progress.md`）
- verify/distill 是否完成

## 输入契约

### 标准输入

每次执行都需要读取并理解这些输入：

```text
.workflow/versions/index.md
.workflow/versions/<version>/
.workflow/versions/<version>/changes/<change-id>/context.md
.workflow/versions/<version>/changes/<change-id>/progress.md
.workflow/versions/<version>/changes/<change-id>/verify.md
```

读取规则：

- `.workflow/versions/index.md` 是活跃 version/change 的来源，只记录活跃队列、当前焦点、暂缓/放弃和全局阻塞。
- `.workflow/versions/<version>/` 是需要冻结并移动的完整运行态边界。
- `context.md` 是每个 change 的看板上下文，归档时必须保留。
- `progress.md` 是每个 change 阶段状态和局部阻塞的权威来源。
- `verify.md` 是归档前质量门禁。

### 条件输入

根据归档前检查结果，按需读取这些输入：

1. **version shared 与 artifacts**
   - 如果 version 下存在 `shared/` 或 `artifacts/`，确认它们属于本 version 的运行态上下文，应随 version 一起归档。

2. **change 运行态产物**
   - 当需要确认 change 是否完整、是否仍有未沉淀内容或未完成任务时，按需读取：

```text
.workflow/versions/<version>/changes/<change-id>/specs/
.workflow/versions/<version>/changes/<change-id>/design/
.workflow/versions/<version>/changes/<change-id>/plan.md
.workflow/versions/<version>/changes/<change-id>/tasks.md
.workflow/versions/<version>/changes/<change-id>/artifacts/
```

3. **长期 docs**
   - `docs/` 只用于确认 distill 是否已经完成；不要在 archive 阶段更新长期 docs。
   - 如果 distill 完成证据不足，按需读取 `docs/project.md`、`docs/specs/`、`docs/design/` 或 `docs/architecture/` 判断是否已有对应长期沉淀。

4. **既有 archive**
   - 如果 `.workflow/archive/versions/<version>/` 已存在，停止并要求人工处理冲突。
   - 旧归档结构如 `.workflow/archive/roadmap.md` 或 `.workflow/archive/changes/` 已存在，只有需要历史追溯时才读取，不迁移、不改写。

## 输出契约

### 标准输出

归档成功后，必须保证这些输出成立：

```text
.workflow/archive/versions/<version>/
.workflow/versions/index.md
```

标准输出要求：

- `.workflow/archive/versions/<version>/` 包含原 `.workflow/versions/<version>/` 的完整上下文，包括 shared、artifacts 和 changes。
- `.workflow/versions/<version>/` 已从活跃区移除。
- `.workflow/versions/index.md` 已移除该 version 的活跃记录。
- 如果当前焦点指向被归档 version/change，index 的“当前焦点”和“下一步”已更新到下一个活跃 change，或明确为空。
- 不修改长期 `docs/`。

### 条件输出

根据归档结果，按需产生这些输出：

1. **创建 archive versions 目录**
   - 如果 `.workflow/archive/versions/` 不存在，创建它。
   - 如果项目有 `.workflow/archive/versions/index.md`，追加或更新该 version 的归档记录；如果没有，不强行引入新索引，除非现有治理文件要求。

2. **阻塞说明**
   - 如果任一归档前检查失败，不移动 version，不修改 index，并说明失败项和应回到哪个技能。

3. **用户可读摘要**
   - 完成后简短汇报已归档 version、归档路径、包含哪些 changes、从活跃 index 移除了什么、当前剩余活跃焦点以及是否有跳过或冲突。

## 不负责

`archive-version` 不负责：

- 执行实现。
- 运行测试或修复验证问题。
- 合并 specs 或提炼 design。
- 更新长期 `docs/`。
- 重新规划未完成 version。
- 迁移旧归档结构。

如果发现这些工作尚未完成，应停止归档并提示回到对应技能。

工作流层面的直接衔接只有：

- 上游：change 未完成时回到 `step-change`，verify 不足时回到 `verify-change`，distill 不足时回到 `distill-change`。
- 下游：归档完成后如仍有活跃意图或需要下一轮规划，进入 `plan-versions` 或 `step-change`。

## 归档前检查

确认目标 version 后，必须检查：

1. version 是否存在于 `.workflow/versions/index.md`。
2. `.workflow/versions/<version>/` 是否存在。
3. version 下列出的每个 change 是否存在对应目录。
4. 每个 change 是否有 `context.md`、`progress.md` 和 `verify.md`。
5. 每个 `verify.md` 是否不存在未解决 CRITICAL。
6. 每个 change 是否已完成 `distill-change`，或明确没有长期知识需要沉淀。
7. 每个 change 是否没有未完成 tasks，或未完成项已被明确转移到其他 change/version。
8. `.workflow/archive/versions/<version>/` 是否已存在；如果存在，停止并要求人工处理冲突。

如果任一检查失败，不移动文件，不修改 index。

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

- change 的 `progress.md` 显示 `当前阶段：已完成`。
- change 记录或 verify/distill 输出中明确说明长期知识已沉淀。
- 相关 `docs/` 已包含该 change 需要保留的长期 WHAT/HOW/project knowledge。
- 该 change 明确没有长期知识需要沉淀。

如果证据不足，应提示先执行 `distill-change`。

## 核心执行循环

1. 确认目标 version。
2. 读取 `.workflow/versions/index.md` 与 `.workflow/versions/<version>/`。
3. 找出目标 version 下全部 changes。
4. 对每个 change 执行归档前检查。
5. 若检查通过，确保 `.workflow/archive/versions/` 存在且目标归档路径不存在。
6. 将目标 version 目录整体移动到：

```text
.workflow/archive/versions/<version>/
```

7. 从 `.workflow/versions/index.md` 移除该 version 的活跃记录。
8. 如果 index 中仍有活跃 versions，更新当前焦点和下一步；否则标记为空。
9. 如存在 `.workflow/archive/versions/index.md`，追加或更新该 version 的归档记录。
10. 验证归档后的目录和 index 状态。
11. 汇报归档结果。

## archive versions index 写入规则

如果项目存在或治理要求维护：

```text
.workflow/archive/versions/index.md
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

如果该 index 不存在且治理文件没有要求，不要为了归档单个 version 强行创建新的历史索引；只移动 version 目录并更新活跃 index。

## version 移动规则

移动 version 时：

- 保留完整目录内容。
- 不重写 version 或 change 内部文件。
- 不删除 shared、artifacts 或 change artifacts。
- 不重新编号或重命名 version/change-id。
- 如果目标 archive 路径已存在，停止并要求人工处理。

目标路径：

```text
.workflow/archive/versions/<version>/
```

## 活跃 versions index 更新规则

归档成功后，更新：

```text
.workflow/versions/index.md
```

规则：

- 删除目标 version 的活跃记录。
- 删除该 version 下 changes 的活跃索引。
- 如果当前焦点指向被归档 version/change，重新选择下一个活跃焦点；如果没有活跃项，标记为空。
- 不把归档历史复制回活跃 index。
- 不在 index 中维护单个 change 的阶段状态。

## 完成后输出

完成后简短汇报：

- 已归档 version。
- 归档路径。
- 包含哪些 changes。
- 从 `.workflow/versions/index.md` 移除了哪些活跃项。
- 当前剩余活跃 version / change。
- 是否有跳过、冲突或需要用户处理的事项。

## 退出条件

当满足以下条件时，`archive-version` 可以结束：

- 目标 version 已确认。
- version 下所有 changes 已通过归档前检查。
- `.workflow/archive/versions/<version>/` 已包含该 version 完整上下文。
- `.workflow/versions/<version>/` 已从活跃区移除。
- `.workflow/versions/index.md` 已移除该 version。
- 当前活跃焦点已更新或明确为空。
- 未修改长期 `docs/`。
- 如有未归档内容，已明确说明原因和下一步。
