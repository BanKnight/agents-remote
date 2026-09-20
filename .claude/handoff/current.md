# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-20（M0 设计基座完成 + code-reviewer 通过 + 4 项加固；下一步 M1 组件化层。触发：里程碑完成）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

UI v2 重构 M0（设计基座）已完成并过 review：token 映射表落总纲附录、散落 token 机检脚本（report 模式，基线 HEX 15/色阶 0）、e2e 基线 29/29 绿；下一步 M1 组件化层（token 换底 + 原语重建 + 图标移植 + 双主题机制）。

## 本 session 焦点

M1：①`tokens.css` 语义变量做新 `@theme inline` 基座（shadcn vars 对齐，:root=dark 基准 + `data-theme="light"` 覆盖）②components.css 原语重建（pill/chip/sheet/seg4/side/pane/tabbar…）③30+ 图标按内嵌 SVG path 移植 ④`data-theme` 双主题机制 ⑤移除 Geist。验收：双主题全成立 + 四门禁 + design-reviewer 过。

## 关键决策（本阶段不可丢）

- 全部 23 条决策见 `docs/design/redesign-v2.md` §2（D1–D23），里程碑状态见其 §6——**决策以总纲为准，本文件不重复**。
- 我按最佳实践拍板的关键三条：Instance 不引入新实体层（session 升格 closed+复用 id）；功能视图切换 = 同 layout 子路由 + 主区替换；审批中心服务端聚合。
- 待定项：Wiki 注入协议（M4 前）、iPad/Mac 细节（M9 前与用户确认）、Git ✦ 暂不做。
- 舞台尺寸折算：按真机惯例（Tab Bar 49pt+safe-area），非设计示意 100px。

## 进度（已完成 / 进行中 / 待办）

- ✅ 沉淀批次（commit `b669b57`+`742ed83`）：目录迁移（design→design-v1 归档、v1.3 设计包→docs/design）、旧路径引用改指 design-v1、redesign-v2.md 总纲（D1-D23 决策日志+里程碑）、docs/design/index.md、harness 标尺切设计包三件套、GTD 项目卡
- ✅ M0 设计基座（commit `3bd16cb`+`f386325`）：①token 映射表（总纲附录，M1 施工图）②`scripts/ar-verify-tokens.mjs`（report 基线 HEX 15/色阶 0；code-reviewer 通过 + 4 项加固：side 变体/白名单 sep/symlink 防护/cwd 锚定）③e2e 基线 29/29 绿
- ⬜ M1 → M10（总纲 §6 状态列滚动更新）

## 阻塞 / 风险

- 无阻塞。风险：M1 token 换底涉及全量 utility 重映射（~250 处旧 token 写法），映射表质量决定返工量——M0 先出表。

## 易丢的关键上下文

- **v1 机制文档结论仍有效**（message-replay/agent-session-model 等在 design-v1），引用时注意区分「视觉已废、机制有效」。
- 用户 Q17 约定：**所有里程碑完成后跑新 e2e 才交用户验证**；期间每里程碑 reviewer + 四门禁，不要中途找用户验收单点。
- 旧 e2e 断言会随重构大面积失效——基线先在 M0 记录，新 e2e 在 M10 写，中途不修旧 e2e（以基线记录为准判断回归）。
- commit 用标准 `git add && git commit`；md 不进 format 门禁（别跑 prettier）。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
