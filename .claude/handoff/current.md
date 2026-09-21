# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-21（M6 插件与市场完成并整体 commit；下一步 M7 设置与登录。触发：里程碑完成）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

UI v2 重构 M6（插件与市场）已完成：M6-a（09 主页/18 市场/15 源管理 + pluginView 路由维度）+ M6-b（12 技能详情/13 MCP 详情/14 添加 sheet/16 审计 sheet + `/plugins/mcp/$` 路由接线）+ 三份 reviewer 修复（security 通过 2 P3 记录；code 1 P2+5 P3 全修；design 3 P2+6 P3 全修——含确认容器改 useConfirm Alert、`.back` 设计语言、~227 行 CSS 死码删除、桥接 utility 清扫）；探针 59/59、四门禁全绿（web 670）、CSS 硬闸、token 机检零新增、e2e 29/29。M5 在 `1814270`。下一步 **M7 设置与登录**。

## 本 session 焦点

M6 收口：design-reviewer 报告修复 → §6.7 补记 → 整体 commit（已完成）。下一步 M7：设置页（通用/Runtime/自动重试/服务器/退出，入项目 Tab ⚙）+ 登录页完整态，对照原型 19/20/21。

## 关键决策（本阶段不可丢）

- 全部决策见 `docs/design/redesign-v2.md` §2（D1–D23）+ **§6.6 M6 能力边界裁定**（13 只画配置段/14 完整实现/16 只画有据字段/17 不实现/18 完整实现/15 不画 toggle 等）+ **§6.7 M6 收口补记**（落地清单 + 16 条记档 + 三份 reviewer 逐条修复）。
- **§3.5 作用域规则**：「本项目」= `workbenchLastProjectAtom`（与工作台标题 ▾ 同一份记忆）；段上 ▾ 打开 03l 切换器（点会话行降级只切项目）；从未选项目时空态引导。
- **pluginView 路由维度**：`WorkbenchRouteContext.pluginView: "home"|"market"|"sources"`；`/plugins/market`、`/plugins/sources` 派生非 home 值；无 focusId 不进保活 tab 体系；桌面 M9 前忽略。`pluginmcp_` focusId 前缀对标 `skill_`（桌面 update effect 提前 return 防误开 tab）。
- **确认容器分工（design-reviewer P2-3 定稿）**：删除/关闭类确认 = `useConfirm()` Alert（`shell/confirm-dialog.tsx`，移动形态 iOS action sheet 红字 destructive）；sheet = 表单/内容承载。`.kbtns .p.solid.danger` CSS 保留备用。
- **`.back` 设计语言**：原型 `.nav .back` = 主色 15px + ::before chevron + **可见 backLabel 文字**（非裸图标钮）；PluginNav 收 `backLabel` prop（12=「已安装技能」、13/15/18=「插件」）。
- **CSS 同名类消歧**：`.psect`（09 13px）/`.dsect`（12/13 12px）/`.mchips`/`.skrow`/`.stabseg`/`.kbtns .p.solid`；M6 段 CSS 全在 `@layer components` 内。
- **env 脱敏纪律**：13 详情只渲染 `Object.keys(entry.env)` + 静态 `••••••（脱敏）`，真值不进 DOM（探针硬断言 body.textContent）。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0（`3bd16cb`）→ M1（`ba8ddca`）→ M2（`2a4d9e1`）→ M3（`944aa03`）→ M4（`1891a43`）→ M5（`1814270`）→ **M6（本次 commit）**
- ⬜ **M7 设置与登录** → M8 缺口功能 → M9 多端 → M10 总验收（总纲 §6 滚动）
- **M8 缺口清单（已累积）**：merged 分支置灰、✦ 提交来源标注、文件搜索、`.count` 取消端点、wiki 引用服务端元数据化、03n 数据管道与桌面 agent-history 同源、MobileSheet 缺 Description、`.d2` 命名双义、`76dvh` 绕开 `--app-viewport-height`、SKILL.md beacon 面（security P3）、env 内存既有面（security P3）、project scope MCP 详情入口、M6 删的死码 CSS 按需重落（`.upcard`/`.stcard`/`.toggle` 等 14 块）。

## 阻塞 / 风险

- 无阻塞。
- **大段生成垃圾行注入仍是高危**：遵循 `verification.md`「大段代码替换写入纪律」（≥15 行用 python 锚点整段替换 + 读回机检）；Edit 小步替换安全。本 session 一次 heredoc 半/全角括号不匹配（assert 拦截未写盘）——教训：锚点避免含全角括号，用无括号子串。
- e2e 单次 flake 观察：M6 收口第一次 e2e 失败（输出被 tail 截断未见 spec），原样重跑 29/29 全绿且 e2e 断言与改动零交集——判 flake；下次遇到先保留完整输出再判。

## 易丢的关键上下文

- **M6 关键文件**：`web/src/components/workbench/mobile-plugins-home.tsx`（09）/ `mobile-plugins-market.tsx`（18/15 + PluginNav + InstallAuditSheet）/ `mobile-plugins-detail.tsx`（12/13/14 + mcpTypeLabel 单一实现）/ 路由 `router.tsx`（pluginsMcpFocusRoute）+ `workbench-model.ts`（parsePluginMcpTabId）/ 探针 `probe-v2-m6-plugins.mjs`（59 断言 6 Part）。
- **M6 段 CSS 在 v2-primitives.css `@layer components`（第 1459 行起 M5 段内追加）**；P3-5 死码删除后 `@layer components` 仍 2 块。
- **M5 遗产**：审批中心协议（§6.4）、MobileSheet 容器（headerExtra slot）、`bg-scrim` token、mock 同构原则。
- e2e 纪律：cgroup 2G（`systemd-run --scope --user -p MemoryMax=2G bun run e2e`）；探针用 bun 跑；**e2e 输出别接 tail（丢失败 spec 细节）**。
- md 不进 format 门禁；改 web 包后必跑 `node scripts/ar-verify-css.mjs`；token 机检基线 11 处 HEX（存量）。
- 用户 Q17 约定：所有里程碑完成后跑新 e2e 才交用户验证；期间每里程碑 reviewer + 四门禁。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
