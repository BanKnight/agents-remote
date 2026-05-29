# Frontend Design

## Change

- change-id：verify-prototype-alignment-release

## 前端范围

- 本 change 不修改 app UI 实现代码，除非 release verify 发现必须回流的 CRITICAL 并由后续 implement-change 处理。
- 主要产物是 release verify harness、summary log、verify.md 和必要 artifacts。
- 可新增 change-local artifact script，位置限定在 `.workflow/versions/v0.8-prototype-ui-alignment/changes/verify-prototype-alignment-release/artifacts/`。
- 不修改 `web/src/routes/*`、`web/src/components/*`、API、shared DTO、runtime protocol 或 package dependencies。

## Harness 输入

- Shared contract：`.workflow/versions/v0.8-prototype-ui-alignment/shared/alignment-contract.md`。
- Design system note：`.workflow/versions/v0.8-prototype-ui-alignment/shared/design-system-note.md`。
- Follow-up gaps：`.workflow/versions/v0.8-prototype-ui-alignment/shared/follow-up-gaps.md`。
- Page change evidence：
  - `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-home-project-shell/verify.md` 与 `artifacts/browser-check.log`。
  - `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-runtime-detail-workspaces/verify.md` 与 `artifacts/browser-check.log`。
  - `.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/verify.md` 与 `artifacts/browser-check.log`。
  - baseline shared verify evidence for `establish-prototype-alignment-baseline`。

## Harness 输出

- `artifacts/release-browser-check.log`：JSON-lines 或等价 text log，逐项记录 Prototype Map artifact presence、前置 browser-check 结论、cross-page structural checks、follow-up gap summary 和 release conclusion inputs。
- `artifacts/release-artifact-manifest.json` 或等价 log entry：列出被引用的 screenshots/logs/verify paths，不复制 PNG。
- `verify.md`：最终 release 级 Trace/Delta/Scenario/Evidence 矩阵、问题分级和结论。

## 验证策略

- 第一层：静态证据复核。检查前置 change 是否已完成、verify 是否通过/条件通过且无 unresolved CRITICAL、required artifacts 是否存在。
- 第二层：日志结构复核。读取各前置 `browser-check.log`，确认 navigation、bottom nav visibility、runtime input absence、danger confirmation、forbidden copy 等断言存在并 passed。
- 第三层：release 汇总断言。基于 alignment contract 的 Prototype Map 输出统一 manifest，标明每个 prototype/page 对应证据和是否满足。
- 第四层：必要时补充真实浏览器检查。若前置 evidence 不能证明跨页面一致性或 artifact 缺失，使用固定 `ar-dev`（API 43011、Web 43012、PROJECTS_ROOT=/home/deploy/workspace）补采对应路径，而不是伪造通过。

## 状态与数据边界

- Release harness 只读取文件系统中的 workflow evidence 和可选浏览器页面，不改变 app state。
- 如需登录浏览器检查，使用已约定的显式 dev/test password，不读取进程环境中的 secret。
- 如需启动/复用服务，优先使用固定 tmux `ar-dev`，避免新端口和孤儿进程。
- Follow-up gap 只更新 shared file 中 release verify 新发现的 gap；不把普通视觉可修问题登记为 gap。

## 可测试性

- Harness 应可重复运行，并在 log 中记录 checkedAt、source path、result、missing entries 和 passed/failed 状态。
- `git diff --check` 应覆盖本 change 文档和 artifacts。
- 如果新增脚本，优先使用 Bun/Node 标准库，不新增依赖。

## 后续沉淀候选

- 可复用的 release-level artifact manifest/check pattern。
