# API Design

## Change

- change-id：implement-project-model-and-safe-paths

## 接口范围

本 change 增加受保护的 Project HTTP API，调用方是登录后的 `web` 控制台。

- `GET /api/projects`：读取 `PROJECTS_ROOT` 下一级目录并返回 Project 摘要列表。
- `POST /api/projects`：创建或采用一个一级目录作为 Project。
- `GET /api/projects/:projectName`：按 project 名称读取单个 Project 摘要，并验证该 project 存在且是一级目录。

不在本 change 设计：Files/Git/Terminal/Agent 的 project 内子资源 API；它们后续应复用 Project safe path resolver。

## 请求 / 响应

### `GET /api/projects`

- 调用场景：登录后 Project 列表页加载。
- 请求：无 body；第一轮不设计分页、筛选或排序参数。
- 成功响应：

```json
{
  "projects": [
    {
      "name": "agents-remote",
      "path": "/home/deploy/projects/agents-remote",
      "agentSessionCount": 0,
      "terminalSessionCount": 0
    }
  ]
}
```

- 空结果：`{ "projects": [] }`。
- 排序：默认可按目录名稳定排序，避免文件系统枚举顺序导致 UI 抖动。

### `POST /api/projects`

- 调用场景：用户创建或进入一个已存在目录作为 Project。
- 请求 body：

```json
{
  "path": "demo"
}
```

- `path` 表示用户输入的文件夹名称或绝对路径。
- 当 `path` 是文件夹名称时，它必须对应 `PROJECTS_ROOT` 下一级目录名。
- 当 `path` 是绝对路径时，它必须解析为 `PROJECTS_ROOT` 下一级子目录。
- 成功响应返回 Project DTO：

```json
{
  "project": {
    "name": "demo",
    "path": "/home/deploy/projects/demo",
    "agentSessionCount": 0,
    "terminalSessionCount": 0
  }
}
```

### `GET /api/projects/:projectName`

- 调用场景：前端进入 project 路由后确认 project 存在，并取得展示摘要。
- 路径参数：`projectName` 使用 URL encode 后传入，API 按 URL 解码后的一级目录名解析。
- 成功响应：

```json
{
  "project": {
    "name": "demo",
    "path": "/home/deploy/projects/demo",
    "agentSessionCount": 0,
    "terminalSessionCount": 0
  }
}
```

## 协议与兼容性

- 所有接口位于 `/api` 前缀下，遵循既有同域部署约定。
- 所有 Project 接口受现有 HTTP token guard 保护；未认证返回既有 `UNAUTHENTICATED`。
- `Project` DTO 沿用 shared 中已有字段；新增 response wrapper 类型和错误码属于向前扩展。
- `gitBranch` 保持可选；未实现或不可用时省略，不作为错误。
- 第一轮不做分页。若未来 Project 数量增大，可在不破坏现有响应的情况下增加 query 参数。

## 鉴权与权限

- 认证机制沿用 `private-access-auth` 的单密码登录与本地 token。
- 第一轮无多用户、角色、资源归属权限；登录状态即允许访问当前服务器的 Project API。
- 认证通过不替代路径安全；所有 project 和 path 仍必须通过 `PROJECTS_ROOT` 边界解析。

## 错误语义

建议扩展 shared `ApiErrorCode`：

- `PROJECT_NAME_INVALID`：project 名称为空、包含路径分隔语义、指向嵌套路径或无法作为一级目录名。
- `PROJECT_NOT_FOUND`：请求的一级目录不存在。
- `PROJECT_TARGET_INVALID`：创建目标不是一级目录、目标是文件、目标是 `PROJECTS_ROOT` 本身或请求 body 无效。
- `PROJECT_PATH_OUTSIDE_ROOT`：输入路径或解析后的真实路径越出 `PROJECTS_ROOT`。
- `PROJECT_FS_ERROR`：文件系统读取或创建失败，且不是用户可修正的输入错误。

错误响应沿用当前形态：

```json
{
  "error": {
    "code": "PROJECT_PATH_OUTSIDE_ROOT",
    "message": "Project path must stay inside PROJECTS_ROOT"
  }
}
```

状态码建议：

- `400`：请求 body 缺失、格式错误、名称非法、嵌套 project、目标为文件或 root 本身。
- `401`：未认证或 token 无效。
- `404`：project 名称合法但不存在。
- `409`：目录创建过程中发生可归因于并发的冲突，例如检查时不存在但创建时出现非目录。
- `500`：非预期文件系统错误或配置后状态异常。

## 关键决策

- 使用资源语义 `/api/projects`，不暴露内部 resolver 函数或文件系统操作。
- 创建接口用 `path` 而不是 `name`，因为用户意图允许输入文件夹名称或路径；响应中的 `name` 始终由最终一级目录名派生。
- 不增加单独的“注册 Project”接口；存在目录就是 Project，创建接口只是确保目录存在并返回 DTO。
- 详情接口只验证并返回 Project 摘要，不打开文件、Git 或 Session 子资源。

## 风险与权衡

- `path` 字段既支持名称又支持绝对路径，需要错误提示清楚区分“越界”和“不是一级目录”。
- 返回真实 `path` 暴露服务器路径给已登录用户，符合个人部署可观察目标；但失败错误不应包含用户无权访问的任意外部路径细节。
- 不分页简化首轮 API，但如果 `PROJECTS_ROOT` 目录数量很多，列表延迟可能增长；第一轮可接受。

## 开放问题

- 无阻塞开放问题。
- 是否把 Git branch 放进列表响应取决于计划阶段成本；接口已允许缺省。

## 后续沉淀候选

- `docs/specs/project-model/spec.md` 的长期 API 行为部分。
- `docs/specs/project-safe-paths/spec.md` 的路径错误语义部分。
