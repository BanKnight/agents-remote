# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-29 20:50（批 G 全部完成 + 三路 review 消化，ar-dev 已交付）

## 一句话状态

**批 G「codex composer 智能感应」完成：`/` skills slash 补全 + `@` 文件补全全链落地
（9 commit：`8a3a447` 批0+1 / `42885d4` 批2 / `71d9ace` 批3 / `5c9e908` flaky 根治 /
`08e2c4f` 批4 / `bf3ea0f` 批5 / `521c256` security L1 / `814f845` code P2+P3 /
`6dd9535` design P2+P3），三路 reviewer 报告全部消化，门禁全绿（api 1228 / web 1009 /
shared 11，e2e codex-session 6/6），ar-dev 已 respawn 交付。codex 接入（批 1/2/A–G）
开发任务全部完成，待真机验收。**

## 本 session 焦点

### 关键决策（不可丢）

- **触发补全走 assistant-ui 原生 TriggerPopover 体系**（0.15.27）：`TriggerPopoverRoot`
  下挂 `char="/"` + `char="@"` 双 popover；共享三件套抽到 `web/src/components/ui/composer-trigger.tsx`
  （plainTextFormatter / TriggerPopoverItemRow / useTriggerPopoverActiveRef，后补
  triggerPopoverPanelClasses 面板单源）；claude 路由 move-only 改 import。
- **@ 补全自写 hook 被库能力替代**：`unstable_useLiveCompletionAdapter` 内置防抖(180ms)/
  stale token/缓存，只保留 fetcher 桥（`fileSearch` waiter + 3s 超时兜底 + 空 query/超长
  截断边界）。
- **@ 与 / 插入语义分流**：slash Enter 直发 `/name`（IDE 式）；@ 任何触发方式只插入
  `@path` 不发送（文件引用是消息文本一部分，`atFileFormatter` + onExecute noop）。
- **file_search 通道**：上行 `{type:"file_search", query≤128, requestId≤128}` → per-socket
  `file_search_result` 应答（不进 relay 缓冲）；服务端 roots 固定 entry.projectPath。
- **api flaky 根治（计划外）**：额度通知单飞闸「在飞即丢」→ 快照记 `pendingNotificationLimits`
  latest-wins 单槽 + finally 收口补发；`--slow-account` 确定性复现 + A/B 验证。全量测试
  45s→22s，连续 3 次全绿。
- **批 5 home skills symlink**：托管 apiKey home 补 `skills` 存在才链（config.toml 同款
  ensureSymlink），user 级 skills 跨 home 可见。
- **review 消化三连**：security L1 requestId ≤128 上限（回声放大）；code P2 skills 空帧
  清空（全量快照 latest-wins，重拉删光不发帧则前端 stale；「无帧=能力缺失」保留给 catch
  路径）+ P3 fileSearch race 5s 短超时（不再白占 conn pending 60s）；design P2 空面板
  隐藏 `[&:not(:has([role='option']))]:hidden`（open 与 items 数量无关）+ P3 面板串收
  `triggerPopoverPanelClasses` 单源。

### 进度

- ✅ 批 0 探针（R1–R5 实证：RPC 直返型、`/name` 引用文本、skills/list 形态）
- ✅ 批 1 api 通道（shared 帧类型 + codex-runtime skills/fileSearch + codex-stream 分发）
- ✅ 批 2 共享抽取（composer-trigger 三件套，claude move-only）
- ✅ 批 3 skills slash 补全 + 批 4 @ 文件补全（adapter + waiter 桥 + e2e）
- ✅ 批 5 home symlink + 全门禁 + e2e 6/6
- ✅ 三路 reviewer：security（L1 修/L2 备查）、code（P2/P3 修、requestId 计数器备注不改）、
  design（P2/P3 修、对比度 2.9:1 与行触达 32px 留观见下）
- ✅ dev 交付：api/web respawn、health ok、CSS text/css、产物含新代码与空面板隐藏 utility

### 阻塞 / 风险

- 无阻塞。**留观（不计 fail）**：
  - design P3 继承项：弹层行 description 浅色主题对比度 ~2.9:1（inkSecondary on
    bg-elevated2）——用户拍板**保持现状**（token 层改动影响面广）。
  - ~~弹层行触达 ~32px~~ → **已治理**（`72cc019`：`touch:min-h-11` 触屏保底 44px，
    桌面零变化）；真机验收时确认触屏弹层行好点准。
  - code 备注：`atRequestIdRef` 计数器与 waiter Map 生命周期不同步（当前无触发路径，
    加固可提 hook 层或随机前缀）。
  - pre-commit 全门禁 test 阶段偶发 flaky（chat-idle-recycler / agent-tui 等真实 sleep
    时序敏感，单跑必绿；重试即过，非本批引入）。

## 下一步

1. **真机验收（批 D + E + F + G + 真机反馈修复一起交）**：见下方清单。
2. codex 接入开发任务全部完成（批 1/2/A–G）；后续按真机反馈修问题。

### 真机反馈修复（2026-10-30）

- **`0435ef6` 自动重试开关入口泛化到 codex**（用户实测「codex 缺乏自动重试」）：
  诊断 = api 侧批 D 已全泛化、banner 链已通，缺口是 4 个开关 UI 入口 claude-only 门
  （头部 rotate 按钮 / 桌面 ⋯ 菜单 / 移动 ⋯ 菜单 / ℹ 信息面）；已全部放宽到 codex
  chat 形态（terminal 排除保留，claude 行为零变化）。

## 真机验收清单（批 D + E + F + G）

**批 G（composer 智能感应）**：
1. codex 会话 composer 输 `/` → 弹 skills 目录（名称+描述），Enter 直发 `/name`；
   无 skills 时无弹层；skills 文件增删后 `skills/changed` 自动刷新；删光后弹层清空。
2. composer 输 `@` + 片段 → 弹项目内文件路径（fuzzy、file/directory 图标一致），Enter
   只插入 `@path`（尾随空格）不发送；无命中不弹空面板。
3. 托管 apiKey（settings 填 key）会话能看到用户级 skills（home skills symlink 生效）。

**批 F（历史列表）**：
4. 项目左栏「View session history」→ 真实 `~/.codex` 会话在列（首条用户消息做标题、
   时间分组、大小副标题）；其它项目会话不串；「全部」段带项目限定符。
5. 点历史行 → 命名框 → Create → 回放历史（外部 codex-tui 会话也能 resume）；活跃行
   点击直接聚焦；删除（二次确认）文件真删；活跃行删除被 409 拒。
6. 已知限制：项目改名后旧 codex 会话在新项目名下不可见（预期）。

**批 D + E（同前）**：
7. codex 托管 CODEX_HOME 凭据 chat/terminal 双形态同源；自动重试 provider 泛化。
8. 上下文占用浮层 → 「压缩上下文」→ 「Compacting」pill → 「Context compacted」块。
9. 运行中发消息并入当前轮（steer）；错误重连 pill；ChatGPT 登录显示额度段。
10. codex 切终端形态带 ar-hub MCP；claude 会话同浮层压缩走 `/compact`。

**真机反馈修复（0435ef6）**：
11. codex chat 会话三处可见自动重试开关（头部 rotate 按钮 / ⋯ 菜单「自动重试」✓ 行 /
    ℹ 信息面行）；打开后 turn 失败自动注入重试消息，面板上方出现待发倒计时条
    （取消 / 立即重试）；终端形态 codex 无开关（预期）。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
