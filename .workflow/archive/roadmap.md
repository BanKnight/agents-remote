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

### version: v0.3-session-runtime-quality

- 归档时间：2026-05-25
- 完成结果：完成 Agent/Terminal Session 运行态边界、Claude/Codex provider 入口、移动端 Session Detail 交互，以及真实 tmux/WebSocket Terminal E2E 质量基线；相关长期 WHAT/HOW/runbook 已沉淀到 docs。
- version 目标：跑通 Terminal/Agent Session 的运行态语义、移动端交互、Claude/Codex provider 入口，并建立覆盖 `web + api + runtime` 的 E2E 质量基线。
- verify 结论摘要：四个 changes 均有 `verify.md`，结论通过，无未解决 CRITICAL/WARNING。
- distill 结论摘要：已沉淀 session runtime、agent provider experience、mobile session interaction、E2E quality baseline 等长期 specs/design/architecture/runbook 文档。
- 包含 changes：
  - change-id：design-session-runtime-boundaries
    归档路径：.workflow/archive/changes/design-session-runtime-boundaries/
    verify：通过；无未解决 CRITICAL。
    distill：已沉淀 `docs/specs/session-runtime/spec.md`、`docs/design/session-runtime-boundaries.md`、`docs/architecture/session-runtime.md`、`docs/project.md`。
  - change-id：implement-agent-provider-experience
    归档路径：.workflow/archive/changes/implement-agent-provider-experience/
    verify：通过；无 CRITICAL/WARNING。
    distill：已沉淀 `docs/specs/agent-provider-experience/spec.md`、`docs/design/agent-provider-experience.md`、`docs/architecture/agent-runtime.md`。
  - change-id：implement-mobile-session-interaction
    归档路径：.workflow/archive/changes/implement-mobile-session-interaction/
    verify：通过；无 CRITICAL/WARNING。
    distill：已沉淀 `docs/specs/mobile-session-interaction/spec.md`、`docs/design/mobile-session-interaction.md`、`docs/design/frontend-stack.md`。
  - change-id：setup-e2e-quality-baseline
    归档路径：.workflow/archive/changes/setup-e2e-quality-baseline/
    verify：通过；无 CRITICAL/WARNING。
    distill：已沉淀 `docs/specs/e2e-quality-baseline/spec.md`、`docs/architecture/e2e-quality-baseline.md`、`docs/runbooks/e2e-quality-baseline.md`。

### version: v0.4-project-inspection-tools

- 归档时间：2026-05-25
- 完成结果：完成 Project 内只读文件浏览/预览和只读 Git diff 查看能力，让远程观察不仅限于会话输出；相关长期 WHAT/HOW/architecture 已沉淀到 docs。
- version 目标：在 Project 内提供只读文件浏览/预览和只读 Git diff 查看能力，让远程观察不仅限于会话输出。
- verify 结论摘要：两个 changes 均有 `verify.md`，结论通过，无未解决 CRITICAL/WARNING。
- distill 结论摘要：已沉淀 File Browser preview 与 Git diff viewer 的长期 specs/design/architecture 文档，并同步 docs 索引。
- 包含 changes：
  - change-id：implement-file-browser-preview
    归档路径：.workflow/archive/changes/implement-file-browser-preview/
    verify：通过；无 CRITICAL/WARNING。
    distill：已沉淀 `docs/specs/file-browser-preview/spec.md`、`docs/design/file-browser-preview.md`、`docs/architecture/file-browser-preview.md`。
  - change-id：implement-git-diff-viewer
    归档路径：.workflow/archive/changes/implement-git-diff-viewer/
    verify：通过；无 CRITICAL/WARNING。
    distill：已沉淀 `docs/specs/git-diff-viewer/spec.md`、`docs/design/git-diff-viewer.md`、`docs/architecture/git-diff-viewer.md`。
