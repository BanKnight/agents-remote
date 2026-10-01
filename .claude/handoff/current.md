# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-01（**第十一批收口，最新 `e9e9c87`**。用户复盘澄清「左栏从项目切到全部右栏直接消失」→ 实锤 global 会话页（/projects）scope gate 让右栏 aside+RailButton 整体蒸发（seg4 恒「全部」高亮是归因误导，探针矩阵实锤与右栏零因果）→ 右栏全 scope 连续可唤出 + 空态分支首次走到 + gitDiffForChip enabled gate。第十批 RailButton 视觉 `5e06b5d`、第八/九批已收口等真机复验。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第十一批「global 会话页右栏整体蒸发」收口（`e9e9c87`）：用户反馈「左栏从项目切到全部右栏直接消失」。三轮探针排查（seg4 矩阵 18 态 + observer 零捕获）排除 seg4 → 用户三问答锁定消失形态（面板+按钮全无/切回项目就回来/URL 没变）→ 实锤 = global 会话页 `/projects` 的 scope gate `rightPanelCollapsible = scope.kind === "project"`：右栏 aside+RailButton 全蒸发、seg4 恒「全部」高亮（归因误导）、恢复 = 点「项目」段 navigate 回 lastProject、URL 仅差尾段感知「没变」。修 = 右栏全 scope 可唤出（rightPanel = panelOpen 直驱 + collapsible=!desktopMainPage + 投影去 scope gate），RightPanelTabs 空态分支首次走到；配套 usePanelToolChip gitDiffForChip `enabled: projectKey !== ""` gate（防空 projectKey 脏请求）。probe-v2-m9-multi-device 新 Part 4 六断言全绿（19 pass）+ m9-d 64 pass 回归。**待真机复验**。

## 本 session 焦点（第八 + 九 + 十 + 十一批）

1. 第八批：嵌套原型页图标看不到 → 静态水合（`3665264`）。
2. 第九批：全局文件预览返回不是全局文件 → MobileFileFocus back pop 优先（`9bbf351`）。
3. 第十批：桌面右栏折叠后展开按钮不见了 → RailButton 视觉可发现性（`5e06b5d`）。
4. 第十一批：左栏切「全部」右栏直接消失 → global 会话页 scope gate 蒸发（`e9e9c87`）。

## 关键决策（本阶段不可丢）

- **global 会话页右栏语义**（第十一批）：右栏全 scope 可唤出；global = 空态（「检视 · 只读」+「暂无内容」），真内容 = rootBrowse 全局文件树下沉（存量欠账后续批次）。mainPage 整页态（footnav 文件/插件/设置）右栏蒸发保留（09m/10m 中栏吃满 IA）。
- **定位教训（连续两批）**：①headless `visible=true` 只证 DOM 非隐藏，不证人眼可辨（第十批）；②用户复现路径的第一手三个事实（消失对象/恢复动作/URL 变化）比代码路径穷举更快收敛（第十一批——三轮探针矩阵实锤 seg4 无辜后才问，应更早问）。
- **视觉验证局限**：半透明底叠同色系背景是 headless 盲区；视觉问题用 getComputedStyle 色值对比判可发现性。
- **返回类导航统一 pop 优先**（useWorkbenchBack）：有来路 history.back()，深链兜底 push——MobileFileFocus 纳入该范式。
- **静态等效水合**（第八批）：sandbox 禁脚本既定口径不回退；`WINDOW_ICONS_ASSIGN_RE` 赋值定位。
- 第七批决策继续有效：iframe 内联 srcdoc、按嵌套文档自身目录、深度 2、失败容错。
- **file tab 状态（用户拍板）**：桌面中栏 file tab 后续规划要恢复发挥作用，当前暂时保持没有——暂缓非弃案。
- 历史拍板继续有效：三栏第一行同一水平线；跨页一致优先；多端同构；「侧边栏」= 检视面板。

## 进度（已完成 / 进行中 / 待办）

