# Frontend Design

## Change

- change-id：implement-file-browser-preview

## 前端范围

- 修改 Project console 中 Files section，从占位态变为可浏览、可预览的只读观察工具。
- 新增或扩展 `/api` client 方法，用于目录列表和文件预览。
- 新增 Files UI 组件：path breadcrumb、directory/file list、preview panel、empty/error/status cards。
- 不新增全局状态库、不引入文件树/代码编辑器/图片查看器依赖。

## 模块划分

- Route/page 层：Project console 持有当前 section；Files section 持有 `currentPath` 与 `selectedFilePath`。
- API client 层：封装 `listProjectFiles(projectName, path)` 与 `previewProjectFile(projectName, path)`。
- Query 层：用 TanStack Query 管理目录列表和选中文件预览的 server state。
- 展示组件层：目录列表、breadcrumb、preview panel 只接收 DTO 和回调，不直接调用 API。

## 组件边界

- `FilesSection`：组合 current path、selected file、queries、导航和错误恢复。
- `FileBreadcrumb`：展示 root 到当前目录的分段路径，支持回到上级路径或 root。
- `FileEntryList`：展示 entries；目录点击进入目录，文件点击选择预览。
- `FilePreviewPanel`：根据 preview union 渲染 text/image/unsupported/too_large 状态。
- 展示组件不负责 path 安全判断；path safety 只在 API 端保证。

## 状态管理

- 服务端状态：目录列表和文件预览由 TanStack Query 管理，query key 包含 projectName、path、selectedFilePath。
- 页面状态：`currentPath`、`selectedFilePath` 保持在 Files section 本地 state。
- 交互状态：loading、error、retry 由 Query 状态驱动。
- 不使用 Jotai；该状态只影响单个 route/page instance。

## 路由 / 页面接入

- 沿用现有 Project console route 和 Project context。
- Files section 在用户点击 Files 入口后加载 Project root 目录。
- 进入子目录时更新本地 `currentPath` 并清空当前预览。
- 点击文件时保持目录列表可见，并在同页展示预览。
- 返回 Agent/Terminal/Git section 时不需要重新选择 Project；Files state 可在本 route 生命周期内保留或重置，不作为第一轮契约。

## 工程约束

- 前端只通过同域 `/api` client 访问 Files API。
- 文本内容作为 React text node 渲染在 `<pre>` 中；不使用 `dangerouslySetInnerHTML`。
- SVG 图片只通过 `<img src={dataUrl}>` 渲染；不 inline SVG。
- 移动端样式优先：列表项触控目标充足，文本预览可换行，图片 `max-width: 100%` 且保持比例。
- 不新增 npm 依赖。

## 关键决策

- Files 使用单页本地状态而不是新增独立 route，减少第一轮路由复杂度并保持 Project console 上下文。
- Preview panel 与 directory list 同页显示；移动端纵向堆叠，桌面端可在现有布局宽度内提升信息密度但不创建独立 PC 产品路径。
- Unsupported 和 too-large 用状态卡片展示，不走 toast-only 反馈，因为用户需要理解为什么无法预览并继续浏览。

## 风险与权衡

- 本地 state 不提供可复制的深链；第一轮规格没有要求深链，后续如用户需要可把 path/selected file 放入 route search。
- 同页列表 + 预览在小屏上会较长；通过 sticky/compact breadcrumb、清晰 preview header 和返回上级入口保证可恢复。
- 不引入虚拟列表，极大目录可能滚动较长；第一轮不承诺分页或复杂排序。

## 开放问题

- 无阻塞开放问题。

## 后续沉淀候选

- Files section 的前端状态边界、移动端列表/预览布局和安全渲染规则可在 verify 后沉淀到长期 design。
