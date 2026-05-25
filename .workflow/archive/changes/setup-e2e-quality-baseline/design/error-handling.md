# Error Handling Design

## Change

- change-id：setup-e2e-quality-baseline

## 异常范围

- E2E environment setup：临时目录、端口、测试密码、`PROJECTS_ROOT`、runtime dir。
- Service lifecycle：api/web dev services 启动失败、ready 超时、异常退出、日志收集。
- Browser flow：登录失败、Project 列表/console 不可达、创建 Terminal Session 失败、detail route 失败。
- Runtime flow：`tmux` 缺失、shell runtime 创建失败、WebSocket 未 connected、确定性输出超时。
- Artifact flow：截图、trace、服务日志或报告保存失败。

## 失败场景

- 依赖缺失：`tmux` 不存在或不可执行；Playwright browser 未安装；端口不可用。
- 服务启动失败：api/web 命令退出、ready URL 超时、环境变量缺失导致服务不可用。
- 认证失败：测试密码配置与 API 不一致，登录页无法进入受保护页面。
- Project 准备失败：临时 `PROJECTS_ROOT` 未创建、测试 Project 不存在或无法被 API 列出。
- Session 创建失败：HTTP create Terminal Session 返回错误或 UI 未展示可打开入口。
- Stream 失败：detail 页面无法连接 WebSocket、runtime ended/error、connected 后无输出。
- IO 失败：确定性输入发送后未出现预期输出。
- 清理失败：E2E 完成后仍有测试进程、tmux session 或临时目录残留。

## 错误码 / 错误语义

- 不新增产品 API 错误码。
- E2E runner/test failure 应按步骤语义表达错误：`setup failed`、`service not ready`、`login failed`、`project unavailable`、`terminal create failed`、`stream not connected`、`terminal output timeout`、`cleanup failed`。
- Playwright assertion failure 保留原始 locator、URL、screenshot/trace；Bun orchestration error 保留 command、exit code、stdout/stderr 摘要。

## 重试 / 降级 / 恢复

- 第一轮不对业务步骤做自动重试；失败应暴露真实 flake 或集成问题。
- Service readiness 可以有短时间轮询/timeout，因为 dev services 启动需要时间。
- 缺少真实 `tmux` 或 Playwright browser 时，本地可以给出明确安装/依赖提示；CI 中应失败或明确 skip，不得静默通过。
- 清理应尽力执行：关闭 api/web 子进程，删除临时目录，清理测试创建的 tmux session；清理失败记录为 failure evidence 或 WARNING，不能隐藏。

## 用户可见反馈

- 成功时命令输出简洁通过结果和主要路径。
- 失败时报告至少说明失败阶段、当前 URL/页面、关键错误消息和 artifact 路径。
- Browser failure 保存 screenshot/trace；service failure 保存 api/web logs；runtime failure 保存 session id 和当前输出快照。
- 错误输出不得泄露真实用户 token、生产路径或密钥；测试环境使用临时密码和临时目录。

## 关键决策

- 失败 evidence 是 E2E baseline 的核心要求，不把“跑失败了”只留在终端滚动输出中。
- 对真实依赖缺失采用明确失败/skip 语义，不用 mock 让 Terminal runtime path 假通过。
- 不在第一轮引入复杂 retry 以掩盖 flakiness；优先让失败可定位。
- E2E 清理逻辑必须与测试执行绑定，避免留下长驻 dev service 或测试 tmux session。

## 风险与权衡

- 真实 tmux/WebSocket IO 可能比 unit tests 慢且更易受环境影响；但这是覆盖跨服务联通的必要风险。
- Playwright traces/screenshots 可能产生较多 artifacts；第一轮只保留 failure artifacts 和必要 smoke evidence。
- 如果测试使用固定端口，可能与本地开发服务冲突；优先使用可配置或自动选择端口，并在日志中记录最终 URL。

## 开放问题

- 是否在 CI 中把 Playwright trace/html report 作为 artifact 上传。
- 是否需要对 cleanup failure 单独设为 WARNING 而非直接失败。
- 是否要为未来 Agent fake provider 增加专门的 failure taxonomy。

## 后续沉淀候选

- `docs/runbooks/e2e-quality-baseline.md`：如何运行、排查失败、查看 screenshots/traces/logs、清理残留测试资源。
