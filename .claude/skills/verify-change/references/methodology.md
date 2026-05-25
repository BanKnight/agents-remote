# verify-change 方法论

`verify-change` 的核心不是一次性检查，而是建立并迭代验证回路：

```text
实现 → 验证 → 调整 → 再验证
```

质量来自这个循环的速度、确定性和证据强度。

## 四层验证

### 1. Trace 验证

把 change 的承诺映射到实现证据：

- intent 是否被 specs/design/tasks 承接。
- spec requirement 是否有实现证据。
- scenario 是否有测试或手动验证证据。
- design 决策是否有对应实现。
- tasks 勾选是否真实对应代码或证据。

### 2. Delta 验证

只看本次 change 引入的差异：

- 是否有超出 scope 的实现。
- 是否有未被 spec/design 支撑的新行为。
- 是否修改了非目标区域。
- 是否引入额外风险或隐性依赖。

### 3. Scenario 验证

从真实使用路径验证：

- 正常路径是否成立。
- 边界路径是否成立。
- 失败路径是否成立。
- 用户可见行为是否符合 spec。

### 4. Evidence 验证

任何“通过”都必须有证据：

- 自动化测试结果。
- e2e 操作记录。
- CLI/HTTP 脚本输出。
- 截图、日志、trace、录屏、自动化测试报告、交互日志、benchmark。
- 代码位置引用。

### 5. Artifact 充分性检查

对用户可见或交互式能力，Evidence 不只记录“测试通过”，还要检查是否有可审查 artifact：截图、trace、录屏、自动化测试报告、交互日志、服务日志或等价证据。不适用或无法采集时，应明确写出理由和替代证据。

## 三维评估

每次验证都从三个维度给出结论：

- Completeness：任务、需求、场景是否覆盖。
- Correctness：实现行为是否正确。
- Coherence：实现是否符合 design 与项目模式。

## 迭代规则

如果验证失败，不要只记录失败；必须给出回流建议：

- 回到 `implement-change`：实现缺失、测试失败、任务未完成。
- 回到 `design-change`：实现与设计冲突，且设计可能需要调整。
- 回到 `specify-change`：发现 spec 缺失、行为契约不完整或验收口径不清。
- 回到 `plan-change`：任务拆解不支持验证或缺少验证任务。

修正后必须重新执行 `verify-change`，不能沿用旧验证结论。
