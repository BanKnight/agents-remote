# 模板冗余规则

`setup-workflow` 的模板冗余关系是：

```text
setup-workflow 内置模板 → 项目本地 templates/ 可编辑副本
```

内置模板是原始种子；项目本地模板是复制到项目里的可编辑副本。

这样设计的目的：

- 用户可以直接修改项目本地 `templates/` 来适配自己的项目。
- 后续 workflow 执行时优先使用项目本地模板，减少 Agent 临时发挥。
- 命令原始模板保持稳定，不因单个项目定制而被污染。

不要把“冗余”解释成运行态文件和模板文件之间的重复。

## Claude Code hook 模板

Claude Code hook guardrails 也使用 setup-workflow 的内置模板作为原始种子，但它们不是项目本地 `.workflow/templates/` 或 `docs/templates/` 的一部分。

对应关系是：

```text
setup-workflow/templates/claude-code/settings.json          → .claude/settings.json
setup-workflow/templates/claude-code/hooks/*.ts              → .claude/hooks/*.ts
setup-workflow/templates/claude-code/scripts/*.ts            → .claude/scripts/*.ts
```

规则：

- `templates/claude-code/` 是 hook、Claude Code harness 配置和 settings 合并脚本的模板源。
- 生成目标是下游项目的 `.claude/`。
- `.workflow/templates/` 只保存 workflow artifact 模板。
- `docs/templates/` 只保存长期文档模板。
- setup 不应修改 `.claude/settings.local.json`。
- 已存在的 `.claude/settings.json`、`.claude/hooks/*.ts` 与 `.claude/scripts/*.ts` 应保留用户修改，只补齐缺失项或在用户明确要求时同步。

## 当前策略

当前提供基础提醒型 Claude Code hook 模板；下游项目可在生成后的 `.claude/hooks/` 中按项目需要调整规则。
