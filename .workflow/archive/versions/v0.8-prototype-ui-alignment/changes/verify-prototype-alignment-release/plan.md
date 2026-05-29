# plan

## Change 目标

- 为 `v0.8-prototype-ui-alignment` 生成 release 级 prototype alignment 收口验证，确认所有页面 change 的 artifacts、结构断言、设计系统一致性、真实能力边界和 follow-up gaps 已被完整检查。
- 完成后解锁本 version 的最终 distill/archive 判断。

## 局部 big picture

- 本 change 是本 version 的最后一道质量门禁，不改变真实 app 行为，只复核前置 changes 已留下的证据是否足以证明整轮原型对齐成立。
- 前置 changes 已分别覆盖 shared baseline、Home/Project shell、runtime detail 和 resource workspaces；本 change 聚合这些单页证据，补上跨页面一致性和 follow-up gap 结论。
- 本 change 的结果会决定 shared alignment contract/design system note 是否已经稳定到可长期沉淀，或是否需要后续 version 承接未解决 gaps。

## 执行策略

- 先审计输入和证据：读取 shared contract/note/gaps、前置 progress/verify/browser logs/artifact file list，建立 Prototype Map 到证据的 manifest。
- 再生成 release artifacts：编写或运行 change-local 汇总脚本，输出 release artifact manifest 与 release browser/check log，记录 artifact presence、前置断言结果、open gaps 和 release-level passed/failed 状态。
- 最后执行 verify：将 manifest/log 结果写入 `verify.md`，按 Trace/Delta/Scenario/Evidence 结构分级问题，并更新 progress 到待沉淀或阻塞。
- 除非证据缺失或结构断言无法复核，否则不重新采集全量 screenshots；如需补采，复用固定 `ar-dev`，避免端口漂移。

## 任务顺序依据

- 证据审计是后续 manifest/log 的输入，因此任务 1.1 阻塞所有后续任务。
- Release artifacts 必须先生成，verify.md 才能引用稳定证据，因此任务 2.1 阻塞 3.1。
- Progress/tasks 收口必须在 verify 结论之后执行，因此任务 3.2 最后完成。

## 上游承诺投影

- `spec.md` 的 full Prototype Map artifacts 要求落到任务 1.1、2.1、3.1：必须逐项检查 responsible change 的 screenshots/logs 并写入 manifest/verify。
- `spec.md` 的 cross-page navigation 要求落到任务 2.1、3.1：release log/verify 需确认 mobile direct/deep 互斥、Terminal direct/detail runtime boundary 和 desktop shell continuity。
- `spec.md` 的 shared design system consistency 要求落到任务 1.1、3.1：必须检查 shared primitives、shadcn wrapper boundary、surface/list/status/action affordance 是否由前置 evidence 支撑。
- `spec.md` 的 real capability boundary 要求落到任务 2.1、3.1：必须检查 forbidden copy、runtime input absence、no fake history/data 和 follow-up gap 表达。
- `follow-up-gaps.md` 汇总要求落到任务 2.1、3.1：open gaps 要进入 release log 和 verify conclusion，明确是否阻塞。
- `design/frontend.md` 的范围要求落到所有任务：不修改 app UI、API、shared DTO、runtime protocol 或 package dependencies；新增文件仅限本 change artifacts/verify/plan/tasks/progress。

## 额外上下文

- `.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`
- `.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`
- `.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`
- `.workflow/versions/v0.8-prototype-ui-alignment/changes/establish-prototype-alignment-baseline/progress.md`、`verify.md`、`artifacts/verify/shared-baseline-check.log`
- `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/progress.md`、`verify.md`、`artifacts/browser-check.log` 与 screenshots
- `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/progress.md`、`verify.md`、`artifacts/browser-check.log` 与 screenshots
- `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/progress.md`、`verify.md`、`artifacts/browser-check.log` 与 screenshots
- `docs/project.md`；`docs/design/prototype/index.md`；`docs/design/prototype/guidelines.md`；`docs/design/frontend-ui-architecture.md`

## 依赖与阻塞

### 阶段依赖

- 当前阶段依赖 specs/design 已完成。
- verify 阶段依赖 plan/tasks 与 release artifacts 完成。

### 任务依赖

- 1.1 → 2.1 → 3.1 → 3.2。

### 外部依赖

- 默认不需要外部服务。
- 若证据缺口需要补采浏览器检查，复用 fixed tmux `ar-dev`：API `43011`、Web `43012`、`PROJECTS_ROOT=/home/deploy/workspace`。
- 如需登录浏览器，使用显式 dev/test password；不得读取进程环境 secret。

## 并行机会

- 当前任务主要读写同一 release manifest/log/verify/progress，串行执行更安全。
- 证据读取本身可并行，但落盘 artifacts 与 verify 结论按顺序执行。

## 风险与验证重点

- 重点验证 artifact 不缺失、前置 browser logs 中关键断言均 passed、open gaps 不被误判或漏判、release 结论可追溯。
- 风险是只做文件存在检查而忽略结构语义；任务要求 log 中必须记录关键断言结果。
- 风险是证据过期或与当前代码状态冲突；如发现冲突，verify 应降级为 WARNING/CRITICAL 并给出回流建议。

## 不做事项

- 不修改 app UI 实现、API、shared DTO、runtime protocol、dependencies。
- 不伪造 screenshots/logs 或通过空 manifest 声称验证通过。
- 不以 pixel-perfect、DOM/class 完全一致作为 release 阻塞标准。
- 不把明确 future enhancement 的 open gap 塞进本 version 实现。
