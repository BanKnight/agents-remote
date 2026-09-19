# agents-remote — 项目记忆入口

> 优化版 hapi：网页控制平面，远程管理服务器上的 Agent（Codex / Claude）会话与执行。Bun + React 19 + TanStack + Tailwind v4 monorepo（`web/` + `api/` + `packages/shared/`）。

## 启动纪律（每次开干前必做）

1. **恢复上下文**：SessionStart hook 自动注入 `.claude/handoff/current.md`；若未注入则手动读。
2. **看下一步**：`.claude/gtd/next-actions.md` 决定本次推进什么，确保实现环节不走偏。
3. **守底线**：`.claude/constitution.md` 是不可变红线；`.claude/rules/` 是可进化规则库。

## 行为指南（import，每次加载）

- @GUIDLINES.md
- @state-sync-principles.md
- @frontend-notes.md

## 目录索引

| 路径 | 作用 |
| --- | --- |
| `.claude/constitution.md` | 不可变核心价值观（六条底线） |
| `.claude/handoff/current.md` | 滚动最新状态（compact/启动时注入） |
| `.claude/gtd/` | GTD 任务方法论（inbox→projects→next-actions） |
| `.claude/rules/` | 可进化规则库（`/evolve` 更新；README 有索引） |
| `.claude/agents/` | 4 个审查 subagent（code/security/design/perf） |
| `.claude/skills/` | `/handoff` `/gtd` `/evolve` `/onboard` `/check-deps` |
| `docs/AGENTS.md` | 长期文档治理规则（进入 docs/ 前必须读取） |
| `docs/project.md` | 项目认知 big picture（渐进式补全） |
| `docs/design/DESIGN.md` | 设计系统唯一权威标尺（token + component variant） |
| `docs/runbooks/dev-services.md` | ar-dev 常驻服务启停流程（固定端口 43011/43012） |

## 关键约定

- **语言**：始终用中文交流；代码标识符保持原样。
- **确认后才动**：初始化、部署、删除、外发等不可逆动作前必须征得用户确认。
- **上下文不丢**：到达里程碑、阶段性收尾、或感知将 compact 时，主动 `/handoff save`。
- **质量门**：commit 前 pre-commit 全门禁（format:check / lint / typecheck / test，0 warning）；实现完成后经相关 reviewer subagent 审查（触发表见 `rules/agent-workflow.md`）。
- **供应链**：新增/升级依赖前先 `/check-deps`——发布 <7 天降级到次新，pre-alpha 换库优先（见 `rules/supply-chain.md`）。
- **安全边界**：Project-scoped 输入必须过 Project-safe resolver；系统命令一律 argv 数组；密钥不入库、不回显。
- **工具优先**：理解代码用 codegraph（`codegraph_explore`）；调研用 tvly；库文档用 Context7；验证用 DOM 几何硬数据（禁截图/vision 验证 UI）。
- **dev 服务**：web=prod build、api=dev，tmux `ar-*` 命名、固定端口，进程必须在 tmux 内管理（见 `rules/dev-environment.md`）。
- **文档沉淀**：工程教训 → `.claude/rules/`；产品/规格/设计知识 → `docs/`（遵循 `docs/AGENTS.md` 治理与索引规则）。
