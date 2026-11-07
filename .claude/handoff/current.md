# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-07 18:50（**pages 默认根批交付** `12d8e59..2aeaecf` 三个 commit 本地
> 未 push；**发现 Pages 面板全端无入口**待用户决策；wiki 格式对齐批次排队）

## 一句话状态

pages / memory / wiki 三线讨论收口落地：pages 默认根（site/ 零配置默认发布 public
免登录）已实现并全链验证（探针 3/3 + 全门禁绿 + 3 commits）；memory 用户拍板先不做
（调研留档）；inbox 清理完成。**实施中发现 PagesPanel 是孤儿注册**——tab 注册表里有
pages 但 `newPanelTab` kind 收窄 files/git/wiki，全端无创建入口，默认根生效后用户在
UI 里看不到/管不了页面根，入口方案待用户拍板。

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **默认根语义定案**（用户拍板「不需要配置，默认公开可访问 ＋ 不需要登录，仅仅是在
  配置时才可以调整」）：无配置文件 → `DEFAULT_PAGES_ROOT = {urlPath:"/", fsDir:"site",
  auth:"public"}` 兜底；文件存在含 `roots:[]` = **显式关闭发布**（删光根 = 唯一关闭
  通道）；readConfig 返回「生效视图」→ serve/config/UI 三方零特殊逻辑。
- **Pages 面板全端无入口（孤儿注册）**：`WORKBENCH_TAB_PLUGINS` 注册了 pages tab
  （workbench-tab-plugin.tsx:328-333）但 `usePanelTabRegistry` 的 `newPanelTab` kind
  参数收窄 `"files"|"git"|"wiki"`（use-panel-tab-registry.ts:46）——桌面右栏 filter
  只投影三结构标签、移动「新建标签」菜单也只有三种。**修复点 = newPanelTab kind 加
  "pages" + 两端 AddMenu 加项**；入口形态（工具条 ticon vs 新建标签菜单 vs 设置页）
  是用户当初问过未拍板的问题（「侧边栏没入口，统一在设置中默认提供比较好呢？」）。
- **探针恢复纪律（新实践）**：pages 探针备份 pages.json 到 fs 层恢复（有备份写回、
  无则 unlink）——**绝不能 PUT roots:[] 恢复**（那会把 test 项目永久置为显式关闭）；
  PUT `[]` 落盘 ≠ 删文件，删配置文件 = 回到默认发布。
- **api watch 假死又一次实证**：改 project-pages.ts 后 bun --watch 未重载（touch 也
  无效），respawn-pane -k 重启解决；respawn 杀了 api spawn 的 5 个活跃 agent 会话
  （用户已确认）。测试项目 site/ 目录已清理，pages.json 恢复为不存在（默认发布态）。
- **wiki 三项拍板回顾**（上游背景）：①inbox 清理 ✅；②Quartz 一步到位（跳过 docsify，
  需过 /check-deps 供应链核查：发布 ≥7 天）；③memory 先不做。

### 进度

- ✅ pages 默认根批全链交付：api 兜底（`5f2da9c`）+ 测试反转/新增（api 1300 pass）+
  i18n 空态文案 + deployment.md/pages-static-hosting.md 记档 + 探针
  probe-pages-default-root.mjs（A 公开面 200 / B 生效视图 / D token 401，3/3）
- ✅ inbox 清理批（`12d8e59`）：3 篇迁出 + 两层 index + 9 处引用修正 + wiki/memory
  两份调研文档沉淀登记
- ✅ 上传探针遗留断言（`2aeaecf`）
- ⏸ 手动 golden path 真机清单未交（探针已覆盖 HTTP 全链；UI 面板行为等入口批次）

## 下一步

1. **Pages 入口决策（问用户）**：默认根生效但 UI 无入口——修复选项 a) `newPanelTab`
   kind 放开 + 新建标签菜单加 Pages（两端一行级）；b) 工具条加 pages ticon；c) 设置页
   统一承载。用户当初倾向问过「设置中统一提供」。
2. **wiki 格式对齐批**（排队中）：Phase 0（description 透传 + MCP 工具描述写链接约定）
   → Phase 1（slug 放行空格/中文子目录、wikilink 渲染、backlinks）；方案见
   docs/research/wiki-solutions-survey.md §4。
3. **wiki 发布管线 Quartz**（排队中）：先 /check-deps 供应链核查再立项。
4. push 属外发动作，等用户确认后推 `12d8e59..2aeaecf`。

## 易丢的关键上下文

- pages 探针跑法：`bun scripts/probe-pages-default-root.mjs`（dev api 43011 需在跑）；
  它备份/恢复 test 项目 pages.json + 自建 site/index.html（files/mkdir → files/create
  → files/save 三步，注意 save 不自动建文件、query path 用相对形态禁前导 `/`）。
- files API 语义坑（探针实战踩过）：`/files/save` 只覆盖已存在文件（新建走 create）；
  `/files/create` 与 `/files/mkdir` 都是 query `?path=父目录` + body `{name}`；
  `resolveProjectRelativePath` 拒绝对路径形态（前导 `/` → PROJECT_PATH_OUTSIDE_ROOT）。
- DEFAULT_PAGES_ROOT 在 api/src/project-pages.ts 顶部导出；单测断言形状用字面量。
- dev 服务：api/web 已在跑（api 18:38 respawn 过）；tmux `ar-dev:api|web`。
- bun test / e2e 内存限制用 systemd-run cgroup（2G / 4G）；探针用 `bun scripts/X.mjs`。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
