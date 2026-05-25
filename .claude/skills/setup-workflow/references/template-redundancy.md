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

## 技能、模板与 reference 对齐规则

优化 workflow skill 时，必须同步检查三类落点：

1. 技能本体 `SKILL.md`：定义执行规则、输入输出、完成条件和边界。
2. 运行态/长期模板：`.workflow/templates/`、`docs/templates/`、以及 `setup-workflow/templates/` 中的原始种子，确保后续生成 artifact 时结构承载新规则。
3. references：对应 skill 的 `references/` 文件，确保方法论、最佳实践和检查清单不会与 `SKILL.md` 冲突。

对齐原则：

- 通用 workflow skill 和 setup-workflow 内置模板应保持技术栈无关，只写常规场景和最佳实践类别。
- 项目特定目录、服务名、端口、框架组合或运行方式应写入项目本地 `docs/project.md`、runbook 或项目治理文档。
- 如果只修改 `SKILL.md` 而未同步模板，后续生成的 artifact 会退回旧结构；如果只改模板而未同步 reference，后续执行判断会漂移。



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
