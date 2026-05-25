# tasks

## 执行顺序

1. 先调整 Home 页面骨架和信息层级，让 Projects workspace 成为主内容。
2. 再细化 Project entry 行、低频 Create/adopt 入口和状态保留。
3. 最后运行 web 检查并用真实浏览器采集桌面/移动 Home entry 证据。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 收敛 Home 一级 Projects workspace 信息层级
  - 验收标准：Home 桌面端保持左侧一级导航 + 右侧 Projects 工作区；移动端保持底部一级导航 + 主工作区；顶部文案压缩为一句话上下文；未实现的 Sessions/Config/Help 不挤占主工作区。
  - 依据：`plan.md`；`.workflow/changes/align-home-project-entry/specs/project-console-navigation/spec.md`；`design/overview.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/design/frontend-ui-architecture.md`；`docs/design/prototype/guidelines.md`；`docs/design/prototype/home.html`；`web/src/routes/HomeRoute.tsx`
  - 修改范围：`web/src/routes/HomeRoute.tsx`
  - 依赖：无
  - 并行：否（建立后续 Project entry 和状态布局基础）

### 2. 核心实现任务

- [x] 2.1 对齐 Project entry 列表行与低频 Create/adopt 入口
  - 验收标准：Project 条目包含一致图标/marker、Project 名称、截断路径或状态摘要、Open 进入行为；长路径不横向溢出；Create/adopt 默认是低频入口，但空态、提交中和错误态仍可见且可恢复；创建成功和 Project Link 都显式进入默认 Agent workspace。
  - 依据：`plan.md`；`.workflow/changes/align-home-project-entry/specs/project-console-navigation/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/HomeRoute.tsx`；`web/src/routes/shell-primitives.tsx`；`web/src/routes/console-model.ts`
  - 修改范围：`web/src/routes/HomeRoute.tsx`，必要时只做局部 primitive 组合调整
  - 依赖：1.1
  - 并行：否（与 1.1 修改同一文件，且依赖页面结构稳定）

### 3. 集成与验证任务

- [x] 3.1 运行局部 web 检查并准备浏览器验证证据
  - 验收标准：`bun --filter @agents-remote/web typecheck`、`bun --filter @agents-remote/web test`、`bun --filter @agents-remote/web build` 通过；真实浏览器检查桌面端和移动端 Home / Project entry 的主路径、空态或低频创建入口、Project 打开默认 Agent workspace；截图/日志放入本 change artifacts 供 verify-change 使用。
  - 依据：`plan.md`；`.workflow/changes/align-home-project-entry/specs/project-console-navigation/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/project.md` 测试与质量门禁；`web/src/routes/HomeRoute.tsx`；现有 e2e/browser 验证脚本模式
  - 修改范围：`.workflow/changes/align-home-project-entry/artifacts/`；必要时新增本 change 专用 browser check 脚本
  - 依赖：2.1
  - 并行：否（必须在实现完成后执行）

## 依赖图

- 1.1 → 2.1 → 3.1

## 可并行任务

- （无；实现集中在同一 Home route，验证依赖实现完成）

## 阻塞项

- （无）
