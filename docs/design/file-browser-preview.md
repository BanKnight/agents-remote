# File browser preview design

本文件记录经过验证后沉淀下来的 Project Files 浏览与预览长期 design。它面向后续版本复用，不复制单次 change 的过程记录。

## 背景

- `web` 是移动端优先的 Project console，Files 是 Agent、Terminal、Git 之外的只读观察入口。
- Project 已被定义为 `PROJECTS_ROOT` 下一级真实目录，Files 必须复用 Project-safe relative path 语义。
- 第一轮 Files 目标是浏览目录、阅读文本和查看常见 Web 图片，而不是文件管理器或编辑器。

## 适用范围

- Project console 内 Files section 的信息架构、状态和交互边界。
- `web` Files client/UI 与 `api` Files DTO 的协作方式。
- 文本/image/unsupported/too-large preview union 的前端渲染规则。

## 设计结论

- Files section 保持在 Project console route 内，不新增独立 Files route；当前目录 path 与选中文件 path 是单页本地 state。
- 目录列表和文件预览由 TanStack Query 管理 server state，query key 包含 projectName、currentPath 和 selectedFilePath。
- Files UI 使用“紧凑当前 path 操作区 + compact row 文件列表 + 内容优先同页预览 panel”的移动端优先结构；手机窄屏下应减少说明文案、重复 metadata 和过厚容器占位。
- 目录条目点击语义按类型区分：目录进入下级目录，文件打开预览。
- 预览 panel 使用 discriminated union 渲染：`text`、`image`、`unsupported`、`too_large`。
- 文本预览以 `<pre>` 纯文本方式展示；图片预览使用 `<img>`，SVG 不 inline 到 DOM。
- Unsupported/too-large 是可理解状态，不作为 toast-only 或 fatal error 展示。

## 关键规则

- `web` 只通过同源 `/api` client 访问 Files API，不拼接或展示服务器绝对路径作为导航依据。
- 只影响 Files section 的 path、selected file 和 loading/error 状态保留为本地 state，不引入 Jotai atom。
- 页面不得出现编辑、删除、重命名、上传、下载按钮或拖拽上传 affordance。
- 移动端可读性优先：文件列表采用可扫读的紧凑行，触控目标仍需充足；文本预览允许换行并优先占据可用空间，图片适应容器宽度。
- Files compact row 中主信息是文件/目录名称，类型、大小、hidden 等辅助信息应压缩为短文字或 badge；长名称/path 使用 `min-w-0`、truncate、break-all/break-words 或局部滚动避免页面级横向溢出。
- 预览 panel header 只保留定位所需的文件名、path、类型和大小，避免把说明性文本置于预览内容之前。
- 状态表达必须有文字说明，不只依赖颜色。
- 错误状态应提供可恢复路径，例如 Retry、Root 或 Up one level。

## 不适用场景

- 需要文件深链、浏览器地址栏同步 path 或跨页面保留 Files 状态时，应重新设计 route/search params。
- 需要编辑、上传、下载或删除时，应新增写操作能力设计，不能复用当前 preview API 绕过只读边界。
- 需要大文件分页、streaming、range request、全文搜索或语法高亮时，应扩展 API 与 UI 契约。
- 需要图库管理、标注、裁剪或自定义缩放控件时，应新增图片查看设计。

## 来源

- change：implement-file-browser-preview
- verify 证据：`.workflow/changes/implement-file-browser-preview/verify.md`
- change：compact-inspection-mobile-views
- verify 证据：`.workflow/changes/compact-inspection-mobile-views/verify.md`
- 运行态验证证据：`.workflow/changes/compact-inspection-mobile-views/artifacts/mobile-files-compact.png`
