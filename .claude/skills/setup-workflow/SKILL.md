---
name: setup-workflow
description: 初始化或更新本工作流模板项目的 `.workflow/` 与 `docs/` 双区结构，并可选注入 Claude Code hook guardrails。用户要求 setup、初始化、更新、修复、重新执行工作流结构、治理文件、模板目录、docs 索引或 hook guardrails 时使用。
---

# setup-workflow 技能

## 定位

`setup-workflow` 用于初始化或更新项目中的两个关键治理区域：

- `.workflow/`：运行态与流程态区域。
- `docs/`：长期文档沉淀区域。

它还负责把两个区域的治理文件注入到项目入口文件 `CLAUDE.md` 与 `AGENTS.md`，确保项目一开始就会加载对应治理规则。

`setup-workflow` 也可以为下游项目注入 Claude Code hook guardrails。hook 只服务 `.workflow/` 流程治理和 `docs/` 长期沉淀治理，默认作为提醒型护栏，不替代 workflow skills，不自动修改项目文件。

## 使用时机

当用户要求 setup、初始化、更新、修复、重新执行工作流结构，或要求补齐治理文件、模板目录、docs 索引、`AGENTS.md` / `CLAUDE.md` 加载规则、Claude Code hook guardrails 时，使用本技能。

## 参考资料

执行时按需读取：

- [scope.md](references/scope.md) — setup-workflow 的负责范围与不负责范围。
- [docs-indexing.md](references/docs-indexing.md) — 老项目接入时的 docs 索引重建规则。
- [template-redundancy.md](references/template-redundancy.md) — 技能模板源与项目本地模板副本的关系。

## 输入契约

### 标准输入

每次执行都需要理解这些输入：

```text
当前项目根目录
.claude/skills/setup-workflow/templates/workflow/
.claude/skills/setup-workflow/templates/docs/
```

标准输入规则：

- 先检查目标项目是否已有 `.workflow/`、`docs/`、`CLAUDE.md`、`AGENTS.md`。
- 使用本 skill 的 bundled templates 作为种子，不根据文件名猜测治理内容。
- 修改文本文件时优先使用内置 Read/Edit/Write 工具；保留用户已有内容，做最小编辑。

### 条件输入

根据目标项目现状按需读取：

- 如果已有 `.workflow/AGENTS.md`、`docs/AGENTS.md` 或本地 templates，先读取现有内容再补齐缺失规则。
- 如果已有 `docs/` 文档，按 [docs-indexing.md](references/docs-indexing.md) 逐层读取并判断是否需要重建索引。
- 如果用户要求启用 hook guardrails，读取 `.claude/settings.json`、已有 `.claude/hooks/` 与 `.claude/scripts/`，并读取 `templates/claude-code/`。
- 如果用户要求同步或重置模板，读取 [template-redundancy.md](references/template-redundancy.md) 判断哪些模板源和项目本地副本需要更新。

## 输出契约

### 标准输出

setup 完成后，目标项目至少具备：

```text
.workflow/AGENTS.md
.workflow/intents.md
.workflow/templates/
.workflow/versions/index.md
docs/AGENTS.md
docs/project.md
docs/index.md
docs/templates/
CLAUDE.md 或 AGENTS.md 中的治理加载区块
```

标准输出规则：

- `.workflow/` 使用 versioned workflow 结构：活跃 roadmap 入口是 `.workflow/versions/index.md`，change 骨架位于 `.workflow/versions/<version>/changes/<change-id>/`。
- change 模板使用 `context.md`，不再使用 `intents.md` 作为单个 change 的来源文件。
- 归档目标结构是 `.workflow/archive/versions/`；旧归档结构如已存在，保持不改。

### 条件输出

根据用户要求或项目现状，按需产生：

- `.workflow/templates/versions/index.md` 与 `.workflow/templates/changes/context.md` 等项目本地模板。
- `.workflow/versions/<version>/shared/` 目录只在规划出具体 version 或模板需要时创建；setup 默认只保证 versions index 可用。
- `.claude/settings.json`、`.claude/hooks/`、`.claude/scripts/` 的 hook guardrails；仅在用户明确要求启用或项目治理明确要求时创建/合并。
- 重建后的 `docs/**/index.md`；只有老项目已有 docs 且索引缺失或过期时执行。

## 模板源

setup 使用本 skill 的 `templates/` 目录作为模板源：

```text
templates/
├── workflow/
│   ├── AGENTS.md
│   ├── intents.md
│   ├── templates/
│   │   ├── intents.md
│   │   ├── versions/
│   │   │   └── index.md
│   │   └── changes/
│   ├── versions/
│   │   └── index.md
│   └── archive/
│       └── versions/
├── docs/
│   ├── AGENTS.md
│   ├── project.md
│   ├── index.md
│   ├── templates/
│   ├── specs/
│   ├── design/
│   ├── architecture/
│   └── runbooks/
└── claude-code/
    ├── settings.json
    ├── hooks/
    │   ├── workflow-guard.ts
    │   └── docs-guard.ts
    └── scripts/
        └── merge-hook-settings.ts
```

执行 setup 时，从本 skill 的 `templates/workflow/` 与 `templates/docs/` 补齐项目根目录下的 `.workflow/` 与 `docs/`。按需从 `templates/claude-code/` 为下游项目补齐 `.claude/settings.json`、`.claude/hooks/` 与 `.claude/scripts/`。

## 执行纪律

执行 `setup-workflow` 时，从一开始就使用系统任务追踪工具。

