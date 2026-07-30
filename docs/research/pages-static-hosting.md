# pages 静态托管技术方案

> 状态：技术方案已对齐（2026-07-30），待实现。三个新需求（wiki / pages / browser）统筹排序中，pages 排第一。wiki / browser 的基础要素见 `./inbox/llm-wiki-okf.md`、`./inbox/embedded-browser.md`。

## 定位

per-project 静态目录托管，类 nginx 的简化版。用户配置 project 内哪些目录作为静态根，内容直接通过 URL 访问。

## 内容来源（明确不管）

托管的内容由用户/Agent 自己产出，**我们不管内容怎么来**。典型场景：用户通过定时器驱动 AI agent 定时生成内容到指定文件夹，然后直接通过 URL 访问——无需离开控制台部署。

## 职责边界

纯静态文件服务（serve 目录 → URL）。不做渲染、不做编译、不做构建。内容是 HTML 就按 HTML 服务，是别的就按对应 MIME 类型服务。

## 决策点与结论

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 作用域 / 配置位置 | per-project；project 内配置文件（如 `.agents-remote/pages.json`） |
| 2 | URL 路由 / auth | `/api/projects/{project}/pages{urlPath*}`；默认无 auth，per-静态根可选开启 |
| 3 | 安全 | 锁定 project 目录（Project-safe resolver）、禁 symlink、MIME 映射、目录列表关、无 SPA fallback |
| 4 | 缓存 | 不缓存文件内容、弱 ETag、不强缓存、无 build/watch |
| 5 | 开关 | 配置即启用，不另设开关 |
| 6 | 与 Files 的边界 | 复用 Files 的安全读取原语，不复用 UI |

### 决策点 1：作用域与配置位置

- per-project：每个 project 在自己的配置里声明若干"静态根映射"。
- 配置存放在 project 内配置文件（如 `.agents-remote/pages.json`），而非 project runtime metadata。理由：静态根是 project 内容的一部分，随目录走、可被 git 跟踪、用户/Agent 可直接编辑。
- 配置结构示意：`{ roots: [{ urlPath: "/blog", fsDir: "dist/blog", auth: false }] }`。

### 决策点 2：URL 路由与 auth

- 路由：`/api/projects/{project}/pages{urlPath*}`，走现有 API 端口（43011），复用 Project-safe resolver。
- **默认无 auth**（公开 URL 可访问），参考 Cloudflare Drop 默认（见下方"参考实现"）。理由：契合 Agent 定时生成 → 用户直接 URL 访问场景，不想每次带 token。
- **per-静态根可选开启 auth**：配置项 `auth: false`（默认）→ 直接 serve；`auth: true` → 走现有 token auth 中间件。
- 一个 project 内可混搭：公开 blog 静态根（无 auth）+ 私有报告静态根（有 auth）。

### 决策点 3：安全

- 静态根锁定在 project 目录内，复用 Project-safe resolver，防 `../` 越界。
- 默认禁 symlink（符号链接可能逃出 project 边界）。
- MIME 类型按扩展名映射（text/html、css、js、图片等），`text/html` 默认 UTF-8。
- 目录列表（directory index）默认关。
- **无 SPA fallback**：pages 是静态 HTML 站（每个 URL 对应一个 `.html` 文件），不是 React/Vue SPA，用不上 `try_files $uri /index.html` 回退。命中即返回，404 即 404。

> SPA fallback 解释：类 nginx `try_files $uri $uri/ /index.html`——请求 `/about` 时磁盘上没有对应文件，不返回 404 而回退到根 `index.html`，让前端路由器接管。仅 SPA 需要，静态 HTML 站不需要。

### 决策点 4：缓存与热更新

- 内容由 Agent 定时生成，文件随时变——**不缓存文件内容**（每次读盘）。
- 加弱 ETag（低成本弱缓存，304 协商）。
- 不做强缓存（避免 Agent 改了内容用户看到旧的）。
- 无需 build/watch：纯 serve，文件由 Agent 写。

### 决策点 5：开关

- 配置即启用：配置文件里声明了静态根就等于启用，没声明就等于关闭。不另设独立开关字段。

### 决策点 6：与 Files 的边界

- Files 是只读 inspection（看路径树 + 文本/图片预览），pages 是静态 HTTP 托管（URL 访问 + 浏览器渲染）。
- pages 复用 Files 的安全读取原语（Project-safe resolver、MIME 判定），**不复用 Files UI**。
- pages 自身不做 UI 浏览，只提供 URL；内容由 browser（见 `embedded-browser.md`）或外部浏览器消费。

## 参考实现：Cloudflare Drop

Cloudflare Drop（2026-07-08 上线，基于 Workers static assets）是低摩擦静态站托管，关键设计选择对照如下：

| Drop 的选择 | 我们是否采用 | 说明 |
|---|---|---|
| 匿名优先，publish first identify later（60 分钟内认领） | ❌ 不抄 | 我们要 per-project + 可选 auth，不匿名 |
| **默认 public、无访问门控**（"edge-cached, no access gating of any kind"） | ✅ 采用默认 | 对应决策点 2"默认无 auth" |
| edge-cached（边缘缓存） | ❌ 不抄 | 我们走 Bun HTTP，不做边缘缓存；决策点 4 只做弱 ETag |
| Workers static assets 平台（HTTPS/DNS/DDoS 全包） | ❌ 不抄 | 我们走现有 Bun HTTP |
| post-claim 才有 access control（Worker policies） | ✅ 概念对齐 | 访问控制是后置可选的，对应"per-根可选开启 auth" |

**核心启发**：Drop 验证了"静态托管默认无 auth + 公开可访问"是合理默认。我们的"auth 可开关"与 Drop 默认一致——默认无 auth，需要时再开。

来源：
- Cloudflare Drop 发布（2026-07-08）：cloudflare.com/drop
- Stacktree 测试记录：https://stacktr.ee/blog/what-is-cloudflare-drop
- Static.app 对比（验证 60 分钟匿名 + claim 流程）：https://static.app/cloudflare-drop-alternative

## 落地位置

- 技术方案：本文件（`docs/research/pages-static-hosting.md`）。
- 实现期沉淀：`docs/specs/` 下建 spec（行为契约），`docs/architecture/` 下建架构边界。

## 待实现期细化（当前不锁）

- 配置文件确切格式与字段命名（`.agents-remote/pages.json` 的 schema）。
- 多静态根的 URL 前缀冲突解决规则。
- MIME 映射表的确切覆盖范围。
- auth 开启时与现有 token auth 中间件的具体接线方式。