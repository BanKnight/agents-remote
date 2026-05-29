# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：verify-prototype-alignment-release
- Roadmap 对应项：v0.8-prototype-ui-alignment / release-level prototype UI alignment verification
- 验证对象：Prototype Map 全页面 artifacts、前置 change verify/browser logs、跨页面导航层级、shared design system consistency、真实能力边界、follow-up gaps 汇总。
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-29
- 验证范围：establish-prototype-alignment-baseline、align-home-project-shell、align-runtime-detail-workspaces、align-resource-inspection-workspaces 的 progress/verify/artifacts；shared alignment contract/design system note/follow-up gaps；release artifact manifest/log。
- 使用 harness：change-local Bun release artifact script、前置 browser-check log 结构断言复核、artifact presence manifest、follow-up gap summary、git diff whitespace check。
- 本轮结论：通过，无 CRITICAL/WARNING。
- 后续动作：允许进入 `distill-change`，判断 shared alignment contract/design system note 中哪些稳定结论需要长期沉淀。

## Harness 清单

- 名称：Release artifact manifest generator
  类型：Bun/Node static evidence harness
  覆盖承诺：Prototype Map 每个页面的 required artifacts、前置 verify 无 CRITICAL、前置 browser-check 关键断言、shared files 存在、follow-up gaps 不阻塞。
  执行方式：`bun .workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/artifacts/create-release-artifacts.mjs`
  结果：通过，0 failure。
  证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/artifacts/release-artifact-manifest.json`；`release-browser-check.log`；`release-summary.json`

- 名称：Whitespace diff check
  类型：git check
  覆盖承诺：本 change 新增 spec/design/plan/tasks/artifacts/verify/progress 无 whitespace error。
  执行方式：`git diff --check`
  结果：通过
  证据：命令无输出。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| spec: Release verification covers full Prototype Map | Home、Project Agent、Agent detail、Terminal detail、Files/Git/Terminal workspaces 均有 required artifacts 和 browser logs | 前置 change artifacts 目录；release manifest `prototypeMap` | `release-browser-check.log` artifact-presence entries 全部 passed；`release-artifact-manifest.json` missing 均为空 | 通过 |
| spec: Cross-page navigation layers | 一级 shell、Project direct secondary、deep/contextual detail 三层导航模型一致；mobile direct/deep 互斥 | `alignment-contract.md` Prototype Map；前置 browser logs | Home/Project log 确认 Home/Project desktop/mobile；runtime log 确认 detail top return/no Project bottom nav；resource log 确认 Files/Git direct bottom nav true、detail false、Terminal direct true | 通过 |
| spec: Shared design system consistency | 页面继承 shared shell/navigation/surface/list/status/action/input/terminal/code 语言，不散用另一套默认 dashboard 视觉 | `design-system-note.md`；前置 verify 的 shared primitive/shadcn wrapper 记录 | release log 复核 previous verify 均 allowsDistill；前置 verify 记录 shell primitives、runtime surface roles、resource action/list/status language | 通过 |
| spec: Real capability boundaries | 不伪造 provider history、runtime output、Files/Git 写操作、Terminal direct runtime input 或 unsupported quick key mode | 前置 verify/log；`follow-up-gaps.md` | Home log no fake provider history；runtime log Shift+Tab gap not faked；resource log forbidden-copy passed、terminal-runtime-input-absent passed | 通过 |
| spec: Follow-up gaps summarized | open gaps 被汇总并判断是否阻塞 release | `follow-up-gaps.md`；release script gap parser | `release-browser-check.log` follow-up-gaps passed，openGaps 当前为空 | 通过 |
| spec: Final release evidence package | 本 change 产出 final release artifacts 和 verify.md | `artifacts/create-release-artifacts.mjs`、manifest/log/summary、`verify.md` | 本 verify.md 与 release artifacts | 通过 |
| plan/tasks | 1.1、2.1、3.1、3.2 按顺序完成 | `tasks.md`；`progress.md` | release manifest/log、git diff check、verify.md | 通过 |

## Delta 验证

- Scope 内变更：本 change 的 specs、design、plan、tasks、artifacts、verify、progress；release artifacts 包含 `create-release-artifacts.mjs`、`release-artifact-manifest.json`、`release-browser-check.log`、`release-summary.json`。
- Scope 外变更：无 app UI、API、shared DTO、runtime protocol、dependencies 修改；无长期 docs 修改。
- 未被 spec/design 支撑的新行为：无。Release harness 只读取 workflow evidence 和 shared files，生成汇总证据。
- 风险：未重新采集全量 screenshots，但前置 page-level changes 已保存 required screenshots/browser logs，release manifest 检查全部存在；本 change 的职责是汇总收口而非重做单页 verify。
- 结论：通过。

## Scenario 验证

- 场景：Prototype Map artifacts are complete
  路径类型：正常 / 证据完整性
  验证方式：release manifest 检查每个 page/prototype/change 的 required artifact paths。
  证据：`release-artifact-manifest.json`；`release-browser-check.log` artifact-presence entries。
  结果：通过；7 个 Prototype Map 条目 missing 均为空。

- 场景：Mobile direct secondary and deep detail navigation are mutually exclusive
  路径类型：用户可见 / 边界
  验证方式：复核前置 browser logs。
  证据：Home/Project `browser-check.log`；runtime detail `browser-check.log`；resource workspace `browser-check.log`。
  结果：通过；Home/Project direct、runtime detail、Files/Git direct/detail、Terminal direct/detail 边界均有 passed 信号。

- 场景：Unsupported prototype-only capabilities are not faked
  路径类型：能力边界
  验证方式：复核 forbidden-copy/no fake/gap log 信号。
  证据：Home no fake provider history；runtime Shift+Tab gap not faked；resource Files/Git forbidden-copy 和 Terminal runtime input absent。
  结果：通过。

- 场景：Follow-up gaps are release-safe
  路径类型：边界 / release 收口
  验证方式：读取 `follow-up-gaps.md` 并由 release script 汇总 open gaps。
  证据：`release-browser-check.log` follow-up-gaps entry；`release-artifact-manifest.json` openGaps。
  结果：通过；当前 release manifest 中 openGaps 为空，且前置 runtime Shift+Tab gap 未伪造能力。

## Evidence 清单

- 类型：自动化测试报告
  路径或命令：`bun .workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/artifacts/create-release-artifacts.mjs`
  结果：通过
  说明：生成 release manifest/log/summary，0 failure。

- 类型：日志
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/artifacts/release-browser-check.log`
  结果：通过
  说明：记录 previous verify、artifact presence、browser-log assertions、shared files、follow-up gaps，全为 passed。

