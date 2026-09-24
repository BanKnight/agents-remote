# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-24（**第十二轮复验四批全部闭环**：批次 1 右栏宽度固定 `bf95e05`、批次 2 三件套共享化 `aa93f48`、批次 3 注册表换装 `70a5c07`、批次 4 review 收口 `62fa904`。**下一步：交用户真机复验全清单（见下）。**）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第十二轮复验（用户报「1 右栏宽度过大 2 文件/git 未与 iPhone 同构重用代码」）四批全闭环。核心成果：右栏宽度固定模型（22rem 档、中栏吃剩余）+ 文件/Git/Wiki **三件套多端同构单源**（FilesToolPanel/GitToolPanel/WikiToolPanel 双端同一份，注册表 files/git/wiki render = 移动项目工具态同一 render；右栏点行 = 栏内详情态，不进 URL）。design/code review 双终审零 P1/P2 残留，验证全绿。

## 本 session 焦点

批次 4（验证 + 记档 + review + handoff）收口。关键点：
- **P1 右栏不铺满（design-review 发现）**：右栏承载链是 row-flex（shell body → RightPanelTabs 根 → tabpanel → 三件套），旧面板根 `flex-1` 承担 grow、换三件套后断链 → 子项收缩 max-content。修 = grow 上移 RightPanelTabs 根（`flex-1`）+ `w-full` 下沉内容层。**方向语义铁律：row 容器子项 grow 用 flex-1，column 容器 cross 轴自动 stretch**。
- **e2e 双重价值实证**：file-browser/git-diff 锚点适配（三件套形态）同时兜底发现**右栏 cwd 丢失真回归**（详情态卸载列表丢内部 state）→ FilesToolTab 层持 tabPath 受控传入。
- **存量探针欠账归因（§6.12l 条 9）**：全套 48 探针 21 FAIL 逐个归因四类（①§6.12k 删 middle tab 结构退役 ②M2 登录 label 漂移 ③M7 设置结构 + cssCodeSplit 文件名 ④网关 524），**非本批回归**（基线 worktree 43099 对照实证）；单独立项跟进，不阻塞交付。
- **code-review 终审**：P1/P2 零；P3 六条消化（log key 注释如实化〔与桌面同形不共享，对齐有 key 漂移双拉风险〕、GitStatusBadge/TabDiffDetail 单源折叠、探针死 sleep 换 waitFor 等）。
- **Edit 注入前科复发**（工作纪律）：本 session 内置 Edit 三次被注入篡改（`setTarget`→`insTarget`、`(el) =>` 丢箭头、参数整体篡改）——每次 rg 机检 + 单行重修恢复。**大段 new_string 高危，单行小步替换 + 写后 rg 机检照旧执行**（verification.md 已记新纪律：内置工具 + 连续两次失败停手恢复）。

## 关键决策（本阶段不可丢）

- **多端同构 = 代码同一份（用户拍板）**：三件套（`project-tool-panels.tsx`）双端共享，注册表（`workbench-tab-plugin.tsx`）单源；表现差异只在容器层（ToolPanel 滚动容器 vs 右栏高度链；L3 跳转 vs 栏内详情态）。
- **段装配规则**：回调式 props 条件渲染（传 onOpenCommit 才渲染最近提交段），query 同规则 `enabled` 门控（不白发请求）。右栏不传 → 只渲染 githead + 工作区改动 + diff 详情态（无 commit/分支列表页承载，不伪造入口）。
- **右栏宽度模型（批次 1）**：右栏固定 `${rightWidth}rem`（默认 22rem=352px，拖拽 clamp 16–40rem），中栏恒 `minmax(0,1fr)` 吃剩余；`WORKBENCH_CENTER_MAX` 已删。grid-template 裸引 var() 必须是完整轨道定义（嵌套 minmax(var()) 整条非法——批次 1 实测坑）。
- **`docs/design2/` 是用户目录不动。**

## 进度（已完成 / 进行中 / 待办）

