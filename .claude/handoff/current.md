# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-22（M9 批次 d 实现完成：探针 23/23 三连 + 回归全绿 + 四门禁过，§6.10 补记已落，**reviewer 三份待跑** → commit。触发：批次 d 收尾）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

UI v2 重构 M9 批次 d（桌面版页面：09m 插件 / 10m 全局文件 ⌘F 接线 / 07m 设置 / 13 pluginmcp_ 开 tab / 桌面预览只读化）实现完成：①07m 设置并入 mainPage 体系——SettingsDialog（M7 居中 Dialog）被 SettingsMainPage 取代（同文件 SettingsContent 单源），footnav 设置 navigate `/projects` + sticky search（leftMode=settings）+ `.footnav .on` 激活 ②mainPageActive 三条件（global + !focusId + leftMode∈{files,plugins,settings} 正面枚举）③13 pluginmcp_${name} tab kind 渲 MobileMcpDetail（McpPanel ListRow onOpenDetail 行点击，prune 跳过）④⌘F → workbenchFilesSearchFocusRequestAtom 计数器 → GlobalFilesOverview focus + 内联 .wsearch 过滤 ⑤桌面预览只读化（FileTabPreview 去编辑链 saveToggle={null}、CodeEditor editable prop，saveFileContent API 保留）⑥移动 leftMode=settings 重定向 /settings 投影。探针 `probe-v2-m9-d-desktop-pages.mjs` **23/23 三连**；回归全绿（M4 41/M5 26+46/M6 59/M7 68/M8 65/M9a 13/M9b 17×3/M9c 15）；四门禁过（api 814 无 flaky）+ CSS 硬闸过 + token 机检（11 处既有，新文件零违例）。§6.10 批次 d 补记已落（9 条）。**下一步：reviewer 三份（fork）→ commit → 批次 e。**

## 本 session 焦点

批次 d 全程 + 三次探针假红甄别（均已解，探针/mock 责，业务代码零冤改）：①E 段 footnav 设置 URL 变 /projects 丢 search——`/` 是纯跳板（beforeLoad redirect 丢 search），改 navigate to /projects + deriveWorkbenchRouteContext 加 settings 例外；②D 段 .cm-content 0——README.md 走 md render 模式不渲 CodeMirror + preview mock 响应 name 字段决定渲染分支（铁律④），断言目标改 probe.txt；③C 段点击命中左栏卡片内部 section——中栏定位改 `section` + `.filter({ has: .wsearch })`。另有 mainPageActive 语义 bug（`!== "auto"` 对 undefined 判真）由 TS2367 揪出改正面枚举。

## 关键决策（本阶段不可丢）

- 全部决策见 `docs/design/redesign-v2.md` §2（D1–D23）+ §6.10 摊牌（11 条）+ 批次 b/c/d 补记（5+8+9 条）。
- **探针 mock 铁律（累计四条）**：①形状严格对齐 shared 类型（OverviewCandidate=sessionId/type，AgentSession=id）；②完备覆盖 prune 依赖数据源（overview candidates 含分屏新建终端）；③隔离真实环境 WS 推送（approvals/stream abort）；④**preview 响应 `name` 字段决定 md/html render 分支**（断言 CodeMirror 必须 mock `.txt` 名）。
- **mainPageActive 正面枚举**：leftMode 可选类型（undefined 语义 = auto），禁写 `!== "auto"`；`!focusId` 优先于 mainPage（tab focus 路由继承 leftMode 透传也回工作台）。
- **`/` 纯跳板**：beforeLoad redirect 丢 search，不能作带 search 的导航目标；footnav 设置 = `/projects` + stickyWorkbenchSearch；deriveWorkbenchRouteContext /projects case 仅保留显式 leftMode=settings 深链（[项目] 按钮不带 search 自然 auto）。
- **prune 时序约定（三条路径统一）**：create/resume/split 都 `await navigateWorkbench` 先行再 update layout；pluginmcp tab prune 跳过（无 instance refs）。
- reviewer 用 `subagent_type: "fork"`（继承上下文，M8/M9a/M9b/M9c 四批全一次成功）。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0–M7 → M8（`4ae8098`）→ M9 批次 a+b（`4681642`）→ M9 批次 c → **M9 批次 d（本批，未 commit，等 reviewer）**
- ⏳ reviewer 三份（code/design/perf，fork）待跑 → 通过后 commit 批次 d
- ⬜ **M9 批次 e**（安全与键盘杂项：resolveCreateTarget realpath / searchFiles 遍历上限 / focus-visible 含 seg4 span 键盘 + aria-controls / w-[52px]）→ 批次末四门禁+commit → M10 总验收（新 e2e 全套 + spec §9 逐项机检 + 用户总验证，Q17 约定）
- **M9 遗留清单**：`.setrow`/`.logout` focus-visible；`.ar` 对比度；`w-[52px]` 真机项；⌘1..9 浏览器层抢占真机项；iPad 触屏 hover 正交真机验证（批次 e 静态核对 + 交用户）

