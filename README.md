# claude-template

用于快速初始化 Claude Code 工作流的模板仓库。

这个仓库把一套面向 AI 协作开发的流程、技能与文档治理结构预先组织好，适合在新项目中直接作为起点使用。它强调把临时执行状态和长期知识沉淀分开管理，让需求、设计、实现、验证和归档都有明确位置。

## 适用场景

- 新项目需要一套可复制的 Claude Code 协作流程。
- 团队希望把需求、路线图、设计、实现任务和验证证据串成固定链路。
- 项目需要区分运行态材料与长期文档，避免把临时过程混入长期知识库。
- 想在多个仓库中复用同一套 workflow skills 和治理规则。

## 工作流链路

```text
Intent → Roadmap → Specify → Design → Build → Verify → Distill → Archive
```

对应的主要技能包括：

| 阶段 | Skill | 作用 |
|---|---|---|
| 帮助入口 | `help-workflow` | 说明工作流能力并推荐下一步 |
| 项目初始化 | `setup-workflow` | 初始化或更新 `.workflow/` 与 `docs/` 双区结构 |
| 项目认知 | `describe-project` | 渐进式补全 `docs/project.md` |
| 意图澄清 | `clarify-intents` | 记录尚未进入 roadmap 的原始意图 |
| 路线规划 | `plan-roadmap` | 编排 versions / changes，并创建 change 骨架 |
| 行为规格 | `specify-change` | 产出可验证的 WHAT |
| 方案设计 | `design-change` | 产出 HOW，包括产品、前端、架构、API、数据等子域 |
| 实施计划 | `plan-change` | 拆解实现计划与任务清单 |
| 实现执行 | `implement-change` | 按任务实施变更并更新任务状态 |
| 验证验收 | `verify-change` | 核对实现与 spec / design / tasks 的一致性 |
| 知识沉淀 | `distill-change` | 将已验证结论沉淀到长期 docs |
| 版本归档 | `archive-version` | 以 version 为单位冻结并归档上下文 |

## 目录结构

```text
.
├── .claude/skills/        # Claude Code workflow skills
├── .workflow/             # 运行态：意图池、roadmap、活跃 changes、验证证据和归档
├── docs/                  # 长期文档：项目认知、spec、design、architecture、runbooks
├── CLAUDE.md              # Claude Code 项目入口指令
├── AGENTS.md              # Agent 协作说明
└── GUIDLINES.md           # 项目行为规范
```

核心分区原则：

- `.workflow/` 保存运行态材料，例如当前 intents、roadmap、change plan、tasks、verify 和 archive。
- `docs/` 保存长期沉淀材料，例如项目认知、长期规格、长期设计、架构决策和 runbook。
- change 通过 verify 后，才由 `distill-change` 把可复用结论沉淀到 `docs/`。

## 使用方式

### 1. 从模板创建仓库

在 GitHub 仓库页面点击 **Use this template**，创建你的项目仓库。

### 2. 在新项目中打开 Claude Code

进入新仓库后启动 Claude Code，让它读取仓库内的 `CLAUDE.md`、`.workflow/AGENTS.md` 和 `docs/AGENTS.md`。

### 3. 初始化或更新工作流结构

如果新项目需要重新生成或修复 workflow 结构，可以使用：

```text
/setup-workflow
```

### 4. 开始记录和推进需求

常见起步方式：

```text
/describe-project
/clarify-intents
/plan-roadmap
```

之后按 change 依次进入：

```text
/specify-change
/design-change
/plan-change
/implement-change
/verify-change
/distill-change
/archive-version
```

## 设计原则

- **运行态与长期态分离**：执行过程留在 `.workflow/`，长期知识进入 `docs/`。
- **先 WHAT 后 HOW**：先通过 spec 明确行为契约，再进入 design 和 implementation。
- **验证后再沉淀**：未验证的 change design 不直接进入长期 docs。
- **语义化 change-id**：change 使用可读语义标识，不使用纯数字编号。
- **模板可重复应用**：`setup-workflow` 保留可重新执行的结构治理能力。

## 参考方向

本模板借鉴并整理了多个 workflow / spec / skill 项目的实践，目标不是替代项目自身工程规范，而是提供一个可复制、可演进的 Claude Code 协作骨架。

## 本地服务与部署路径

本项目第一轮保留 `web` 与 `api` 两个本机服务边界：

- `web`：前端控制台服务，开发端口默认 `3000`。
- `api`：后端控制面服务，开发端口默认 `3001`。
- 对外统一入口由部署层提供，应用自身不创建或管理 Cloudflare Tunnel、域名或外部认证资源。

推荐的同域路径转发形态：

```text
/api/*  -> http://127.0.0.1:3001/api/*
/*      -> http://127.0.0.1:3000/*
```

WebSocket 也走 `/api` 前缀，部署层需要支持 upgrade 转发：

```text
/api/ws/* -> ws://127.0.0.1:3001/api/ws/*
```

开发环境中，`web` 通过 Vite dev proxy 将 `/api` HTTP 与 WebSocket 请求转发到本机 `api`，因此前端代码默认使用相对 `/api` 路径，不要求普通用户手动输入 API 地址。

## License

请根据你的组织或项目需要补充许可证。
