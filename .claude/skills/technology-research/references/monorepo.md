# Monorepo 默认技术基线

## 默认推荐

- Monorepo 不是默认最佳实践；只有当多个包/应用需要共同演进时才采用。
- 采用 monorepo 时，应先明确包边界、依赖方向、构建图、版本发布策略和 CI 影响范围。
- Workspace package manager 是基础；task runner/build graph 是后续优化，不应先于真实需求引入。
- TypeScript project references、package exports、shared config 和 changesets/release 策略要一起考虑。

## 职责边界

- Package manager workspace：依赖安装、链接、workspace 协议。
- Task runner/build graph：按依赖图运行 build/test/lint。
- TypeScript references：类型检查边界和增量构建。
- Release tool：包版本、changelog、发布流程。

## 常见反模式

- 单应用项目为了“规范”强行 monorepo。
- 包边界只是目录拆分，没有独立职责或依赖边界。
- 所有 package 共享一个巨大 tsconfig，类型检查越来越慢。
- 引入 Turborepo/Nx 但没有缓存命中和 affected 运行需求。

## 需要官方确认的点

- 选定 package manager 的 workspace、lockfile、catalog、overrides 支持。
- Turborepo/Nx/moon 等工具的当前配置方式和生态支持。
- TypeScript project references 与 bundler/test runner 的兼容。
- 部署平台对 monorepo 路径、build command、缓存的支持。

## 何时不适用

- 只有一个应用，且没有共享包、SDK、CLI、文档站等共同演进需求。
- 团队还没有维护构建图和包边界的能力。
- 包之间发布节奏、安全边界或权限模型强烈不同。

## 输出落点

- repo 结构、包边界和工具选择进入 design-change 的 architecture 子域。
- package manager、task runner、CI affected strategy 进入 plan-change。
