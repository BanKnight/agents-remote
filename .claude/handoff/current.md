# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-16（**MCP 渐进式披露批：实现 + 双 reviewer 收敛全部落地
> （`9f998ae8` + `9d765ded`），全门禁复跑绿，待用户确认 push + 真机验证清单交用户**）

## 一句话状态

ar-hub 功能域完成渐进式披露四层改造（L0 instructions 菜单 / L1 guide:// 指南 /
L2 capability_list+set / L3 门控工具面），能力真相源从项目 mcp.json 迁 ar-hub 内部
状态 `~/.agents-remote/mcp-capabilities.json`（惰性导入 + 级联），wiki 改名去 pages +
新增 wiki_search。security（0 P0/P1）+ code（1 P1 + 6 P2）报告全部消化：
store 写串行化 / admin 导入不复活 / 域名单单源化 / 文案对齐 / 探针恢复语义。
全门禁复跑绿（api 1380 / shared 16 / web 1088 / e2e 42 / lint 0 warning）。

## 本 session 焦点

### 关键决策（不可丢）

- **四层结构**（契约单源 `docs/design/mcp-progressive-disclosure.md`）：L0
  instructions 每请求动态拼装（`buildArHubInstructions`，5 域一行+实时状态+Operating
  rules）→ host 拼进 system prompt；L1 `guide://<domain>` 五条恒注册；L2
  capability_list / capability_set 恒注册；L3 wiki 四工具恒注册+运行时门控。
- **两种门控**：wiki = 运行时门控示范（关闭态调用返回引导错误指向 capability_set）；
  ui/skills/admin/gen-ui = 注册面门控（数据源换 store，行为同旧版）。
- **真相源迁移**：`~/.agents-remote/mcp-capabilities.json`（仿 push-subscriptions
  同族：0o600 原子写）；**惰性导入**存量 mcp.json 一次（imported 标记后文件不再参与
  判定）；`set` 先 `await get()` 防覆盖导入前状态；项目删除/重命名级联
  removeProject/renameProject（key = 目录名）。
- **审批分档**：capability_set admin 域走 `requestManageApproval`（agent 不能自我提
  权，无 adminDeps → [ADMIN_APPROVAL_UNAVAILABLE]）；其余四域直接生效，返回 note
  「Changes apply to subsequent tool calls immediately」。hub 无状态架构下同一会话
  下一条请求即生效（测试覆盖闭环）。
- **工具改名**：`wiki_list` / `wiki_read` / `wiki_write` / 新增 `wiki_search`（复用
  `ProjectWikiService.searchPages`）；参数 slug 保留、structuredContent kind 不变。
  旧名三层兼容：web 渲染注册表双键（历史卡片不降级）/ HUB_APP_TOOLS 双键（反向刷
  新）/ i18n key `claude.tool.wikiReadPage` 保留文案改「Wiki」。
- **`readProjectMcpConfig` 降级为仅导入源**（唯一调用方 = store.importFromLegacy）。

### 进度

- ✅ 阶段 1-5 全实现 + 本轮收尾（mcp-admin-tools.test.ts 迁 store、两探针迁移、文档、
  handoff/gtd 登记）
- ✅ 双 reviewer 审查 + 报告全部消化（`9d765ded`）：security 0 P0/P1 + 3 P2；code
  1 P1（store 写竞态）+ 6 P2。修复：store 写路径 writeQueue 串行化 + temp 名
  randomUUID 段；惰性导入 admin 强制剔除（迁移路径没有审批语义）；能力域名单单源化
  （store 白名单 + hub z.enum 都从 MCP_DOMAINS 派生）；ADMIN_GUIDE/SKILLS_GUIDE 文案
  对齐实现；hub 补 disable-admin 审批用例；index.ts 删 store 重复传参；探针恢复不整份
  rm 状态文件。新增回归测试 3 条（store 2 + hub 1）
- ✅ 全门禁复跑绿：format:check / lint 0 warning / typecheck / 全量单测（systemd 2G：
  api 1380 + shared 16 + web 1088）/ e2e 42/42（4G）/ CSS 落盘硬闸 / tokens 机检 0/0
- ✅ commit：`9f998ae8`（主批）+ `9d765ded`（reviewer 收敛），pre-commit 全门禁过
- ⏳ push 待用户确认（连同 checkpoint 批 dad68fe/278289d2/d81b28d9 三个挂账 commit）
- ⏳ 真机验证清单交用户（见 gtd next-actions @mcp-apps 组渐进披露条）

### 易丢的关键上下文

- `startMcpHubServer` 的 `capabilitiesStore` 现为**必选**——任何新 hub 测试必须注入，
  否则 capabilities 全空（wiki 四工具仍恒注册但 capability_set 会炸）。
- **store 写路径全部走 writeQueue 串行**（review P1 修复）；`importFromLegacy` 对
  admin 强制剔除——存量 mcp.json 的 admin:true 不随导入复活（迁移路径无审批语义）。
- 探针 `probe-admin-approval.mjs` 写入带 `imported: true` 防惰性导入覆盖；恢复时
  backup===null 只删 test 记录写回（不整份 rm，防误删其它项目记录）。
- `rtk proxy rg` 查工具名（rtk 输出压缩会把旧名显示成 "n"）。
- run-e2e.ts 造 mcp.json `{ui:true}` **保持不变**——天然验证惰性导入路径。
- commit 用标准 `git add && git commit`（禁 `--only`/`--git-dir`）；`site/` untracked
  不入库；尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

### 下一步

1. 请用户确认 push（本批 2 commit + checkpoint 批 3 个挂账）。
2. 真机验证清单交用户（五条，见 gtd @mcp-apps 组渐进披露条）。
3. security 附注（记档不修）：admin 闸本质是审批 UX 而非硬边界——有 shell 的 agent
   可直写状态文件，这是平台既有信任模型的属性（agent 进程与用户同权限），后续不要把
   硬边界建立在该 store 上。

## 挂账（非本批）

- checkpoint 批（dad68fe/278289d2/d81b28d9）push 待用户确认 + 真机验收清单已交。
- settle 批（`16c9911`，已推送）待真机验收。
- settle 搜索结果不含 settled（inbox 2026-11-13）。
- probe-fab.mjs 过期断言（5 FAIL）待拍板重构/退役。
- 技能更新检测服务端慢（逐 repo 串行拉 GitHub Trees）。
- StatusDot/StatusMarker 休眠死代码待拍板。
- wiki 格式对齐批 → wiki Quartz（先 /check-deps）。
- 会话进行中调度 auto-retry pending 注入计时器（runtime 生命周期遗留）。
- checkpoint 批已知取舍：diff 面板单容器滚动（DiffContent 内 sticky hunk 条不吸顶，
  逐文件导航仍可用）；只做 claude 对话回滚（其它 provider 留能力位）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

最后更新：2026-11-16 / 触发原因：MCP 渐进披露批实现+全门禁绿，准备 commit。
