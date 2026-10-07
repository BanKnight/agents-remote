# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-07（**批 10 + 收尾全部 commit + push 完毕；等用户真机复验 + 点 9b 答复**）

## 一句话状态

v1.5 九批 + 真机反馈批 9（`88feaad`）+ **批 10（`5d9966f`）+ 收尾清理（`fa973c6`）全部 push 完毕**。诊断脚本 probe-upload-repro.mjs 已删、test 项目上传残留（probe-upload-repro.txt / probe-up-dir/）已 DELETE API 清除、死探针 probe-files-cwd-refresh 已退役。**当前等待** = 用户按统一真机复验清单复验 + 答复点 9b（上传操作路径与 composer uploads/ 期望语义）→ 决定是否追加批 11。

## 本 session 焦点（真机复验反馈 → 批 9✅ / 批 10✅ / 收尾）

### 批 10（已完成，本 commit）——16 files changed（10 web + 6 探针 + e2e 1 + 记档）

- **反馈③（▾ 菜单跨项目）**：`useGlobalInstanceCandidates({kind:"global"})` 数据源（共享 ["overview"] 缓存）；`foreignGroups` useMemo（filter 本项目 + Map 分组 + localeCompare）；`InstanceSwitchRow` 模块级 + badge prop（外项目行内标注项目名，ink-2）；`onSelectInstance` 扩签 `(projectName, sessionId)`，focusInstance 跨项目分支 `navigateWorkbench({kind:"project", key}, sessionId, {})`；✓ 仅本项目行；caret 文字 ▾ → `.sw` chevron 原语 + 开态主色。**探针 mock 契约坑**：/api/overview candidates = 扁平 wire shape（{projectName,sessionId}），ref 嵌套是 hook :1834 映射后 client 形状。
- **反馈⑦（全局文件行同构）**：FileEntryList ListRow 分支 → `.frow` button 形制（.ic 17px + .p/.p dir + .tm + .ar RowChevron + 长按/右键菜单）；行尾 ⋯ 钮退役（renderActions triggerMode="hidden"）；DragSourceCard 包裹（新 className prop="frow-host"；inClose 判定命中行根 button → 单击/拖动语义正确）；**重命名态行 = div**（code-review P1：HTML 内容模型禁 button 含交互式后代）。分隔线四组合选择器并入既有规则。
- **反馈⑧（crumb 图标化）**：`.crumb .cico` 12px 物化；首段 ShellIcon name="project"；**根层也改**（任何层级不显项目名文字——用户反馈优先于原型根态 b 项目名，diverge 记档）；aria-label 补可访问名（design-review P1）；`.cseg` 标记抑制图标后「/」前导（原型「📁 src / auth」）。
- **反馈⑨a（上传进度）**：upcard `data-state="uploading|queued"`（**卡根**）；uploading = indeterminate 扫动条（keyframes 单源 index.css 与 skeleton-shimmer 同族、var(--ease-standard) 1.4s）；queued 保持 percent 静态；reduce 态 width:0（防「定格 30% 被读成已完成 30%」）；i18n 单数键 uploadingOne/queuedOne。
- **★ 伴生存量缺陷（global-back 探针实抓）**：mobile-l3 预览 meta 行 `new Date(data.mtimeMs).toISOString()` 对 optional 契约字段无守卫 → RangeError 崩预览渲染树。修复 = 4 处守卫。探针腐化双因：selector `[data-list-row-title]` 已删 + 「返回文件列表」批 3 已改父目录名。stash 基线实锤存量（批 3 后某批引入）。
- **e2e 适配**：file-browser.spec 断言批 4 已退役的右栏 ptabs file 标签 → 中栏 tabstrip（.tb.on / main 内预览文本 / Minimize ✕）；基线实锤存量腐化。

### 关键决策（本阶段不可丢）