## 阻塞 / 风险

- 无阻塞。**基线既有 flaky 甄别记录**：`claude-auto-retry.test.ts`「pending 存在时重复 error 不叠加调度」单跑稳定、全量偶发红——与 web 改动无关，记档不修；本次 api 全量 814 一次过未复现。全量遇红先单跑甄别。
- **dist 半新半旧回归假红**：touch main.tsx + sleep 25-30s 不稳定，探针可能跑到半新半旧产物（m9b 一次 16/1 即此因）；甄别 = `rg -l "新符号" web/dist/assets/` + 复跑；git stash 二分对探针无效（跑的是 43012 dist，stash 反触发 rebuild）。
- 大段生成纪律：本批 python 锚点稳定（heredoc 内短字符串字面量偶被改写——断言串用拼接绕开）；Edit 大段也出过占位词一次（mainPageActive placeholder，typecheck/rg 抓住后精确修正）。**sidebar.tsx 全量 Write 乱码注入一次 → git checkout 恢复改 5 个小 Edit**——「≤5 行小步 Edit 安全」经验值已验证。
- 探针 DOM：页面有两个 section（左栏 GlobalProjectsOverview 卡片内也是 section），中栏定位必须 `section` + `.filter({ has: page.locator(".wsearch") })`。

## 易丢的关键上下文

- **批次 d 改动文件全集**（12 源文件 + 1 探针 + 1 文档）：`workbench-model.ts`（leftMode 类型 6 处 + "settings" + validate + /projects settings 例外 + PluginMcpPanelRef + tabIdOf pluginmcp_ + workbenchFilesSearchFocusRequestAtom）、`WorkbenchRoute.tsx`（mainPageActive 三条件 + desktopMainPage settings 分支 + pluginmcp 拦截点删除/update/prune + leftPanel mainPage 分支 + navigate sticky 重置 + ⌘F 挂钩 + props 类型 115 行加 "settings"）、`PluginsRoute.tsx`（onOpenMcp/onOpenSkill）、`instance-area.tsx`（pluginmcp tab 渲染）、`global-files-overview.tsx`（⌘F effect + filter 框）、`file-browser.tsx`（filter prop + onEditChange 可选化 + PreviewBody editable 判定）、`CodeEditor.tsx`（editable）、`file-preview-panel.tsx`（全量重写去编辑链）、`use-workbench-shortcuts.ts`（⌘F）、`settings-dialog.tsx`（SettingsDialog → SettingsMainPage 46 行）、`sidebar.tsx`（footnav 设置导航 + settingsActive + 删 Dialog/Suspense）、`mobile-workbench.tsx`（类型 + 重定向 effect）。
- **07m 设置 IA**：mainPage 渲 SettingsMainPage（header 返回键 + max-w-[560px] col + SettingsContent root/section 内部导航不变）；MobileWorkbench 的 leftMode=settings effect 重定向是移动端投影，桌面分支不受影响。
- **探针 m9-d**：A mainPage IA（/plugins seg MCP + sidewin + 无 data-drop-group；/files .wsearch）/ B 13 入口（probe-mcp 行点击 → pluginmcp_probe-mcp tab）/ C ⌘F+filter / D 只读（contenteditable="false" + 无保存按钮，probe.txt）/ E 07m（footnav → /projects?leftMode=settings + h1 17px + max-w-[560px] + .footnav .on + 无 dialog）。mock：overview candidates 完备 + approvals/stream abort + /api/mcp + skills + root/files + proj1 files + preview(name=probe.txt) + settings。
- **dev 服务纪律**：改 web 后 touch main.tsx + `node scripts/ar-verify-css.mjs`；探针 bun 跑；e2e/test 用 `systemd-run --scope --user -p MemoryMax=2G`。
- 用户 Q17 约定：所有里程碑完成后跑新 e2e 才交用户验证；期间每里程碑 reviewer + 四门禁。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
