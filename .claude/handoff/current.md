# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-21（MCP Apps 阶段 5.5 卡片富渲染完成：marked+DOMPurify+mermaid 12 构建期内联 + gzip,待提交）

## 一句话状态

**MCP Apps 阶段 5.5（卡片富渲染）完成待提交**：真机发现卡片 mermaid/SVG/表格/富 HTML 不可渲染 → 调研定案构建期内联（三方一致强证据）→ 用户拍板 mermaid 统一 12（依赖冗余收敛）→ marked 15.0.12 + DOMPurify 3.2.6 + mermaid 12.0.0 Bun text import 内联 + rich 管线（sanitize→innerHTML→mermaid SVG 升级,异常回落 legacy）+ api mcp-ui-resource 路由 gzip 协商（5.65MB→~1.2MB）+ e2e spec timeout 90s。验证:模板探针 26/26 + e2e 31/31 + api 1026 + web 859 + shared 10,SDK 意外升级 1.32.1 验证接受（发布 2026-10-05 合规）。剩余等待项：真机验证（含富渲染新项）、composer 挂起批、轻/重模板分流（后续）。

## 本 session 焦点

### 关键决策（不可丢）

- **MCP Apps 落地总纲（用户拍板）**：「调研完之后就开始落地，除非有需要我拍板的内容否则就全部逐个按里程碑全部实现」；阶段 5 拍板（2026-10-20）：「你不妨将阶段 5 也完成了，等到他们 cli 支持得时候直接对上」——server 侧先行。
- **阶段 5.5 渲染定案（2026-10-21,用户三连拍板）**：渲染库供给 = **构建期内联**（CDN 路线被调研证据推翻:纯 MCP Apps 宿主 0 先例 + 回放/离线空白;ext-apps 官方示例/OpenAI Apps SDK/ZCode UI Plugin 三方一致打包）;mermaid **一并打包且版本统一 12**（用户两次提醒依赖冗余 → 与 web 包同版本,锁文件单点,接受 5.4MB）;传输重量 = api 路由 gzip + 后续轻/重模板分流。SEP-1865 不规定渲染组件——渲染能力是模板实现选择。流式渲染全部为聊天流而生,卡片不需要;沙箱双份依赖是隔离模型固有代价（调研报告 §4/§5）。
- **阶段 5 数据面（已实现）**：数据源 = 本地 skills 同批磁盘文件（项目 `.claude/skills` + 全局 `~/.claude/skills` 并集,同名项目胜出,claude-code 口径,codex 目录不分发）;SDK 1.30 手写桥（自造 zod schema 经 `server.server.setRequestHandler`,非 tools/call 走默认注册路径——已读 SDK 源码验证）;每请求实时扫描（单请求内三方法共用一次扫描,digest 与内容必然一致）。
- **security-reviewer 消化（本批,0 安全漏洞）**：P1-1 清单读回不对称（中文/空格/含 `..` 字样文件名列出却读不回 → **扫描时建 uri→相对路径 Map,读取查表**,消灭反向构造）;P1-2 无上限扫描（SEP 上限 512 文件/16MiB → **超限整体跳过** + digest 流式化）;P2-1 根级 symlink realpath 校验;P2-2 cacheScope "public"→"private"。info：frontmatter 平铺 KV 拍扁嵌套 YAML = 互操作债（官方 SDK 落地时迁移）,同 name 冲突 sort+warn,home 注入参数无害。
- **e2e mock 策略（阶段 4.5,已验证）**：WS mock 只喂流帧,此后全链零 mock;stale 标题→Fresh = 代理全链端到端证据。登录定位跟语言走（lang=zh →「访问密码」/「登录」）。
- **历史决策（主文档 §8/§10）**：单层沙箱;display tool 名单 + kind 双条件;HUB_UI_RESOURCES 单源表;阶段 4 反向通道四方法（ui/initialize + tools/call 双白名单 + ui/message 确认闸 + ping）。

### 进度