- 类型：trace
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/artifacts/release-artifact-manifest.json`
  结果：通过
  说明：Prototype Map 7 个条目均列出 required artifact paths，missing 均为空，failureCount 为 0。

- 类型：日志
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/artifacts/release-summary.json`
  结果：通过
  说明：记录 release summary、referenced evidence 和 log path。

- 类型：测试
  路径或命令：`git diff --check`
  结果：通过
  说明：diff 无 whitespace error。

- 类型：引用证据
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/browser-check.log`
  结果：通过
  说明：Home/Project shell desktop/mobile browser structure and no fake provider history evidence.

- 类型：引用证据
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/browser-check.log`
  结果：通过
  说明：Agent/Terminal detail top return, no Project bottom nav, drawer below output, Terminal no Agent tools, Shift+Tab gap not faked.

- 类型：引用证据
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts/browser-check.log`
  结果：通过
  说明：Files/Git read-only checks, mobile direct/deep bottom nav visibility, Terminal runtime input absence and close confirm.

## 交互式 Artifact 清单

- 类型：自动化测试报告
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/artifacts/release-artifact-manifest.json`
  结果：通过
  说明：引用前置 changes 的 screenshots/logs，不复制 PNG。

- 类型：浏览器日志 / 结构断言汇总
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/artifacts/release-browser-check.log`
  结果：通过
  说明：聚合并复核前置 browser logs 的关键结构断言。

- 类型：截图引用
  路径或命令：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/artifacts/*.png`；`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/artifacts/*.png`；`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts/*.png`
  结果：通过
  说明：所有 required prototype/app desktop/mobile screenshots 已由前置 page changes 保存，本 change manifest 引用并确认存在。

## Version Shared 验证记录

- shared path：`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`
  验证方式：release manifest 按 Prototype Map 检查 7 个页面条目和 required artifacts；browser log assertions 检查 blocking differences 相关结构信号。
  结果：通过。

- shared path：`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`
  验证方式：复核前置 verify 对 shell primitives、shadcn wrapper、runtime surface roles、resource action/list/status helpers 和 non-abstraction boundary 的记录。
  结果：通过。

- shared path：`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`
  验证方式：release script 汇总 open gaps；前置 runtime Shift+Tab gap 未伪造能力且不阻塞 release。
  结果：通过；release manifest openGaps 为空。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | Prototype Map、前置 verify、browser logs、shared files 和 follow-up gaps 均被 release manifest/log 覆盖。 |
| Correctness | 通过 | Release harness 全部 passed，failureCount 0；未修改业务实现或扩大能力范围。 |
| Coherence | 通过 | 结论与 shared alignment contract、design system note、长期 frontend UI architecture 和前置 page-level verify 一致。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- （无）

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无
