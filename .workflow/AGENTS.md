# .workflow 治理规则模板

本文件定义 `.workflow/` 的运行态与流程态治理规则。

## 定位

- `.workflow/` 是运行态区域，用于保存尚未归档的意图池、活跃 roadmap、当前 changes、执行证据与归档上下文。
- `.workflow/roadmap.md` 是 workflow big picture，用于理解当前 versions/changes 队列和当前焦点；不维护单个 change 的阶段状态，也不保存活跃 change 的原始意图全文。
- 项目认知 big picture 放在 `docs/project.md`，不要放在 `.workflow/`。
- `.workflow/` 不保存长期知识基线；长期规格、长期设计、架构、ADR、runbooks 等应在验证后沉淀到 `docs/`。
- 需要理解项目 big picture 时，不要只读单个文件，应按需读取 `docs/`、`.workflow/roadmap.md`、`.workflow/changes/` 与 `.workflow/archive/`。

## 固定结构

```text
.workflow/
├── AGENTS.md                           # .workflow 治理规则，进入 .workflow 前必须读取
├── intents.md                          # 尚未进入 roadmap 的原始意图池
├── roadmap.md                          # 当前活跃 versions/changes 索引
├── templates/                          # 运行态模板文件
│   ├── intents.md
│   ├── roadmap.md
│   └── changes/
│       ├── intents.md                  # change 来源记录模板
│       ├── progress.md                 # change 阶段进度模板
│       ├── specs/
│       │   └── spec.md                 # change spec 模板
│       ├── design/                     # change design 子域模板
│       ├── plan.md                     # change plan 模板
│       └── tasks.md                    # change tasks 模板
├── changes/                            # 当前未归档 changes
│   └── <change-id>/                    # 语义化变更标识，不是数字编号
│       ├── intents.md                  # 本 change 的来源意图或规划来源，保存完整原始意图
│       ├── progress.md                 # 本 change 的阶段、局部阻塞和进展记录
│       ├── specs/                      # 本 change 的行为契约增量
│       ├── design/                     # 本 change 的 how 设计材料
│       ├── plan.md                     # 本 change 的实现计划
│       ├── tasks.md                    # 本 change 的实施清单
│       ├── verify.md                   # 本 change 的一致性证据
│       └── artifacts/                  # 截图、基准、测试证据等
└── archive/                            # 已归档 version 与 change 上下文
    ├── roadmap.md                      # 已归档 versions 索引
    └── changes/                        # 已归档 changes 的完整上下文
```

## 结构职责

- `intents.md` 只作为进入 roadmap 前的意图池。
- `roadmap.md` 只作为当前活跃 versions/changes 的索引和当前焦点入口，不是历史总账，也不是 change 状态表。
- `changes/<change-id>/intents.md` 保存完整原始意图和规划来源；roadmap 只引用该路径，不复制原文。
- `changes/<change-id>/progress.md` 保存该 change 当前阶段、局部阻塞和进展记录；不保存下一步技能。
- `step-change` 是推荐的 change 推进入口：它读取 roadmap 当前焦点或指定 change 的 `progress.md`，独占维护“当前阶段 → 阶段技能”的路由，并在产物检查通过后推进 `progress.md`；当当前焦点 change 完成后，同步更新 roadmap 的“当前焦点 / 下一步”入口到下一个合适 change；如果该 change 是所在 version 的最后一个已完成 change，应触发 `archive-version` 做整版本归档检查，不在 roadmap 维护单个 change 阶段状态。
- `templates/` 保存运行态产物模板，命令生成文件时应优先使用项目本地模板。
- `changes/<change-id>/` 保存单个未归档 change 的完整运行态上下文。
- `archive/` 保存已归档 version 与 change 上下文。
- `<change-id>` 必须是语义化变更标识，不是数字编号。

## 阶段产物规则

- `describe-project` 可在任意阶段更新 `docs/project.md`，用于补全项目认知 big picture。
- `clarify-intents` 只更新 `.workflow/intents.md`。
- `plan-roadmap` 更新 `.workflow/roadmap.md`，建立或更新 `.workflow/changes/<change-id>/intents.md` 与 `progress.md`，并从 `.workflow/intents.md` 移出已分配意图。
- `step-change` 读取 roadmap 当前焦点或指定 change 的 `progress.md`，只负责判断当前阶段、调用对应阶段技能、检查产物并更新 `progress.md`；如果目标 change 完成且仍是 roadmap 当前焦点，可同步更新 roadmap 的“当前焦点 / 下一步”；如果同一 version 下所有 changes 已完成，应主动触发 `archive-version`，不要只停留在“可归档”提示；不直接编写 spec/design/plan/tasks/verify/docs 正文。
- `specify-change` 只更新 `.workflow/changes/<change-id>/specs/`，用于明确 what。
- `design-change` 只更新 `.workflow/changes/<change-id>/design/`，用于明确 how。
- `plan-change` 补齐 `.workflow/changes/<change-id>/plan.md` 与 `tasks.md`，其中 `plan.md` 必须提供实现上下文，并按需说明长期 docs 使用情况。
- `implement-change`、`verify-change` 分别补齐实现状态与 verify 证据；涉及 UI、浏览器、CLI/TUI、终端式交互、实时流、可视化报表或其他用户可见能力时，`verify-change` 必须主动采集截图、trace、日志、录屏、自动化测试报告或等价 artifact，并在 `verify.md` 中记录路径或跳过理由。
- `distill-change` 才能把已验证的 change specs、design、implementation 经验沉淀到 `docs/specs/`、`docs/design/`、`docs/architecture/` 与 `docs/runbooks/`。
- `archive-version` 以 version 为单位归档，归档后从活跃 roadmap 移入 archive。

## 禁止事项

- 不要把长期知识直接写进 `.workflow/`。
- 不要在未进入 roadmap 的情况下创建 change 产物。
- 不要把 how、任务或实现细节写入 spec。
- 不要在 verify 前把运行态 design 直接复制进 `docs/` 当作长期结论。
- 不要用数字编号作为 change-id。
- 不要绕过 `progress.md` 在 roadmap 中维护单个 change 的阶段状态；不要在 `progress.md`、roadmap 或阶段技能中重复维护下一步技能。
