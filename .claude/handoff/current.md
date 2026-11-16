# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-16（**MCP 渐进式披露 + 能力内部状态批：实现 + 全门禁绿，待 commit
> （push 待用户确认）+ 真机验证清单交用户**）

## 一句话状态

ar-hub 功能域完成渐进式披露四层改造（L0 instructions 菜单 / L1 guide:// 指南 /
L2 capability_list+set / L3 门控工具面），能力真相源从项目 mcp.json 迁 ar-hub 内部
状态 `~/.agents-remote/mcp-capabilities.json`（惰性导入 + 级联），wiki 改名去 pages +
新增 wiki_search。全门禁绿（api 1377 / shared 16 / web 1088 / e2e 42 / CSS 硬闸 /
tokens 机检）。

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

- ✅ 阶段 1-2（store + mcp-domains + hub 四层装配）、阶段 3（web 改名+模板+探针）、
  阶段 4（projects 级联 + mcp-management/mcp-config 注释）、阶段 5（新设计文档 +
  wiki/mcp-server-features.md 重写 §一 + hosting.md 三处现状锚点 + handoff/gtd 登记）
- ✅ 测试：`mcp-capabilities-store.test.ts` 9 新增；`mcp-hub-server.test.ts` 51（含
  instructions/guide://wiki/capability 闭环/admin 审批三态 7 新用例）；`index.test.ts`
  36；`project-gen-ui` + `projects` 47；web 两文件 378（含 legacy 兼容断言）
- ✅ 本轮收尾：`mcp-admin-tools.test.ts` 迁 store（三 describe 建 store 注入 + 项目
  目录保留 + tools/list 断言更新 = admin 八工具 + 恒注册六工具 14 项）→ 14/14；
  `probe-mcp-app-template.mjs` 刷新请求名 → `wiki_read`；`probe-admin-approval.mjs`
  「备份→写 mcp.json→恢复」改为直写/清 `~/.agents-remote/mcp-capabilities.json`
  （imported:true 防惰性导入覆盖；原文备份/无文件则 rm）
- ✅ 全门禁：format:check / lint 0 warning / typecheck / 全量单测（systemd 2G：
  api 1377 + shared 16 + web 1088）/ e2e 42/42（4G）/ CSS 落盘硬闸 / tokens 机检 0/0
- ⏳ commit（pre-commit 全门禁）→ push 待用户确认
- ⏳ 真机验证清单交用户（见 gtd next-actions @mcp-apps 组）

### 易丢的关键上下文

- `startMcpHubServer` 的 `capabilitiesStore` 现为**必选**——任何新 hub 测试必须注入，
  否则 capabilities 全空（wiki 四工具仍恒注册但 capability_set 会炸）。
- 探针 `probe-admin-approval.mjs` 改内部状态后：test 项目若无 store 记录会惰性导入
  其 mcp.json——探针写入带 `imported: true` 就不会覆盖。
- `rtk proxy rg` 查工具名（rtk 输出压缩会把旧名显示成 "n"）。
- run-e2e.ts 造 mcp.json `{ui:true}` **保持不变**——天然验证惰性导入路径。
- commit 用标准 `git add && git commit`（禁 `--only`/`--git-dir`）；`site/` untracked
  不入库；尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

### 下一步

1. commit → 请用户确认 push（含此前 checkpoint 批 3 个 commit 挂账 push）。
2. 真机验证清单交用户（五条，见 gtd @mcp-apps 组渐进披露条）。
3. reviewer 审查：本批涉及命令执行/审批/外部输入面 → 建议 security-reviewer +
   code-reviewer 过一遍（MCP hub 改造面大，digest 见 mcp-hub-server.ts 四层装配）。

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
