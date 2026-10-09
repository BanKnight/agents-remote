# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-09（**批 17 键盘 inset 单源完成并 push（至 `1280c69`）：编辑态避让 + aux 条键盘联动 + Android meta + 文档沉淀——等用户真机复验**）

## 一句话状态

批 16 全链路（含真机再反馈修复 `6007d15`）+ **批 17 键盘 inset 单源**（`215d390` 实现 + `1280c69` 记档）全部 push——批 17 解决用户两个问题：①文件编辑态 `.aux` 条被键盘挡（visualViewport 观察器单源 → `--kb-offset` padding 缩链）②辅助条随键盘切换样式（`--kb-active` 系数，env chin 避让随键盘在场归零）+ Android `interactive-widget=resizes-content`。双 reviewer 无 P0/P1、P2×3 全消化、e2e 27/27、探针 10/10。**等用户真机复验批 17 清单**。

## 本 session 焦点（批 16 收尾 + 批 17 键盘 inset）

### 关键决策（本阶段不可丢）

- **①aux 三钮**：两端共用同一段代码（mobile-l3.tsx），差异根因 = 平台字体渲染（iOS 对 U+21A9/U+21AA 字形不同）→ Lucide 单轨化（§15）：白名单 +undo-2/redo-2，`<LucideIcon>` 直消费 lucide 名（不经 SF 映射），`size-3.5` 显式尺寸。
- **②面板钮**：panel-left → panel-right（面板右滑入 InspectionPanel translate-x-full + 桌面右 aside）；panel-left 白名单保留 = probe 负向对照。
- **③mermaid**：自动渲染（GitHub 风格），不进 RENDERABLE_LANGUAGES；mermaid@12.0.0 pin（12.1.0 <7 天降级）；dynamic import 拆 chunk；securityLevel strict（secure 列表不可被 %%{init}%% 降级）+ suppressErrorRendering；theme 随 data-theme；**400ms 尾沿防抖**（流式 delta 不逐帧 parse）+ 旧图滞留新结果就绪（不闪回 pre）+「未完成 ≠ 失败」；模块级 mermaidRenderSeq 图 id 唯一；失败降级 = i18n 错误行（{{message}} 插值）+ 源码 pre 保留。
- **PWA precache 瘦身**（code-reviewer P1）：vite workbox globIgnores 26 模式，mermaid 全树 ~3MB 出 precache 运行时拉取；esm-*.js（shiki）与 d3 系保留。**改 vite.config 必须 respawn dev web**（已做，precache 36 条目零 mermaid 实证）。
- **双 reviewer 消化**：P1×2 全修 + P2 修 5（text-xs 错误档/i18n 插值/容器 padding 对齐/suppressErrorRendering/cursor-pointer 删 3 处——.aux button base 已有）；记档不动 2（panel-right 与分屏钮同形制异动作，两端今日不共屏；frontmatter 探针固定 sleep pragmatic）。
- **e2e 环境故障判定（重要）**：批 16 树 e2e 挂 2-5 个且失败集合漂移 → **stash 全部批 16 改动跑基线（78db575 干净树）同挂**（挂点漂到更早）→ 非批 16 回归。根因：PVE 宿主上另一 VM（vm-302-disk-0.raw）经 loop2 设备狂读 468MB/s → 本机（宿主角色）内核态 CPU 75%、3 核 load 25-30 → 时序敏感 WS mock 流测试（acp-session/file-browser）全线漂移。VM 302 不在我管辖，不可动。
- **gitStatus 快照误导**：会话开头快照显示 HEAD=938618a（sheet commit）+ sheet 手感未提交改动——reflog 实证该 commit 从不存在于本 repo，工作区也无 sheet 改动。以 git log/reflog 实际状态为准（HEAD=78db575 批 15 记档，与 summary 吻合）。
- **批 17 键盘 inset（2026-10-09）**：iOS 键盘 overlay 只缩 visual viewport 不动 layout（WebKit 141832 intentional），CSS/meta 全线失效（`interactive-widget`/VirtualKeyboard iOS 未实现）→ visualViewport JS 唯一路径。监听单源 `keyboard-inset.ts`（resize+scroll 双监听 + rAF 同帧 + visible gate 强制归零 + coarse guard + dispose cancel rAF）；`--kb-offset` 消费二形态：全高面板 padding 缩链（编辑态）、浮动卡片 translateY（composer 既有）；`.aux` 联动 = `env × (1 − var(--kb-active,0))` 键盘在场 chin 归零（**勿作显隐消费**——iOS 26 瞬态误判教训）；Android = meta `interactive-widget=resizes-content` 治本（JS 路径自然休眠不打架）。历史教训：focus 目标自身 padding 骤减致 iOS ~50% 取消键盘触发（aux 非 focus 目标风险低，真机清单保留排查）。
- **批 17 验证边界**：Chromium 对键盘 vv 行为结构性失明——探针（probe-keyboard-inset 10/10）只证接线（defineProperty mock + dispatchEvent），真实键盘行为必须真机。记档不动 4 项（aux 34px 瞬态跳变观感 / Android sheet 手势基准 / Android env 残留 / pinch-zoom 假阳性）全在真机清单。

### 进度（已完成 / 待办）

