# Testing 默认技术基线

## 默认推荐

- 测试策略按风险分层，而不是只选一个测试框架。
- 默认组合：单元测试覆盖纯逻辑，集成测试覆盖模块边界，E2E/浏览器测试覆盖关键用户路径。
- 前端项目优先考虑 Vitest + Testing Library + Playwright；但需按框架、运行时和已有工具确认。
- 后端/API 项目优先测试真实边界：数据库、外部服务 mock/fixture、认证、错误路径。
- CI 中测试要可重复、可并行、可定位失败原因。

## 职责边界

- Unit test：纯函数、小组件、业务规则。
- Integration test：API、数据库、模块协作、框架边界。
- E2E/browser：用户关键路径、路由、权限、表单、视觉/交互核心。
- Typecheck/lint：不是测试替代品，但属于质量门禁。

## 常见反模式

- 大量 mock 导致测试通过但真实集成失败。
- 只做 snapshot，不验证行为。
- E2E 覆盖太多低价值路径，导致慢且 flaky。
- 新增测试工具前不确认 CI、coverage、watch、mock、fixture 需求。
- 把类型检查、lint、test 混成一个不可诊断的命令。

## 需要官方确认的点

- 当前框架推荐测试工具和配置方式。
- Test runner 对 ESM、TypeScript、path alias、DOM、coverage 的支持。
- Playwright 或浏览器测试在目标 CI/部署预览环境的运行方式。
- Bun test/Vitest/Jest 在项目依赖下的兼容性。

## 何时不适用

- 极早期 PoC 可以先用手动验证，但进入实现计划时必须写明补测试时机。
- 对视觉高度敏感的产品可能需要额外视觉回归工具。

## 输出落点

- 测试策略进入 design-change 的 risks 或 architecture 子域。
- 具体测试命令、CI 门禁、fixture 和覆盖范围进入 plan-change。
