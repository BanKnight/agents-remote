# Frontend Design

## Change

- change-id：align-mobile-app-shell

## 前端范围

- 技术栈：React 19 + TypeScript + Vite + TanStack Router + TanStack Query + Jotai + Tailwind CSS，沿用现有 `web/` 约定，不新增依赖。
- 修改登录后首页 / Project list route 的布局、密度和创建/采用入口呈现。
- 调整全局 shell 或基础样式中的移动端 viewport/overflow 约束，供后续页面复用。
- 不修改 `api/`、`packages/shared/` 协议或 runtime 数据模型。

## 模块划分

- 页面级 route 继续负责 Project 列表数据加载、创建/采用流程和主要布局组合。
- Shell/layout 层负责全高背景、页面宽度、导航/内容区边界和全局 overflow 基线。
- Project 创建/采用 UI 可以从常驻大块区域变为轻量入口 + 展开/弹出/内联表单，具体以现有代码最小改动为准。
- 后续 Project workspace、Session console、Files/Git 页面只消费本 change 建立的 shell 约束，不在本 change 中重排其业务内容。

## 组件边界

- 首页主内容组件负责展示 Project 列表、加载态、空态、错误态和进入 Project 行为。
- 创建/采用组件负责表单输入、提交中、错误和成功反馈；它不应决定首页整体信息层级。
- Shell 容器负责 `min-h-dvh`、安全区域 padding、横向 overflow 防护和内容滚动框架。
- 不为了一次布局调整拆出通用设计系统；只有已有组件真实复用时才提取。

## 状态管理

- Project 列表与创建/采用请求仍属于 TanStack Query / existing API client 管理的 server state。
- 创建/采用表单的输入、展开/收起、提交中和本地错误优先保持在页面或组件局部 state。
- Shell 级跨页面 UI 状态只有在多个远离 route 需要共享时才进入 Jotai；本 change 不默认新增 atom。
- 不把视觉密度、当前 viewport 或一次性展开状态持久化。

## 路由 / 页面接入

- 继续使用现有首页和 Project route；不新增产品路由作为创建/采用的必需路径，除非现有代码已经采用独立 route。
- Project entry URL 编码/解码规则保持现状。
- 宽屏与移动端共享同一 route 和信息架构，通过响应式样式调整布局，不创建独立 desktop 页面。

## 工程约束

- Tailwind 样式优先使用移动端默认 + breakpoint 增强，避免 desktop-first 后再覆盖移动端。
- 根页面和 shell 容器应避免 `w-screen` 搭配 padding 导致横向溢出；更偏向 `w-full`、`min-w-0`、`overflow-x-hidden` 和局部 `min-w-0`。
- 列表项、卡片、代码/路径/长 Project 名称需要显式 `min-w-0`、截断或换行策略。
- 使用动态视口高度时优先考虑移动浏览器地址栏变化，可采用 `min-h-dvh` 或项目已有等价 CSS。
- UI 变更必须通过浏览器验证移动视口；verify 阶段需要保存截图或等价 artifact。

## 关键决策

- 不引入新 UI 库或布局框架；现有 Tailwind 足以完成本 change。
- 创建/采用 Project 的视觉降级通过页面布局和交互状态完成，不改变服务端接口或 shared DTO。
- 全局 overflow 基线应在尽量靠近 shell/root layout 的位置收敛，同时对具体长文本容器补 `min-w-0`，避免单靠 `overflow-hidden` 掩盖不可达内容。

## 风险与权衡

- 只在 root 强行隐藏横向溢出可能掩盖子组件宽度问题；实现时要同时修正会撑宽的具体容器。
- 过早抽象 shared shell 组件可能增加后续重排成本；本 change 应优先小步调整现有 layout，再根据复用真实出现提取。
- 表单从常驻大块改为次级入口后，测试需要覆盖展开/提交路径，避免功能实际不可达。

## 开放问题

- 无。

## 后续沉淀候选

- `web` 移动端 shell/root layout 的 overflow 和 viewport 高度实践。
- 首页 Project 主路径与低频创建/采用入口的组件边界。
