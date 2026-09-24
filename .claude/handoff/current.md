# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-24（**第十一轮复验两批全闭环**。第一批 2 问题（移动 terminal 空隙 + 导航栈 pop 语义）= `1fd4aab`；第二批 4 问题（标题行统一/市场箭头/桌面搜索框/管理源返回）= `9873f99`。**下一步：交用户真机复验两批清单 + 问题⑤（桌面右栏缺功能）待用户澄清。**）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第十一轮复验报数 2+5 问题处理完：第一批（1fd4aab）修移动 terminal 双重避让空隙 + 导航栈三修（useWorkbenchBack pop 原语/单次导航/fallback 清 focusId）；第二批（9873f99）修 ①项目页标题行触屏撑高 52→41.5 统一 ②市场卡箭头贴右（.ar margin-left:auto）③新增 .psearch 搜索框单源 + /files 内容 28px 线对齐 ④管理源/市场/详情 4 处 back pop 优先。**问题⑤（桌面右栏缺乏重要功能）描述不完整，已调研 3 个差异点待用户澄清。**

## 本 session 焦点

两批复验修复。第二批根因：①`.h-ic` 原型是 22px 裸图标不撑行，实现 touch:h-10 按钮参与布局——修 = 删 pb-2 + touch:-my-1（点击区保留）；②原型 09 箭头贴右靠 .c 计数列 margin-left:auto（实现无计数列 §6.12g）——auto 移交 .ar；③桌面 mainPage 搜索框三页三形态（wsearch 30 胶囊/内联 38/内联 38）——新增 .psearch 单源（移动 38/r12/fill-search = 09m/10m，桌面 34/r10/elevated2/border = 09-mac/10-mac）+ /files 搜索框 mx-4 补齐 seg4/卡 28px 线；④管理源 back push 固定 /plugins 跳过来路——复用 useWorkbenchBack pop 优先，覆盖 market/sources/skill-detail/mcp-detail 4 处。

## 关键决策（本阶段不可丢）

- **.psearch 搜索框单源**：三页（项目/插件/全局文件）一级页搜索框统一类；margin 由调用方承担（/files 需叠 FilesPanel px-3 补 mx-4 到 28px 线；/plugins mx-4=16px 自有线）。**遗留**：桌面 /files 28px 线 vs /plugins 16px 线两页内容基线差 + seg4 独立行形制（原型 mhead 行内 280/290 定宽）——记档待复验再议（收编需动 FilesPanel px-3 / seg4 margin 共享结构）。
- **触屏撑高修法范式**：触屏大点击区按钮参与父行布局时用 touch:-my-* 抵消盒高，不砍点击区（frontend-notes §7 延伸）；agent-browser（pointer:fine）测不出 touch: 差异，需静态数学 + 真机。
- **useWorkbenchBack 推广**：插件域 4 处 back（market/sources/skill/mcp detail）全部 pop 优先 + 深链兜底 push /plugins；原语在 workbench-model.ts:281，判定 `__TSR_index>0`。
- **死探针删除**（tabstrip-back 先例延续）：probe-plugin-tooltips 首断言依赖 M6 已退役「Skills」button（组头现为 psect span）→ git rm。
- **残留 tmux 会话不删**：ar-terminal-agents-remote-bd3bacc9-terminal_dd9 = 用户自建「重构ui」会话（terminal_dd988a5849af4fb2），非探针数据。

## 进度（已完成 / 进行中 / 待办）

- ✅ 第一批（1fd4aab）：terminal 空隙 + 导航栈三修 + 3 探针适配（workbench-states/project-header 适配、tabstrip-back 删）
- ✅ 第二批（9873f99）：标题行/箭头/搜索框/管理源 back 4 项 + m10、files-tree-bugs 选择器适配 + plugin-tooltips 删
- ✅ 验证：e2e 受影响 10/10；探针 projects-home 21 + m6-plugins 53 + m6c 53 + files-tree PASS + m10 全过 + ia-skeleton 19 + m7 68；单测 672+829+9；门禁/CSS 硬闸过
- ⬜ **交用户真机复验**：
  - 移动 iPhone：①项目页/文件页/插件页三页主标题行高度一致（触屏 40px 按钮不再撑行）②插件页市场两卡箭头贴最右 ③插件页→管理源→back 回来路（市场 ⚙ 进 → 回市场页）④市场/管理源/技能详情/MCP 详情 back 后浏览器手势不回弹 ⑤terminal 聚焦态无空隙（上批）
  - 桌面：⑥/files 作用域分段/搜索框/项目卡三块左缘对齐一条线 ⑦/files 与 /plugins 搜索框同规格（34px/圆角 10/浅底描边）
- ⬜ **问题⑤澄清**：桌面右栏（Inspector）缺什么功能——已调研 3 个原型差异点（见下），等用户确认所指
- ⬜ review 待办（单独立项）：useApprovals 双 WS 订阅收敛；右栏渐变底随 token 收敛批清

## 问题⑤调研结论（桌面右栏 Inspector 原型 vs 实现）

结构已对齐（glabel2「检视 · 只读」+ seg4 文件/Git/Wiki/历史）。原型（04 iPad pin⑥ / 05 Mac）有而实现无：
1. **点文件 → 本栏预览 / diff**（04 insfoot / 05 Git 段 diffhead+dcode 内嵌 diff）
2. **文件树 + Git 折叠同屏**（04 文件段同屏两块；实现四段互斥切换）
3. **右键（长按）= 05e 同款菜单**（04 insfoot）
另有 clps » 折叠（实现用 RailButton 收起替代，能力在）。用户原话「桌面端右侧的侧边栏缺乏，这种重要功能」话未说完——交付时列以上 3 点请其确认所指。

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活 43011/43012，dist 已 rebuild（新代码），CSS content-type text/css。
- 连跑探针偶发 flaky（m6c 首轮 click 超时、files-tree-bugs 首轮页面未渲染挂——重跑均绿；负载时段 sleep 800ms 不够）。

## 易丢的关键上下文

- **探针跑法**：`bun scripts/probe-*.mjs` + `systemd-run --scope --user -p MemoryMax=2G`；跑前 touch main.tsx 完整 rebuild + sleep 16。
- **agent-browser 密码**：`PW=$(awk '/password:/ {print $2; exit}' ~/.agents-remote/config.yaml)` 进 shell 变量填 @ref，不进上下文/输出；agent-browser 无 locale 设置（界面英文，断言用类名/aria 不用文案）。
- **agent-browser 页面缓存**：set viewport 后需重 open URL 才生效；dev rebuild 后旧页面跑旧代码，open 带 ?v=N cache-bust。
- **stash 对照不可靠**（vite rebuild 竞态）：必须 stash 后 touch main.tsx + sleep 16 再跑基线；pop 后同样 touch + sleep。
- **探针跑死≠回归**：连跑多探针时段 m6c/files-tree-bugs 均出现过环境 flaky（重跑绿）；先重跑再查代码。
- **Edit 注入防护**（前科 8 次）：≥15 行用 python 锚点脚本；单行 Edit 后 rg 机检。
- **e2e 纪律**：`systemd-run --scope --user -p MemoryMax=2G bun run e2e`；多 spec 用正则 `"a|b"`（run-e2e.ts 多 filter 只吃第一个）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
