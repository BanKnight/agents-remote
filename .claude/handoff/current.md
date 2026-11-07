# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-07 22:50（**Pages 入口批交付** `177dcfa..cfe8668` 三个 commit 本地
> 未 push；6 探针 + 硬闸 + 全门禁全绿；wiki 格式对齐批排队）

## 一句话状态

Pages 面板平级接入完成（检视面板第 4 个常驻基础标签，桌面右栏 + 移动检视面板 + 深链
全链打通，`177dcfa`）；顺带排障实锤探针 flaky 根因（sessions-stream WS 透传真实后端
覆盖 mock overview，`b1b1d92` 探针加固 + `cfe8668` 规则沉淀）。本地累计 6 commit 未
push（含前批 pages 默认根 3 个）。

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **Pages 入口方案（用户拍板「工具条平级入口」）**：pages = 检视面板 ptabs 第 4 个常驻
  基础标签，序与 WORKBENCH_TAB_PLUGINS 注册表一致（files/git/pages/wiki）。
  `withBasePanelTabs` 读侧幂等补齐 → 存量 localStorage 自动获得第 4 标签。
- **探针 flaky 根因（第一手证据链）**：`use-session-shells.applyShellsFrame` 用
  sessions-stream WS 帧**整体覆盖** `["overview"]` 缓存；探针只 mock REST、把
  `/stream/` 一律 `connectToServer()` 透传真实后端 → 真实 6 会话顶掉 mock candidates
  → stale-tab prune 把 mock 会话 tab 判 stale 摘除（v15-batch4 Part6 ⑦ 假 FAIL；
  TEMP-PRUNE 埋点实锤 pruneRefs 变真实会话）。修法 = 各探针按 REST mock 同源 mock
  `/api/sessions/stream`（已沉淀进 `.claude/rules/verification.md`）。
- **已知缺口（记档待用户拍板）**：移动端「添加根」无入口——PagesPanel 头部按钮
  `hidden lg:flex`（仅桌面），移动检视面板能看/编辑/删除/预览根、不能新增。是否修
  （头部按钮 touch 常显 / row2 ＋ 装配）交用户真机验收后拍板。
- **＋菜单退化为纯切换器**（观察项记档）：4 项全为常驻基础标签，已开=激活幂等
  （git/wiki 本就如此，pages 延伸，保留一致性）。

### 进度

- ✅ `177dcfa` feat(web): Pages 面板平级接入（PanelTab/BASE_PANEL_TABS/newPanelTab/
  tabMeta/＋菜单/双端 body/深链白名单/单测）
- ✅ `b1b1d92` test(probe): sessions-stream mock 补齐 + 过期断言同步（m4 crumb/完成、
  m9-b 分屏、m9-d G 段等待+G6 置顶行）
- ✅ `cfe8668` docs(rules): 探针 mock 同源纪律
- ✅ 探针 6/6 全绿：pages-default-root 5/5（含新 UI 断言 C）、inspector-row-menus
  ALL PASS、m4 75/75、m9-b 19/19、m9-d 68/68、v15-batch4 60/60
- ✅ 硬闸（css + tokens）与全门禁（format/lint/typecheck/test web 1065 pass）全绿

## 下一步

1. **真机 golden path 清单交用户**（见交付 checklist，下方易丢上下文）。
2. **push 等用户确认**：`5f2da9c..cfe8668` 共 6 commit（pages 默认根 3 + 入口批 3）。
3. **wiki 格式对齐批**（排队）：Phase 0（description 透传 + MCP 工具描述写链接约定）
   → Phase 1（slug 放行空格/中文子目录、wikilink 渲染、backlinks）；方案见
   docs/research/wiki-solutions-survey.md §4。
4. **wiki 发布管线 Quartz**（排队）：先 /check-deps 供应链核查再立项。

## 易丢的关键上下文

- **真机 golden path 清单（交付材料）**：① 桌面右栏见 [文件 Git 页面 Wiki] 四标签；
  ② 点「页面」→ 默认根行 `/` → site + 公开徽标；③ 行点击新标签打开 `/p/{project}/`；
  ④ 移动检视面板同构（四标签）；⑤ ＋ 菜单含「页面」（已开=激活）；⑥ 移动端「添加根」
  无入口（缺口，待拍板）。
- 探针跑法：`bun scripts/X.mjs`（repo 根跑，dev api 43011 / web 43012 在跑）；
  pages 探针备份/恢复 test 项目 pages.json（fs 层恢复，绝不 PUT roots:[]）。
- web=prod build + watch（tmux `ar-dev:web`）；改 web 源码后验证产物特征串用
  `rg "特征串" web/dist/` 直查懒加载 chunk；埋点类临时改动跑完必须删干净并等 watch
  重建（本轮 TEMP-PRUNE 已全清，产物 grep 无残留）。
- 手势/状态同步类「探针全绿真机坏」的取证范式：localStorage.setItem 追踪器 +
  window 埋点（本轮 `__layoutWrites` 逐写 dump + 源码内 TEMP console.log 双通道），
  排查完即撤。
- bun test / e2e 内存限制用 systemd-run cgroup（2G / 4G）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
