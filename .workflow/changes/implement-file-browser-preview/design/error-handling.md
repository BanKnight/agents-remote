# Error Handling Design

## Change

- change-id：implement-file-browser-preview

## 异常范围

本设计覆盖 Files 目录列表和文件预览中的用户输入错误、Project/path 资源错误、文件类型/大小限制和本地文件系统读取失败。第一轮没有写操作，因此不涉及并发写冲突、补偿或回滚。

## 失败场景

- 未认证：请求被现有 auth guard 拒绝，前端按既有登录/session 失效体验处理。
- Project 不存在：返回 `PROJECT_NOT_FOUND`，用户可回 Project 列表重新选择。
- path 越界：返回 `PROJECT_PATH_OUTSIDE_ROOT`，不读取目标路径，用户可回 root。
- path 不存在：返回 `PROJECT_FILE_NOT_FOUND`，用户可返回上级或刷新目录。
- 列表请求指向文件：返回 `PROJECT_FILE_NOT_DIRECTORY`，用户可回上级或选择预览入口。
- 预览请求指向目录：返回 `PROJECT_FILE_NOT_FILE`，用户可进入该目录。
- 文件超过上限：返回 preview state `too_large`，用户知道第一轮暂不预览。
- 文件类型不支持或无法安全解码为文本：返回 preview state `unsupported`。
- 文件系统读取失败：返回 `PROJECT_FS_ERROR`，前端展示通用读取失败并提供 retry/root。

## 错误码 / 错误语义

- `PROJECT_NOT_FOUND`：资源错误，不可通过重试修复。
- `PROJECT_PATH_OUTSIDE_ROOT`：用户输入/安全边界错误，不可重试；不泄露请求目标真实路径。
- `PROJECT_FILE_NOT_FOUND`：资源错误，可通过返回上级、刷新或回 root 恢复。
- `PROJECT_FILE_NOT_DIRECTORY`：调用方式错误，前端应停止当作目录展示。
- `PROJECT_FILE_NOT_FILE`：调用方式错误，前端应停止当作文件预览。
- `PROJECT_FS_ERROR`：系统/文件系统错误，可重试；日志保留内部原因。
- `too_large` preview state：非异常，不可重试；需显示当前大小和上限。
- `unsupported` preview state：非异常，不可重试；需显示“不支持预览”而不是“加载失败”。

## 重试 / 降级 / 恢复

- 可重试：网络失败、`PROJECT_FS_ERROR`、服务端临时失败。
- 不重试：越界、unsupported、too-large、not file/not directory、Project 不存在。
- 降级：不把 unsupported/too-large 降级成下载；第一轮没有下载能力。
- 恢复入口：Retry、Back to root、Up one level、返回 Project console。
- 回滚/补偿：无写操作，无需回滚或补偿。

## 用户可见反馈

- 越界或非法 path：提示“Path is outside this project”或等价文案，提供回 root。
- 目录不存在：提示“Directory or file not found”，提供回上级/root。
- 非目录/非文件：提示当前目标类型不匹配，并提供进入目录或返回列表的合理入口。
- Too large：提示“File is too large to preview”，显示 preview limit。
- Unsupported：提示“This file type is not supported for preview yet”。
- 读取失败：提示“Unable to read this file right now”，提供 retry。

## 关键决策

- 安全边界错误不展示服务器绝对路径、realpath、堆栈或内部模块名。
- Unsupported 和 too-large 不走 error boundary，避免误导用户以为系统故障。
- 前端恢复入口优先回到安全的 Project root 或当前目录上级。
- 服务端日志可记录 projectName、relativePath、error code 和内部 cause，但不得记录敏感文件内容。

## 风险与权衡

- 将 unsupported/too-large 设计为 200 状态需要实现和测试明确区分“不能预览”和“请求失败”。
- 对文件系统错误做通用提示会隐藏具体原因，但能避免泄露服务器路径和权限细节。
- 如果目录在用户浏览期间被删除，前端需要展示 not found 并允许回 root；不需要复杂自动同步。

## 开放问题

- 无阻塞开放问题。

## 后续沉淀候选

- Files preview 错误语义和用户恢复方式可在 verify 后沉淀到长期 runbook/design（如后续出现重复排查流程）。
