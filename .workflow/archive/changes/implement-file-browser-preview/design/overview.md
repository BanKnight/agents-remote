# Design Overview

本文件汇总 `implement-file-browser-preview` 的设计范围、子域选择和整体设计结论。

## Change

- change-id：implement-file-browser-preview
- 所属 version：v0.4-project-inspection-tools

## 输入依据

- intents：用户希望第一轮 Files 支持 project 内目录浏览、文本预览和图片预览；明确不做编辑、删除、重命名、上传、下载、复杂排序、语法高亮、行号、搜索、流式读取或分页。
- specs：`specs/file-browser-preview/spec.md`
- 相关长期 docs：
  - `docs/project.md`
  - `docs/specs/project-safe-paths/spec.md`
  - `docs/architecture/project-boundary.md`
  - `docs/design/console-shell.md`
  - `docs/design/frontend-stack.md`

## 设计范围

### 本次覆盖

- Project console 中 Files 入口从占位变为只读浏览能力。
- Project-relative 目录列表 API 和文件预览 API。
- 目录条目包含隐藏文件/目录，目录优先、文件在后，各组按名称稳定排序。
- 文本文件纯文本预览，移动端可读，受大小上限约束。
- PNG、JPEG、GIF、WebP、SVG 图片预览，移动端默认适应容器。
- 不支持类型、过大、路径越界、文件/目录类型不匹配和文件系统错误的用户可见反馈。

### 本次不覆盖

- 文件编辑、删除、重命名、上传、下载。
- 语法高亮、行号、搜索、分页、流式读取。
- 自定义图片标注、裁剪、图库管理或复杂缩放控件。
- Git diff 查看；该能力属于 `implement-git-diff-viewer`。
- Project identity、PROJECTS_ROOT 配置或 safe path resolver 的重新设计。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 行为边界已由 specs 明确，未新增独立产品规则。 |
| ui-ux | 是 | Files 需要移动端目录浏览、预览、空态和错误态设计。 |
| frontend | 是 | 需要定义 Project console 接入、server state、本地状态和组件边界。 |
| architecture | 是 | 该能力跨 `web`、`packages/shared`、`api` 和本地文件系统边界。 |
| api | 是 | 需要新增目录列表与预览接口、DTO 和错误语义。 |
| data | 否 | 第一轮不引入数据库或持久化模型。 |
| business-rules | 否 | 排序、只读和大小限制已在 API/UI/错误语义中覆盖。 |
| error-handling | 是 | 文件系统、路径安全、预览限制和 unsupported states 需要明确恢复方式。 |
| risks | 否 | 风险已分散记录在各子域，当前无单独跨域开放风险。 |

## 总体设计结论

- Files 作为 Project console 内的只读观察入口实现，不改变 Project model，也不引入写操作 API。
- `api` 新增 Project-scoped Files service/routing，所有 path 参数先经过 `resolveProjectRelativePath`，再执行 `stat`、`readdir` 或 bounded read。
- `packages/shared` 只新增跨边界 DTO、preview union 和错误码，不放入文件系统或路径解析逻辑。
- `web` 在 Project console 的 Files section 中使用 TanStack Query 获取目录列表和预览内容；当前 path 与 selected file 是单页本地状态，不引入 Jotai atom。
- 图片预览第一轮通过 bounded preview payload 展示，不提供原文件下载入口；SVG 只作为 `img` source 渲染，不 inline 到 DOM。
- 文本预览通过 UTF-8 安全解码与二进制检测，使用 React text node + `<pre>` 渲染，不使用 `dangerouslySetInnerHTML`。

## 关键决策

- API 使用 query 参数传递 project-relative `path`，避免 wildcard route 与 encoded slash 兼容性问题。
- 目录浏览和文件预览分为两个 GET 接口：目录接口只返回 entries，预览接口返回 discriminated union。
- Unsupported 和 too-large 是预览结果状态而不是异常；路径越界、缺失、类型不匹配和文件系统失败才返回 API error。
- 第一轮使用明确大小上限：文本预览 256 KiB，图片预览 5 MiB；后续如需大文件能力再设计 streaming/pagination。
- 目录条目排序在服务端完成，保证所有客户端展示稳定一致。

## 开放问题

- 无阻塞开放问题；实现阶段可根据现有 API route 组织微调文件命名，但不得改变本设计的只读、bounded preview 和 safe path 语义。

## 后续沉淀候选

- `docs/specs/file-browser-preview/spec.md`：长期 Files 只读浏览/预览 WHAT。
- `docs/architecture/file-browser-preview.md`：Project-scoped Files API 与 safe path 复用边界。
- `docs/design/file-browser-preview.md`：移动端 Files UI/UX 与前端状态边界。
