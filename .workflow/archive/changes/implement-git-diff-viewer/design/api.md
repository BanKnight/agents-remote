# API Design

## Change

- change-id：implement-git-diff-viewer

## 接口范围

新增两个已认证、Project-scoped、只读 GET 接口：

- `GET /api/projects/:projectName/git/diff`：返回当前 Project 的 Git 仓库状态与变更文件列表。
- `GET /api/projects/:projectName/git/diff/file?scope=<worktree|staged>&path=<git-path>`：返回单文件 unified diff。

## 请求 / 响应

### 变更文件列表

```ts
type GitDiffScope = "worktree" | "staged";
type GitDiffFileStatus = "modified" | "added" | "deleted" | "renamed";

type GitDiffFileSummary = {
  path: string;
  previousPath?: string;
  status: GitDiffFileStatus;
  scope: GitDiffScope;
};

type GitDiffListResponse =
  | { repository: true; projectName: string; files: GitDiffFileSummary[] }
  | { repository: false; projectName: string; reason: "not_git_repository" };
```

- `files` 同时包含 worktree 与 staged 变更。
- 空变更仓库返回 `repository: true` 且 `files: []`。

### 单文件 diff

```ts
type GitFileDiffResponse = {
  repository: true;
  projectName: string;
  path: string;
  previousPath?: string;
  scope: GitDiffScope;
  status: GitDiffFileStatus;
  diff: string;
};
```

请求：

```http
GET /api/projects/demo/git/diff/file?scope=worktree&path=src%2Findex.ts
```

## 协议与兼容性

- 新增接口，不改变 Project、Files、Session API。
- path 使用 query 参数传递，避免 nested Git path 编码进 route wildcard。
- 非 Git 仓库通过 list response 的 `repository: false` 表达，不作为系统异常。
- 单文件 diff 在非 Git 仓库、path 不在当前变更列表、scope 无效或 Git 命令失败时返回标准 API error。

## 鉴权与权限

- 沿用现有 HTTP token guard；只有已认证用户可以访问 Git diff API。
- 鉴权不替代 Project path safety；每次请求都必须先解析 Project name 到 `PROJECTS_ROOT` 内真实目录。

## 错误语义

建议新增或复用以下错误码：

- `PROJECT_NOT_FOUND`：Project 不存在。
- `PROJECT_PATH_OUTSIDE_ROOT`：Project path 安全解析失败。
- `PROJECT_GIT_NOT_REPOSITORY`：单文件 diff 请求或不适合返回 state 的路径发现非 Git 仓库。
- `PROJECT_GIT_FILE_NOT_CHANGED`：请求的 file/scope 不在当前变更列表中。
- `PROJECT_GIT_SCOPE_INVALID`：scope 不是 `worktree` 或 `staged`。
- `PROJECT_GIT_UNAVAILABLE`：系统 git 不可用或 Git 命令执行失败且不适合暴露细节。

## 关键决策

- API 不暴露 raw command 参数，不允许客户端传递任意 Git args。
- 文件列表和单文件 diff 分离，避免一次展示所有 diff。
- 服务端负责 status/scope 映射，前端只消费稳定 DTO。
- Git 命令执行不通过 shell，不拼接用户字符串。

## 风险与权衡

- `repository: false` 作为 list 成功状态降低前端错误复杂度，但单文件 diff 仍应错误返回，避免误解为有效 diff。
- 如果 Git diff 输出极大，第一轮仍返回完整单文件 diff；后续如真实项目出现压力，再扩展 diff size limit 或分页。

## 开放问题

- 无阻塞开放问题。

## 后续沉淀候选

- Git diff DTO、error code 与只读 API 语义可在 verify 后沉淀到长期 architecture/design 文档。
