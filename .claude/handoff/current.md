# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-23（**第七轮反馈修复完成**：MCP 官方市场接入 + 技能详情去重，四 commit `a62bf2a`/`f6f8155`/`2e700e4`/`2b1f1c9`，新探针 53/53 + m6 66/66 + e2e 29/29 + 四门禁 + CSS 硬闸。触发：第七轮收口）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第七轮（市场缺 MCP + 技能详情重复）全部修复并 commit：批次 1 后端发现层（shared 类型 + 翻译函数 + registry 代理 + headers 链路）`a62bf2a`；批次 2 市场页双 tab（`.tabseg`「MCP 服务器｜技能」+ McpMarketTab + McpInstallAuditSheet + 09 双 mrow）`f6f8155`；批次 3 技能详情去重三对（FrontmatterCard excludeKeys / dtitle 条件化 / rmnote 换键）`2e700e4`；探针 + §6.12g 记档 `2b1f1c9`。**下一步：交用户复验。**

## 本 session 焦点

第七轮两个问题的三批次实施。核心裁定：用户推翻 §6.6 摊牌 17「MCP 市场不画」，指定官方 registry（registry.modelcontextprotocol.io）为数据源——原型 17 本就是 MCP 市场整页，属补齐漏移植非新功能。

## 关键决策（本阶段不可丢）

- **翻译规则**（shared `mcpMarketEntryToInstallRequest` JSDoc）：name = reverse-domain 末段（非法名整条 skip）；remotes[0] 优先 → http/sse 直连；npm → `npx -y <identifier>`；pypi/oci/mcpb 不翻译（双无 → 禁装态）；多 package 取第一个；只并入实填键。
- **`claude mcp add -H "K: V"`**：http/sse 用 `-H`（stdio 用 `-e`）；`-H` 是全局 flag 必须在位置参数 url **之前**（避 variadic 吞参）。`AddMcpServerRequest` += `headers?`，手工表单仍不设。
- **marketTab 不用 `tab`**：撞 validateWorkbenchSearch 已有 `tab?: WorkbenchMiddleTab` union；`marketTab?: "mcp"|"skill"` 路由特定维度不进 stickyWorkbenchSearch（gitScope 同款）。
- **诚实口径**：registry 无认证徽标/工具数/安装量/总量/百分比——一律不画；安装是同步 POST 无 task 流，卡内「添加中…」disabled。
- **12 详情视觉变化**：name 只在 nav h1 单点显示（dtitle 仅 hasUpdate 时承载 chip）；FrontmatterCard 排除 name/description（`excludeKeys` prop，桌面 SkillTabPreview 同传）。
- **FrontmatterCard 过滤口径**：通用组件 `excludeKeys` + MarkdownString `frontmatterExclude` 透传（JSDoc 注明唯一合法场景：页面已在别处单点展示对应字段）。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0–M10 → 用户总验证 → 七轮反馈修复全闭环（1~6 轮见 snapshots；第七轮四 commit 如上）
- ✅ 探针：新 `probe-v2-m6c-mcp-market.mjs` 53/53；`probe-v2-m6-plugins.mjs` 修正后 66/66；e2e 29/29
- ⬜ **交用户复验**，真机项清单：
  - **MCP 市场**：09 插件页市场段两条入口（MCP 市场/技能市场）→ MCP 段搜索官方 registry（真数据源，需外网）→ 条目卡（名/来源章/描述·版本）→ 安装审计 sheet（必填 env/headers 输入，isSecret 密文）→ 提交后 ✓；pypi 等不可装条目 disabled + 说明行
  - **技能详情**：name 不再三处重复（nav 单点）；SKILL.md 卡不再列 name/description；卸载说明 ≠ 确认弹窗文案（含「重载」）
  - **12 详情 dtitle 视觉变化需向用户说明**：技能名只在顶部 nav 单点展示，「有更新」chip 单独一行（仅检测出更新时出现）
  - 遗留（历史轮）：②时间刷新节奏、⑥gf 卡形态、⑫浮层穿透、⑬ticon 间距、iPad 触屏 hover 正交、W4 chip-Popover 形态

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活，43011/43012 均 200，dist 已 rebuild（CSS 硬闸 + content-type text/css 均过）。
- 真机验证 MCP 市场需服务器可达 registry.modelcontextprotocol.io（公网出口）；registry 不可达时 UI 显示 502 错误行（不崩，属预期降级）。

## 易丢的关键上下文

- **探针 mock 铁律**：Playwright route glob **不匹配带 query 的 URL**——`**/api/mcp/search` 命不中 `?q=`，必须尾带 `*`；mock「翻译后形态」按消费端契约构造（pypi 条目翻译层 package=null，mock 给 package 对象会测错层）。
- **探针跑法**：`bun scripts/probe-*.mjs`（bun 不用 node）；密码自读不进 agent 上下文。
- **e2e 纪律**：`systemd-run --scope --user -p MemoryMax=2G bun run e2e`。
- **CSS 落盘流程**：改 web 后 touch main.tsx → sleep 12+ → ar-verify-css；交付前 curl content-type 必须 text/css。
- **写入纪律**：大段生成（≥15 行）heredoc 写补丁脚本 + python 锚点整段替换 + rg 机检；format 写入只用 `bun run format`。
- **行高纪律**（第六轮起）：v2-primitives 新增带 font-size 的块必须同步 `line-height: var(--line-height-ui)`。
- **button width:auto = fit-content**（四/五轮）：行类 max-width:100% 护栏；卡片类 width 三连；勿用 w-full。
- contains 防护 idiom：`if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target as Node)) return;`

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