- ✅ 阶段 0-5 全链已提交（`9ec70ab`→…→`8dc153d`）
- ✅ **阶段 5.5 本批完成（待提交）**：渲染调研（`docs/research/mcp-app-rendering-survey.md` 新）定案构建期内联 → `api/src/mcp-hub-server.ts` 模板富渲染（marked/DOMPurify/mermaid 12 Bun text import 内联 + `</script` 防御转义 + rich 管线 + 主题重渲染）+ `api/src/mcp-app-libs.d.ts`（新,text import 类型）+ `api/src/index.ts` mcp-ui-resource gzip 协商（响应体缓存 + Accept-Encoding 协商;hunk 分离挂起批）+ `api/src/index.test.ts` gzip 用例 + e2e spec timeout 90s（5.65MB srcdoc 全链 36s@2G）+ 模板探针适配 26 断言（mermaid SVG/表格/HTML 直通/script 剥除/主题重渲染/刷新清残留）+ bun.lock（mermaid 12 单版本 + SDK 1.32.1 + zod ^4.6.7;根 package.json 的 bun update 污染已回退）
- ⏳ 真机验证清单交付用户（既有 + 阶段 4 两条 + 富渲染新项）

### 待办

- **真机验证（交用户,随时）**：既有清单（卡片渲染 + 主题两态 + 高度自适应 + 回退）+ 阶段 4 两条（刷新回灌 / 追问确认闸）+ 富渲染新项（mermaid 图/表格/富 HTML 渲染;卡片首载比之前慢是预期——5.4MB parse,tunnel 传输 gzip 后 ~1.2MB）
- 挂起批（工作区,刻意不提交）：api/src/index.ts inset-report hunk + web/src/lib 三件（composer 第二次埋点等真机数据）
- **后续优化（未排期）**：轻/重模板分流（无 mermaid 页 ~60KB 轻模板,消 5.65MB srcdoc 的 parse/传输重量）;上游 SDK skills 支持发布后迁移手写桥
- 阶段 6 = 上游 CLI client 消费（等上游;Codex 提交时快照限额复核）

## 易丢的关键上下文

- **P1-1 查表方案**：`ScannedHubSkill.files: Map<uri, 相对路径>`——读取永远查表,不从 uri 反向构造路径;`includes("..")` 黑名单已删（`a..b.md` 是合法文件名）。第二道防穿越（resolve + startsWith）保留在 `readSkillResourceText`。
- **SEP 上限语义**：超 512 文件/16MiB = **整体跳过该 skill**（截断清单会产生违反「resources MUST 完整」的非法 entry）,不是报错。
- **iframe WindowProxy 跨导航恒定**：身份比较检测不了帧内导航;导航信号 = onLoad 同模板 refire（revokedRef 模型）。
- **真实 Chromium 时序**：srcdoc iframe 的 load 先于帧内解析期 postMessage；reply 挂 revokedRef 不依赖引擎顺序。
- **TS 模板字符串转义坑**：`WIKI_PAGE_APP_HTML` 内嵌 JS 用单引号字符串包双引号。改模板后探针必跑。
- **api 测试事实**：jsonError 形状 `{error:{code,message}}`；wiki 路径 `{root}/{project}/wiki/{slug}.md`；hub 测试 home 注入（`mkdtemp` 假 home,不碰真实 `~/.claude/skills`）。
- **探针跑法**：`systemd-run --scope --user -p MemoryMax=2G bun …`；用 bun 不用 node；`_diag-` 一次性脚本用后删。
- **tmux**：`ar-dev:0` = api、`ar-dev:1` = web；标准重启 `respawn-pane -k`；绝不 kill server。
- **提交拆分手法**：混合 hunk 用 `git diff` + awk 过滤目标 hunk + `git apply --cached`；本批有混合文件（api/src/index.ts 挂起 hunk 不进）。

---
最后更新：2026-10-21 01:37（触发原因：MCP Apps 阶段 5 完成 + 审查消化,提交前 handoff save）
