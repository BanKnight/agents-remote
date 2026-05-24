# roadmap

本文件是当前开发路线图：只记录仍在开发队列中的 versions、changes 队列和当前焦点。

已归档 version 不写在这里；归档后移动到 `.workflow/archive/roadmap.md`。

## 当前焦点

<!-- 当前正在推进的 version/change，用于让 Agent 快速知道当前工作入口。具体阶段和下一步读取 change 自己的 progress.md。 -->

- 当前 version：v0.1-foundation-and-agent-research
- 当前 change：configure-personal-app-settings
- change 路径：.workflow/changes/configure-personal-app-settings/
- progress：.workflow/changes/configure-personal-app-settings/progress.md

## 活跃 Versions

<!--
每个 version 表示当前要开发的一组 changes。
roadmap 中列出的每个 change 都必须对应 `.workflow/changes/<change-id>/`。
roadmap 不保存活跃 change 的原始意图全文、不维护 change 阶段状态；完整来源见 change 的 intents.md，阶段状态见 change 的 progress.md。
-->

### version: v0.1-foundation-and-agent-research

- 目标：先确定 Agent 接入路线，并建立第一轮 `web/api/shared`、配置、认证与同域部署路径等基础边界。
- 范围：
  - 做：Agent 接入方式调研；monorepo 与 `web/api/packages/shared` 边界；Bun、Tailwind、同域 `/api` 与 Vite proxy 基础；个人部署配置、单密码与 token 访问保护。
  - 不做：真实 Claude/Codex Agent Runtime 完整接入；多个 server/hub 管理；Cloudflare Tunnel 自动管理；文件/Git 工具与精细 UI 打磨。
- changes：
  - change-id：research-agent-access-options
    目标：调研 Agent 接入路线，并把结论转化为后续 Agent Runtime/API 设计约束。
    来源：用户意图
    路径：.workflow/changes/research-agent-access-options/
    intents：.workflow/changes/research-agent-access-options/intents.md
    progress：.workflow/changes/research-agent-access-options/progress.md
    依赖：无
  - change-id：setup-monorepo-service-boundaries
    目标：建立 `web/api/packages/shared` 的 monorepo、服务边界和同域 `/api` 部署约束。
    来源：用户意图
    路径：.workflow/changes/setup-monorepo-service-boundaries/
    intents：.workflow/changes/setup-monorepo-service-boundaries/intents.md
    progress：.workflow/changes/setup-monorepo-service-boundaries/progress.md
    依赖：无
  - change-id：configure-personal-app-settings
    目标：建立个人私有部署所需的配置、认证、token 访问保护和运行目录规则。
    来源：用户意图
    路径：.workflow/changes/configure-personal-app-settings/
    intents：.workflow/changes/configure-personal-app-settings/intents.md
    progress：.workflow/changes/configure-personal-app-settings/progress.md
    依赖：setup-monorepo-service-boundaries

### version: v0.2-project-console-shell

- 目标：交付登录后的 Project 列表、Project 创建/进入、安全路径解析，以及响应式 PWA 控制台外壳。
- 范围：
  - 做：`PROJECTS_ROOT` 一级目录 project 模型；新建/读取 project；project 路由参数；移动端优先的深色 PWA 控制台；原型优先的布局与信息架构。
  - 不做：真实 Agent Runtime 接入；文件编辑/上传/删除；Git 写操作；多 server/hub；精细动效和像素级还原。
- changes：
  - change-id：implement-project-model-and-safe-paths
    目标：定义 Project 目录模型，并提供所有 project 内能力共享的 `PROJECTS_ROOT` 安全路径解析。
    来源：用户意图
    路径：.workflow/changes/implement-project-model-and-safe-paths/
    intents：.workflow/changes/implement-project-model-and-safe-paths/intents.md
    progress：.workflow/changes/implement-project-model-and-safe-paths/progress.md
    依赖：configure-personal-app-settings
  - change-id：build-responsive-pwa-console-shell
    目标：建立移动端优先的深色 PWA 控制台外壳，并为 Agent/Terminal/Git/Files 入口提供信息架构。
    来源：用户意图
    路径：.workflow/changes/build-responsive-pwa-console-shell/
    intents：.workflow/changes/build-responsive-pwa-console-shell/intents.md
    progress：.workflow/changes/build-responsive-pwa-console-shell/progress.md
    依赖：setup-monorepo-service-boundaries, implement-project-model-and-safe-paths

### version: v0.3-session-runtime-quality

