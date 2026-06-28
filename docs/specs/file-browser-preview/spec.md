# file-browser-preview spec

本文件记录 `file-browser-preview` 的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 在 Project console 内提供文件观察能力，让用户无需离开浏览器即可浏览 Project 目录、阅读文本文件和查看常见 Web 图片。
- 在只读浏览基础上，提供受控的文本文件就地编辑与保存：仅覆盖已预览的文本文件、经 Project 安全路径边界约束、受保存大小上限限制。
- 删除、重命名、上传等其余文件系统操作有独立行为契约；保存之外的任意写操作不在此 spec 范围。

## Requirements

### Requirement: Project files are exposed through read-only browsing

系统 SHALL 允许已认证用户在某个 Project 作用域内浏览目录条目。浏览本身只读；删除、重命名、上传各有独立行为契约，文本编辑保存见下文 Requirement，下载不在第一轮范围。

#### Scenario: User opens Files inside a Project console

- **WHEN** 用户在 Project console 中打开 Files 入口
- **THEN** 系统展示当前 Project 内某个目录的条目列表
- **AND** 用户可以进入子目录或选择文件预览
- **AND** 页面不展示会修改文件系统的编辑、删除、重命名、上传或下载入口

#### Scenario: User attempts an unsupported write behavior

- **WHEN** 用户尝试下载文件，或对目录、图片/二进制等非文本目标发起编辑保存
- **THEN** 系统不提供下载入口
- **AND** 编辑保存只接受已预览的文本文件，非文件目标被 API 拒绝

### Requirement: File browsing uses project-safe relative paths

系统 SHALL 使用已验证的 Project 安全路径解析语义访问 Project 内目录和文件，所有客户端传入路径都必须保持在当前 Project 根目录内。

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

### Requirement: Text file edit is a controlled save over project-safe paths

系统 SHALL 允许已认证用户在文本文件预览的 source 模式就地编辑内容，并通过显式 Save 覆盖保存到服务器；保存是受控写操作，仅作用于已预览的文本文件、经 Project 安全路径解析、受保存大小上限约束。

#### Scenario: User edits and saves a text file

- **WHEN** 用户在 source 模式编辑已预览的文本文件并点击 Save
- **THEN** 系统将编辑后内容覆盖写回同一 Project 内文件
- **AND** 保存后刷新预览与目录列表（大小/修改时间）
- **AND** 渲染模式（markdown/html）保持只读，不提供编辑入口

#### Scenario: User switches away from a file with unsaved edits

- **WHEN** 用户在当前文件有未保存改动时切换到其他文件或关闭预览
- **THEN** 系统提示将丢弃未保存改动
- **AND** 用户确认后才切换并丢弃，取消则停留在当前文件

#### Scenario: Save is rejected for unsafe or invalid target

- **WHEN** 保存目标路径越界、指向目录或超过保存大小上限
- **THEN** API 拒绝保存并返回对应错误
- **AND** 不写入 Project 外部或非文件目标

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

### Requirement: Files mobile inspection uses compact content-first layout

系统 SHALL 在手机窄屏 Project workspace 中以紧凑、可扫读的目录列表和内容优先的文件预览展示 Files 只读 inspection，减少说明文案、重复 metadata 和过厚容器占用的空间。

#### Scenario: User reviews a directory on mobile

- **WHEN** 用户在手机窄屏打开 Project Files 并浏览目录
- **THEN** 系统展示紧凑的文件/目录列表行
- **AND** 每个条目仍能区分文件夹和文件
- **AND** 长文件名或长路径不会导致页面级横向溢出
- **AND** 用户不需要先滚过大块说明文本才能看到目录条目

#### Scenario: User previews a file on mobile

- **WHEN** 用户在手机窄屏从 Files 列表选择文件
- **THEN** 页面展示紧凑的所选文件上下文
- **AND** 文本或图片预览内容占据主要可用空间
- **AND** 用户可以返回目录列表或选择其他文件
- **AND** 预览内容不被无关说明、装饰或过大的 metadata 区域挤压

#### Scenario: User inspects compact Files view

- **WHEN** 用户在手机窄屏查看 Files 列表或文件预览
- **THEN** 页面不展示下载入口
- **AND** 文本编辑保存入口只在文本预览的 source 模式出现，不挤占目录列表首屏
- **AND** 紧凑布局不通过隐藏菜单引入下载或不受控的写操作

### Requirement: Files mobile direct page and preview detail use distinct navigation levels

系统 SHALL 在移动端区分 Files 直接二级页和文件预览深层 detail：目录列表属于 Project 直接二级 workspace，文件预览属于同 route 内的深层 inspection detail。

#### Scenario: User views Files as a mobile direct secondary page

- **WHEN** 用户在手机视口打开 Project Files workspace
- **THEN** 页面底部展示 Project 二级导航或等价 Back/Agent/Files/Git/Terminal 结构
- **AND** 页面顶部不重复显示返回一级页面的 Back 控件
- **AND** 文件/目录列表保持紧凑可扫读

#### Scenario: User opens a file preview on mobile

- **WHEN** 用户从 Files 列表选择文件预览
- **THEN** 页面顶部展示返回 Files list 或当前目录的入口
- **AND** 页面底部不显示 Project 二级导航
- **AND** 预览内容占据主要可用空间
- **AND** 文件上下文和不可预览/过大状态不伪装成编辑能力

## Notes

- 第一轮文本预览上限为 256 KiB，图片预览上限为 5 MiB。
- 文件浏览属于只读观察；文本编辑保存是唯一的就地写能力，经 Project 安全路径与保存大小上限（与上传一致的 50 MiB）约束；删除、重命名、上传等其余文件操作有独立行为契约。
- 移动端 Files inspection 应优先保证目录列表和预览内容可见，避免用大块说明文案或重复 metadata 挤占首屏。

## 来源

- change：implement-file-browser-preview
- verify 证据：`.workflow/changes/implement-file-browser-preview/verify.md`
- change：compact-inspection-mobile-views
- verify 证据：`.workflow/changes/compact-inspection-mobile-views/verify.md`
- change：align-resource-inspection-pages
- verify 证据：`.workflow/changes/align-resource-inspection-pages/verify.md`
- 运行态验证证据：`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/files-direct-mobile.png`、`.workflow/changes/align-resource-inspection-pages/artifacts/browser-resource-inspection/files-preview-mobile.png`
