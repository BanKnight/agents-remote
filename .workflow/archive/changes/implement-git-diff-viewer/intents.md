# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：26
  原始意图：用户希望 Git 功能只查看已经修改文件的 diff，暂不需要完整 Git 操作或更宽泛的 Git 管理能力。
- 编号：103
  原始意图：用户希望 Git diff 功能第一步先展示变更文件列表，用户点选某个文件后查看该文件 diff；不需要一次展示所有 diff。
- 编号：104
  原始意图：用户希望第一步 Git diff 覆盖工作区和 staged 的已修改文件，让用户知道当前项目有哪些未提交变化；但不提供任何 Git 写操作。
- 编号：105
  原始意图：用户希望如果 project 不是 Git 仓库，Git 页面明确提示当前项目不是 Git 仓库；不要报错成系统异常。
- 编号：106
  原始意图：用户希望第一步手机端优先使用 unified diff 文本展示，因为左右并排不适合窄屏；PC 端以后可以增强为并排对比。
- 编号：107
  原始意图：用户希望第一步变更文件列表应显示文件路径和基本状态类型，例如 modified、added、deleted、renamed；不需要复杂筛选。

## 规划来源

- 类型：其他
- 原因：Git diff 是只读观察能力，范围应限制在工作区/staged 变更展示，避免引入 Git 写操作风险。
- 支撑目标：提供 Project 内变更文件列表和单文件 unified diff 查看。
- 前置关系：依赖 `implement-project-model-and-safe-paths` 和 `build-responsive-pwa-console-shell`。

## 分配说明

- 所属 version：v0.4-project-inspection-tools
- 分配原因：Git diff 是辅助观察工具，适合在核心 Project 与 Session 链路后单独交付。