- **基线 stash 对照法两条铁律**：①产物面探针（bun scripts/*.mjs 打 43012 preview）必须等 build --watch 完整 rebuild（touch main.tsx + 45s）——增量产物中间态会假 fail（tree-bugs 桌面根层「不可滚」即此类，完整 rebuild 后消失）；②e2e（自起 vite dev 测源码）**不受产物影响**，stash 后立即跑就是真基线。
- **探针 mock wire shape**：overview candidates 扁平；ref 嵌套是 client 形状。mock 按 wire 写。
- **用户反馈 > 原型落图**：反馈⑧「不再展示项目名」明确推翻原型根态 `<b>项目名</b>`（diverge 记档 redesign-v2 §6.14 批 10 段）。
- **死探针记档**：probe-files-cwd-refresh（middle tab TabButton + 左栏 refresh 钮 v1.5 已退役；cwd 记忆已被 cwd-memory 覆盖）——收尾批处置。
- **历史拍板继续有效**：密码自读不进上下文；禁截图/vision（DOM 几何硬数据）；探针只删自建数据、用 bun 跑；改 web 文件后必跑 ar-verify-css；format 只用 `bun run format`；React 前加载 vercel-react-best-practices；多端同构；tokens.json 唯一权威；max-sm 断点铁律；单测/e2e systemd-run 2G（**api test 无 2G 限制会 flaky exit 1**）；tmux 红线只 respawn-pane -k。

### 进度（已完成 / 待办）

- ✅ 批 0–8（v1.5 九批）+ 批 9（反馈①②④⑤⑥，`88feaad`）。
- ✅ 批 10（反馈③⑦⑧⑨a）`5d9966f`：实现 + 验证 + 双 reviewer + 记档，已 push。
- ✅ 收尾 `fa973c6`：死探针退役；诊断脚本已删；test 项目残留已清（200/200）。
- ⬜ 等用户真机复验（统一清单见下）+ 点 9b 答复 → 定是否批 11。
- ⬜ reviewer P2 存量记档项随维护批消化（§6.14 批 8/9/10 段）。
- ℹ️ `~/workspace/test/b4diag-*.txt` 两文件（2026-09-28，早于 v1.5）全仓无引用——非本批残留，未动，待用户定夺。

### 阻塞 / 隐患

- 无阻塞。dev 存活 43011/43012。
- `docs/agents-remote-design-v1.5.zip` untracked 不提交（长期约束）。

## 统一真机复验清单（最终交用户版，批 10 完成后）

**批 10**：
1. 会话页行1 ▾ 菜单：跨项目实例在列（行内标注项目名）、点击直接跳转目标项目聚焦该实例；标题 chevron（.sw）开态主色
2. 全局文件进项目文件夹：列表行与工具区文件树同构（同款行形制/长按右键菜单/分隔线）；文件可拖到中栏开 tab（拖动注入时）
3. 工具区地址栏：首段=项目图标（任何层级不显项目名文字）；图标与首段路径之间无「/」
4. 上传：进行中扫动条动画 + 「正在上传 1 个文件」单数文案；**上传成功落点**（点 9b——请说明操作路径与期望）
**批 9**：中栏 tab 无重试图标/分组头无最大化钮；行1 面板钮与 ⋯ 中心距；▾ 菜单开滚当前行；QuickKeyBar 未展开可拖动；中栏分组 ⋯ 菜单项图标；composer safe-area 抬高。
**批 8**：滚轮横滚 / 12px 渐隐 / 附件双路径 / 菜单新观感（45px/17px/圆角14）。
**批 7**：iPad 状态栏审批段 / 终端收起手感 / 子 agent 概览条 / 会话图标 / 插件图标。
**批 6**：项目行菜单 / 重命名影响提醒 / 删除 sheet。
**批 5**：历史计数筛选/搜索/五档分组/游标分页/左滑删除/iPad 历史侧栏/右键行菜单。
**批 4**：桌面中栏 file/wiki 标签 / tabstrip / 全局文件推入态 / 桌面「让 Agent 读这篇」。
**批 3**：移动 .fmeta / pencil / ⋯ 菜单 / 空态 / wiki 面板 / FAB。
**批 2**：三 Tab / 登录直达上次会话 / 会话页无 tab bar。
**批 1**：行1 导航 / ▾ 切换 / ⋯ 历史+实例信息 / 迷你条退役。
**专项关注（code-review P2）**：桌面 /files 子目录行右键 = 唯一行菜单入口（无 hover ⋯）——验证可发现性；重命名中点文件名中部光标定位（WebKit 触屏 tap 路由）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-07 05:00；触发原因：批 10（`5d9966f`）+ 收尾（`fa973c6`）push 完毕——交付真机清单，等用户复验
