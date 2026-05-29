# Risks Design

## Change

- change-id：verify-prototype-alignment-release

## 主要风险

- 前置 screenshots/logs 存在但已经过期：release verify 需要结合 progress、verify 时间和当前代码状态判断是否足够；证据不足时补采或记录 WARNING。
- 只检查文件存在而不检查结构语义：release harness 必须验证 browser-check log 中的关键断言，而不是只列文件。
- Pixel-perfect 过度验证：本 version 明确使用结构等价和可审查截图，不以 DOM/class/pixel diff 阻塞。
- Future gap 被误判为 failure：已明确不在本 version 解决且真实 UI 未伪造的 gap 不应阻塞 release。
- Shared baseline gap 被漏掉：如果最终发现 alignment contract 或 design system note 与实际验收不一致，应记录为 WARNING/CRITICAL 或更新 shared。
- 补采浏览器 evidence 时制造孤儿进程或端口漂移：必须复用 `ar-dev` 或使用可追踪 cleanup。

## 跨子域权衡

- 重跑所有页面浏览器截图可提高信心，但成本高且容易制造环境波动；本 change 优先复核前置 page-level artifacts，只有证据缺口时补采。
- 汇总 PNG 会让 artifacts 目录很重；本 change 默认写 manifest/log 引用前置截图，保留证据链即可。
- Release verify 不修 UI，可以保持收口边界清晰；若发现 CRITICAL，应回流到对应页面 change 或 implement-change，而不是在 verify 阶段偷偷修。

## 依赖与阻塞

- 依赖四个前置 changes 已完成：establish-prototype-alignment-baseline、align-home-project-shell、align-runtime-detail-workspaces、align-resource-inspection-workspaces。
- 依赖 shared contract/note/gaps 可读取。
- 当前无阻塞。

## 验证建议

- 检查 `git diff --check`。
- 读取并汇总前置 verify/browser logs。
- 若写 artifact script，运行该 script 并确保 release log 无 failed/missing/CRITICAL 条目，或在 verify.md 明确记录问题分级。
- 最终 verify.md 需要列出 open follow-up gaps，并说明是否阻塞 release。

## 开放问题

- 无阻塞开放问题。

## 后续沉淀候选

- Release verify 后判断是否将 shared alignment contract/design system note 中的稳定结论沉淀为长期 docs。
