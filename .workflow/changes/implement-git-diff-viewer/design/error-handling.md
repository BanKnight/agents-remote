# Error Handling Design

## Change

- change-id：implement-git-diff-viewer

## 异常范围

本设计覆盖 Git diff viewer 中的非 Git 仓库、Git CLI 不可用、Project path 边界失败、scope/path 参数错误、文件不在变更列表和 Git 命令执行失败。第一轮没有 Git 写操作，因此不涉及回滚或补偿。

## 失败场景

- 未认证：由现有 auth guard 拒绝。
- Project 不存在或越界：返回 Project 相关错误，不执行 Git 命令。
- 非 Git 仓库：list endpoint 返回可理解 state；单文件 diff 请求返回明确错误。
- Git CLI 不可用：返回 `PROJECT_GIT_UNAVAILABLE` 或等价错误，页面提示无法读取 Git 状态。
- scope 无效：返回 `PROJECT_GIT_SCOPE_INVALID`。
- file path 不在当前变更列表：返回 `PROJECT_GIT_FILE_NOT_CHANGED`。
- Git 命令失败：返回通用 Git unavailable/error，不泄露内部命令或绝对路径。

## 错误码 / 错误语义

- `PROJECT_NOT_FOUND`：Project 不存在。
- `PROJECT_PATH_OUTSIDE_ROOT`：Project 安全解析失败。
- `PROJECT_GIT_NOT_REPOSITORY`：当前 Project 不是 Git 仓库。
- `PROJECT_GIT_SCOPE_INVALID`：scope 参数非法。
- `PROJECT_GIT_FILE_NOT_CHANGED`：请求文件不是当前 worktree/staged 变更。
- `PROJECT_GIT_UNAVAILABLE`：Git CLI 缺失、命令失败或输出无法安全解析。

## 重试 / 降级 / 恢复

- 可重试：Git CLI 临时失败、读取失败、网络失败。
- 不重试：非 Git 仓库、scope 无效、file not changed、Project 不存在。
- 降级：不把 Git 命令失败降级为 shell 命令输出；必须保持结构化错误。
- 恢复入口：Retry、返回 Project console、切换其他 section。
- 回滚/补偿：无写操作，无需回滚或补偿。

## 用户可见反馈

- 非 Git 仓库：提示“当前 Project 不是 Git 仓库”。
- 无变更：提示“No changes” 或等价空态。
- Git 不可用：提示无法读取 Git 状态，可稍后重试或检查服务器环境。
- 文件 diff 不存在：提示该文件当前没有对应变更，建议刷新列表。
- scope 无效：前端正常不应产生；若发生，展示通用无法打开 diff。

## 关键决策

- 非 Git 仓库不作为系统异常，不用红色错误主视觉。
- Git 命令错误不暴露完整 argv、绝对路径或 stderr 原文到前端。
- 单文件 diff 请求必须先校验 scope 与变更列表，避免用任意 path 构造 Git diff 查询。

## 风险与权衡

- 隐藏 stderr 细节会降低前端可诊断性，但避免泄露服务器路径和仓库内部细节。
- file not changed 校验需要额外读取变更列表；可接受，因为第一轮优先安全与明确语义。

## 开放问题

- 无阻塞开放问题。

## 后续沉淀候选

- Git diff viewer 的错误语义和非 Git 仓库状态可在 verify 后沉淀到长期 design/architecture。
