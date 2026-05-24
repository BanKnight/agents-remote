# private-access-auth spec

本文件记录 `private-access-auth` 的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 为个人私有部署提供最小访问保护：单密码登录、本地 token、HTTP/WebSocket 认证边界。
- 保持第一轮访问模型简单，避免提前引入多用户、角色权限、设备管理或团队协作复杂度。

## Requirements

### Requirement: System uses single-password private access

系统 SHALL 在第一轮提供单密码登录，并不要求用户名、注册、OAuth、2FA 或普通用户手动输入 API 地址。

#### Scenario: User opens login page

- **WHEN** 未认证用户打开 Web/PWA 入口
- **THEN** 用户看到单密码登录入口，而不是用户名、注册、OAuth 或 2FA 流程

#### Scenario: User submits correct password

- **WHEN** 用户提交正确的单密码
- **THEN** 系统登录成功，并进入后续受保护页面

#### Scenario: User submits wrong password

- **WHEN** 用户提交错误密码
- **THEN** 登录页直接提示密码错误

### Requirement: Local token protects HTTP requests

系统 SHALL 在登录成功后签发本地 token，并用该 token 保护后续 HTTP API 请求。

#### Scenario: Authenticated HTTP request is sent

- **WHEN** 登录后的前端发起 HTTP API 请求
- **THEN** 请求自动携带认证状态，且用户不需要手动处理 token

#### Scenario: HTTP request lacks valid token

- **WHEN** HTTP API 请求缺少有效 token 或 token 被后端判定无效
- **THEN** 后端拒绝该请求，前端回到登录页

#### Scenario: Token behavior is reviewed

- **WHEN** 第一轮认证能力被评审
- **THEN** 行为范围不包含复杂刷新机制、设备管理或会话列表

### Requirement: Local token protects WebSocket connections

系统 SHALL 使用同一认证状态保护需要登录访问的 WebSocket 连接。

#### Scenario: Authenticated WebSocket connects

- **WHEN** 登录后的前端连接受保护的 WebSocket stream
- **THEN** 连接自动携带认证状态，且用户不需要手动输入或理解 WebSocket 认证参数

#### Scenario: WebSocket lacks valid token

- **WHEN** WebSocket 连接缺少有效 token 或 token 被后端判定无效
- **THEN** 后端拒绝该连接，前端显示需要重新登录或回到登录页

### Requirement: Login state persists for mobile/PWA convenience

系统 SHALL 默认在手机/PWA 上保留登录状态一段时间，以减少频繁输入密码。

#### Scenario: User reopens PWA before token expires

- **WHEN** 用户在 token 仍有效时重新打开 Web/PWA
- **THEN** 用户可以继续访问受保护页面，而不需要重新输入密码

#### Scenario: Token expires or becomes invalid

- **WHEN** token 过期、服务端重启导致 token 无效，或后端判定 token 无效
- **THEN** 当前页面回到登录页，要求用户重新登录

#### Scenario: Return-to-original-location behavior is reviewed

- **WHEN** 用户因认证过期回到登录页后重新登录
- **THEN** 是否回到原本位置不属于第一轮必需行为

### Requirement: Private deployment security scope stays single-user

系统 SHALL 将第一轮安全范围限定为个人私有部署下的单密码访问、HTTP/WebSocket token 保护、`PROJECTS_ROOT` 路径不逃逸和危险操作确认。

#### Scenario: Access model is reviewed

- **WHEN** 第一轮安全能力被评审
- **THEN** 系统不提供多用户、角色权限或团队协作模型

#### Scenario: Dangerous operation requires confirmation

- **WHEN** 后续能力执行会终止进程或产生危险影响的操作
- **THEN** 系统应要求用户确认，而不是仅依赖登录状态

#### Scenario: Path safety is required by downstream APIs

- **WHEN** 后续 project、文件、Git 或 tmux 启动目录相关 API 使用项目路径
- **THEN** 这些 API 必须受 `PROJECTS_ROOT` 安全解析约束，而不能仅依赖认证通过

## Notes

- 当前已验证实现覆盖后端登录 API、token 签发/校验、HTTP guard 和 WebSocket guard。
- Web/PWA 登录页、认证过期跳转和 WebSocket 认证失败提示尚未由已验证实现覆盖，必须由后续 UI/PWA change 承接。
- URL query token 不应成为 Web UI 主路径；后续 WebSocket stream 设计应优先考虑更不易泄露的认证携带方式。

## 来源

- change：configure-personal-app-settings
- verify 证据：`.workflow/changes/configure-personal-app-settings/verify.md`