- 目标：跑通 Terminal/Agent Session 的运行态语义、移动端交互、Claude/Codex provider 入口，并建立覆盖 `web + api + runtime` 的 E2E 质量基线。
- 范围：
  - 做：Agent Session 与 Terminal Session 分层；tmux/xterm/WebSocket 第一轮链路；运行态 metadata；重连和关闭语义；移动端输入/快捷键；Claude/Codex provider 表达；真实 Terminal smoke E2E。
  - 不做：跨服务器重启恢复；完整 React 原生 Agent UI 化；Terminal 完整日志持久化；快捷键配置界面；真实 AI CLI 依赖的 E2E。
- changes：
  - change-id：design-session-runtime-boundaries
    目标：定义 Agent Session 与 Terminal Session 的运行态边界、生命周期、metadata 和重连/关闭语义。
    来源：用户意图
    路径：.workflow/changes/design-session-runtime-boundaries/
    intents：.workflow/changes/design-session-runtime-boundaries/intents.md
    progress：.workflow/changes/design-session-runtime-boundaries/progress.md
    依赖：research-agent-access-options, implement-project-model-and-safe-paths, configure-personal-app-settings
  - change-id：implement-agent-provider-experience
    目标：在统一 Agent Session 语义下表达 Claude/Codex provider 入口、运行实例和历史会话恢复方向。
    来源：用户意图
    路径：.workflow/changes/implement-agent-provider-experience/
    intents：.workflow/changes/implement-agent-provider-experience/intents.md
    progress：.workflow/changes/implement-agent-provider-experience/progress.md
    依赖：research-agent-access-options, design-session-runtime-boundaries
  - change-id：implement-mobile-session-interaction
    目标：实现 Agent/Terminal 详情页的移动端终端显示、输入辅助层、快捷键和底部区域展开收起体验。
    来源：用户意图
    路径：.workflow/changes/implement-mobile-session-interaction/
    intents：.workflow/changes/implement-mobile-session-interaction/intents.md
    progress：.workflow/changes/implement-mobile-session-interaction/progress.md
    依赖：design-session-runtime-boundaries, build-responsive-pwa-console-shell
  - change-id：setup-e2e-quality-baseline
    目标：建立覆盖登录、Project、Terminal Session、WebSocket/终端交互的真实依赖 E2E 质量基线。
    来源：用户意图
    路径：.workflow/changes/setup-e2e-quality-baseline/
    intents：.workflow/changes/setup-e2e-quality-baseline/intents.md
    progress：.workflow/changes/setup-e2e-quality-baseline/progress.md
    依赖：design-session-runtime-boundaries

### version: v0.4-project-inspection-tools

- 目标：在 Project 内提供只读文件浏览/预览和只读 Git diff 查看能力，让远程观察不仅限于会话输出。
- 范围：
  - 做：目录浏览、文本预览、图片预览、文件大小限制、隐藏文件展示、工作区/staged diff 文件列表与单文件 unified diff。
  - 不做：文件编辑、删除、重命名、上传、下载；Git 写操作；复杂 diff 筛选；PC 双栏 diff 增强。
- changes：
  - change-id：implement-file-browser-preview
    目标：提供 Project 内只读目录浏览、文本预览和手机适配图片预览。
    来源：用户意图
    路径：.workflow/changes/implement-file-browser-preview/
    intents：.workflow/changes/implement-file-browser-preview/intents.md
    progress：.workflow/changes/implement-file-browser-preview/progress.md
    依赖：implement-project-model-and-safe-paths, build-responsive-pwa-console-shell
  - change-id：implement-git-diff-viewer
    目标：提供 Project 内工作区和 staged 变更文件列表，以及单文件 unified diff 只读查看。
    来源：用户意图
    路径：.workflow/changes/implement-git-diff-viewer/
    intents：.workflow/changes/implement-git-diff-viewer/intents.md
    progress：.workflow/changes/implement-git-diff-viewer/progress.md
    依赖：implement-project-model-and-safe-paths, build-responsive-pwa-console-shell

## 暂缓 / 放弃

<!--
记录已从 `.workflow/intents.md` 处理、但不进入活跃 roadmap 的意图。
这些意图不再留在 `.workflow/intents.md`。
-->

- （无）

## 阻塞项

<!-- 只记录跨 change / 跨 version 的全局阻塞；单个 change 的阻塞写入该 change 的 progress.md。 -->

- Agent Runtime/API 的最终形态不能在 `research-agent-access-options` 完成前锁定；后续 `design-session-runtime-boundaries` 中的 Agent provider 部分和 `implement-agent-provider-experience` 必须消费该调研结论。

## 下一步

<!-- 当前全局最应该推进的 change；具体阶段和命令读取该 change 的 progress.md。 -->

- 继续推进 `.workflow/changes/configure-personal-app-settings/`；具体阶段和下一步技能见 `.workflow/changes/configure-personal-app-settings/progress.md`。
