# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-26 17:00（**settle 搜索可达批交付**：移动首页已了结
> 会话搜索命中 + 弱标，探针 23/23 + 全门禁绿；另按用户确认收口批 18 键盘
> 取证与批 17/18 真机复验。未 commit，见「本 session 焦点」。）

## 一句话状态

settle 搜索可达（v1 挂账收口）已实现并验证全绿，**待 commit + push**；
批 18 键盘遮挡按用户长期使用未复现判为已修复收口；无阻塞待办。

## 本 session 焦点（settle 搜索可达批 + GTD 收口）

- **settle 搜索可达**（session-attention.md §3.3 v1 挂账收口）：
  - 改动面唯一：`mobile-projects-home.tsx` 活动列表——无 query 已了结照旧
    出列；有 query 时已了结命中并入结果（排活跃之后）+ 弱标（`text-ink-3`
    降饱和 + 无状态点 + 行尾「N 天前了结」，与桌面已了结折叠组同源形态）。
  - 边界：已了结行只按会话自身名称/副行匹配，**项目名命中不纳入**（防搜
    项目名涌入整个项目的已了结批量）。
  - `MobileProjectSwitchSheet` 不动——实核其会话行分支仅被 `projectOnly`
    消费（插件页只切项目，会话行不渲染），无此缺口；契约文档已记该边界。
  - 契约文档 §3.3 已从「v1 未实现」改写为「已补齐 + 两条边界」。
  - 验证：`probe-settle.mjs` 23/23（新增 18-23 六条：无 query 出列 / 并入+
    弱标 / 降饱和无点 computed / 活跃在前 boundingBox / 项目名不纳入 / 清空
    出列）+ 全门禁（typecheck/lint/format/web 1104 pass）+ CSS 硬闸 +
    tokens 机检 0 违例。产物 16:39:52 已含改动。
- **GTD 收口（按用户确认）**：批 18 键盘遮挡取证 + 批 17/18 真机复验勾选
  收口——用户长期使用未再复现键盘遮挡，判为真正修复（取证通道
  `keyboard-debug.ts` 早在 `936b1ed9` 摘除）；旧清单文字留档在勾选条目内。
  next-actions 新增 @settle 段；inbox settle 条目标 ✅。
- **过期条目修正**：next-actions「pages 域 + 外部 MCP 管理批（待提交）」
  实为早已提交推送（`0441a491`）——待下轮清理时勾选。

## 关键决策（本阶段不可丢）

1. **过滤层次选择按「行肥大程度」分流**（上批）：肥大审计族 api 回放入口
   过滤；小遥测行只 web 投影 skip。
2. **产物特征串验证**（上批仍有效）：rolldown minifier 用**反引号**写
   字符串字面量，rg 搜特征串别带引号形式假设。
3. **搜索可达的匹配面收窄**：已了结行不参与项目名匹配——这是「有 query
   才纳入」之外的第二条防淹没边界，设计稿 §3.3 已成文。

## 下一步

- **本批收尾**：settle 搜索可达批 commit + push（改动 = mobile-projects-home
  + probe-settle.mjs + session-attention.md + GTD/handoff 文档）。
- 挂账保留：**#11 队列重物化真机清单 6 条**（§6.20 尾，交用户日常验证）；
  **prompt 队列 v1+v2 真机验证**；**渐进披露 + pages/mcp 管理 真机清单**；
  **#7 wiki**（用户「待会再说」）；**#4 trust**；**#10 回流编排**；
  **#3 checkpoint/settle**（用户自测中）。

## 阻塞 / 风险

- 无阻塞。dev api 与 web 产物均最新（web 产物 16:39:52 含本批改动，CSS
  硬闸 + 特征验证过）。

## 易丢的关键上下文

- 22router 会话（1.42GB / 5003 请求）是回放验证素材；api-request 族验证
  脚本模式：连 WS → history batch gunzip → 逐行 parse → 按 type 计数。
- 最小会话 probe 结论（stdout 只有 system/assistant/result）记录在协议文档
  「api-request 族」详节。
- 全量单测 checkpoint-service 偶发超时 = 时序抖动（隔离跑绿 + diff 面无关
  佐证），复跑全绿即可，不是回归。
- commit 尾行 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

最后更新：2026-11-26 17:00 / 触发原因：settle 搜索可达批交付（探针 23/23 +
全门禁绿，待 commit）+ 批 18/17 真机复验按用户确认收口。
