# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-20（M1 组件化层完成并过 design-reviewer 复审，commit `ba8ddca`；下一步 M2 IA 骨架。触发：里程碑完成）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

UI v2 重构 M1（组件化层）已完成：v2 token 底座（:root dark 基准 + data-theme 双主题）+ v2-primitives.css 原语层 + 29 图标移植 + Geist 移除；四门禁全绿 + 探针 61/61 + e2e 29/29 + design-reviewer 复审通过（commit `ba8ddca`）。下一步 M2 IA 骨架（移动 4 Tab + 桌面 Sidebar + 深度模型 + L0 登录）。

## 本 session 焦点

M2：①移动 4 Tab（D21：项目/工作台/文件/插件）②桌面 Sidebar（ActivityBar→Sidebar 换代）③L0 登录页对齐 04 系列 ④深度模型 L1→L2→L3（中栏多 tab → push 导航）⑤工作台 3 行骨架 ⑥`/`=上次项目（D4 localStorage 记忆）。验收：路由切换零会话销毁 + 四门禁。

## 关键决策（本阶段不可丢）

- 全部 23 条决策见 `docs/design/redesign-v2.md` §2（D1–D23），里程碑状态见其 §6——**决策以总纲为准，本文件不重复**。
- M1 落地机制（写新代码前必读 `web/src/styles/index.css` 头注释）：新代码一律 v2 语义 utility（`bg-elevated`/`text-ink-1`/`border-sep`/`bg-tint-blue`…）；v1 桥接 utility（bg-surface 族/text-on-surface 族/border-neutral-line）随 M2/M3 页面重写消亡，勿再用。
- 图标入口 `web/src/components/shell/icons/`：20 中心坐标系 viewBox="-10 -10 20 20" + stroke-width 2 + currentColor；新增图标照此规格 + svgMap 注册；anthropic/openai 是品牌 fill logo 例外。
- 主题双轨：`data-theme` 承载 v2 语义 token + `.dark` class 承载 shadcn `dark:` variant，theme.ts 同步落两轨；偏离记档在 redesign-v2.md 附录「主题切换机制」。
- v2-primitives.css 原语类（.nav/.row2/.pills/.pill/.card/.tray/.btn/.tabbar/.side/.pane…）可直接在页面用；`.grow` 已改名 `.growrow`（避让 Tailwind utility）。
- 待定项：Wiki 注入协议（M4 前）、iPad/Mac 细节（M9 前与用户确认）。

## 进度（已完成 / 进行中 / 待办）

- ✅ 沉淀批次 + M0 设计基座（commit `b669b57`/`742ed83`/`3bd16cb`/`f386325`）：总纲 D1-D23、token 映射表（附录）、机检脚本（report 模式）、e2e 基线 29/29
- ✅ M1 组件化层（commit `ba8ddca`，42 文件 +1778/-476）：①index.css 重写 = v2 token 底座（:root dark 基准 + data-theme="light" 覆盖 + shadcn 单份映射 + v1 桥接 ~250 处零改动换新外观）②v2-primitives.css 原语 1:1 移植（@layer components；.grow→.growrow）③29 图标重绘（20 中心系 + data-symbol 锚点）④双主题双轨 + FOUC + Geist 移除 + manifest dark 基准。验证：探针 61/61、机检 HEX 11<基线 15、e2e 29/29、**design-reviewer 复审通过**（首轮 2 高 2 中 4 低全修复：openai 悬挂引用恢复、.growrow 改名、manifest 旧色、主题机制偏离记档 3 条、对比度已知限制、tokens.json 措辞、--on-accent 去重、字号行高）
- ⬜ M2 IA 骨架 → M10（总纲 §6 状态列滚动更新）

## 阻塞 / 风险

- 无阻塞。观察项：ar-dev api 曾被外部 SIGTERM 终止一次（18:32，来源不明；respawn 恢复后正常，e2e 清理逻辑已排查非肇事者）——若复现查 `journalctl --user` 与同机其他项目。
- M2 风险：IA 骨架是路由层大改（mobile-primary-nav/activity-bar/workbench-model），「路由切换零会话销毁」验收要靠 pathless layout 保活机制，动 IA 前先读 frontend-notes §3（结构关系是 state）与总纲 §5 现状锚点。

## 易丢的关键上下文

- **v1 机制文档结论仍有效**（message-replay/agent-session-model 等在 design-v1），引用时注意区分「视觉已废、机制有效」。
- 用户 Q17 约定：**所有里程碑完成后跑新 e2e 才交用户验证**；期间每里程碑 reviewer + 四门禁，不要中途找用户验收单点。
- 旧 e2e 断言会随重构大面积失效——基线已在 M0 记录（29/29），新 e2e 在 M10 写，中途不修旧 e2e（以基线记录为准判断回归）。
- 机检脚本 M1 后收紧 `--strict` 的前置：white/black 色阶 + 行尾注释内 HEX（当前 report 模式 11 处，全部已知：theme.ts 2 + SessionDetailRoute 9）。
- commit 用标准 `git add && git commit`；md 不进 format 门禁（别跑 prettier）。
- e2e 内存限制用 cgroup（`systemd-run --scope --user -p MemoryMax=2G bun run e2e`），ulimit -v 会 rolldown WASM OOM（dev-environment.md）。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
