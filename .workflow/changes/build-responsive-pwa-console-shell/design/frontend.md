# Frontend Design

## Change

- change-id：build-responsive-pwa-console-shell

## 前端范围

- `web` 工作区内的 React + TypeScript + Vite 单页应用。
- TanStack Router 路由扩展：根 Project 列表入口和 Project scoped console 路由。
- TanStack Query 数据获取：Project list/detail/create 使用既有 `/api/projects` client。
- Jotai 本地 UI 状态：section 选择、底部 affordance 展开等非持久化交互状态。
- PWA 静态资源：manifest、icons、HTML meta/link。

## 模块划分

- Route 层：负责根入口和 Project console 的 URL 参数、加载边界和页面组合。
- API client 层：复用 `listProjects`、`createProject`、`getProject`，不绕过 `/api`。
- Console shell 层：组合 Project header、section navigation、Agent main panel、auxiliary panels、bottom action affordance。
- View model 层：在前端把 Project summary 和空 session 状态映射成展示模型；不新增共享 DTO。
- PWA asset 层：静态 manifest 和图标位于 `web/public`，由 `index.html` 引用。

## 组件边界

- Project list 组件负责展示 Project summary、创建入口和 API 状态，不负责 Project 路由定义。
- Project console 组件负责布局和 section 组合，不负责真实 session runtime。
- Section navigation 组件只表达 Agent/Terminal/Git/Files 入口和当前选择。
- Agent panel 展示空状态、占位结构和未来 session summary 的信息位置，不伪造真实会话。
- Bottom action 组件只表达 disabled/coming soon affordance，不发送输入。

## 状态管理

- 服务端状态：Project list/detail/create 由 TanStack Query 管理。
- URL 状态：当前 Project 名称由 TanStack Router 路由参数承载，需 encode/decode。
- 页面状态：当前 section 可以先用路由内 state 或 Jotai；如果需要跨组件读写，使用 Jotai atom。
- 交互状态：底部 affordance 展开/收起继续使用 Jotai 或局部 React state。
- 不新增全局业务 store，不把 Project API 数据复制进 Jotai。

## 路由 / 页面接入

- `/`：Project 列表和创建入口。
- Project console 路由：使用 Project 名称作为 URL 参数，前端通过 `encodeURIComponent`/router 参数表达 URL-sensitive 名称。
- 进入 Project 后调用 `getProject(projectName)` 校验和获取当前 Project 上下文。
- 未找到或加载失败时展示错误/返回 Project 列表入口。

## 工程约束

- 沿用 React 19、Vite 8、Tailwind 4、TanStack Router/Query、Jotai 和 Bun scripts。
- 不新增 PWA 插件依赖；不引入组件库、图标库或新的状态库。
- PWA 采用 `web/public/manifest.webmanifest`、192/512 PNG icon 和 `index.html` meta/link。
- `manifest.webmanifest` 至少包含 `name`、`short_name`、`start_url`、`display: "standalone"`、`theme_color`、`background_color`、icons。
- 不注册 service worker，不声明离线能力。

## 技术资料核对

- 检索时间：2026-05-25。
- 使用基线：`.claude/skills/technology-research/references/default-web-stack.md`、`.claude/skills/technology-research/references/bun-vite.md`。
- 当前来源：Context7 `/vitejs/vite/v8.0.10`、Context7 `/mdn/content`、Context7 `/vite-pwa/vite-plugin-pwa`、`npm view vite-plugin-pwa version time dist-tags dependencies --json`。
- 结论：Vite 可以直接服务 `public` 静态资源并从 `index.html` 引用 manifest；MDN/Chromium installability 需要 manifest 关键字段和 192/512 icons；`vite-plugin-pwa` 主要价值在 manifest 注入、service worker 和 Workbox/offline，本 change 不需要。
- 供应链判断：`vite-plugin-pwa@1.3.0` 发布于 2026-05-05，满足 7 天规则，但会引入 Workbox 等依赖；本 change 不新增该依赖。

## 关键决策

- 根路由从 smoke 页面升级为实际 Project console 入口，不继续保留无产品意义的 health-only demo。
- Project console 使用 Project API 真实数据，session 相关区域使用空状态/占位而不是 mock 数据。
- PWA shell 静态实现优先，service worker 留给后续离线/更新策略 change。

## 风险与权衡

- 手写 manifest 简单可控，但无法自动生成多尺寸图标或 service worker；本轮范围内可接受。
- Project 路由参数如果手写解析不当会影响特殊字符 Project；实现需通过 TanStack Router 参数和 API client encode 校验。
- 如果浏览器安装条件变化，可能需要后续补充 service worker 或额外 manifest 字段；本轮验证以当前 Chromium/MDN 要求为准。

## 开放问题

- 后续是否把 section 选择放入 URL，需要在真实 Files/Git/Terminal 页面出现后再决定。

## 后续沉淀候选

- 静态 PWA shell 实现边界和 service worker 延后原则可沉淀到长期 frontend stack 文档。