创建并维护以下任务：

1. 检查当前项目结构。
2. 初始化或更新 `.workflow/`。
3. 初始化或更新 `docs/`。
4. 创建或更新 `.workflow/AGENTS.md` 与 `docs/AGENTS.md`。
5. 将治理加载规则注入根目录 `AGENTS.md` 与 `CLAUDE.md`。
6. 创建或补齐 `.workflow/templates/` 与 `docs/templates/`。
7. 按需创建或更新 `.claude/settings.json` 与 `.claude/hooks/` 的 hook guardrails。
8. 必要时重建 `docs/` 索引。
9. 验证并汇总 setup 结果。

每一步开始前，将对应任务标记为 `in_progress`；完成后立即标记为 `completed`。如果出现阻塞，保持相关任务未完成，并说明阻塞项。

## 执行流程

### 1. 检查现状

编辑前先读取或列出相关现有文件：

```text
.workflow/
docs/
AGENTS.md
CLAUDE.md
```

保留用户已有内容，优先做最小编辑，不要整文件重写。

### 2. 初始化或更新 `.workflow/`

确保 `.workflow/` 至少包含：

```text
.workflow/
├── AGENTS.md
├── intents.md
├── templates/
├── versions/
│   └── index.md
└── archive/
    └── versions/
```

### 3. 初始化或更新 `docs/`

确保 `docs/` 至少包含：

```text
docs/
├── AGENTS.md
├── project.md
├── index.md
├── templates/
├── specs/
├── design/
├── architecture/
└── runbooks/
```

### 4. 创建或更新治理文件

创建或更新：

```text
.workflow/AGENTS.md
docs/AGENTS.md
```

文件已存在时，保留项目已有修改，只补齐 setup 关键规则。

### 5. 注入入口加载规则

确保根目录 `CLAUDE.md` 与 `AGENTS.md` 都包含受管理区块：

```md
<!-- WORKFLOW:GOVERNANCE:START -->
## 治理文档导入

- @.workflow/AGENTS.md
- @docs/AGENTS.md

必须读取并遵循：
1. `.workflow/AGENTS.md` 负责运行态、流程态与变更工作区治理。
2. `docs/AGENTS.md` 负责长期文档、索引与沉淀治理。
<!-- WORKFLOW:GOVERNANCE:END -->
```

如果区块已存在，只更新该区块；如果文件存在但无区块，则追加；如果文件不存在，则创建。

### 6. 维护模板目录

确保存在：

```text
.workflow/templates/
docs/templates/
```

如果模板文件已存在，不要覆盖，除非用户明确要求重置或同步模板。

### 7. 维护 Claude Code hook guardrails

Claude Code hook guardrails 默认不随 setup 自动启用。只有用户明确要求启用，或下游项目治理文件明确要求随 setup 注入时，才从 `templates/claude-code/` 补齐：

```text
.claude/
├── settings.json
├── hooks/
│   ├── workflow-guard.ts
│   └── docs-guard.ts
└── scripts/
    └── merge-hook-settings.ts
```

规则：

- hook guardrails 是可选能力，不是默认 setup 必选项；未启用时不要创建 `.claude/settings.json`、`.claude/hooks/` 或 `.claude/scripts/`。
- hook guardrails 服务 `.workflow/` 流程治理和 `docs/` 长期沉淀治理。
- hook 实现和 settings 合并脚本使用 TypeScript，并通过 Bun 运行。
- hook 默认只输出提醒，不自动修改文件，不替代 workflow skills。
- 如果 `.claude/hooks/` 或 `.claude/scripts/` 不存在，可以创建。
- 如果 hook 文件或 `.claude/scripts/merge-hook-settings.ts` 已存在，不要覆盖，除非用户明确要求重置或同步。
- 不要手工覆盖 `.claude/settings.json`；必须通过 `merge-hook-settings.ts` 合并缺失的 hook 配置，保留已有 settings、permissions、env 与 hooks。
- 合并命令示例：`bun .claude/scripts/merge-hook-settings.ts --target .claude/settings.json --template <setup-workflow>/templates/claude-code/settings.json --mode missing-only --write`。
- 不要创建或修改 `.claude/settings.local.json`。
- 如果合并脚本报告 schema 冲突或无法安全合并，暂停并让用户确认。

### 8. 重建 docs 索引

老项目接入时，按 [docs-indexing.md](references/docs-indexing.md) 检查并补齐 `docs/**/index.md`。

### 9. 验证结果

完成前确认：

- `.workflow/AGENTS.md` 存在。
- `docs/project.md` 存在。
- `.workflow/intents.md` 存在。
- `.workflow/versions/index.md` 存在。
- `.workflow/templates/` 存在。
- `docs/AGENTS.md` 存在。
- `docs/index.md` 存在。
- `docs/templates/` 存在。
- 如启用 hook guardrails，`.claude/settings.json` 与 `.claude/hooks/` 已创建或安全合并。
- `CLAUDE.md` 与 `AGENTS.md` 包含治理加载区块。
- 如果存在老项目文档，`docs/` 各层目录有最新的 `index.md`。

## 退出条件

- `.workflow/` 与 `docs/` 双区结构可用。
- 两个区域各自有治理文件。
- 根入口文件会加载两个治理文件。
- `docs/` 索引机制可继续维护。
- 模板目录已就位。
- 如启用 hook guardrails，`.claude/` hook 配置已就位且不会覆盖本地私有配置。
- setup 结果有简短摘要，并说明仍需用户决定的事项。