- ✅ 批次 1（`bf95e05`）：右栏宽度固定模型
- ✅ 批次 2（`aa93f48`）：三件套共享化（mobile-project-tools 泛化迁 project-tool-panels）
- ✅ 批次 3（`70a5c07`）：注册表换三件套 + 右栏/焦点详情态装配（WikiPanel 退役）
- ✅ 批次 4（`62fa904`）：design-review P1/P2/P3 修复 + e2e 适配 + cwd 丢失修复 + code-review 终审 + §6.12l 记档 + verification.md 内置工具纪律
- ✅ 验证：四门禁 + CSS 硬闸 + token 机检（11 处全存量）+ 探针 inspector-row-menus 16/16、m4-tools-l3 41/41、m9-b 16/16、m9-multi-device 13/13、files-cwd-memory ALL + 受影响 e2e 13/13
- ⬜ **交用户真机复验**（清单见下）
- ⬜ 存量探针欠账单独立项（§6.12l 条 9 四类：①类探针适配/退役、②③类修定位器、④类网关恢复重跑）
- ⬜ review 待办（历史遗留）：useApprovals 双 WS 订阅收敛；右栏渐变底随 token 收敛批清

## 用户真机复验清单（第十二轮四批）

**桌面（1920/1440 宽屏优先）：**
1. 右栏宽度 = 固定 ~352px 不随屏宽膨胀（1920 下不再是半屏）；中栏吃剩余宽度
2. 右栏拖拽 gutter 可调 16–40rem；收起/展开正常（RailButton）
3. 右栏三段（文件/Git/Wiki）每段内容铺满栏宽（frow 行贴满、githead 态势行 `main ↑N ↓N · 工作区 N` 推到行尾）
4. 右栏点文件行 → 栏内预览（顶部「返回文件」条）；预览内「查看 diff ›」→ 栏内 diff（「返回预览」）；Git 改动行 → 栏内 diff（「返回变更文件列表」）；Wiki 行 → 栏内阅读态——返回后 cwd 不丢（预览返回还在原目录）
5. 文件行右键 = 7 项菜单（预览/复制路径/在 Git 查看 diff〔dirty 文件〕/重命名/移动/上传/删除）；Git 行右键 2 项；Wiki 行右键 2 项；iPad 长按同菜单
6. 双主题（浅/深）下右栏三段 + 栏内详情态显示正常

**移动 iPhone：**
7. 项目页工具态（文件/Git/Wiki chip）行为零变化 + **新增** Git/Wiki 行长按菜单（查看 diff/复制路径；打开页面/复制链接）
8. 会话 focus 态 files/git tab = 工具面板形态（03o/03m：mtime/git 角标/githead）——原检视面板（FilesPanel/GitDiffPanel）形态消失（scope chips/branches/commits 完整视图移除，属预期；不合适反馈后单独装配）
9. 移动 githead 态势行 + 最近提交段/links 段正常（项目工具态才有）

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活 43011/43012，`62fa904` 后 dist 已 rebuild、`curl -sI localhost:43012/assets/<css>` = text/css。
- **右栏 files tab 点图片文件 = unsupported 提示**（图片预览归 FilesPanel 检视语境，三件套详情态仅文本形态）——有意取舍，用户若需要再评估。
- 探针连跑偶发 flaky（重跑绿）；iPad 长按/触屏 pointer media 自动化测不全，真机最终验证交用户。

## 易丢的关键上下文

- **探针跑法**：`bun scripts/probe-*.mjs`；跑前 touch main.tsx 完整 rebuild + sleep 16；e2e 用 `systemd-run --scope --user -p MemoryMax=2G bun run e2e "正则"`。
- **agent-browser 密码**：`PW=$(awk '/password:/ {print $2; exit}' ~/.agents-remote/config.yaml)` 进 shell 变量，不进上下文；断言用类名/aria 不用文案（探针须设 locale zh-CN）。
- **Edit 注入防护（本 session 三次实测）**：单行小步 Edit + 落盘后 rg 机检；大段 new_string 疑似高危（`setTarget`→`insTarget`、丢 `=>`、参数篡改三形态）；连续两次失败停手（git checkout 恢复仅限改动未混杂时）。
- **route mock LIFO**：后注册先匹配，宽泛正则抢窄正则；探针 mock 别挂宽泛 `git/.*`。
- **右栏默认收起**：atomWithLocalOnlyStorage 默认 true——探针/e2e 加InitScript `localStorage.setItem("workbenchRightCollapsed","false")` 或点 RailButton 展开。
- **基线对照法**：`git worktree add /tmp/ar-probe-baseline <旧 commit>` + 43099 独立端口 preview，区分存量欠账 vs 本批回归。
- **stash 对照不可靠**（vite rebuild 竞态）：stash 后必须 touch main.tsx + sleep 16。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-24 21:53；触发原因：第十二轮四批闭环（批次 4 `62fa904`）+ handoff save
