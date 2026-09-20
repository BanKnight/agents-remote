# design 索引

UI 设计权威层：v1.3 设计包（Apple HIG 风格，iPhone/iPad/Mac 三端 54 页原型）+ v2 重构总纲。v1 设计体系归档于 `../design-v1/`（历史参考，非权威）。

## 子目录

- [assets](./assets/) — 设计包共享资产：`components.css`（共享组件单源参考实现）、`tokens.css`（token 的 CSS 变量映射）、`theme.js`（双主题运行时，data-theme 切换三通道）。

## 文档

- [design_spec.md](./design_spec.md) — v1.3 设计规格唯一权威：九条铁律、IA 总览、L0–L3 逐页说明、浮层清单、三端适配映射、§7 设计语言、§8 数据模型、§9 验收清单。
- [tokens.json](./tokens.json) — 设计 token 唯一数值源（color/radius/space/typography/icon/component 七组）；`$value`=浅色、`$extensions["mode.dark"]`=深色，语义名两态一致；禁止散落 HEX。
- [redesign-v2.md](./redesign-v2.md) — UI v2 重构总纲：权威源声明、23 条决策日志、九铁律实现映射、现状能力盘点、关键代码锚点、M0–M10 里程碑计划与状态、待定项跟踪。
- [index.html](./index.html) — 原型图集导航入口：54 页原型索引 + 浅/深主题联动开关。

## 原型页（54 页 HTML，像素级视觉标准）

按 IA 分组（文件名即页码序）：

- **IA/总览**：`01-ia-flow.svg`（信息架构流）、`index.html`
- **L0/项目 Tab**：`06-login`、`02-tab-projects`、`02c-pill-context-menu`、`08-sheet-new-project`
- **工作台（agent/idle/error/offline/terminal/chat/subagent/empty）**：`03-workspace-agent`、`03c`–`03i` 系列
- **工作台浮层**：`03j`（新建实例）、`03k`（实例信息）、`03l`（项目切换）、`03n`（会话历史）
- **工作台工具三件套**：`03m`（Git）、`03o`（文件）、`03p`（Wiki）及 `03s`–`03v`（wiki reader/git history/commit/branches）
- **文件操作/预览**：`03q`/`03r`（预览/diff）、`03w`–`03z`（file actions/search/create/upload）
- **多端**：`04-ipad`、`05-mac`、`05c`–`05g`（Mac history sidebar/new instance popover/inspector/approval center/all sessions）
- **设置/插件/审批/全局文件**：`07-settings`、`07-mac-settings`、`09-tab-plugins`、`09-mac-plugins`、`11-approval-center`、`10-tab-files-global`、`10-mac-files-global`
- **技能/MCP 详情与市场**：`12-skill-detail`、`13-mcp-detail`、`14-mcp-add`、`15-market-sources`、`16-install-audit`、`17-market-browse`、`18-skill-market`
