# archive roadmap

本文件记录已经归档的 versions 索引。

活跃版本不写在这里；活跃版本只写在 `.workflow/roadmap.md`。

## 已归档 Versions

### version: v0.1-foundation-and-agent-research

- 归档时间：2026-05-24
- 完成结果：完成 Agent 接入方式调研、monorepo 服务边界和个人私有部署配置/认证基础；相关长期 WHAT/HOW/runbook 已沉淀到 docs。
- version 目标：先确定 Agent 接入路线，并建立第一轮 `web/api/shared`、配置、认证与同域部署路径等基础边界。
- verify 结论摘要：三个 changes 均有 `verify.md`，无未解决 CRITICAL；`configure-personal-app-settings` 为条件通过，Web/PWA 登录页体验转交后续 UI/PWA change。
- distill 结论摘要：已沉淀 Agent access、workspace/service boundary、frontend stack、agent runtime、personal app config、private access auth 和 personal deployment runbook 等长期文档。
- 包含 changes：
  - change-id：research-agent-access-options
    归档路径：.workflow/archive/changes/research-agent-access-options/
    verify：通过；无 CRITICAL/WARNING。
    distill：已沉淀 `docs/research/agent-access-options.md`、`docs/specs/agent-access/spec.md`、`docs/design/agent-session-model.md`、`docs/architecture/agent-runtime.md` 与相关 ADR。
  - change-id：setup-monorepo-service-boundaries
    归档路径：.workflow/archive/changes/setup-monorepo-service-boundaries/
    verify：通过；无 CRITICAL/WARNING。
    distill：已沉淀 `docs/specs/workspace-foundation/spec.md`、`docs/specs/service-access-boundary/spec.md`、`docs/architecture/monorepo-service-boundaries.md`、`docs/design/frontend-stack.md`。
  - change-id：configure-personal-app-settings
    归档路径：.workflow/archive/changes/configure-personal-app-settings/
    verify：条件通过；无 CRITICAL，Web/PWA 登录体验作为后续 UI/PWA change 输入。
    distill：已沉淀 `docs/specs/personal-app-config/spec.md`、`docs/specs/private-access-auth/spec.md`、`docs/runbooks/personal-deployment-configuration.md`。

### version: v0.2-project-console-shell

- 归档时间：2026-05-25
- 完成结果：完成 Project 目录模型、安全路径解析、登录后 Project 列表/创建/进入，以及移动端优先的深色 PWA 控制台外壳；相关长期 WHAT/HOW 已沉淀到 docs。
- version 目标：交付登录后的 Project 列表、Project 创建/进入、安全路径解析，以及响应式 PWA 控制台外壳。
- verify 结论摘要：两个 changes 均有 `verify.md`，结论通过，无未解决 CRITICAL/WARNING。
- distill 结论摘要：已沉淀 Project 模型、安全路径、PWA console shell、Project console navigation、console shell/frontend stack/project big picture 等长期文档。
- 包含 changes：
  - change-id：implement-project-model-and-safe-paths
    归档路径：.workflow/archive/changes/implement-project-model-and-safe-paths/
    verify：通过；无 CRITICAL/WARNING。
    distill：已沉淀 `docs/specs/project-model/spec.md`、`docs/specs/project-safe-paths/spec.md`、`docs/architecture/project-boundary.md`、`docs/architecture/monorepo-service-boundaries.md`、`docs/project.md`。
  - change-id：build-responsive-pwa-console-shell
    归档路径：.workflow/archive/changes/build-responsive-pwa-console-shell/
    verify：通过；无 CRITICAL/WARNING。
    distill：已沉淀 `docs/specs/pwa-console-shell/spec.md`、`docs/specs/project-console-navigation/spec.md`、`docs/design/console-shell.md`，并更新 `docs/design/frontend-stack.md`、`docs/project.md`、`docs/specs/index.md` 与 `docs/design/index.md`。
