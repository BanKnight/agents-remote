# Console shell design

本文件记录经过验证后沉淀下来的 Project console shell 长期 design。它面向后续版本复用，不复制单次 change 的过程记录。

## 背景

- `web` 是移动端优先的 Web/PWA 控制台，需要作为登录后进入 Project、观察 Agent 状态并发现 Terminal/Git/Files 辅助能力的统一入口。
- Project 已被定义为 `PROJECTS_ROOT` 下一级真实目录，是 Files、Git、Terminal Session 和 Agent Session 的统一作用域。
- 第一轮真实 Agent/Terminal runtime 尚未接入，因此 console shell 必须建立信息架构和观察空间，同时避免伪装真实会话或冻结 runtime 协议。

## 适用范围

- 登录后的 Project list、Project create/adopt 和 Project-scoped console 页面。
- Agent、Terminal、Git、Files 四类 Project 内入口的信息架构。
- 移动端优先、深色-only 的 PWA 控制台布局。
- runtime 尚未接入时的空状态、占位和 disabled input affordance。

## 设计结论

- 根入口展示 Project 列表和创建/采用入口；Project API 数据属于 TanStack Query 管理的 server state。
- 移动端根入口优先展示已有 Project 或工作上下文，创建/采用 Project 是低频入口，应保持可发现但不作为已有 Project 场景下的首屏大块常驻表单。
- Project console route 使用 Project 名称作为 URL 参数；URL-sensitive 名称必须通过 encode/decode 进入 `/api/projects/:projectName`。
- 移动端 Project console 是工作区主界面：顶部显示返回 Projects 与当前 Project 上下文，主体优先展示 Files/Git 功能区，然后展示 Agent Sessions 与 Terminal Sessions 区域。
- Project console 的直接二级 workspace 包括 Agent、Files、Git、Terminal；移动端直接二级页使用 Project 二级底部导航，深层/contextual detail 使用顶部返回并隐藏该底部导航。
- Project console 保持 Agent Sessions 作为主要运行态区域；Terminal Sessions 是独立运行态区域，Files/Git 是 Project 级只读检查入口。
- Agent/Terminal 区域展示真实 session 数据、创建入口、空状态和错误状态；不要用 mock session 填充工作区。
- Project 工作区不常驻 shell-level 底部 runtime input；真实输入、快捷键、重连恢复和发送状态归属于具体 Agent/Terminal Session detail。
- 桌面端复用同一产品逻辑，只扩展导航和信息密度；不要为 PC 端创建独立产品路径。
- 第一轮 PWA 外壳使用静态 manifest、icons 和 HTML meta/link；不注册 service worker，不承诺离线能力。

## 关键规则

- `web` 只通过同域 `/api` client 访问 Project 和后续 runtime 能力，不直接依赖 `api` 内部模块。
- 不把未验证的 AgentSession、TerminalSession 或 provider-native 字段推进 `packages/shared`；真实 session 语义由 runtime design 决定。
- Terminal/Git/Files 入口展示真实能力、明确空状态或错误状态；Terminal workspace 列出 live Terminal instances 并提供 create/open/close，但 runtime input 只在 Terminal detail 中出现；Files/Git 保持只读 inspection。
- 状态表达不能只依赖颜色；应结合文字标签，如 Default focus、Coming soon、No runtime connected、Disabled。
- 移动端是布局基准；Project 工作区默认使用单列顺序：Project context / Files-Git 功能区 / Agent Sessions / Terminal Sessions；桌面可以增强为多列，但不能让移动端依赖侧栏发现一级入口。
- Project 工作区不渲染固定底部 runtime input panel，也不要通过 CSS 隐藏真实输入面板来满足移动布局；输入控制必须进入 Session detail 后出现。
- 登录后页面应采用动态视口高度、`min-w-0`、长文本截断/换行和局部滚动区域来避免页面级横向溢出；不能只依赖全局隐藏 overflow 掩盖不可达内容。
- `docs/design/prototype.png` 只作为暗色移动端控制台气质、密度和层级参考；最终用户可见术语必须映射到 Project、Agent Sessions、Terminal、Files、Git 等项目领域概念。
- PWA manifest 至少包含应用名、short name、start URL、standalone display、theme/background color、192 和 512 PNG icons。

## 不适用场景

- 不定义真实 Agent/Terminal session lifecycle 或 WebSocket stream 协议；Project 工作区只提供创建、列表和进入 detail 的入口。
- 不定义 Files/Git 写操作行为。
- 不覆盖离线缓存、service worker 更新策略、push notification 或系统通知。
- 不替代后续品牌、图标体系或精细动效设计。

## 来源

- change：build-responsive-pwa-console-shell
- verify 证据：`.workflow/changes/build-responsive-pwa-console-shell/verify.md`
- 运行态验证证据：`.workflow/changes/build-responsive-pwa-console-shell/artifacts/console-desktop.png`、`.workflow/changes/build-responsive-pwa-console-shell/artifacts/console-mobile.png`
- change：align-mobile-app-shell
- verify 证据：`.workflow/changes/align-mobile-app-shell/verify.md`
- 运行态验证证据：`.workflow/changes/align-mobile-app-shell/artifacts/mobile-home.png`
- change：rework-project-mobile-workspace
- verify 证据：`.workflow/changes/rework-project-mobile-workspace/verify.md`
- 运行态验证证据：`.workflow/changes/rework-project-mobile-workspace/artifacts/mobile-project-workspace.png`
- change：align-resource-inspection-pages
- verify 证据：`.workflow/changes/align-resource-inspection-pages/verify.md`
- 运行态验证证据：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/resource-inspection-check.log` 与同目录 Files/Git/Terminal desktop/mobile 截图
- change：align-resource-inspection-workspaces
- verify 证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/verify.md`
- 运行态验证证据：`.workflow/versions/v0.8-prototype-ui-alignment/changes/align-resource-inspection-workspaces/artifacts/browser-check.log` 与同目录 Files/Git/Terminal workspace prototype/app desktop/mobile 截图
