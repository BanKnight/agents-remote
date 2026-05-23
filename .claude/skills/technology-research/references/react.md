# React 默认技术基线

## 默认推荐

- 使用 React 作为 UI 组件层，而不是把数据获取、路由、服务端边界都塞进组件树。
- 默认使用函数组件、组合式组件、明确 props 类型和受控副作用。
- Server state 与 client state 分离：远端数据优先交给 Query/loader/server framework，局部交互状态才放 React state。
- 表单、路由、数据加载、表格等复杂能力优先选择职责明确的成熟工具，而不是在组件中自造框架。
- 可访问性、响应式、错误状态、加载状态是组件设计的一部分，不是最后补丁。

## 职责边界

- React：组件组合、渲染、局部交互状态。
- Router/framework：页面结构、路由参数、导航、代码分割。
- Server state 工具：缓存、重试、失效、后台同步。
- Form 工具：字段状态、校验、提交生命周期。
- Design system/UI primitives：一致交互和可访问性基础。

## 常见反模式

- 把所有状态都放进 Context。
- 在组件里手写远端缓存、重试和失效逻辑。
- 为了“复用”过早抽象复杂通用组件。
- 滥用 memo/useCallback 代替真实性能分析。
- 不区分 server state、URL state、form state、local UI state。

## 需要官方确认的点

- 当前 React 推荐的数据获取与服务端渲染边界。
- hooks、concurrent features、server components 相关限制。
- 所选 framework 对 React 能力的支持方式。
- 状态管理、表单、数据获取库与当前 React 版本兼容性。

## 何时不适用

- 主要是静态内容站，Astro/SSG 可能更简单。
- 需要极轻交互且团队没有 React 经验。
- 项目运行环境或框架已经强约束到其他 UI 技术。

## 输出落点

- UI/前端技术选择写入 `design-change` 的 frontend 或 ui-ux 子域。
- 组件模式、状态边界和性能假设进入 change design 或 implementation plan。
