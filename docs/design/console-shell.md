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
- Project console route 使用 Project 名称作为 URL 参数；URL-sensitive 名称必须通过 encode/decode 进入 `/api/projects/:projectName`。
- Project console 默认聚焦 Agent Sessions；Terminal、Git、Files 是同一 Project scope 下的辅助入口。
- Agent 区域在 runtime 未接入时展示明确空状态和未来状态摘要位置，不展示难以区分真假的 mock session。
- 底部输入或快速操作区域可以作为 shell-level affordance 展示，但在 runtime 未接入前必须禁用或说明不会发送输入。
- 桌面端复用同一产品逻辑，只扩展导航和信息密度；不要为 PC 端创建独立产品路径。
- 第一轮 PWA 外壳使用静态 manifest、icons 和 HTML meta/link；不注册 service worker，不承诺离线能力。

## 关键规则

- `web` 只通过同域 `/api` client 访问 Project 和后续 runtime 能力，不直接依赖 `api` 内部模块。
- 不把未验证的 AgentSession、TerminalSession 或 provider-native 字段推进 `packages/shared`；真实 session 语义由 runtime design 决定。
- Terminal/Git/Files 入口在真实能力完成前只能展示占位、空状态或 coming soon，不执行文件写入、Git 写操作或 session runtime 操作。
- 状态表达不能只依赖颜色；应结合文字标签，如 Default focus、Coming soon、No runtime connected、Disabled。
- 移动端是布局基准；桌面可以使用侧栏/双栏，但必须保持 Agent 默认焦点和 Project 上下文可见。
- PWA manifest 至少包含应用名、short name、start URL、standalone display、theme/background color、192 和 512 PNG icons。

## 不适用场景

- 不定义真实 Agent/Terminal session lifecycle、WebSocket stream、输入发送、重连或关闭语义。
- 不定义 Files/Git 的读取、diff、预览或写操作行为。
- 不覆盖离线缓存、service worker 更新策略、push notification 或系统通知。
- 不替代后续品牌、图标体系或精细动效设计。

## 来源

- change：build-responsive-pwa-console-shell
- verify 证据：`.workflow/changes/build-responsive-pwa-console-shell/verify.md`
- 运行态验证证据：`.workflow/changes/build-responsive-pwa-console-shell/artifacts/console-desktop.png`、`.workflow/changes/build-responsive-pwa-console-shell/artifacts/console-mobile.png`
