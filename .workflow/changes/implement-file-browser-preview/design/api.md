# API Design

## Change

- change-id：implement-file-browser-preview

## 接口范围

新增两个已认证、Project-scoped、只读 GET 接口：

- `GET /api/projects/:projectName/files?path=<project-relative-path>`：列出目录内容。
- `GET /api/projects/:projectName/files/preview?path=<project-relative-path>`：返回文件预览结果。

接口调用方是 `web` 的 Project console Files section。第一轮 API 不提供编辑、删除、重命名、上传、下载或写入操作。

## 请求 / 响应

### 目录列表

请求：

```http
GET /api/projects/demo/files?path=src
```

- `projectName`：Project 名称，仍按现有 Project API 语义解析为 `PROJECTS_ROOT` 下一级目录。
- `path`：可选 project-relative path；为空或缺失时表示 Project root；绝对路径、parent traversal、symlink escape 均拒绝。

响应：

```ts
type ProjectFileEntryType = "directory" | "file";

type ProjectFileEntry = {
  name: string;
  path: string;
  type: ProjectFileEntryType;
  hidden: boolean;
  size: number | null;
};

type ProjectFileListResponse = {
  projectName: string;
  path: string;
  parentPath: string | null;
  entries: ProjectFileEntry[];
};
```

排序规则：先 `directory` 后 `file`，同组内按 `name` 升序稳定排序；隐藏条目不被过滤。

### 文件预览

请求：

```http
GET /api/projects/demo/files/preview?path=README.md
```

响应使用 discriminated union：

```ts
type ProjectTextFilePreview = {
  type: "text";
  projectName: string;
  path: string;
  name: string;
  size: number;
  content: string;
};

type ProjectImageFilePreview = {
  type: "image";
  projectName: string;
  path: string;
  name: string;
  size: number;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/svg+xml";
  dataUrl: string;
};

type ProjectUnsupportedFilePreview = {
  type: "unsupported";
  projectName: string;
  path: string;
  name: string;
  size: number;
  reason: "unsupported_type" | "binary_text";
};

type ProjectTooLargeFilePreview = {
  type: "too_large";
  projectName: string;
  path: string;
  name: string;
  size: number;
  limitBytes: number;
};

type ProjectFilePreviewResponse =
  | ProjectTextFilePreview
  | ProjectImageFilePreview
  | ProjectUnsupportedFilePreview
  | ProjectTooLargeFilePreview;
```

预览限制：

- 文本预览上限：256 KiB。
- 图片预览上限：5 MiB。
- 文本必须通过支持扩展名判断、UTF-8 fatal decode 和二进制控制字符检查。
- 图片支持扩展名：`.png`、`.jpg`、`.jpeg`、`.gif`、`.webp`、`.svg`。

## 协议与兼容性

- 新增接口，不改变已有 Project、Session 或 Auth API。
- path 使用 query 参数传递，避免把 nested file path 编码进 route wildcard。
- `unsupported` 与 `too_large` 是成功响应，方便前端展示可理解状态；它们不表示 API 调用失败。
- 错误响应沿用现有 API error envelope 和 `ApiErrorCode` union。

## 鉴权与权限

- 沿用现有 HTTP token guard；只有已认证用户可以访问 Files API。
- 认证只证明用户可访问控制台，不替代 Project path safety。
- 每次请求都必须通过 Project name 与 project-relative path 安全解析。

## 错误语义

建议新增或复用以下错误码：

- `PROJECT_NOT_FOUND`：Project 名称不存在。
- `PROJECT_PATH_OUTSIDE_ROOT`：path 越界、绝对路径、parent traversal、symlink escape 或 null byte。
- `PROJECT_FILE_NOT_FOUND`：Project 内目标 path 不存在。
- `PROJECT_FILE_NOT_DIRECTORY`：目录列表请求的 path 不是目录。
- `PROJECT_FILE_NOT_FILE`：预览请求的 path 不是普通文件。
- `PROJECT_FS_ERROR`：文件系统读取失败且不适合暴露细节。

错误消息不得泄露 Project 外部绝对路径、堆栈或内部模块细节。

## 关键决策

- API 不提供 raw file content/download endpoint；图片通过 bounded preview data URL 返回。
- 目录和预览分离，避免一个接口根据文件类型隐式执行多种任务。
- Preview type 判断在服务端完成，前端只渲染服务端声明的结果。
- 文件大小上限在读取完整内容前通过 `stat` 判断。

## 风险与权衡

- Data URL 让图片预览不需要额外内容 endpoint，但会增加 JSON payload 体积；通过图片大小上限控制。
- Unsupported 作为 200 preview state 可以降低前端错误处理复杂度，但 verify 必须确认越界、缺失和类型不匹配仍是错误。
- 目录列表不分页，极大目录可能响应较大；第一轮按规格不做分页。

## 开放问题

- 无阻塞开放问题。

## 后续沉淀候选

- Files API endpoint、DTO、preview union 和错误语义可在 verify 后沉淀到长期 architecture/design 文档。
