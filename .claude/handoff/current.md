# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-25（**第十二轮复验四批 + 四次复验补齐全闭环**：批次 1 `bf95e05` / 2 `aa93f48` / 3 `70a5c07` / 4 `62fa904` / 4+ 右栏 Git 三段 `5fc82ab` / 4++ seg4 撑爆 `1e44858` / 4+++ 搜索图标 `39b7ab2` / **4++++ 左栏 seg4 高亮跟随 `2410d9d`**。**下一步：交用户真机复验全清单（见下）。**）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第十二轮复验（用户报「1 右栏宽度过大 2 文件/git 未与 iPhone 同构重用代码」）四批全闭环 + 四次复验反馈全部修复闭环（最近一次：桌面左栏「项目/全部」分段切换时内容变但 tab 高亮不变 → 视图态做唯一真相，`2410d9d`）。核心成果：右栏宽度固定模型（22rem 档、中栏吃剩余）+ 文件/Git/Wiki **三件套多端同构单源**（三件套双端同一份 + 右栏 Git 三段与移动 L3 完全同组件）+ 左栏 seg4 高亮跟随视图态。验证全绿。

## 本 session 焦点

四次用户复验反馈逐个修复闭环，模式固定 = **根因定位 → 最小修复 → e2e/探针新增断言兜底 → 门禁 → §6.12l 记档 → commit → handoff**。最近一条（反馈④）关键点：
- **高亮源 ≠ 视图态源**：seg4 两段 on 完全由 `sideProjectName`（scope 路由态）派生，「全部」点击只写 `scopeSegment`（body 渲染真源）→ 内容变、高亮钉死。
- **修 = 视图态做唯一真相**：`projectSegOn = sideProjectName !== null && (historyOpen || scopeSegment === "project")`（历史是项目段子态）；跨 scope 导航入口（`enterProject` / `selectProjectSeg` navigate 分支）显式重置视图态——组件不重挂，残留视图态会带进新 scope。
- sessionPage 语境行为不变（sideProjectName=null → projectSegOn 恒 false =「全部」on）。

## 关键决策（本阶段不可丢）

- **多端同构 = 代码同一份（用户拍板）**：三件套（`project-tool-panels.tsx`）双端共享，注册表（`workbench-tab-plugin.tsx`）单源；表现差异只在容器层（ToolPanel 滚动容器 vs 右栏高度链；L3 跳转 vs 栏内详情栈）。
- **段装配规则**：回调式 props 条件渲染（传 onOpenCommit 才渲染最近提交段），query 同规则 `enabled` 门控。右栏现传齐全段（详情栈承载）。
- **右栏宽度模型（批次 1）**：右栏固定 `${rightWidth}rem`（默认 22rem=352px，拖拽 clamp 16–40rem），中栏恒 `minmax(0,1fr)` 吃剩余；`WORKBENCH_CENTER_MAX` 已删。grid-template 裸引 var() 必须是完整轨道定义。
- **seg4 高亮 = 视图态派生（反馈④）**：`sideProjectName` 是 scope 路由态，不能当视图高亮源；`historyOpen` 归项目侧子态。
- **`docs/design2/` 是用户目录不动。**

## 进度（已完成 / 进行中 / 待办）

- ✅ 批次 1（`bf95e05`）：右栏宽度固定模型
- ✅ 批次 2（`aa93f48`）：三件套共享化（mobile-project-tools 泛化迁 project-tool-panels）
- ✅ 批次 3（`70a5c07`）：注册表换三件套 + 右栏/焦点详情态装配（WikiPanel 退役）
- ✅ 批次 4（`62fa904`）：design-review P1/P2/P3 修复 + e2e 适配 + cwd 丢失修复 + code-review 终审 + §6.12l 记档 + verification.md 内置工具纪律
- ✅ 批次 4+（`5fc82ab`）：右栏 Git 同构三段（GitToolTab 栏内详情栈 + GitToolPanel 三段装配 + 探针 G6-G10 + e2e 历史/分支链路，§6.12l 条 10）
- ✅ 批次 4++（`1e44858`）：右栏详情态长行撑爆 seg4（min-w-0 断 min-content 传播根，§6.12l 条 11）
- ✅ 批次 4+++（`39b7ab2`）：项目/插件搜索图标撑爆输入框（ShellIcon size-4 契约 + @layer 死规则，§6.12l 条 11 前记档）
- ✅ 批次 4++++（`2410d9d`）：左栏 seg4 项目/全部切换高亮跟随视图态（§6.12l 条 12；e2e desktop-side 新增切换跟随 test 5/5 绿）
- ✅ 验证：四门禁 + CSS 硬闸 + token 机检 + e2e desktop-side 5/5；探针 inspector-row-menus 21/21、m4-tools-l3 41/41、m9-b 16/16、m9-multi-device 13/13、files-cwd-memory ALL
- ⬜ **交用户真机复验**（清单见下）
- ⬜ 存量探针欠账单独立项（§6.12l 条 9 四类：①类探针适配/退役、②③类修定位器、④类网关恢复重跑）
- ⬜ review 待办（历史遗留）：useApprovals 双 WS 订阅收敛；右栏渐变底随 token 收敛批清

