# setup 执行边界

`setup-workflow` 只负责建立和更新工作流基础设施。

## 负责

- 初始化或更新 `.workflow/`。
- 初始化或更新 `docs/`。
- 创建或维护 `.workflow/AGENTS.md` 与 `docs/AGENTS.md`。
- 把治理文件加载规则注入根目录 `AGENTS.md` 和 `CLAUDE.md`。
- 创建或补齐 `.workflow/templates/` 与 `docs/templates/`。
- 按需为下游项目创建或更新 Claude Code hook guardrails：`.claude/settings.json`、`.claude/hooks/*.ts` 与 `.claude/scripts/*.ts`。
- 在老项目中根据现有 `docs/` 内容重建索引。

## 不负责

- 需求澄清。
- 产品或技术设计。
- roadmap 规划。
- 任务执行。
- 代码评审、测试或安全审查。
- 长期业务知识沉淀。
- 具体模板内容的最终设计。
- 用 hook 自动修改 workflow 或 docs 内容。
- 修改 `.claude/settings.local.json` 这类本地私有配置。

这些动作应由后续 workflow skills 或用户本地配置负责。
