# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-02（Provider 品牌图标全面接入批收尾）

## 一句话状态

**Provider 品牌图标全面接入完成**：claude/codex/omp 的通用图标（sparkles/bolt/bot）全部换成
品牌件（lobehub 静态 SVG 管线 + `<ProviderIcon>` 单源），彩色 logo 免疫容器 CSS（属性转
inline style + `stroke:none`）；手绘 anthropic/openai 退役。全门禁绿（web 1012 pass）+ 4 探针
全绿（provider-icons 11/11、mobile-project-header 56/56、batch7 46/46、m5-sheets 92/92）。
**待用户确认 push。**

## 本 session 焦点

### 关键决策（不可丢）

- **技术路线**：`@lobehub/icons-static-svg@1.101.0`（devDep，MIT，发布 ≥7 天）→
  `scripts/build-icons.mjs` 品牌白名单（claude=claude-color / codex=codex-color / omp=pi）→
  生成 `web/src/assets/brand-icons.ts`（进 git、可复现、过 oxfmt）→ `<ProviderIcon>` 消费。
  不引 React 组件包（peer 拖入）。
- **容器免疫机制**：容器层 `.dicon svg`/`.tile svg`/`.tticn svg` 是 Lucide stroke 规格
  （fill:none + stroke:currentColor），CSS 胜 presentation attribute → 生成器把 KEEP_ATTRS
  （fill/fill-rule/clip-rule/stroke 系）转 inline style（inline 永胜 CSS），消费端 svg 再补
  `stroke:none` 断继承。探针硬证据：omp computed fill = rgb(255,159,10)。
- **设计取舍**：omp = pi 单色件染 `text-warning`（延续 omp 品牌橙）；带容器 marker（sm/lg）
  品牌态 tone 降 `default` 中性底（彩色不撞 accent）；移动新建 sheet agent 三行 tile 统一
  `bg-ink-2/10`（终端行保留 tint-green，已在组件注释记档）；菜单行品牌件显式
  `size-[17px]`（对齐 ActionMenu 17px 标准档，不依赖 `[data-shell-icon]` 兜底）。
- **sessionMarker 三参**：`sessionMarker(type, size, provider?)`——agent+provider → ProviderIcon；
  provider 缺省退 sparkles（冷启动 memo 兜底）；terminal 恒 terminal。v1.5 §6.2 去品牌化决策
  2026-11-02 用户拍板推翻（spec + frontend-notes §15 已记）。
- **TS 收窄根因修法**：`cachedSessionFromLists` 缓存形状补 `provider` 字段（数据本就在手），
  不用 `in` 收窄强转；SideInstanceRow 用 `"provider" in entry.session` 守卫。
- **探针基线漂移归因（§29 法）**：`useSessionShells` 订阅 `/api/sessions/stream`，真实全量壳
  快照会**直写 `["overview"]` 缓存**覆盖 REST mock——探针必须静默该 WS
  （`routeWebSocket(/\/api\/sessions\/stream/, () => {})`），否则真实项目实例漏进候选集，
  组头/实例行断言出现「真实项目泄漏」假象。本批已给 2 个探针补上。

### 进度

- ✅ 生成器两段（lucide 白名单 -bot/-zap 收口 + 品牌段 union 单行化=可复现过 format）
- ✅ ProviderIcon（unknown provider 运行期防御 return null）+ 单测 3 tests
- ✅ 6 个消费面：workbench-side dicon / instance-area tab+新建菜单 / mobile-project-header
  tticn+切换行 / mobile-sheets tile / mobile-l3 菜单 / history-list；focusProvider 冷启动
  回落实例列表防闪变
- ✅ 手绘 anthropic/openai SVG + BRAND_SVG 退役；tokens 机检加生成物白名单
- ✅ 文档：design_spec §6.2（品牌化推翻 + marker tone default 记录）/§10.3、frontend-notes
  §15、.claude/rules/frontend.md
- ✅ 探针过期修正（同批顺手，commit message 点名）：mobile-project-header 5 处（runct→聚焦
  `.dot`、⋯ 菜单补双模式行、sessions-stream mock）、batch7 5 处（品牌锚点/.complete/codex
  composer）、m5-sheets srow 3→4
- ✅ 全门禁 + CSS 硬闸 + tokens 0 违例；review（design+code）已消化

### 阻塞 / 风险

- 无阻塞。待用户：
  - **push 确认**（外发）。
  - 真机清单：彩色 logo 小尺寸辨识度（15–20px）；codex 白底方块深色主题观感；omp π 橙色
    对比度（浅色下 ~2.1:1，若刺眼可换 warning-text 档）；移动 sheet tile 中性底观感。
- 已知未处理（低优先，review 记录）：codex 渐变 `<linearGradient id>` 固定 id，同页多实例
  DOM id 重复（同定义，渲染等价）；omp 品牌橙复用 warning 语义色（对比度面）。
- `?? wiki/` 目录 git 归属（遗留，多次未拍板）。

## 下一步

1. 用户确认 push。
2. 真机验证（见上清单）。
3. 后续可选：provider 品牌色角色 token 化；codex 渐变 id 去重。

## 易丢的关键上下文

- 改品牌白名单后重跑 `bun scripts/build-icons.mjs`：生成物必须 `bunx oxfmt --check` 干净且两次
  重跑 md5 一致（union 单行化 + 注册表模板已对齐 oxfmt 形状）。
- 探针跑法：`bun scripts/probe-provider-icons.mjs` / `probe-mobile-project-header.mjs`
  （需 dev web 43012；均含 verifyCssFlushed/mock/登录）。
- 任何 mock `/api/overview` 的探针都必须同时静默 `/api/sessions/stream` WS。
- 生成物 brand-icons.ts 在 tokens 机检白名单（品牌原色是品牌资产非 UI token）。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
