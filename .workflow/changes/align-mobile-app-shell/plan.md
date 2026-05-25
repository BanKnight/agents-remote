# plan

## Change 目标

- 建立移动端优先的 App-like console shell 基线，让登录后首页优先服务 Project 进入路径，并降低 Create/Adopt Project 的常驻视觉占比。
- 收敛全局移动端 viewport 与 overflow 行为，为后续 Project 工作区、Session 控制台、Files/Git 移动视图提供统一布局前提。

## 局部 big picture

- 本 change 是 `v0.5-mobile-ux-polish` 的第一步，后续三个 change 都依赖它提供移动端 shell、页面密度和术语映射基线。
- 当前代码中首页 `HomeRoute.tsx` 仍偏“网站式 landing”：大页头、大描述和常驻创建表单会挤占移动端首屏；`ProjectConsoleRoute.tsx` 已有 Project 内 shell，但全局 root/body 仍使用 `100vh`，需要与移动浏览器视口和横向不溢出要求对齐。
- 本 change 不重排 Project 内具体工作区或 Session detail，只修首页主路径和全局 shell 基线，避免抢后续 changes 的范围。

## 执行策略

- 先补全全局 CSS/root 容器的移动端安全基线，避免后续页面继续继承 `100vh` 与横向溢出的隐患。
- 再重排 `HomeRoute.tsx`：把 Project 列表变成首屏主对象，把 Create/Adopt Project 改成次级但可发现的入口，并保留完整提交、错误和空态路径。
- 然后做小范围 Project console shell 对齐：只补必要的 `min-w-0`、动态视口和横向防护，不改业务区重排。
- 最后补前端行为验证：运行现有质量门禁，并用浏览器移动视口采集首页截图作为 verify 阶段证据基础。

## 任务顺序依据

- 全局 CSS/root 约束会影响首页和 Project console，是所有视觉任务的基础，必须先做。
- 首页信息层级是本 change 的核心；它依赖全局 shell 基线，但不依赖 Project console 的后续小修。
- Project console 只做兼容性对齐，避免首页实现后仍存在明显横向溢出或 `100vh` 不一致。
- 验证必须在实现后执行；浏览器截图依赖本地 web/api 服务可用，应放在最后。

## 额外上下文

- `docs/project.md`：长期项目定位、技术栈、移动端 PWA shell、UI verify artifact 要求和长驻进程管理准则。
- `docs/specs/pwa-console-shell/spec.md`：PWA shell、深色移动端优先和原型参考的长期 WHAT。
- `docs/specs/project-console-navigation/spec.md`：Project 控制台导航语义和 Agent/Terminal/Files/Git 入口优先级。
- `docs/design/console-shell.md`：已验证的 Project console shell 长期设计边界。
- `docs/design/frontend-stack.md`：React/Tailwind/TanStack/Jotai 前端状态与样式边界。
- `web/src/routes/HomeRoute.tsx`：首页 Project list 与 Create/Adopt Project UI 的主要实现入口。
- `web/src/routes/ProjectConsoleRoute.tsx`：Project 内 shell 的全局布局对齐入口，本 change 只做溢出/视口基线修正。
- `web/src/styles/index.css`：root/body 全局移动视口和 overflow 基线入口。
- `web/src/routes/router.tsx`：确认首页和 Project route 共用 AuthGate/root route，不需要新增路由。

## 依赖与阻塞

### 阶段依赖

- specs 和 design 已完成，本阶段可以进入实现。
- verify 阶段需要真实浏览器检查移动视口，并保存截图或等价 artifact。

### 任务依赖

- 1.1 全局 shell/CSS 基线阻塞 2.1 首页移动重排和 2.2 Project console 对齐。
- 2.1 首页移动重排阻塞 3.1 首页创建/采用路径确认和 4.1 浏览器验证。
- 2.2 Project console 对齐可在 2.1 之后执行，避免同一轮中对视觉基线的判断互相覆盖。
- 3.1 行为确认依赖 2.1，确保视觉降级后 Create/Adopt 仍可用。
- 4.1 质量门禁与浏览器截图依赖所有实现任务完成。

### 外部依赖

- 不需要新第三方服务、数据迁移、权限或人工确认。
- 浏览器验证需要复用或启动明确命名的 web/api 长驻进程，避免端口递增和孤儿进程。

## 并行机会

- 1.1 不能并行，是布局基线。
- 2.1 和 2.2 都会触碰前端布局，并且 2.2 的取舍要基于 1.1 与 2.1 后的视觉结果，建议串行。
- 3.1 可与 2.2 的纯样式检查部分接近并行，但同在 `HomeRoute.tsx` 上有上下文依赖，实际执行建议串行。
- 4.1 只能在实现完成后执行。

## 风险与验证重点

- 不能通过全局 `overflow-x-hidden` 掩盖不可达内容；长 Project 名、路径、卡片内容仍要在具体容器上处理 `min-w-0`、截断或换行。
- Create/Adopt Project 入口视觉降级后仍必须可发现、可提交、可展示错误，空 Project 状态下应更突出该入口。
- 移动端截图要验证首页不再以大页头/大表单占满首屏，并且 Project 列表是主路径。
- 宽屏不能丢失原有 Project list 与创建/采用能力。

## 不做事项

- 不新增或修改 API、shared DTO、后端 Project 规则或数据持久化。
- 不新增 PWA service worker、离线、通知、主题切换或新依赖。
- 不重做 Project 详情页功能区、Session detail 输入/快捷键、Files/Git 详情密度。
- 不引入新的全局状态 atom，除非实现中发现已有 shell 状态必须跨 route 共享。
