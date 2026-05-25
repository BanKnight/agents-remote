# Error Handling Design

## Change

- change-id：design-session-runtime-boundaries

## 异常范围

- HTTP session API 的参数、Project、认证、状态和 runtime 错误。
- WebSocket stream 的认证失败、attach 失败、transport 断开、runtime 缺失和输入/resize 失败。
- tmux/CLI/runtime 启动、attach、close 过程的失败。
- Runtime metadata 读取、写入、损坏和 stale cleanup 失败。

## 失败场景

- 未登录或 token 失效：HTTP 返回 401；WebSocket upgrade 拒绝。
- Project 不存在或越界：复用 Project safe path 错误，不启动 runtime。
- Agent provider unsupported：创建 Agent Session 失败，提示 provider 不支持。
- Provider CLI 未安装/未登录/启动失败：返回 provider unavailable 或 runtime error，不管理账号配置。
- Terminal shell 启动失败：返回 runtime error，并不写入活跃 metadata。
- Metadata 存在但 tmux session 不存在：详情返回 ended/missing，列表清理该实例。
- WebSocket 中途断开：详情页显示 disconnected；不关闭 runtime。
- 输入或 resize 发送失败：stream 返回 error/status，允许用户重连或返回列表。
- Close 失败：返回 runtime error；如果 runtime 已不存在，则按已结束处理。
- Metadata 文件损坏：跳过/清理该记录，记录日志，不阻塞其他 session。

## 错误码 / 错误语义

- `UNAUTHENTICATED`：沿用现有认证错误。
- `PROJECT_NAME_INVALID` / `PROJECT_NOT_FOUND` / `PROJECT_PATH_OUTSIDE_ROOT`：沿用 Project safe path 错误。
- `SESSION_NOT_FOUND`：session id 不存在或不属于该 Project/type。
- `SESSION_RUNTIME_MISSING`：metadata 指向的底层 runtime 已不存在。
- `SESSION_RUNTIME_ERROR`：runtime 启动、attach、input、resize、close 出现系统错误。
- `SESSION_PROVIDER_UNAVAILABLE`：Agent provider CLI 或账号状态无法满足启动要求。
- `SESSION_STATE_CONFLICT`：对 closed/ending session 执行不允许操作。
- `SESSION_METADATA_ERROR`：metadata 损坏或无法读写；实现可合并到 runtime error，但日志需区分。

## 重试 / 降级 / 恢复

- 可重试：WebSocket 断开、attach 暂时失败、输入/resize 传输失败、runtime 状态刷新失败。
- 不应自动重试：Project 越界、未认证、provider unsupported、用户确认 close。
- 可恢复：runtime 仍存在时 reconnect；metadata stale 时清理并返回列表。
- 不恢复：服务器重启后 run dir 丢失的 metadata；第一轮不扫描并恢复历史任务。
- 降级：Agent provider 状态无法判断 `idle` 时降级为 `running` 或不显示等待输入，不猜测。

## 用户可见反馈

- 断开：显示“连接已断开”，提供重新连接。
- runtime 已结束：显示“会话已结束”，提供返回列表。
- 关闭确认：明确“会话中的进程将被终止”。
- provider 不可用：提示服务器侧需要安装/登录对应 Claude/Codex CLI。
- Project/path 错误：使用现有 Project 错误文案，不显示内部路径遍历细节。
- 系统错误：提示操作失败，可稍后重试或查看服务器日志，不暴露命令、token 或堆栈。

## 关键决策

- WebSocket 断开是可恢复 transport 错误，不改变 session lifecycle。
- Runtime missing 是用户可理解的 ended 状态，不要求用户手动清理。
- Provider account/setup 错误不进入本系统配置管理，只作为 runtime 启动失败显示。
- Metadata 损坏只影响对应 session，不阻塞整个 Project 或全局 API。

## 风险与权衡

- 过度细分错误码会增加前后端同步成本；第一轮只增加调用方必须区分的 session 错误。
- 隐藏 tmux/provider 细节有利于安全和长期抽象，但排障需要日志保留安全 diagnostics。
- 自动清理 metadata 需要避免误删仍可恢复的 runtime，需以 tmux 存在性检查为准。

## 开放问题

- 是否需要 request id / stream id 进入所有错误响应，留到 E2E 质量基线或 observability 设计。
- Close 失败后 UI 是否允许再次 close，或强制刷新状态，留到实现验证。

## 后续沉淀候选

- Session runtime 错误语义可沉淀到长期 spec 和 runbook；如果实现产生可重复排障步骤，再进入 `docs/runbooks/`。
