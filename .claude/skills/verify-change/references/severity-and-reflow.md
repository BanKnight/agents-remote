# verify-change 问题分级与回流

`verify-change` 的问题分级用于决定是否可以进入 distill/archive，以及应该回到哪个阶段修正。

## 分级

### CRITICAL

必须修复后才能通过 verify。

常见情况：

- spec requirement 未实现。
- 核心 scenario 无证据或失败。
- tasks 标记完成但实现缺失。
- 实现与 design 关键决策冲突。
- 自动化测试或核心 harness 失败。
- 引入明显安全、数据一致性或破坏性风险。

### WARNING

可以继续讨论，但必须明确记录处理决定。

常见情况：

- 场景覆盖不完整但不影响核心路径。
- 实现与 design 有轻微偏差。
- 测试证据较弱，需要人工确认。
- 存在潜在回归风险。
- 部分非核心任务未完成。

### SUGGESTION

不阻塞通过，但建议后续优化。

常见情况：

- 代码模式轻微不一致。
- 可维护性、命名或结构可优化。
- harness 可以更快或更稳定。
- 证据记录可以更清晰。

## 误报控制

当不确定时，优先降级：

```text
CRITICAL → WARNING → SUGGESTION
```

不要用不确定判断阻塞 change；但必须说明不确定性来源和建议补充的证据。

## 回流规则

每个 CRITICAL 或 WARNING 都必须给出回流建议：

- `implement-change`：代码、测试或任务完成度问题。
- `plan-change`：任务拆解、验证计划或依赖安排问题。
- `design-change`：设计决策与实现现实不匹配。
- `specify-change`：行为契约、场景或验收口径缺失。

## 通过规则

- 有 CRITICAL：不通过，必须回流。
- 无 CRITICAL 但有 WARNING：可条件通过，但必须记录确认的例外或后续项。
- 只有 SUGGESTION 或无问题：通过。

修正后必须重新执行验证并更新 `verify.md`，不能复用旧结论。