- ✅ 三项修复实现（CodeBlock mermaid / mobile-l3 aux / mobile-project-header）+ build-icons 白名单 + i18n 两语言 + vite globIgnores。
- ✅ 探针：probe-v16-batch16 9/9 新建 + probe-markdown-frontmatter 7/7（顺修 login 文案/openFile v1.5 欠账）+ mobile-project-header 42/42。
- ✅ 门禁：format/lint 0/typecheck 三包/单测 749/CSS 硬闸（194287 全量 rebuild）/tokens strict 0/两 commit pre-commit 全绿（api 单测一次负载 flaky 重跑 905/0 复绿）。
- ✅ dev web respawn（vite.config 生效）：sw.js precache 36 条目零 mermaid/chunk-*；curl content-type text/css ✓。
- ✅ 记档：redesign-v2.md §6.14 批 16 段 + 复审二轮段 + 真机再反馈段 + gtd next-actions。
- ✅ e2e 补跑 27/27 全绿（IO 风暴结束后复证，定时任务已撤）。
- ✅ push 全部（origin/main = 6007d15）。
- ✅ 批 15+16 真机复验清单已交（19 条）；用户复验反馈「基本都没问题」，仅清单第 16 条再优化两项 → 已修（6007d15）。
- ✅ 批 17 键盘 inset 全流程（实现 + 双 reviewer + P2 消化 + e2e 27/27 + 探针 10/10 + 文档沉淀四件）→ `215d390` + `1280c69` 已 push。
- ⬜ **用户真机复验批 17 清单**（见交付说明）：编辑态聚焦不被挡 / aux 贴键盘紧凑 / 收起恢复 / composer 回归 / 键盘偶发不弹排查 / Android 行为。

## 易丢的关键上下文

- stash round-trip 已做两轮（CodeBlock 单独 / 全部批 16），工作区已恢复完整，`git status` 核对过。
- 单跑单个 spec 的正确姿势：`bun run scripts/run-e2e.ts acp-session.spec.ts`（run-e2e.ts 自起 api/web 随机端口 + 透传 E2E_BASE_URL）；直接 `bunx playwright test` 会打默认 4173 必连接拒绝。
- 探针技巧：mermaid svg `id="mmd-N"` 精确定位；svg innerHTML 对比要过 DOMParser 规范化；右栏折叠态 aside 不渲染要显式 setItem workbenchRightCollapsed=false；中栏 file tab 叠层保活断言用 `:visible`。
- login 文案 = 「登录/Sign in」（regex `/登录|Sign in/`），非「解锁/Unlock」。
- VM 302 IO 风暴若持续，e2e 可先 skip 等——探针与门禁已全绿，真机验证链路（prod preview 43012）不受影响。

## 统一真机复验清单（批 13 8 条 + 批 14 1 条 + 批 15 6 条 + 批 16 4 条）

1. **右栏文件树 mtime**：文件行右侧相对时间在场
2. **右栏 FAB**：右下角 ＋ FAB 新建/上传；地址栏行尾无「＋」钮（移动端同构）
3. **全局文件页地址栏**：与搜索框/卡片左右对齐
4. **检视面板 file tab**：渲染⇄源码 toggle 垂直居中；源码态 = CodeMirror
5. **md 内链**：渲染态点相对 .md 链接 → 新 tab 打开目标
6. **分屏**：分屏按钮 = 当前激活 tab 副本双窗格；无 console 报错
7. **插件作用域分段**：桌面标题行内右端固定宽 290、caret = Lucide；移动满宽正常
8. **检视面板底部文字链退役**：新建/上传统一 FAB；行菜单「上传文件…/上传到此」仍可用
9. **【批 14】菜单统一样式**：各菜单条目间分割线 = 全宽直线（无转角）+ 全行带图标；实例切换菜单与 composer 选择器菜单头下无线；移动 sheet 取消项有分组间距
10. **【批 15】实例 ⋯ 菜单两端一致**：桌面 tabstrip ⋯ / 移动 pill 长按（重命名/置顶/关闭）
11. **【批 15】检视面板 tab CRUD 两端一致**：＋ 新建 / ✕ 关 file·wikiread 标签 / 切换
12. **【批 15】四处文件页新建/上传 + 重名校验生效**：输入既有名 → 红字 + 创建禁用
13. **【批 15】历史行两端标题一致**（含无标题 nativeId 条目）+ 恢复命名预填 + 删除确认文案
14. **【批 15】桌面 wikiread tab ⋯ 新入口**：复制内容 / 查看 diff
15. **【批 15】批 C 视觉零变化**（唯一已知例外：实例切换菜单图标 15→17px）
16. **【批 16①】文件编辑态底部工具条**：撤销/重做（/收起键盘）图标两端形态一致（SVG 非字符字形）
17. **【批 16②】移动端工作台行1 检视面板钮**：面板图标竖线偏右（右侧形制）
18. **【批 16③】md 内 ```mermaid 块**：自动出图；深浅主题切换图随色；语法错误块显示错误行且源码可见
19. **【批 16③】各 md 面生效**：聊天流 / tool_result / Files 预览 / wiki（管线单点，抽查两三面即可）

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-09 13:00；触发原因：批 17 全流程完成并 push（1280c69），等用户真机复验
