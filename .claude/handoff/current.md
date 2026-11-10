# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-10 09:59（**standalone gate 批** `e5e4839` + P2 消化 `bb4b2f6`；
> push 待确认——`50f8e86..bb4b2f6` 共 6 commit）

## 一句话状态

用户对预览层批（`043acf3`）三条真机反馈全部落地：①顶栏地址显示完整域名（origin +
serveUrl）；②预览层只在 standalone PWA 打开（`isStandaloneDisplay` gate，非 standalone
点行放行原生 `target=_blank` 新标签，顶栏「新窗口」钮删除）；③旧版 header「添加根」
ActionButton 退役（v2 换底前残留），入口改右栏 FAB ＋（files/pages tab 双分支，双端
同构，移动端无入口缺口一并补齐）。双 reviewer 无 P0/P1，P2 全部消化（`bb4b2f6`）。

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **预览层 gate 双通道**：pages-panel 行 onClick 顺序 = 修饰键守卫在前（metaKey/
  ctrlKey/shiftKey/altKey return）→ `isStandaloneDisplay()` 判定 → preventDefault +
  setPreviewing。非 standalone 全放行原生（用户拍板「pwa 才是内嵌 iframe 方案，
  其他平台跳转浏览器打开更合理」）；修饰键守卫在 standalone 仍有意义（桌面安装的
  Chrome PWA 同为 standalone 形态，Cmd+click 存在）。
- **顶栏「新窗口」钮删除的推理**：预览层只在 standalone 打开 → standalone 下同源
  target=_blank 恒降级当前视图导航 → 该钮恒是陷阱。openInNewWindow i18n +
  external-link 图标白名单一并回收（icons.ts 56 图标）。
- **顶栏 displayUrl**：`window.location.origin + serveUrl` 纯展示（iframe src 保持
  相对，语义不变）；iframe title 同步 displayUrl。
- **FAB 扩展 pages（用户拍板）**：`activeKind === "files"` gate 扩为 files/pages
  分流——pages 分支复用 `.fab` + `.plus` 同款（无菜单，单项动作直接 onClick 递增
  `pagesAddRequest` 计数）→ PagesPanel `createRequest` 桥（既有 prop 首个真实消费
  点，ref 初值守卫吃 mount 首跑）。双端：right-panel-tabs.tsx（桌面）+
  mobile-workbench.tsx renderPanelFab（移动）。移动端此前无「添加根」入口（handoff
  缺口记档）随本批补齐。
- **probe-fab.mjs 5 处 FAIL = 过期探针（非本批回归）**：MobilePageHeader 结构、
  files.createAria / pages.createAria drawer 入口在本批之前的 UI 演进中已删除/迁移，
  探针没跟上（frontend-notes §29② 预置假设漂移）。本批 diff 与其断言面零交集。
  待用户拍板是否重构跟进现 UI 形态。
- **CSP frame-ancestors 仍待拍板**（security review P2，上批遗留）：`/p/` serve 加
  `'self'` + app shell 加 `'none'`。改 api 会 bun --watch 热重启杀活动 CLI 会话
  （含本会话），须用户确认时机。

### 进度

- ✅ `e5e4839` standalone gate 批：displayUrl + gate 双通道 + 删新窗口钮（i18n/icons
  回收）+ 删 header「添加根」+ FAB 双端扩展 + 探针重排
- ✅ probe-pages-anchor-row 重排 7/7（非 standalone 原生新页 / FAB 添加根 / standalone
  预览层+完整域名+关闭+Ctrl+click）；回归 probe-pages-default-root 5/5 /
  probe-pages-retry 3/3 / probe-inspector-row-menus ALL PASS
- ✅ 全门禁（format/lint 0 warning/typecheck/test 1065 pass）+ CSS 硬闸 + tokens
  机检 0 违例 + content-type text/css
- ✅ 双 reviewer 无 P0/P1；P2 全部消化（`bb4b2f6`）：project-tool-panels 过期注释
  同步、探针 WEB_ORIGIN 常量化 + 断言 2 popup race 兜底；P2-2（.plus inline 冗余）
  与 P2-3（关闭钮圆角微差，既存）按自评不动

## 下一步

1. **push 待确认**：`50f8e86..bb4b2f6` 6 commit（ee179cc 重试按钮 + 9dca05c 外链行 +
   043acf3 预览层 + b7a7f37 handoff + e5e4839 gate 批 + bb4b2f6 P2 消化）。
2. **真机验收（本批更新版，交用户）**：
   - iOS PWA 点 pages 行 → 预览层全屏在位，顶栏地址**含完整域名**；
   - 桌面/非 PWA 浏览器点行 → **原生新标签打开**（不再进预览层——新预期）；
   - 预览层顶栏**无**「新窗口」钮（已删）；关闭回工作台状态不丢；
   - 右栏 pages tab 有 FAB ＋ → 点开「添加根」dialog（桌面 + 移动双端；移动端首次
     有添加根入口）；
   - 旧版 header「添加根」不再出现（面板顶部直接列表）。
3. **probe-fab.mjs 过期断言**（5 FAIL，历史遗留）：重构跟进现 UI 形态或退役，待拍板。
4. **CSP frame-ancestors 待拍板**——用户方便重启 api 的窗口期做。
5. wiki 格式对齐批（排队）→ wiki Quartz（先 /check-deps）。

## 易丢的关键上下文

- 探针纪律沿用：右栏面板 DOM 常驻 hidden 切换须限定容器（`[data-desktop-inspector]`）；
  关闭钮 aria-label=「关闭」全 app 通用必须限定 `[data-pages-preview]` 作用域；
  中文断言须 locale:"zh-CN"；standalone mock = addInitScript defineProperty
  navigator.standalone（对后续导航生效）。
- **本会话 CLI 由 api spawn**——api 热重启会杀掉本会话，改 api 前必须用户确认。
- 探针跑法：`bun scripts/X.mjs`（repo 根，dev api 43011 / web 43012 在跑）。
- web=prod build + watch（tmux `ar-dev:web`）；改 vite.config 必须 respawn。
- bun test 2G / e2e 4G 用 systemd-run cgroup。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
