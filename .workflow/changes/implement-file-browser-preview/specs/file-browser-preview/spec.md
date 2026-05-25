# file-browser-preview spec

本文件记录 `implement-file-browser-preview` 对 `file-browser-preview` 的行为契约增量。

## Change 来源

- change-id：implement-file-browser-preview
- 来源意图：用户希望第一步在 Project 内提供只读目录浏览、文本文件预览和图片预览；支持隐藏文件/目录、移动端可读文本、手机适配图片、常见 Web 图片格式和文件大小上限；明确不支持编辑、删除、重命名、上传、下载、复杂排序、语法高亮、行号、搜索、流式读取或分页。
- 规划来源：v0.4-project-inspection-tools 的 Project 观察能力；依赖已完成的 Project model/safe paths 与响应式 PWA Console Shell。

## ADDED Requirements

### Requirement: Project files are exposed through read-only browsing

系统 SHALL 允许已认证用户在某个 Project 作用域内浏览目录条目，但第一轮 Files 能力只读，不提供文件写入、编辑、删除、重命名、上传或下载操作。

#### Scenario: User opens Files inside a Project console

- **WHEN** 用户在 Project console 中打开 Files 入口
- **THEN** 系统展示当前 Project 内某个目录的条目列表
- **AND** 用户可以进入子目录或选择文件预览
- **AND** 页面不展示会修改文件系统的编辑、删除、重命名、上传或下载入口

#### Scenario: User attempts unsupported write behavior

- **WHEN** 第一轮 Files 页面被评审
- **THEN** 不应存在可触发文件编辑、删除、重命名、上传或下载的用户操作
- **AND** API 不应提供这些写操作作为本 change 的一部分

### Requirement: File browsing uses project-safe relative paths

系统 SHALL 使用已验证的 Project 安全路径解析语义访问 project 内目录和文件，所有客户端传入路径都必须保持在当前 Project 根目录内。

#### Scenario: User opens a nested project-relative path

- **WHEN** 用户请求浏览 `src` 或预览 `src/index.ts`
- **THEN** API 将该路径解析为当前 Project 根目录内的真实路径
- **AND** 返回对应目录列表或文件预览

#### Scenario: Path attempts to escape the Project

- **WHEN** 用户请求 `../other-project`、绝对路径、symlink escape 或等价越界路径
- **THEN** 系统拒绝请求
- **AND** 不读取目标 Project 外部的目录或文件内容

#### Scenario: Empty path is requested

- **WHEN** 用户打开 Files 默认入口或请求空 path
- **THEN** 系统展示当前 Project 根目录内容

### Requirement: Directory listing includes hidden entries and stable first-round ordering

系统 SHALL 在目录列表中展示隐藏文件/目录，并以文件夹在前、文件在后、各自按名称排序的稳定顺序返回第一轮列表。

#### Scenario: Directory contains hidden and visible entries

- **WHEN** Project 目录下包含 `.env.example`、`.gitignore`、`src/` 和 `README.md`
- **THEN** Files 列表包含隐藏文件/目录
- **AND** 不因为条目以 `.` 开头而默认隐藏

#### Scenario: Directory contains mixed files and folders

- **WHEN** 目录下同时存在文件夹和普通文件
- **THEN** 系统先展示文件夹，再展示普通文件
- **AND** 文件夹组和文件组内部均按名称排序
- **AND** 第一轮不要求最近修改、大小或类型排序切换

### Requirement: Text file preview is bounded and mobile-readable

系统 SHALL 支持预览大小上限内的文本文件，并以移动端可读的纯文本等宽样式展示内容；超过上限的文件应提示过大而不读取完整内容。

#### Scenario: User previews a supported text file within size limit

- **WHEN** 用户选择大小不超过第一轮上限的文本文件
- **THEN** 页面显示文件内容
- **AND** 内容以纯文本等宽样式展示，移动端可读
- **AND** 第一轮不要求语法高亮、行号或搜索

#### Scenario: Text file exceeds preview size limit

- **WHEN** 用户选择超过预览大小上限的文本文件
- **THEN** 系统不读取或返回完整文件内容
- **AND** 页面提示文件过大暂不预览
- **AND** 第一轮不要求流式读取或分页

#### Scenario: File is not safe to decode as text

- **WHEN** 用户选择的文件不是支持的文本预览类型或无法安全解码为文本
- **THEN** 系统提示该文件暂不支持文本预览
- **AND** 不把二进制内容作为乱码文本展示

### Requirement: Image preview supports common web image formats on mobile

系统 SHALL 支持在 Project 内预览常见 Web 图片格式，并让图片查看在手机上适应屏幕；其他格式提示暂不支持预览。

#### Scenario: User previews a supported image

- **WHEN** 用户选择 PNG、JPEG、GIF、WebP 或 SVG 图片文件
- **THEN** 页面显示该图片预览
- **AND** 图片默认适应手机屏幕宽度或预览容器
- **AND** 用户可以看清图片主体内容

#### Scenario: User previews unsupported image or binary format

- **WHEN** 用户选择第一轮不支持预览的图片或二进制格式
- **THEN** 页面提示暂不支持预览
- **AND** 不提供下载作为替代路径

#### Scenario: Image is large

- **WHEN** 用户选择的图片超过第一轮预览大小上限或无法安全加载
- **THEN** 系统提示文件过大或暂不支持预览
- **AND** 不尝试无限制读取或展示

### Requirement: File browser integrates with Project console as an observation tool

系统 SHALL 将 Files 作为 Project console 内的只读观察入口，与 Agent/Terminal/Git 等 Project-scoped 能力共享当前 Project 上下文。

#### Scenario: User navigates from Project console to Files

- **WHEN** 用户在某个 Project console 内选择 Files
- **THEN** 页面保留当前 Project 上下文
- **AND** Files 能力只访问该 Project 内路径
- **AND** 返回 Project console 或其他 section 时不需要重新选择 Project

#### Scenario: Files capability is unavailable or errors

- **WHEN** 目录不存在、路径越界、文件过大或文件类型不支持
- **THEN** 页面展示可理解的错误或空状态
- **AND** 用户可以返回上级目录、Project 根目录或 Project console

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
