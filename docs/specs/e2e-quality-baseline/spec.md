# e2e-quality-baseline spec

本文件记录自动化 E2E 质量基线的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 为 `web + api + session runtime` 提供可重复的跨服务质量信号，避免只依赖单元测试或一次性人工 smoke。
- 确保第一条高价值 smoke path 覆盖用户从登录到 Terminal Session 真实输入输出的关键链路。

## Requirements

### Requirement: E2E baseline covers the authenticated project-to-terminal runtime path

系统 SHALL 提供一条可重复执行的 E2E smoke 链路，覆盖登录、Project 列表、进入 Project、创建 Terminal Session、打开 Session detail、连接 WebSocket stream 并观察可交互终端输出。

#### Scenario: E2E runs the first Terminal Session smoke path

- **WHEN** 开发者或 CI 运行 E2E baseline
- **THEN** 测试自动打开 Web/PWA 入口并完成单密码登录
- **AND** 测试进入 Project 列表并选择或准备一个临时 Project
- **AND** 测试进入该 Project 的控制台页面
- **AND** 测试创建一个 Terminal Session
- **AND** 测试打开该 Terminal Session detail
- **AND** 测试看到 runtime/transport 进入可交互状态

#### Scenario: Project list and console are unavailable

- **WHEN** E2E baseline 无法完成登录、Project 列表加载或 Project console 进入
- **THEN** 测试失败并记录失败步骤
- **AND** 输出足够定位 `web`、`api`、认证或 Project 准备问题的日志或截图

### Requirement: E2E baseline uses real dependencies for the Terminal runtime path

系统 SHALL 在第一轮 Terminal Session E2E 中使用真实 `api`、`web`、临时 `PROJECTS_ROOT`、runtime dir、`tmux`/shell 和 WebSocket stream，而不是只验证静态页面或完全 mock runtime。

#### Scenario: E2E starts an isolated runtime environment

- **WHEN** E2E baseline 启动测试环境
- **THEN** 它准备临时 `PROJECTS_ROOT` 与 runtime dir
- **AND** 启动 `api` 与 `web` 服务
- **AND** Terminal Session 通过真实 `tmux`/shell runtime 创建
- **AND** Session detail 通过真实 WebSocket stream 连接并读取输出

#### Scenario: Terminal runtime dependency is missing

- **WHEN** 运行环境缺少 `tmux` 或无法启动真实 shell runtime
- **THEN** E2E baseline 不应静默通过
- **AND** 测试应以明确错误说明缺失的真实依赖或跳过条件

### Requirement: E2E baseline verifies terminal input and observable output

系统 SHALL 在 Terminal Session detail 中发送可控输入，并验证输出中出现可观察结果，从而证明 browser、HTTP/API、WebSocket 和 runtime IO 已联通。

#### Scenario: E2E sends a deterministic command

- **WHEN** Terminal Session detail stream 已 connected
- **THEN** 测试向当前 session 发送一个确定性命令或输入
- **AND** 测试等待终端输出出现该命令的可验证结果
- **AND** 成功条件不能只依赖页面存在或按钮可点击

#### Scenario: Stream connects but command output never appears

- **WHEN** WebSocket stream 已连接但确定性输出未在合理超时时间内出现
- **THEN** 测试失败
- **AND** 报告中包含 session id、当前页面、stream/runtime 相关日志或截图

### Requirement: E2E baseline captures actionable failure evidence

系统 SHALL 在 E2E 失败时保存可用于人工定位的报告、截图、日志或 trace，并在成功时提供简洁的通过信号。

#### Scenario: E2E fails during browser flow

- **WHEN** E2E baseline 在登录、Project、Session 创建、detail 或 stream 验证步骤失败
- **THEN** 测试保存失败页面截图或等价浏览器 artifact
- **AND** 保存 `api` / `web` 服务日志或等价输出
- **AND** 报告指出失败步骤和关键错误信息

#### Scenario: E2E passes

- **WHEN** 完整 smoke path 成功通过
- **THEN** 输出明确通过结果
- **AND** 必要 artifacts 可被后续 verify 或人工测试引用

### Requirement: E2E baseline is integrated as a sustainable quality entrypoint

系统 SHALL 将 E2E baseline 接入项目可重复运行的测试命令或脚本，使后续 changes 可以复用同一质量入口，而不是依赖一次性手动操作。

#### Scenario: Developer runs the baseline locally

- **WHEN** 开发者在本地执行项目定义的 E2E baseline 命令
- **THEN** 命令能准备测试环境、运行 smoke path 并退出
- **AND** 成功时返回成功状态码
- **AND** 失败时返回非零状态码并保留 failure evidence

#### Scenario: Later change needs regression coverage

- **WHEN** 后续 change 修改登录、Project、Session Runtime、WebSocket 或 Session detail 交互
- **THEN** 它可以复用或扩展该 E2E baseline 作为回归质量信号

### Requirement: Agent provider E2E remains decoupled from real AI CLIs in the first baseline

系统 SHALL 允许第一轮 E2E baseline 暂不依赖真实 Claude/Codex CLI；如覆盖 Agent 链路，应使用可控 fake provider、测试命令或后续单独设计，而不阻塞 Terminal runtime baseline。

#### Scenario: First E2E baseline scope is reviewed

- **WHEN** 第一轮 E2E baseline 被评审
- **THEN** Terminal Session 真实 runtime 链路是必需覆盖范围
- **AND** Claude/Codex Agent 真实 CLI 链路不是第一轮通过条件
- **AND** Agent 链路测试替身不得改变生产 provider 语义或混入用户可见行为

## Notes

- 当前已验证实现使用 Playwright Test + Bun orchestration，`bun run e2e` 会启动 isolated api/web services 并验证真实 Terminal Session output。
- `test-results/` 是 transient Playwright artifact 目录，不应提交；需要长期保存的 verify 证据应复制或记录到对应 `.workflow/changes/<change-id>/artifacts/`。

## 来源

- change：setup-e2e-quality-baseline
- verify 证据：`.workflow/changes/setup-e2e-quality-baseline/verify.md`
