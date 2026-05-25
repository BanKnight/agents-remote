# Frontend Design

## Change

- change-id：verify-prototype-ui-alignment

## 前端范围

- 主要新增本 change 专用 browser harness：`.workflow/changes/verify-prototype-ui-alignment/artifacts/`。
- 复用 `@playwright/test`、Bun、Vite dev server 和 mock API 模式。
- 不修改 shared DTO、API、runtime protocol 或产品 UI，除非验证发现 CRITICAL 后由后续回流处理。

## 模块划分

- Browser harness 负责启动 mock API、启动 web dev server、访问关键 routes、执行结构断言、保存截图和日志。
- Mock API 提供 Project、Agent sessions、Terminal sessions、Files、Git diff 和 session detail/stream 所需最小真实 DTO。
- `verify.md` 汇总 harness 结果、已有 page-level artifacts、偏差判断和最终结论。

## 组件边界

- 不新增或抽取 React 组件。
- 不在本 change 中修改 page-level 组件结构。
- Browser harness 只从用户可见 DOM、ARIA role/label、URL 和截图验证结果。

## 状态管理

- Harness 使用内存 mock 数据模拟 Terminal create/close 等状态变化。
- Files selected preview、Git selected diff 等局部 state 通过浏览器点击触发，不直接访问 React 内部状态。
- 不读取或依赖本机现有 tmux/session/env 状态。

## 路由 / 页面接入

- 验证以下 route/state：
  - `/`
  - `/projects/:projectName?workspace=agents`
  - `/projects/:projectName/agent-sessions/:sessionId`
  - `/projects/:projectName/terminal-sessions/:sessionId`
  - `/projects/:projectName?workspace=files`
  - `/projects/:projectName?workspace=git`
  - `/projects/:projectName?workspace=terminal`
- Deep preview/diff state 不进 URL，通过同 route local state 验证。

## 工程约束

- 使用临时端口和 mock API，不读取现有 `APP_PASSWORD` 或 shell/tmux 环境。
- artifacts 必须保存截图、browser harness log、web log 和 mock API log。
- 收尾运行 web 门禁：format/lint/typecheck/test/build。
- 如果 browser harness 失败，先判断是 harness selector 问题还是真实 UI 偏差；真实偏差进入 `verify.md` 问题清单。

## 关键决策

- 本 change 是验证型 change：implementation 产物是 harness/artifacts，而不是用户可见产品改动。
- 使用结构断言 + 截图人工可审查证据，不做 pixel diff。

## 风险与权衡

- Harness 需要覆盖足够多页面，运行时间比单页 page-level harness 更长；但这是 version 收口所需。
- Mock API 需要保持最小且真实 DTO，避免测试伪造 UI 当前并不支持的数据字段。

## 开放问题

- （无）

## 后续沉淀候选

- Prototype alignment browser harness 的长期验收矩阵。