## 用户真机复验清单（第十二轮四批 + 四次复验补齐）

**桌面（1920/1440 宽屏优先）：**
1. 右栏宽度 = 固定 ~352px 不随屏宽膨胀（1920 下不再是半屏）；中栏吃剩余宽度
2. 右栏拖拽 gutter 可调 16–40rem；收起/展开正常（RailButton）
3. 右栏三段（文件/Git/Wiki）每段内容铺满栏宽（frow 行贴满、githead 态势行 `main ↑N ↓N · 工作区 N` 推到行尾）
4. **右栏 Git 段 = 三段同构**（批次 4+）：githead + 工作区改动 + **最近提交 crow×3** + links「全部历史 / 分支 (N)」——「全部历史」→ 栏内历史 → 点 commit → commit 详情 → 返回逐级弹栈；分支页点分支 → 该分支历史
5. 右栏点文件行 → 栏内预览（顶部「返回文件」条）；预览内「查看 diff ›」→ 栏内 diff（「返回预览」）；Git 改动行 → 栏内 diff（「返回变更文件列表」）；Wiki 行 → 栏内阅读态——返回后 cwd 不丢（预览返回还在原目录）
5b. **长行内容进详情态后 seg4 三段恒定**（批次 4++）：预览超长单行代码/diff 长行，tab 导航不变形（长行转栏内横向滚动）
6. 文件行右键 = 7 项菜单（预览/复制路径/在 Git 查看 diff〔dirty 文件〕/重命名/移动/上传/删除）；Git 行右键 2 项；Wiki 行右键 2 项；iPad 长按同菜单
7. **左栏「项目/全部」分段切换**（批次 4++++）：点「全部」→ 段高亮跳「全部」+ 实例区变全部会话分组列表；点「项目」→ 高亮回「项目」+ 实例区回本项目实例分组；时钟历史态高亮保持「项目」侧
8. 双主题（浅/深）下右栏三段 + 栏内详情态显示正常

**移动 iPhone：**
9. 项目页工具态（文件/Git/Wiki chip）行为零变化 + **新增** Git/Wiki 行长按菜单（查看 diff/复制路径；打开页面/复制链接）
10. 会话 focus 态 files/git tab = 工具面板形态（03o/03m：mtime/git 角标/githead）——原检视面板（FilesPanel/GitDiffPanel）形态消失（scope chips/branches/commits 完整视图移除，属预期；不合适反馈后单独装配）
11. 移动 githead 态势行 + 最近提交段/links 段正常（项目工具态才有）；与桌面右栏三段完全同构（批次 4+ 对齐）

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活 43011/43012，`2410d9d` 后 dist 已 rebuild、`curl -sI localhost:43012/assets/<css>` = text/css。
- **右栏 files tab 点图片文件 = unsupported 提示**（图片预览归 FilesPanel 检视语境，三件套详情态仅文本形态）——有意取舍，用户若需要再评估。
- 探针连跑偶发 flaky（重跑绿）；iPad 长按/触屏 pointer media 自动化测不全，真机最终验证交用户。

## 易丢的关键上下文

- **探针跑法**：`bun scripts/probe-*.mjs`；跑前 touch main.tsx 完整 rebuild + sleep 16；e2e 用 `systemd-run --scope --user -p MemoryMax=2G bun run e2e "正则"`。
- **agent-browser 密码**：`PW=$(awk '/password:/ {print $2; exit}' ~/.agents-remote/config.yaml)` 进 shell 变量，不进上下文；断言用类名/aria 不用文案（探针须设 locale zh-CN）。
- **Edit 注入防护（本 session 三次实测）**：单行小步 Edit + 落盘后 rg 机检；大段 new_string 疑似高危；连续两次失败停手恢复。
- **route mock LIFO**：后注册先匹配，宽泛正则抢窄正则；探针 mock 别挂宽泛 `git/.*`。
- **右栏默认收起**：atomWithLocalOnlyStorage 默认 true——探针/e2e 加InitScript `localStorage.setItem("workbenchRightCollapsed","false")` 或点 RailButton 展开。
- **基线对照法**：`git worktree add /tmp/ar-probe-baseline <旧 commit>` + 43099 独立端口 preview，区分存量欠账 vs 本批回归。
- **stash 对照不可靠**（vite rebuild 竞态）：stash 后必须 touch main.tsx + sleep 16。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-25 02:56；触发原因：批次 4++++ seg4 高亮跟随修复（`2410d9d`）+ handoff save
