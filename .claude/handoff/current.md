# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-30（**第六批收口，最新 `16db0ad`**。用户反馈「md 等可预览文件优先展示预览效果 + 编辑后风格一致」：`60dc9e3` MobileL3FilePreview 默认渲染态 + meta 行 render/source toggle（与桌面 FilePreviewPanel 逐字同款）+ 渲染主体复用 PreviewBody 单源 + 编辑流转闭环；`d807ccb` 自审补遗——renderMode 换文件重置收敛 hook 单源（修 L3 切文件形态残留，FilesPanel 调用方补丁退役 + initialRenderMode 死参数退役 + 3 个 hook 契约单测）。全部验证绿。**等用户真机复验**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第六批「md/html 预览优先」收口（`60dc9e3` + `d807ccb` + 记档 `044ad55`/`16db0ad`）：MobileL3FilePreview（移动 L3 + 检视面板 file 标签双端单源）弃强制 source 改 hook 派生默认 render；meta 行补 render/source 分段 toggle（桌面 header 同款）；渲染主体复用 PreviewBody（md→MarkdownString / html→sandbox iframe）；「编辑」先切 source、「完成」回 render；自审发现并修复 renderMode 不随 path 重置的残留缺陷（收敛 hook 单源）。

## 本 session 焦点（第六批）

1. 用户反馈：可预览文件（md/html）优先展示预览；点击编辑后布局排版应风格一致。
2. 根因：MobileL3FilePreview 强制 `initialRenderMode: "source"`（旧假设「L3 无 toggle」），与桌面 `defaultRenderMode()` 默认分叉——同一 md 两端形态不一致。
3. 自审（design/code reviewer 双双因 API 故障早退，人工完成）：发现 renderMode 不随 path 重置的真缺陷并当场修。

## 关键决策（本阶段不可丢）

- **渲染能力复用 PreviewBody 单源**：不新增渲染器；isRenderView = showRenderToggle && renderMode==="render" 时 PreviewBody（onEditChange 不传 = 只读）；源码态保持 CodeWithLineNumbers（唯一消费点保留）。
- **编辑流转（预览优先闭环）**：点「编辑」= onRenderModeChange("source") + setEditing(true)（md/html render 态 canEdit gate 恒 false，保存会被 hook 拦）；「完成」两分支都回 "render"。
- **renderMode 随换文件重置收敛 hook 单源**：hook 既有 path effect（清 editContent/savedFlash）加 setRenderMode(defaultRenderMode(fileBaseName))；basename 从 path 立即可得不等待 preview（防首帧沿用上一文件判定）；FilesPanel 调用方补丁退役（树模式 enablePreview=false 时 selectedFilePath 恒 undefined，新旧等价）；initialRenderMode 死参数退役。
- **非 md/html 零影响**：showRenderToggle=false 恒源码形态（CodeWithLineNumbers/image/cap 分支不动）。
- 历史拍板继续有效：三栏第一行同一水平线；跨页一致优先；多端同构；「侧边栏」= 检视面板。
- **探针陷阱（新入注）**：`.meta .diff` 是「编辑 + 查看 diff ›」容器，hasText 容器 click 落中心误触另一按钮 → 按钮交互一律 `getByRole("button", { name })`。
- **Playwright/Explore subagent API 故障**（本段 3 次 EOF/connection reset 早退）：重试仍挂时人工完成审查，勿反复空转。

## 进度（已完成 / 进行中 / 待办）

- ✅ 第六批四 commit：`60dc9e3`（功能）→ `044ad55`（记档）→ `d807ccb`（自审修复）→ `16db0ad`（记档补遗）
- ✅ 验证：m4 探针 70/70（Part 5 六项断言链：渲染态/toggle on/无行号/源码态/编辑态/完成回渲染）+ file-save-scroll ALL PASS + files-html-img-inline PASS + e2e file-browser 2/2 + 四门禁（865/9/677 单测，+3 hook 契约测试）+ tokens strict 0 违例 + CSS 硬闸 183387 字节 + dev CSS content-type text/css
- ⬜ **交用户真机复验**（清单见下）
- ⬜ reviewer 复审补跑：本批 design/code 双审因 API 故障未完成（人工自审已做，design 侧结论已记档）——下个批次开工前若 API 恢复，可让 reviewer 补审 `60dc9e3`+`d807ccb` 两个 commit
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行（iPad 热区只能真机）
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；右栏栏宽 352 vs 320；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（第六批，`60dc9e3`+`d807ccb`）

1. **iPhone L3 文件详情**（文件树点 md 文件）：打开即渲染排版（非源码）；meta 行左侧「源码/渲染」分段 toggle；点「源码」看行号源码、点「渲染」回渲染
2. **渲染态点「编辑」**：进编辑器（源码形态）；「完成」后自动回渲染态；html 文件同链路（渲染 = sandbox 内嵌页）
3. **切文件形态不残留**：md 点「源码」→ 退回 → 点另一个 md → 新文件应是渲染态（修复前会残留源码态）
4. **检视面板 file 标签**（桌面右栏/移动面板）：md 打开即渲染（与 L3 一致）；非 md/html 文件行为不变（源码/图片/超限提示）
5. 桌面中栏 file tab、/files 全局文件页不受影响（独立路径未动）

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过（183387 字节，content-type text/css）。
- reviewer subagent 本段 3 次因 API 故障（EOF/connection reset）早退——人工自审已完成并记档，补审列待办。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **useFileEditor 契约已变**：renderMode 随 path 重置进 hook（use-file-editor.test.tsx 三个契约测试守）；`defaultRenderMode` 现从 use-file-editor.ts 导出（原 file-browser.tsx）；`initialRenderMode` 参数已不存在。
- **m4 Part 5 mock**：README preview 升为 markdown 语法（`# probe title\n\nprobe line 2\n`）供 h1 渲染断言。
- 记档位置：§6.13「真机反馈修复·第六批」段（修法五步 + 探针陷阱 + 自审补遗）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-30；触发原因：第六批「md/html 预览优先」收口（`60dc9e3`+`d807ccb`）+ /handoff save
