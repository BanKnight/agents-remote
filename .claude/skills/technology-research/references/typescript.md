# TypeScript 默认技术基线

## 默认推荐

- 默认启用 strict，并把 TypeScript 的职责定义为类型检查与声明输出，而不是替代 bundler/runtime。
- 应用项目通常使用 `noEmit`，由 bundler/runtime 负责转译。
- 库项目按需输出 declaration，并明确 ESM/CJS/exports 策略。
- 按环境拆分 tsconfig：base、app、test、node/tooling、package/lib。
- path alias 必须同时被 TypeScript、bundler、test runner、runtime 或部署环境理解。

## 职责边界

- TypeScript：类型检查、类型语义、声明文件。
- Bundler/transpiler：代码转换、bundle、tree shaking。
- Runtime：模块解析和执行限制。
- Lint：代码质量规则，不替代类型检查。

## 常见反模式

- 用 Babel/esbuild/Oxc 转译后误以为不需要 `tsc --noEmit`。
- 一个巨大 tsconfig 同时覆盖 app、tests、scripts、packages。
- path alias 只配置 tsconfig，不配置运行时和测试工具。
- monorepo 不区分 package 边界，导致类型检查慢且依赖方向混乱。

## 需要官方确认的点

- 当前 TypeScript 推荐的 module/moduleResolution 组合。
- 目标 runtime/bundler 对 ESM、CJS、bundler resolution 的要求。
- project references、incremental、declaration 输出限制。
- 与 eslint/typescript-eslint、test runner、framework 的兼容要求。

## 何时不适用

- 极小脚本且类型系统成本高于收益时，可以局部不用 TS。
- 生成代码或外部 schema 为主时，先确认类型生成链路再设计 TS 边界。

## 输出落点

- tsconfig 分层和类型检查策略进入 design-change 的 architecture 或 frontend 子域。
- 具体 scripts、CI typecheck、package 输出进入 plan-change。
