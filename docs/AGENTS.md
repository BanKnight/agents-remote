# docs 治理规则模板

本文件定义 `docs/` 的长期文档治理规则。

## 定位

- `docs/` 是长期沉淀区，用于保存已验证、可复用、可评审的主线知识。
- 参与需求讨论、spec、design、implementation、verify 或文档沉淀前，应先读取 `docs/project.md`，建立项目 big picture。
- `docs/project.md` 是项目认知入口，不是按需附加材料；即使后续只处理局部任务，也应先理解项目整体定位、领域概念与长期准则。
- 长期 WHAT 放入 `docs/specs/`；长期 design 放入 `docs/design/`；系统级 HOW、架构边界、ADR 放入 `docs/architecture/`；操作手册放入 `docs/runbooks/`。
- 运行态（任务队列、session 状态、执行过程、verify 证据）不要放在 `docs/`，应放在 `.claude/`（gtd / handoff）。
- `docs/` 不直接接收未验证的临时设计；长期沉淀应在实现验证完成后进行，工程教训另行走 `.claude/rules/`（见 `/evolve`）。

## 建议结构

```text
docs/
├── AGENTS.md                           # docs 治理规则，进入 docs 前必须读取
├── project.md                          # 项目认知 big picture，渐进式补全
├── index.md                            # docs 本层索引，只描述直接子目录和直接文档
├── templates/                          # 长期文档模板目录
├── specs/                              # 长期 WHAT：能力规格、行为契约、可验证需求
├── design/                             # 长期 design：从验证过的设计与实现中提炼的设计结论
├── architecture/                       # 长期 HOW：系统级架构、模块边界、集成模式、ADR
└── runbooks/                           # 运维、故障、迁移、发布等操作手册
```

## 写入边界

### `docs/project.md`

- 保存项目认知 big picture：项目定位、用户场景、领域概念、稳定结构导航、技术栈、架构边界、易错点、开发/验证准则、重要参考文档入口与长期术语。
- 本文件渐进式补全，不要求一次完整。
- `docs/project.md` 应提供足够线索帮助人或 Agent 继续探索，不维护源码文件清单、单次需求、任务状态、排期、临时实现细节或文档治理流程。

### `docs/specs/`

- 保存长期 WHAT，即系统能力的主线行为契约。
- 在对应能力实现并验证后写入或更新，保持与真实行为一致。
- 不存放实现方案、任务拆解或临时过程记录。

### `docs/design/`

- 保存长期 design 内容，即从已验证的设计与实现结果中提炼出的可复用设计结论。
- 不直接复制未验证的临时设计；写入前应确认对应实现已落地并通过验证。

### `docs/architecture/`

- 保存系统级长期 HOW，包括系统概览、模块边界、集成模式、UI 架构、ADR 等。
- ADR 可以放在 `docs/architecture/adr/`。
- 只有经过验证、具备长期复用价值的架构决策才应进入这里。

### `docs/runbooks/`

- 保存运维、故障、迁移、发布等操作手册。
- runbook 应面向可执行操作，不记录临时讨论过程。

### `docs/templates/`

- 保存长期文档模板。
- 模板可由项目定制；后续写长期 docs 时应优先使用项目本地模板。

## 索引规则

- `docs/` 下每一层目录都应有自己的 `index.md`。
- `index.md` 只描述当前所在层级：直接子目录与直接文档。
- 不要级联展开父目录或子孙目录内容。
- 每个文档条目应包含一句话描述。
- 一句话描述必须由 Agent 阅读文档内容后编写，不能由脚本或文件名猜测生成。
- 新增、修改、移动或删除 `docs/` 文档时，应同步更新该文档所在目录的 `index.md`。

## 旧项目索引重建

旧项目接入本治理规则时，如果 `docs/` 中已有文档，应检查是否需要重建索引。

以下情况需要重建：

- 缺少某层目录的 `index.md`。
- `index.md` 未列出本层直接子目录。
- `index.md` 未列出本层直接 Markdown 文档。
- 文档条目缺少一句话描述。

重建索引时：

- Agent 必须逐个阅读文档内容，再为每个文档写一句话描述。
- 脚本只能用于列出结构，不能自动生成描述。
- 如果文档内容过长，可以分段阅读，但不能只看文件名。

## 与运行态的关系

- `.claude/gtd/` + `.claude/handoff/` 负责运行态：任务捕获与推进、session 上下文接力。
- `docs/` 负责长期态：project big picture、主线 spec、长期 design、architecture、runbooks。
- 进入 `docs/` 的沉淀必须遵循本文件的写入边界与索引规则。

## 禁止事项

- 不要把运行态任务队列、session 状态或执行过程写进 `docs/`。
- 不要把未验证的临时设计直接写进 `docs/`。
- 不要让脚本根据文件名猜测 index 描述。
