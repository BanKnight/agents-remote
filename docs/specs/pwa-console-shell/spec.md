# pwa-console-shell spec

本文件记录 `pwa-console-shell` 的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 定义 Web/PWA 控制台外壳必须提供的安装能力、深色移动端优先体验和响应式可用性。
- 确保 PWA 外壳服务于远程可达和随时可观察，同时将 service worker 缓存限制在静态安装资源，不伪造远程 API/runtime 数据。

## Requirements

### Requirement: Console shell is installable as a first-round PWA

系统 SHALL 让网页登录入口具备第一轮 PWA 安装能力，使用户可以从手机桌面以接近 App 的独立窗口方式打开控制台。

#### Scenario: User opens the console from an installed mobile PWA

- **WHEN** 用户将控制台安装到手机桌面并从该入口打开
- **THEN** 控制台以独立应用窗口形态显示
- **AND** 不要求第一轮提供离线数据能力

#### Scenario: Browser evaluates installability

- **WHEN** 浏览器检查控制台是否可安装
- **THEN** 控制台提供 PWA 安装所需的应用名称、图标、启动地址、显示模式和主题色信息

### Requirement: Console shell is mobile-first and dark-only in the first round

系统 SHALL 以移动端优先的深色控制台作为第一轮默认界面，不提供浅色主题切换作为第一轮行为要求。

#### Scenario: User opens the console on a mobile viewport

- **WHEN** 用户在手机尺寸视口打开控制台
- **THEN** 页面以深色控制台视觉展示主要内容
- **AND** 关键状态、列表和操作入口在移动端首屏可识别

#### Scenario: User opens the authenticated console on a mobile viewport

- **WHEN** 已认证用户在手机尺寸视口打开控制台
- **THEN** 页面呈现深色、全高、App-like 的控制台布局
- **AND** 主要入口使用本项目术语表达 Project、Agent Sessions、Terminal、Files、Git 等能力
- **AND** 页面不以传统网站大页头、大营销文案或大面积介绍块作为移动端首屏主视觉

#### Scenario: User looks for theme switching

- **WHEN** 用户在第一轮控制台中查找浅色/深色切换
- **THEN** 系统不要求提供主题切换入口
- **AND** 深色主题仍保持主要信息可读

### Requirement: Mobile console pages avoid viewport-level overflow by default

系统 SHALL 让登录后移动端页面默认收敛在设备视口内，除明确需要滚动的内容区域外，不产生页面级横向溢出或因固定区域叠加导致的不可达内容。

#### Scenario: User opens primary console pages on a narrow mobile viewport

- **WHEN** 用户在窄手机视口打开 Project 列表、Project 控制台、Session 详情、Files 或 Git 页面
- **THEN** 页面主体不会超出视口宽度形成横向页面滚动
- **AND** 顶部、主体、底部导航或操作区共同占用的高度不会让核心内容被永久遮挡
- **AND** 需要滚动的列表、终端输出或详情内容在自己的可滚动区域内可访问

#### Scenario: Dynamic content is longer than the visible area

- **WHEN** 会话列表、文件列表、Git diff 或终端输出超过当前可视高度
- **THEN** 超出的内容通过明确的滚动区域访问
- **AND** 页面级 shell 仍保持当前 Project 或页面上下文可识别

### Requirement: Console shell remains usable on wider desktop viewports

系统 SHALL 让同一套控制台信息架构在桌面宽屏可用，并利用更宽屏幕展示辅助导航或并列区域，但不引入一套独立于移动端的产品逻辑。

#### Scenario: User opens the console on a desktop viewport

- **WHEN** 用户在桌面宽屏浏览器打开控制台
- **THEN** 控制台仍呈现与移动端一致的核心导航和内容层级
- **AND** 宽屏可以展示侧边导航、双栏或更多上下文来减少空白

#### Scenario: Desktop and mobile behavior are compared

- **WHEN** 同一个 Project 控制台页面分别在手机和桌面视口打开
- **THEN** Agent、Terminal、Git、Files 的入口语义保持一致
- **AND** 不要求用户学习两套不同的产品路径

### Requirement: Prototype visual hierarchy is the default product reference

系统 SHALL 在不违背文本文档、澄清意图、安全边界和长期架构约束的前提下，以 `docs/design/prototype.png` 的暗色移动端控制台气质作为第一轮布局密度和视觉层级参考，但所有用户可见元素命名、页面概念与操作文案必须映射到本项目自己的 Project、Agent Session、Terminal、Files、Git 等领域术语。

#### Scenario: Implementer chooses shell layout details

- **WHEN** 实现者需要决定顶部项目上下文、会话卡片、状态标签或底部输入区域的呈现优先级
- **THEN** 默认参考 `docs/design/prototype.png` 的信息层级和暗色控制台气质
- **AND** 不把原型中的通用页面元素、占位命名或示例文案直接带入最终产品

#### Scenario: Prototype conflicts with written constraints

- **WHEN** 原型与文本文档、澄清意图、安全边界或部署约束发生影响实现的冲突
- **THEN** 系统 SHALL 优先遵循文本文档、澄清意图、安全边界和部署约束
- **AND** 冲突应在设计或实现前被显式提出，而不是自行猜测

### Requirement: PWA service worker preserves install assets only

系统 SHALL 注册 PWA service worker 来缓存 manifest、icons 和构建静态资产等安装资源，但不得缓存导航 HTML，也不得缓存或伪造需要实时认证、Project、Agent、Terminal、Files 或 Git 数据的 API 响应。

#### Scenario: Browser installs or revisits the PWA

- **WHEN** 支持 service worker 的浏览器加载控制台
- **THEN** 系统注册同源 service worker
- **AND** service worker 缓存 manifest、图标和构建静态资产等安装资源

#### Scenario: User reopens an installed PWA after a frontend update

- **WHEN** 已安装 PWA 的用户重新打开控制台
- **THEN** 导航 HTML 优先从网络获取，避免继续展示旧 shell 或旧 CSS
- **AND** 需要 `/api` 的认证、Project 列表、runtime stream、Files 或 Git 数据不被 service worker 用缓存伪造为可用

### Requirement: Notifications are deferred from the first shell slice

系统 SHALL 不把系统通知作为第一轮 PWA shell 的必备行为；第一轮优先保证用户打开网页或 PWA 后能快速观察运行中和等待输入的会话。

#### Scenario: User opens the console to inspect status

- **WHEN** 用户打开控制台或已安装 PWA
- **THEN** 系统优先展示当前项目内会话状态和需要用户关注的入口
- **AND** 不要求通过系统通知主动提醒用户

## Notes

- PWA shell 提供 manifest、icons、HTML meta/link、应用内安装入口和 service worker 静态安装资源缓存。
- service worker 不缓存导航 HTML，只缓存静态安装资源和构建静态资产，不拦截 `/api` 响应，也不承诺离线 Project/Agent/Terminal/Files/Git 数据能力。
- 后续如需更新提示、后台同步或 push notification，应单独设计缓存、认证和实时数据边界。
- 移动端 shell 已验证采用 Project 主路径优先、低频 Create/Adopt Project 次级入口、动态视口高度和页面级横向不溢出基线。

## 来源

- change：build-responsive-pwa-console-shell
- verify 证据：`.workflow/changes/build-responsive-pwa-console-shell/verify.md`
- change：align-mobile-app-shell
- verify 证据：`.workflow/changes/align-mobile-app-shell/verify.md`