- ✅ 第八批 `3665264`（静态水合）+ 第九批 `9bbf351`（全局文件返回）+ 第十批 `5e06b5d`（RailButton 视觉）+ 第十一批 `e9e9c87`（global 右栏蒸发）
- ✅ 记档 §6.13 第六~十一批六段齐 + handoff 滚动
- ⬜ **交用户真机复验**（第八/九/十/十一批清单见下）
- ⬜ **待用户拍板**：ColumnResizeGutter 死代码（右栏宽度拖拽疑似失效，workbench-shell.tsx :140 附近 `{rightOpen ? null : <ColumnResizeGutter/>}` 恒 null；已向用户报告过一次未回应）
- ⬜ reviewer 补审：API 恢复后补审 `60dc9e3`~`e9e9c87`（第六~十一批）
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉（**第十一批后升级：global 右栏空态等它填真内容**）；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；右栏栏宽 352 vs 320；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（第八批 `3665264` + 第九批 `9bbf351` + 第十批 `5e06b5d` + 第十一批 `e9e9c87`）

**第八批**（打开 agents-remote 项目 `docs/design/index.html` 渲染态）：

1. **图标恢复**：嵌套原型页内原来看不到的图标（搜索框放大镜、行内功能图标）应显示
2. **手绘兜底不受影响**：`svg[data-symbol]` 图标保持原样
3. **嵌套功能回归**：第七批清单 1–5 项不受影响；md 渲染、编辑流转不受影响

**第九批**（移动端）：

4. **全局文件预览返回**：底部 nav「文件」→ 进项目 → 点文件预览 → 返回（◄/✕）→ 应回**全局文件页**且停在原目录
5. **cwd 记忆保持**：返回后仍在刚才浏览的目录内

**第十批**（Mac 桌面，项目工作台）：

6. **唤出钮可见**：折叠右栏后中栏右缘垂直中部出现实底竖条按钮（白底描边 + 深色 ›，24×80）——用户已确认能看到（颜色修复生效）
7. **唤出功能**：点击展开如常；折叠/展开循环无异常

**第十一批**（Mac 桌面）：

8. **global 页右栏不蒸发**：项目页右栏展开态 → 地址栏直达 `/projects`（全部项目页）→ **右栏保持展开**（显示「检视 · 只读」+「暂无内容」空态，不再消失）；折叠态到达则唤出钮在中栏右缘在场
9. **开合记忆跨页连续**：global 页折叠右栏 → 点左栏 seg4「项目」段回项目页 → 仍折叠 + 唤出钮在；global 页展开 → 回项目页 → 仍展开（files 标签在）
10. **空态无脏请求**（可选）：global 页展开右栏时 DevTools Network 无 `/api/projects//git` 脏请求

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过（183426 字节，content-type text/css）。
- **router22 残留进程待用户处理**：21 天前的 chromium 两棵进程树（PID 1989432/1989916，user-data-dir=/tmp/router22-fb31-diag3，remote-debugging-port=9781）——kill 被权限分类器拦截（跨项目资源），需用户自己清或授权；本项目探针无残留。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **pre-commit 快速通道**：staged 全为纯文档面 → 只跑 format:check+lint；任一命中代码面 → 全门禁。
- **inlineLocalHtmlAssets 契约**（第七/八批）：四类 job 并行（stylesheet/img/iframe/iconScript）；水合导出件均可测。
- **MobileFileFocus back 契约**（第九批）：pop 优先回来源 + 深链兜底 /files。
- **RailButton 回归覆盖**：probe-v2-m9-multi-device Part 2/3 点击唤出 + Part 4 global 连续性六断言（本批新增，样式改动无需同步断言）。
- **global 右栏空态装配链**（第十一批）：RightPanelTabs projectKey=null → 空态分支；usePanelToolChip 空串 projectKey 已 enabled-gated（gitDiffForChip）；panelTabs/panelActive atom global 无 key 读缺省。
- 记档位置：§6.13「真机反馈修复」第六~十一批六段齐。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-01；触发原因：第十一批「global 会话页右栏整体蒸发」收口（`e9e9c87`）+ /handoff save
