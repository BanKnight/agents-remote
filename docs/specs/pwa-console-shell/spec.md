# pwa-console-shell spec

本文件记录 `pwa-console-shell` 的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 定义 Web/PWA 控制台外壳在第一轮必须提供的安装能力、深色移动端优先体验和响应式可用性。
- 确保 PWA 外壳服务于远程可达和随时可观察，而不是提前承诺离线、通知或完整 service worker lifecycle。

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

#### Scenario: User looks for theme switching

- **WHEN** 用户在第一轮控制台中查找浅色/深色切换
- **THEN** 系统不要求提供主题切换入口
- **AND** 深色主题仍保持主要信息可读

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

系统 SHALL 在不违背文本文档、澄清意图、安全边界和长期架构约束的前提下，以 `docs/design/prototype.png` 的暗色移动端控制台气质作为第一轮布局和视觉层级参考。

#### Scenario: Implementer chooses shell layout details

- **WHEN** 实现者需要决定顶部项目上下文、会话卡片、状态标签或底部输入区域的呈现优先级
- **THEN** 默认参考 `docs/design/prototype.png` 的信息层级和暗色控制台气质

#### Scenario: Prototype conflicts with written constraints

- **WHEN** 原型与文本文档、澄清意图、安全边界或部署约束发生影响实现的冲突
- **THEN** 系统 SHALL 优先遵循文本文档、澄清意图、安全边界和部署约束
- **AND** 冲突应在设计或实现前被显式提出，而不是自行猜测

### Requirement: Notifications are deferred from the first shell slice

系统 SHALL 不把系统通知作为第一轮 PWA shell 的必备行为；第一轮优先保证用户打开网页或 PWA 后能快速观察运行中和等待输入的会话。

#### Scenario: User opens the console to inspect status

- **WHEN** 用户打开控制台或已安装 PWA
- **THEN** 系统优先展示当前项目内会话状态和需要用户关注的入口
- **AND** 不要求通过系统通知主动提醒用户

## Notes

- 第一轮 PWA shell 已验证采用静态 manifest、icons 和 HTML meta/link，不注册 service worker，不承诺离线能力。
- 后续如需离线缓存、安装提示、更新提示或 push notification，应单独设计缓存、认证和实时数据边界。

## 来源

- change：build-responsive-pwa-console-shell
- verify 证据：`.workflow/changes/build-responsive-pwa-console-shell/verify.md`
