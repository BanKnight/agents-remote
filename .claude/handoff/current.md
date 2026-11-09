# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-10 00:20（**预览层批** `043acf3`；
> push 待确认——`50f8e86..043acf3` 共 3 commit）

## 一句话状态

iOS standalone PWA「点 pages 行工作台被顶掉」三轮报障终案：**同源链接在 standalone
PWA 里开不了新窗口是平台硬限制**（target=_blank / window.open 一律降级成当前视图导航），
`9dca05c` 的真链接方案被真机否证后，用户拍板改 **app 内预览层**（iframe + 关闭钮，
还原「内置浏览器可单独关掉」体验），`043acf3` 交付（探针 7/7 + 全门禁 + 双 reviewer
无 P0，结论全部消化）。本地 3 commit 未 push。

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **iOS standalone PWA 同源新窗口 = 平台硬限制**：跨源才有系统级模态视图（用户记忆的
  「内置浏览器可关闭」形态）；同源无论 `<a target=_blank>` 还是 window.open 都当前
  视图导航。前端写法绕不过 → 预览层是唯一出路。
- **PagesPreviewLayer 结构**（`web/src/components/pages/pages-preview-layer.tsx`）：
  全屏 Dialog 三件套（gen-ui 骨架：inset-0/translate-0/max-w-none）+ PagesRootDialog
  同款 close 延迟卸载桥（**追加** clearTimeout 先行，原版没有）+ `data-pages-preview`
  探针锚点。**不设 z-[100]**（AuthGate token 过期须靠 portal DOM 序压上）。
  **onCloseAutoFocus preventDefault**（§33 动机平台蓝环预判——桌面 Dialog 政策在
  iOS touch 主用层让位，桌面键盘焦点落 body 是已知取舍）。
- **行 onClick 双通道契约**（pages-panel）：修饰键守卫（metaKey/ctrlKey/shiftKey/altKey
  放行原生新标签）+ preventDefault + setPreviewing(serveUrl)。中键走 auxclick 天然不
  触发。存 URL 串不存 PagesRoot 对象（防编辑后脏引用）。
- **iframe 不加 sandbox（诚实威胁模型，security review 定稿）**：allow-same-origin
  等于无隔离；opaque origin 丢 cookie → token 根 401。信任边界 = 项目目录内容可能被
  Agent 工作流污染，同源 iframe 可骑 HttpOnly cookie 调 /api 全量 + parent DOM 可达
  ——与顶层新开 /p/ 同为既有基线，单用户控制平面下接受。注释已记档。
- **standalone 检测走 `isStandaloneDisplay()` 单源**（lib/display-mode.ts）；standalone
  下顶栏「新窗口」钮不渲染（点了即当前视图导航陷阱）。
- **待拍板（security review P2，未做）**：`/p/` serve 响应加 `CSP: frame-ancestors
  'self'`（防外站嵌入滥用；预览层同源不受影响）+ 工作台 app shell 加 `frame-ancestors
  'none'`（clickjacking 面，价值更高）。**改 api 会 bun --watch 热重启 → 杀 4 个活动
  CLI 会话（含本会话 + 用户 3 个项目 agent）**，须用户确认时机后做。

### 进度

- ✅ `043acf3` 预览层批：PagesPreviewLayer + pages-panel 接线 + icons/i18n + 探针改造
- ✅ probe-pages-anchor-row 7/7（预览层在位/新窗口 popup/关闭回工作台/Ctrl+click/
  编辑不导航/standalone 分支）；回归 probe-pages-default-root 5/5 / probe-pages-retry
  3/3 / probe-inspector-row-menus ALL PASS
- ✅ 全门禁（format/lint 0 warning/typecheck/test 1065 pass）+ CSS 硬闸 + tokens 机检
  + content-type text/css；产物特征串（data-pages-preview）已进 WorkbenchRoute chunk
- ✅ code-reviewer + security-reviewer 无 P0；已修：探针 2d waitForLoadState（P1）、
  2e standalone 断言、威胁模型注释、close 桥注释、bg-white 意图注释、onCloseAutoFocus、
  删 _diag-window-open-behavior.mjs（不入库）

## 下一步

1. **push 待确认**：`50f8e86..043acf3` 3 commit（ee179cc 重试按钮 + 9dca05c 外链行 +
   043acf3 预览层）。
2. **真机验收（更新版，交用户）**：
   - iOS PWA 点 pages 行 → 预览层全屏在位（站点显示）、顶栏**无**「新窗口」钮、
     关闭回工作台状态不丢；
   - 桌面点行 → 预览层、顶栏钮开新标签、Cmd/Ctrl+click 原生新标签、中键同；
   - 预览层关闭后行无浏览器蓝环（§33 预判拦截，真机复核）；
   - token 根预览层正常显示。
3. **CSP frame-ancestors 待拍板**（见关键决策末条）——用户方便重启 api 的窗口期做。
4. wiki 格式对齐批（排队）→ wiki Quartz（先 /check-deps）。
5. 移动端「添加根」无入口（缺口记档，待用户拍板）。

## 易丢的关键上下文

- 预览层行为链 golden path：行根 `<a href>`（保留）+ onClick（守卫→preventDefault→
  setPreviewing）；层 = Dialog 受控 + close 桥 300ms；探锚 `data-pages-preview`。
- 探针纪律沿用：右栏面板 DOM 常驻 hidden 切换须限定容器；关闭钮 aria-label=「关闭」
  全 app 通用必须限定 `[data-pages-preview]` 作用域；中文断言须 locale:"zh-CN"。
- **本会话 CLI（37627）由 api spawn**——api 热重启会杀掉本会话，改 api 前必须用户确认。
- 探针跑法：`bun scripts/X.mjs`（repo 根，dev api 43011 / web 43012 在跑）。
- web=prod build + watch（tmux `ar-dev:web`）；改 vite.config 必须 respawn。
- bun test 2G / e2e 4G 用 systemd-run cgroup。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
