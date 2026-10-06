# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-07（**真机复验反馈 9 条 · 批 9 已收口待 commit；批 10 预研定稿即将实施**）

## 一句话状态

v1.5 九批全部完成后，用户真机复验反馈 9 条 → 拆两批消化。**批 9（点①②④⑤⑥）实现 + 探针 + 双 reviewer 审查 + 消化全部完成**，§6.14 已记档，本 commit 收口。**批 10（点③⑦⑧⑨a）预研（只读）已定稿**，马上实施。收尾 = 删诊断脚本/清上传探针残留/交用户统一真机清单（点 9b 等用户说明 composer uploads/ 语义）。

## 本 session 焦点（真机复验反馈 9 条 → 批 9 / 批 10 / 收尾）

### 批 9（已完成，本 commit）——改动文件 15 个

- **反馈①**：TabChip 删 AutoRetry 图标（`AutoRetryHeaderButton` 收窄为移动胶囊形态，variant prop 退役）；GroupHeader 删 ▢ 最大化钮 + prop 链全删（WorkbenchRoute→InstanceArea→WorkspaceTree→GroupShell→GroupHeader）+ `toggleLeafMaximize` 函数/单测删除；**读取侧 `stripMaximized` 归零**（V4 raw 条件写回 + V1/V2/V3 三迁移分支包 clamp，防迁移用户独占无入口困死）；en/zh 孤儿键 panelMaximize/panelRestore 删除。maximized 维度此后不可达（记档随清理批）。
- **反馈②**：面板钮 `.ticon`→`.ic`（26×26/svg 20px，与工具页 [pencil][⋯] 中心距一致）；▾ 菜单行删 `h-10` 死值 + **新增打开时当前行 scrollIntoView**（state-ref §14 范式三轮调试：useRef+[] → open 受控+[open] → state-ref 才成立——portal Content 仅开态挂载）。
- **反馈④⑥**：`SessionInputDrawer` pb = `max(env, var(--shell-mobile-bottom-nav-space))`（reviewer P1 实抓双重避让——nav 高度已含 env，同向相加=真机 34px 空带；max() 一条公式两态单层）；`--composer-gap` 无 nav 固定 `"0.5rem"`（旧公式 `0.25rem−env`≈−30px → composer 贴屏底）。
- **反馈⑤**：SessionTabStripActions 4 icon + FilePreviewNavMenu 5 icon（桌面 FileTabStripActions 复用 = 三端生效）显式 `size-[17px]`（design-reviewer P2 实抓：ActionMenu 17px 兜底选择器被 ShellIcon 内部 size-4/size-full 滑过，永不命中）。
- **★ 实抓缺陷（m9-d 探针 F5/F6）**：删 TabChip AutoRetry 块时把 `${isActive ? "on" : ""}` 一并误删 → tab active 下划线全灭；typecheck/单测/reviewer 全绿测不出，只有 DOM 几何断言抓到。
- **复验数据**：门禁全绿（test 1644 = api 905 + shared 10 + web 729）+ CSS 硬闸 196327 字节 + tokens 0 违例 + 探针全绿（mobile-workbench-states 22 / mobile-project-header 34 / batch8 25 / m9-d 67 / tab-overlap / batch3 55 / batch4 36 / m5-sheets 82 / m11 14 + e2e 4）。
- **双 reviewer**：code P1×1（env）已修 + P2 修 5 记档 2；design P1×1（同一 env）已修 + P2 修 1 记档 1。§6.14 批 9 段已落。

### 批 10（即将实施，预研定稿）——点③⑦⑧⑨a

- **点③ 顶栏切换跨项目**：数据源换 `useGlobalInstanceCandidates({kind:"global"})`（instance-area.tsx:1796，返回 `{ref:{kind,projectName,sessionId}, displayName, status, type, provider,...}` 含全部项目）；本项目行在前不加标注、其它项目行内标注项目名；✓ 判定 = projectName+sessionId 对比（不再是单 sessionId）；onSelectInstance 扩签 `(projectName, sessionId)`，跨项目走 `navigateWorkbench({kind:"project", key:projectName}, sessionId, {})`（mobile-workbench.tsx:843-856 focusInstance 处）。**配套 caret ▾ 文字 → `.sw` chevron**（v2-primitives：8px border rotate 45deg，开态 `group-data-[state=open]:text-primary`；原型「标题▾」单源）。
- **点⑦ 全局文件行同构**：file-browser.tsx ListRow 分支（:400-476）→ `.frow` 形制（`<button class="frow">` + .ic 17px + .p/.p dir + .tm + GitStatusBadge + RowChevron，对照 project-tool-panels.tsx:609-651）；保留 DraggableListRow/rename input/readOnly/selected 能力；`.frow` 无 selected 原语需查/补 on 态。共享组件层改动 = 桌面左栏同步生效（多端同构 ✓）。
- **点⑧ 工具区 crumb 项目名 → 图标**：`.crumb .cico`（原型 components.css:156 12px 项目图标首段）物化到 v2-primitives.css + 实现点 project-tool-panels.tsx:1053-1058 usePanelToolChip 首段换 ShellIcon name="project"。
- **点⑨a 上传进度**：UploadQueueCard percent=doneCount/total 恒 0%（fetch 无进度回调）→ 加 `data-state="uploading|queued"` + v2-primitives `.upcard .prog[data-state="uploading"] i` indeterminate CSS 动画；en i18n「1 files queued」复数瑕疵顺带修（translate.ts 无复数机制，改条件词）。
- 批 10 验证链：门禁 + CSS 硬闸 + tokens + 探针（probe-files-cwd-memory/probe-m10 相关面 + 新断言）+ design/code reviewer + §6.14 记档 + commit + push。

