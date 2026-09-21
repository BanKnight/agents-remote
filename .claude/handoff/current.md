# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-21（M7 设置与登录完成并整体 commit；下一步 M8 缺口功能。触发：里程碑完成）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

UI v2 重构 M7（设置与登录）已完成：07 设置五组重构（通用/RUNTIME 四行/自动重试默认真实值/服务器/退出登录）+ 后端新增 `POST /api/auth/logout` + i18n 语言三态（`LanguagePref`）+ 登录页两缺口（密码描红 + 断网重试）+ SettingsRoute 原型 `.nav`。三份 reviewer 全过（security 通过 1 P2 已修；code 通过 2 P2+3 P3 已修；design 修复后通过 2 P1+5 P2+3 P3）；探针 68/68、四门禁全绿（api 798 + web 670 + shared 9）、CSS 硬闸、token 机检零新增、e2e 29/29。M6 在 `fb49dde`。下一步 **M8 缺口功能**。

## 本 session 焦点

M7 收口：实施（前序）→ 探针校正（mock 状态机 / `.ar` chevron / 断网态）→ 三份 reviewer → 逐条修复（design 两项 P1 真根因：卡片同色隐形 + 断网态偏离 spec）→ §6.8b 收口补记 → commit。下一步 M8：缺口功能（文件搜索/移动到/上传冲突/拖拽/采用项目自动/全局文件写边界/子 agent 概览条）。

## 关键决策（本阶段不可丢）

- 全部决策见 `docs/design/redesign-v2.md` §2（D1–D23）+ **§6.8 M7 开工摊牌**（9 条）+ **§6.8b M7 收口补记**（落地清单 + 9 条 reviewer 修复 + 验证证据）。
- **ACP 行裁决（M7 design P2-7）**：07 原型 RUNTIME 只画 3 行，但 ACP 是真实 runtime → **补第 4 行**「ACP Agent」（值 = 已配置 provider 数，有据 `hasApiKey` 计数）。
- **断网态语义（spec §3.1）**：断网 = **保留登录帧**、主按钮换「重试连接」+ refetch——**不是**独立错误帧（密码框不能消失）。
- **`.sgroup` 卡片可见性依赖底档**：页面/滚动容器底必须 `--bg-base`（`bg-surface-base`），卡片才是 `--bg-elevated`——两者同色则卡片隐形只剩描边（design P1-1 真根因）。
- **退出登录纪律**：`handleLogout` 无鉴权幂等清 cookie，CSRF 防线 = `SameSite=Strict`（注释防退化）；前端 `useLogout` = onSuccess 仅 clearAuthOk + onSettled invalidate（失败也对齐服务端真实态 + 行内错误提示）。
- **语言三态**：`LanguagePref = "system"|"zh"|"en"`；无存储 = system（存量 zh/en 为显式选择，无缝迁移）；`setLang("system")` 删 localStorage key；`LANG_STORAGE_KEY` 单一来源（translate.ts 导出）。
- **共享工具单一实现**：`isStandaloneDisplay()` → `web/src/lib/display-mode.ts`（AuthGate + settings-dialog 共用）；`auth_ok` 读写 → `web/src/lib/auth-storage.ts`。
- **CSS 同名类消歧**：07 行用 **`.setrow`**（避让 M5 `.srow`、M4 `.crow`）；`.sgroup`/`.logout` 全新；组标题复用 M4 `.sect`。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0（`3bd16cb`）→ M1（`ba8ddca`）→ M2（`2a4d9e1`）→ M3（`944aa03`）→ M4（`1891a43`）→ M5（`1814270`）→ M6（`fb49dde`）→ **M7（本次 commit）**
- ⬜ **M8 缺口功能** → M9 多端 → M10 总验收（总纲 §6 滚动）
- **M8 缺口清单（已累积 + M7 新增）**：merged 分支置灰、✦ 提交来源标注、文件搜索、`.count` 取消端点、wiki 引用服务端元数据化、03n 数据管道与桌面 agent-history 同源、MobileSheet 缺 Description、`.d2` 命名双义、`76dvh` 绕开 `--app-viewport-height`、SKILL.md beacon 面、env 内存既有面、project scope MCP 详情入口、M6 死码 CSS 按需重落（14 块）、**M7 新增**：`.setrow`/`.logout` 无 `focus-visible`（桌面键盘面）、`.ar` 12px/ink-3 对比度偏低（原型即此值）、`w-[52px]` 原型示意占位值真机值 → 后两项归 M9。

## 阻塞 / 风险

- 无阻塞。
- **子 agent 大面积 API EOF 故障（本 session 高危）**：code/design-reviewer 连续 5-6 次 `unexpected EOF` 中断（每次都在「读文件」阶段）。对策：缩窄 prompt（列必读文件 + 限定问题）、改用 `subagent_type: "fork"`（继承上下文，免冷启动读文件）→ fork 一次成功。**下次遇到 reviewer 反复 EOF，直接上 fork。**
- **大段生成垃圾行注入仍是高危**：遵循 `verification.md`「大段代码替换写入纪律」（≥15 行用 python 锚点整段替换 + 读回机检）；Edit 小步替换安全。

## 易丢的关键上下文

- **M7 关键文件**：`web/src/components/shell/settings-dialog.tsx`（SettingsRootView 五组 + GeneralSection 语言三态 + useLogout + row() helper）/ `web/src/i18n/{context,translate,types}.ts`（三态偏好）/ `web/src/routes/AuthGate.tsx`（描红 + offline 保留登录帧）/ `web/src/routes/SettingsRoute.tsx`（原型 `.nav`）/ `web/src/lib/{auth-storage,display-mode}.ts` / `api/src/http-auth.ts`（handleLogout）/ 探针 `probe-v2-m7-settings-auth.mjs`（68 断言 4 Part）。
- **M7 段 CSS 在 v2-primitives.css `@layer components`（搜 `.sgroup`，约 2346 行起）**：`.sgroup`/`.setrow`/`.setrow .v(.ok/.mono)/.ar`/`.logout`。
- **探针调试经验**：mock `auth/me` 必须状态化（`authed` 变量：login 置 true / logout 置 false），恒 `authenticated:true` 会让登录帧永不出现；值行断言需 `stripAr`（chevron 在 `.v` 内）；`.ar` 的 `.closest(".overflow-y-auto")` 取滚动容器底做对比度断言。
- **M6 遗产**：pluginView 路由维度、`.back` 设计语言（`backLabel` prop）、确认容器分工（删除/关闭 = useConfirm Alert）、env 脱敏纪律。
- e2e 纪律：cgroup 2G（`systemd-run --scope --user -p MemoryMax=2G bun run e2e`）；探针用 bun 跑；**e2e 输出别接 tail**。
- md 不进 format 门禁；改 web 包后必跑 `node scripts/ar-verify-css.mjs`；token 机检基线 11 处 HEX（存量）。
- **dev 服务**：api dev 带 `--watch` 但偶发不加载新路由（本 session logout 端点须 `tmux respawn-pane -k -t ar-dev:api` 重启才生效）。
- 用户 Q17 约定：所有里程碑完成后跑新 e2e 才交用户验证；期间每里程碑 reviewer + 四门禁。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
