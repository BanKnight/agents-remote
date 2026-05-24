# tasks

## 执行顺序

1. 先建立可单测的 quick key/input model，固定 Agent/Terminal 默认快捷键、控制序列、输入规范化和可发送状态。
2. 再改造 Session Detail 页面为移动端优先布局：terminal output、collapsible bottom input panel、quick key bar 和辅助 controls。
3. 补充 unit tests、运行全量质量门禁，并用 tmux + browser 手机视口验证真实操作路径。
4. 最后更新 workflow 进度和验证证据。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 新增 Session Detail 前端交互模型
  - 验收标准：存在纯函数/常量定义 Agent/Terminal 默认 quick keys、label、sequence、排序、文本输入规范化和发送可用性判断；不新增 npm 依赖，不修改 shared/API contract。
  - 依据：`plan.md`；`specs/mobile-session-interaction/spec.md` 的 quick keys、多行显式发送和不可发送状态要求；`design/frontend.md` 的模块划分。
  - 必读上下文：`design/frontend.md`、`web/src/routes/console-model.ts`、`web/src/routes/console-model.test.ts`。
  - 修改范围：`web/src/routes/console-model.ts` 或新增同层 model 文件，及对应测试文件。
  - 依赖：无
  - 并行：否（阻塞 UI 改造和测试）

### 2. 核心实现任务

- [x] 2.1 改造 Session Detail 移动端布局与底部输入面板
  - 验收标准：Session Detail 在移动端显示紧凑 header/status、可读 terminal output、默认展开且可收起/恢复的底部 input panel；普通文本通过多行 textarea + Send 显式发送；空白输入不发送；发送成功清空输入；断连/ended/closing 时发送入口禁用。
  - 依据：`plan.md`；`specs/mobile-session-interaction/spec.md` 的 terminal content/input panel/multiline input requirements；`design/ui-ux.md` 的页面结构和状态。
  - 必读上下文：`web/src/routes/SessionDetailRoute.tsx`、`docs/design/session-runtime-boundaries.md`。
  - 修改范围：`web/src/routes/SessionDetailRoute.tsx`，按需使用 1.1 的 model/helper。
  - 依赖：1.1
  - 并行：否（集中修改同一页面）

- [x] 2.2 实现 Agent/Terminal quick key bar 直发控制序列
  - 验收标准：Agent/Terminal detail 分别渲染默认 quick key 集合；点击 quick key 直接发送 `{ type: "input", data: sequence }`，不修改 textarea；stream 不 connected 或 runtime ended 时 disabled。
  - 依据：`plan.md`；`specs/mobile-session-interaction/spec.md` 的 provider/session-type aware quick keys 与 direct control sequence requirements；`design/frontend.md` 的 QuickKeyBar 边界。
  - 必读上下文：`design/frontend.md`、`web/src/routes/SessionDetailRoute.tsx`、1.1 model/helper。
  - 修改范围：`web/src/routes/SessionDetailRoute.tsx`，按需补充 tests。
  - 依赖：1.1、2.1
  - 并行：否（与 2.1 修改同一页面，可作为同一实现轮次的后续步骤）

### 3. 集成与验证任务

- [x] 3.1 补齐 web 单元测试
  - 验收标准：测试覆盖 Agent/Terminal quick key 集合差异与排序、control sequence、输入规范化、空白输入不发送判断、connected/ended/disconnected 的可发送状态；现有 console-model tests 继续通过。
  - 依据：`plan.md`；`design/frontend.md` 的可测试性要求。
  - 必读上下文：`web/src/routes/console-model.test.ts` 或新增测试文件。
  - 修改范围：`web/src/routes/*test.ts`。
  - 依赖：1.1、2.2
  - 并行：否（依赖实现稳定）

- [x] 3.2 运行全量质量门禁
  - 验收标准：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build` 通过；如失败，修正后重跑相关检查。
  - 依据：`plan.md` 的风险与验证重点。
  - 必读上下文：`package.json` scripts（失败时再读取具体 workspace 配置）。
  - 修改范围：必要的格式、类型、lint 或测试修正。
  - 依赖：3.1
  - 并行：否

- [x] 3.3 执行 tmux + browser 手机视口 smoke
  - 验收标准：使用 tmux 管理 api/web dev 服务，使用浏览器手机视口验证：打开 Terminal Session detail、看到移动端可读 terminal output、输入多行并发送、点击 quick key、收起/展开底部 input panel、断连/重连或 ended/close 路径可见；保存必要 artifacts 或在 verify 中记录无法截图的原因。
  - 依据：`plan.md`；`specs/mobile-session-interaction/spec.md` 的用户可见 scenarios；项目开发准则要求长驻服务用 tmux，UI 变更需浏览器验证。
  - 必读上下文：`docs/project.md` 的 tmux 开发准则、`web/src/routes/SessionDetailRoute.tsx`。
  - 修改范围：`.workflow/changes/implement-mobile-session-interaction/artifacts/`（如保存截图/日志），必要的小修正。
  - 依赖：3.2
  - 并行：否（需要真实运行结果）

- [x] 3.4 更新 workflow 实现进度
  - 验收标准：所有实现任务完成后，`tasks.md` 全部勾选；`progress.md` implementation 标记为已完成并进入 `待验证`，进展记录包含实现摘要、quality gate 和 browser smoke 结果。
  - 依据：`implement-change` 规则；`progress.md` 阶段流转。
  - 必读上下文：`progress.md`、`tasks.md`。
  - 修改范围：`.workflow/changes/implement-mobile-session-interaction/tasks.md`、`.workflow/changes/implement-mobile-session-interaction/progress.md`。
  - 依赖：3.3
  - 并行：否（收尾任务）

## 依赖图

- 1.1 → 2.1 → 2.2 → 3.1 → 3.2 → 3.3 → 3.4

## 可并行任务

- （无；本 change 主要集中在 Session Detail 页面与同一前端 model，顺序执行风险最低。）

## 阻塞项

- （无）
