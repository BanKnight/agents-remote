# docs 治理规则模板

本文件定义 `docs/` 的长期文档治理规则。

## 定位

- `docs/` 是长期沉淀区，用于保存已验证、可复用、可评审的主线知识。
- 参与需求讨论、roadmap、spec、design、implementation、verify 或 distill 前，应先读取 `docs/project.md`，建立项目 big picture。
- `docs/project.md` 是项目认知入口，不是按需附加材料；即使后续只处理局部任务，也应先理解项目整体定位、领域概念与长期准则。
- 长期 WHAT 放入 `docs/specs/`；长期 design 放入 `docs/design/`；系统级 HOW、架构边界、ADR 放入 `docs/architecture/`；操作手册放入 `docs/runbooks/`。
- 运行态意图、活跃 roadmap、单次 change 过程、任务执行状态和 verify 证据不要放在 `docs/`，应放在 `.workflow/`。
- `docs/` 不直接接收未验证的 change design；长期沉淀应由 `distill-change` 在验证后完成。

## 建议结构

```text
docs/
├── AGENTS.md                           # docs 治理规则，进入 docs 前必须读取
├── project.md                          # 项目认知 big picture，渐进式补全
├── index.md                            # docs 本层索引，只描述直接子目录和直接文档
├── templates/                          # 长期文档模板目录
├── specs/                              # 长期 WHAT：能力规格、行为契约、可验证需求
├── design/                             # 长期 design：从运行态 design 提炼出的设计内容
├── architecture/                       # 长期 HOW：系统级架构、模块边界、集成模式、ADR
└── runbooks/                           # 运维、故障、迁移、发布等操作手册
```

## 写入边界

### `docs/project.md`

- 保存项目认知 big picture：项目定位、用户场景、领域概念、长期开发准则。
- 本文件渐进式补全，不要求一次完整。
- change 完成并通过 verify 后，应检查是否有长期项目认知需要提炼到这里。
- 不记录单次需求、任务状态或临时实现细节。

### `docs/specs/`

- 保存长期 WHAT，即系统能力的主线行为契约。
- 由 `distill-change` 从 `.workflow/changes/<change-id>/specs/` 回写。
- 不存放实现方案、任务拆解或临时 change 过程。

### `docs/design/`

- 保存长期 design 内容，即从已验证 change design 中提炼出的可复用设计结论。
- 由 `distill-change` 从 change design、实现结果和 verify 证据中提炼。
- 不直接复制未验证的 `.workflow/changes/<change-id>/design/`。

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

旧项目接入本工作流时，如果 `docs/` 中已有文档，应检查是否需要重建索引。

以下情况需要重建：

- 缺少某层目录的 `index.md`。
- `index.md` 未列出本层直接子目录。
- `index.md` 未列出本层直接 Markdown 文档。
- 文档条目缺少一句话描述。

重建索引时：

- Agent 必须逐个阅读文档内容，再为每个文档写一句话描述。
- 脚本只能用于列出结构，不能自动生成描述。
- 如果文档内容过长，可以分段阅读，但不能只看文件名。

## 与 .workflow 的关系

- `.workflow/` 负责运行态：intents、roadmap、changes、tasks、verify、archive。
- `docs/` 负责长期态：project big picture、主线 spec、长期 design、architecture、runbooks。
- 从 `.workflow/` 进入 `docs/` 的内容必须经过对应命令：`distill-change` 或 `describe-project`。
- 归档材料保留在 `.workflow/archive/`，不要为了历史追溯把完整 archive 复制到 `docs/`。

## 禁止事项

- 不要把活跃 roadmap 写进 `docs/`。
- 不要把单次 change 的中间过程直接写进 `docs/`。
- 不要用 `docs/` 替代 `.workflow/archive/`。
- 不要让脚本根据文件名猜测 index 描述。