### 收尾（批 10 后）

- 删 `scripts/probe-upload-repro.mjs`（诊断脚本，不入库）。
- 清 test 项目残留：`probe-upload-repro.txt` + `probe-up-dir/`（DELETE API `/api/projects/test/files?path=...`，密码脚本自读）。
- 交用户统一真机清单（批 9+10 项 + **点 9b：请用户说明上传操作路径**——composer 上传语义 uploads/ 归属待用户澄清后定是否追加批）。

## 关键决策（本阶段不可丢）

- **批拆定案**：批 9 = 点①②④⑤⑥（已完成）；批 10 = 点③⑦⑧⑨a；收尾 = 清理 + 清单。点 9b（上传成功落项目根目录而非当前项目）需要用户给出上传操作路径说明，暂缓。
- **探针 flaky 防线**：弹出 spring 动画进行中 getBoundingClientRect 采到中间帧（亚像素缩放）→ 几何断言前 `waitForTimeout(250)`（--spring-standard-duration: 120ms）。
- **基线 stash 对照法局限**：stash 后 build --watch 重新编译需 20-30s，立即跑的基线无效；更可靠 = 逻辑推演（本批未触碰的 UI 面 fail = 存量）。
- **ActionMenu 17px 兜底短路**：`[&_svg:not([class*='size-'])]` 被 ShellIcon 内部实现滑过（span size-4 + svg size-full 含 "size-"）——新消费点必须显式 `size-[17px]`；存量兜底失效面已记档。
- **历史拍板继续有效**：密码自读不进上下文；禁截图/vision（DOM 几何硬数据）；探针只删自建数据、用 bun 跑；改 web 文件后必跑 ar-verify-css；format 只用 `bun run format`；React 前加载 vercel-react-best-practices；多端同构；tokens.json 唯一权威；max-sm 是本仓移动断点禁 max-md。

## 进度（已完成 / 待办）

- ✅ 批 0–8（v1.5 九批，hash 见 git log）。
- ✅ 批 9（真机反馈上批）实现 + 验证 + 双 reviewer + 记档，本 commit 收口。
- ⬜ 批 10（真机反馈下批）实施。
- ⬜ 收尾清理 + 统一真机清单交用户。
- ⬜ reviewer P2 存量记档项（redesign-v2.md §6.14 批 8/9 段）随维护批消化。

## 阻塞 / 隐患

- 无阻塞。dev 存活 43011/43012。
- `docs/agents-remote-design-v1.5.zip` untracked 不提交（长期约束）。
- probe-upload-repro.mjs + test 项目两个上传残留随收尾清理。

## 易丢的关键上下文

- **写入污染顽疾（本 session 累计 6 次）**：Edit new_string 写完必须逐字自查再发；修复污染时 old_string 必须从最新 Read 复制。
- **删 JSX 块高危区**：className 模板串里的插值表达式（`${isActive ? "on" : ""}`）——m9-d 实抓 .tb.on 误删。
- **portal 挂载晚于宿主 effect**：需要挂 DOM 的副作用一律 state-ref callback（§14），不用 useRef+[]。
- **hook 返回对象别进 effect deps**；探针材质断言走浏览器序列化归一；session_init 必须手动 seed。
- mock id 前缀契约 `agent_`/`terminal_`；探针 `bun scripts/*.mjs`；单测/e2e systemd-run 2G；tmux 红线只 respawn-pane -k。
- Edit 纪律：old_string 从最新 Read 复制；new_string 写完自查再发。

## 统一真机复验清单（最终交用户版，批 10 后补全批 10 项）

**批 9**：
1. 中栏 tab 无重试图标；分组头无最大化钮（右端 [＋][分屏][编辑][⋯]）
2. iPhone 行1 面板钮与 ⋯ 钮中心距 = 工具页 [pencil][⋯] 间距
3. ▾ 菜单打开时 ✓ 当前行滚入视野（实例多溢出时）
4. terminal 快捷键条未展开也可左右拖动（QuickKeyBar 未展开态拖动——**注：点④归批 9 但展开/收起拖动语义随批 7 输入默认收起改造，真机重点验**）
5. 中栏分组 ⋯ 菜单项有图标
6. agent composer 抬高（safe-area 单层避让，无 nav 固定 8px 间隙）
**批 8**：滚轮横滚手感 / 12px 渐隐 / 附件双路径 / 菜单新观感（45px/17px/圆角14）/ OptionMenu 行高。
**批 7**：iPad 状态栏审批段 / 终端收起手感 / 子 agent 概览条 / 会话图标 / 插件图标。
**批 6**：项目行菜单 / 重命名影响提醒 / 删除 sheet。
**批 5**：历史计数筛选/搜索/五档分组/游标分页/左滑删除/iPad 历史侧栏/右键行菜单。
**批 4**：桌面中栏 file/wiki 标签 / tabstrip / 全局文件推入态 / 桌面「让 Agent 读这篇」。
**批 3**：移动 .fmeta / pencil / ⋯ 菜单 / 空态 / wiki 面板 / FAB。
**批 2**：三 Tab / 登录直达上次会话 / 会话页无 tab bar。
**批 1**：行1 导航 / ▾ 切换 / ⋯ 历史+实例信息 / 迷你条退役。
**前序遗留**：发图批 6 项 + 技能列表批/浮层聚焦批 9 项 + 第五批 reviewer 修复批。
**待用户澄清**：点 9b 上传操作路径（composer uploads/ 语义）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-07 03:17；触发原因：批 9 收口（记档 + handoff + commit）——批 10 实施前 checkpoint
