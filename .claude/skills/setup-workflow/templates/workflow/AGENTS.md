# .workflow 治理规则模板

本文件定义 `.workflow/` 的运行态与流程态治理规则。

## 定位

- `.workflow/` 是运行态区域，用于保存尚未归档的意图池、活跃 version/change 队列、change 执行上下文、执行证据、version 内共享材料与归档上下文。
- `.workflow/intents.md` 是进入版本规划前的全局原始意图池。
- `.workflow/versions/index.md` 是当前活跃 roadmap 入口，用于理解当前 versions/changes 队列、当前焦点、暂缓/放弃和全局阻塞；不维护单个 change 的阶段状态，也不保存活跃 change 的完整上下文。
- `.workflow/versions/<version>/` 是单个活跃 version 的运行态边界；同一 version 内多个 changes 需要共享的运行态材料放在该 version 的 `shared/` 下。
- `.workflow/versions/<version>/changes/<change-id>/context.md` 是单个 change 的看板上下文入口，用于说明 change 为什么存在、承接了哪些来源、当前已知边界是什么，以及如何读写共享材料。
- 项目认知 big picture 放在 `docs/project.md`，不要放在 `.workflow/`。
- `.workflow/` 不保存长期知识基线；长期规格、长期设计、架构、ADR、runbooks 等应在验证后沉淀到 `docs/`。
- 需要理解项目 big picture 时，不要只读单个文件，应按需读取 `docs/`、`.workflow/intents.md`、`.workflow/versions/index.md`、活跃 version/change 上下文与 `.workflow/archive/`。

## 固定结构

```text
.workflow/
├── AGENTS.md                           # .workflow 治理规则，进入 .workflow 前必须读取
├── intents.md                          # 尚未进入活跃 roadmap 的原始意图池
├── templates/                          # 运行态模板文件
│   ├── intents.md
│   ├── versions/
│   │   └── index.md                    # 活跃 versions index 模板
│   └── changes/
│       ├── context.md                  # change 看板上下文模板
│       ├── progress.md                 # change 阶段进度模板
│       ├── specs/
│       │   └── spec.md                 # change spec 模板
│       ├── design/                     # change design 子域模板
│       ├── plan.md                     # change plan 模板
│       ├── tasks.md                    # change tasks 模板
│       └── verify.md                   # change verify 模板
├── versions/                           # 当前未归档 versions
│   ├── index.md                        # 当前活跃 versions/changes 索引
│   └── <version>/                      # 语义化 version 标识
│       ├── shared/                     # 本 version 内多 change 共享的运行态材料
│       ├── artifacts/                  # 本 version 级截图、基准、测试证据等
│       └── changes/
│           └── <change-id>/            # 语义化 change 标识，不是数字编号
│               ├── context.md          # 本 change 的看板上下文
│               ├── progress.md         # 本 change 的阶段、局部阻塞和进展记录
│               ├── specs/              # 本 change 的行为契约增量
│               ├── design/             # 本 change 的 how 设计材料
│               ├── plan.md             # 本 change 的实现计划
│               ├── tasks.md            # 本 change 的实施清单
│               ├── verify.md           # 本 change 的一致性证据
│               └── artifacts/          # change 级截图、基准、测试证据等
└── archive/                            # 已归档 version 与 change 上下文
    └── versions/
        ├── index.md                    # 已归档 versions 索引
        └── <version>/
            ├── shared/
            ├── artifacts/
            └── changes/
                └── <change-id>/
```

旧归档结构如果已经存在，保持不改；不要为了迁移结构而改写历史归档。

## 结构职责

- `intents.md` 只作为进入活跃 roadmap 前的原始意图池。
- `versions/index.md` 只作为当前活跃 versions/changes 的索引和当前焦点入口，不是历史总账，也不是 change 状态表。
- `versions/<version>/shared/` 保存同一 version 内多个 changes 共享的运行态材料，例如调研摘要、设计基线、验证约束、证据清单或跨 change 协作约定。
- `versions/<version>/changes/<change-id>/context.md` 保存该 change 的看板上下文：来源上下文、当前已知边界、协作与共享上下文、背景引用。
- `versions/<version>/changes/<change-id>/progress.md` 保存该 change 当前阶段、局部阻塞、产物检查和进展记录；不保存下一步技能。
- `templates/` 保存运行态产物模板，生成文件时应优先使用项目本地模板。
- `archive/versions/` 保存已归档 version 与其 changes 的完整上下文。
- `<version>` 与 `<change-id>` 必须是语义化标识；`<change-id>` 在活跃区应保持全局唯一，即使它已经位于 version 目录下。

## 禁止事项

- 不要把长期知识直接写进 `.workflow/`。
- 不要在未进入活跃 roadmap 的情况下创建 change 产物。
- 不要把 how、任务或实现细节写入 spec。
- 不要在 verify 前把运行态 design 直接复制进 `docs/` 当作长期结论。
- 不要用数字编号作为 version 或 change-id。
- 不要绕过 `progress.md` 在 `versions/index.md` 中维护单个 change 的阶段状态；不要在 `progress.md`、index 或阶段产物中重复维护下一步技能。
- 不要把工作流技能的执行职责、调用顺序或阶段业务细节写进本治理文件；这些属于各技能自身说明。
