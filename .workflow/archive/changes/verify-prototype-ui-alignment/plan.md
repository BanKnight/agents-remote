# plan

## Change 目标

- 为 `v0.8-prototype-ui-alignment` 生成最终 UI/UX prototype alignment 收口证据。
- 用真实浏览器覆盖 Home、Project Agent workspace、Agent/Terminal detail、Files/Git/Terminal resource workspaces 的桌面端和移动端结构对齐结果。
- 将通过/偏差/回流建议写入 `verify.md`，完成后可进入 distill/archive。

## 局部 big picture

- 本 change 是 v0.8 的最后一个验证型 change，依赖前面所有 page-level alignment changes 已完成。
- 前置 changes 已分别完成实现、verify 和 distill；本 change 不再重做页面实现，而是把整体 UI/UX alignment 作为一个跨页面系统验证收口。
- 验证结果将决定本 version 是否可归档，或是否需要回流到某个 page-level change。

## 执行策略

- 先确认依赖 change 都已完成，并解除本 change progress 中的等待阻塞。
- 编写一个专用 browser harness：启动 mock API 和 web dev server，访问关键页面/状态，执行结构断言并保存截图/日志。
- 运行完整 web 门禁和 browser harness。
- 创建 `verify.md`，把 spec/design/task 承诺映射到代码、页面和 artifacts。
- 若无 CRITICAL，将本 change 推进到待沉淀，并在 distill 阶段记录长期验证规则或明确无需更多 docs。

## 任务顺序依据

- 依赖确认是前置阻塞，否则最终 alignment 验证没有完整对象。
- Harness 必须先设计并生成 artifacts，`verify.md` 才能引用证据。
- 质量门禁和 browser harness 必须在 `verify.md` 前执行，避免无证据通过。
- Distill 只能在 verify 通过后执行。

## 额外上下文

- `docs/project.md`：项目 big picture、前端/移动端开发和验证准则。
- `docs/design/prototype/index.md`：prototype 页面入口清单。
- `docs/design/prototype/guidelines.md`：导航、布局、组件、移动端返回和密度规则。
- `docs/design/prototype/screenshots/index.md`：prototype screenshots 索引。
- `docs/design/frontend-ui-architecture.md`：已验证的三层页面模型、mobile navigation、resource workspace 和 detail 边界。
- 各前置 change 的 `verify.md` 和 artifacts：作为 page-level 已通过证据和最终验证输入。
- 代码入口：`web/src/routes/HomeRoute.tsx`、`web/src/routes/ProjectConsoleRoute.tsx`、`web/src/routes/SessionDetailRoute.tsx`、`web/src/api/client.ts`、`packages/shared/src/index.ts`。

## 依赖与阻塞

### 阶段依赖

- 依赖 `align-home-project-entry` 已完成。
- 依赖 `align-project-agent-workspace` 已完成。
- 依赖 `align-instance-detail-workspaces` 已完成。
- 依赖 `align-resource-inspection-pages` 已完成。

### 任务依赖

- 1.1 依赖确认完成后才能开始 browser harness。
- 2.1 browser harness 生成 artifacts 后，3.1 才能写 verify 结论。
- 4.1 distill 依赖 verify 通过。

### 外部依赖

- 无第三方服务、真实 Project、真实密码或人工确认依赖。
- Browser harness 使用临时端口、mock API 和 dev server；不得读取现有 secrets 或 tmux 环境。

## 并行机会

- 不并行。最终验证需要顺序生成 artifacts、运行门禁、写 verify/distill，避免证据与结论不一致。

## 风险与验证重点

- 验证移动端一级/二级/deep detail 导航互斥。
- 验证 Home/Project/Agent/Terminal/Files/Git 关键页面都覆盖 desktop/mobile。
- 验证 Files/Git 无写操作，Terminal workspace 无 runtime input。
- 验证 Agent detail 有 Agent-only tools，Terminal detail 无 Agent-only tools。
- 验证长 path、diff line、session id 不横向溢出。
- 验证 artifacts 足够 reviewer 后续审查。

## 不做事项

- 不做 pixel-perfect diff。
- 不修改生产 API、shared DTO、runtime protocol 或后端能力。
- 不新增 Files/Git 写操作。
- 不在没有 CRITICAL 的情况下重构 page-level UI。
- 不读取现有环境 secrets、tmux session 环境或真实用户 Project。
