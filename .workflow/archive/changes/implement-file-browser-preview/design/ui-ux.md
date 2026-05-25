# UI/UX Design

## Change

- change-id：implement-file-browser-preview

## 页面 / 界面范围

Files 位于 Project console 内，是与 Agent、Terminal、Git 并列的 Project-scoped 观察入口。用户任务是快速查看当前 Project 的目录结构、打开文本文件阅读内容或查看常见 Web 图片。

## 页面结构

- 顶部保留 Project console 上下文和 Files section 入口选中态。
- Files section 内部从上到下组织：
  1. path breadcrumb / root 与上级目录入口。
  2. directory listing。
  3. selected file preview panel。
- 目录列表条目展示：名称、类型（folder/file）、隐藏状态可由名称表达，不额外隐藏 dot entries。
- 预览 panel header 展示文件名、类型状态和大小；正文展示文本、图片或状态提示。

## 交互模式

- 打开 Files：默认加载 Project root。
- 点击目录：进入该目录，breadcrumb 更新，当前文件预览清空。
- 点击文件：请求预览并在同页显示预览 panel。
- 点击 root 或上级：返回对应目录，并清空当前文件预览。
- 请求失败：展示可理解错误和 Retry / Back to root / Up one level 等恢复入口。
- 页面不展示 edit/delete/rename/upload/download 按钮、菜单或拖拽上传 affordance。

## 页面状态

- 默认态：显示当前目录 entries；如已选择文件则下方显示 preview panel。
- 加载态：目录列表或预览区域分别展示 loading skeleton/文字，不阻塞 Project console 其他 section。
- 空态：目录为空时展示“Empty directory”类提示，并保留 breadcrumb/back 操作。
- 错误态：路径越界、目录不存在、读取失败时展示错误说明和恢复入口。
- 成功态：文本按纯文本等宽样式展示，图片适应容器宽度展示。
- Unsupported 状态：提示该类型暂不支持预览，不提供下载替代。
- Too-large 状态：提示文件超过预览上限，不读取或展示完整内容。

## 可用性要求

- 移动端为基准：列表项触控区域不小于常规按钮高度，breadcrumb 可换行或横向滚动但必须可读。
- 文本预览使用等宽字体、`white-space: pre-wrap` 和 `overflow-wrap: anywhere`，避免小屏横向滚动成为默认阅读方式。
- 图片使用 `max-width: 100%`、`height: auto`、容器内居中；用户可依赖浏览器手势查看细节，第一轮不做自定义 zoom controls。
- 状态表达使用文字与视觉层级，不只依赖颜色。
- 所有操作按钮/链接有可识别文本或 aria label。

## 关键决策

- 使用“目录列表 + 同页预览”而不是独立文件详情页，减少移动端导航成本并保持当前目录上下文。
- Unsupported/too-large 是 preview panel 的正常状态，不弹出一次性 toast，避免用户丢失原因。
- 隐藏文件照常显示，不提供 hide/show toggle；这是个人服务器控制台的第一轮明确需求。

## 风险与权衡

- 很长文本会让页面滚动距离变大；通过 256 KiB 上限降低风险，后续若需要再设计分页/搜索。
- 图片没有自定义 zoom controls；第一轮满足适应屏幕和浏览器基础手势，复杂查看器后续再做。
- 目录 entries 不显示复杂元数据，降低移动端密度和 API 范围；后续如需要 size/mtime 排序再扩展。

## 开放问题

- 无阻塞开放问题。

## 后续沉淀候选

- 移动端 Files 浏览/预览信息架构和状态设计可在 verify 后沉淀到 `docs/design/file-browser-preview.md`。
