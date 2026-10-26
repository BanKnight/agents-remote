# Agents Remote

AI 智能体远程控制台 — 在浏览器中管理、观察和调度远程 AI Agent（Claude / Codex）。

## 功能

- **Agent Sessions** — 创建、观察和控制 Claude / Codex 会话
- **Terminal Sessions** — 远程终端，支持 WebSocket 实时交互
- **Files** — 浏览项目目录和预览文件
- **Git** — 查看 Git 状态和 diff
- **PWA** — 支持安装为桌面 / 移动端独立应用

## 技术栈

- **Monorepo**: Bun workspaces (`web` + `api` + `packages/shared`)
- **前端**: React 19、Vite、TanStack Router / Query、Jotai、Tailwind CSS
- **后端**: Bun、Project-scoped 文件系统 + tmux runtime
- **E2E**: Playwright

## 前置条件

- [Bun](https://bun.sh/) >= 1.3
- Claude Code CLI 和 / 或 Codex CLI（用于实际 Agent 会话）
- Node.js（仅用于 Playwright E2E 测试时需要）

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/<your-org>/agents-remote.git
cd agents-remote
bun install
```

### 2. 配置

首次启动 API 时会自动生成配置文件：

```bash
bun run dev:api
```

编辑生成的 `~/.agents-remote/config.yaml`，至少填写：

```yaml
app_password: "your-password"
projects_root: /path/to/your/projects
api_port: 43011
web_port: 43012
```

### 3. 启动开发服务

约定：**web 跑生产构建（prod preview），api 跑 dev**。web 的 service worker（precache、`navigateFallback`）只在生产构建里真实存在，dev 模式 HMR 与生产 PWA 行为不一致，所以本地也用 prod build 跑 web。详见 [Dev Services Runbook](./docs/runbooks/dev-services.md)。

```bash
# 主路径：分两个终端 / tmux 分别启动（推荐，便于独立重启）
bun run dev:api   # API dev，端口 43011
bun run dev:web   # Web prod preview（build --watch + vite preview），端口 43012

# 或一键并行启动（api dev + web preview）
bun run dev
```

打开 `http://localhost:43012`，输入密码即可使用。

> 纯 UI 迭代想要 HMR 时，可用逃生口 `bun run dev:web:hmr`，但**不要用它验证 PWA / Service Worker 行为**——那只在 prod build 下成立。

## 生产部署

生产形态是**单进程单端口**：api 内置静态 serve（`WEB_DIST_DIR` 指向 `web/dist`），同一端口承载 web 静态 + `/api`（HTTP+WS）+ `/p/` 短路径；Cloudflare Tunnel / 反向代理只需把流量指向这一个端口。

```text
浏览器 ──→ Cloudflare Tunnel / 反向代理 ──→ api 进程（web 静态 + /api/* + /p/*）
```

### Docker Compose（推荐）

```bash
git clone https://github.com/BanKnight/agents-remote.git
cd agents-remote
cp .env.example .env    # 设置 APP_PASSWORD（登录密码）
docker compose up -d
# 浏览器开 http://<host>:8080
```

镜像由 CI 发布（`git tag v<semver>` 触发 GitHub Actions → GHCR）；升级 `docker compose pull && docker compose up -d`。会话记录（Claude 历史、Codex 会话、应用设置、项目文件）全部落在 `./data/` 目录，备份 = 备份该目录——详见 [Deployment Runbook](./docs/runbooks/deployment.md) 的落点表。

### systemd（裸机自托管）

```bash
bun run build
sudo cp deploy/agents-remote.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now agents-remote
```

配置走 `~/.agents-remote/config.yaml`；资源约束（`MemoryMax`）与自动重启（`Restart=always`）已内置在单元里。

### 环境变量（可选，优先于 config.yaml）

| 变量 | 说明 |
|---|---|
| `APP_PASSWORD` | 登录密码 |
| `PROJECTS_ROOT` | 项目目录根路径 |
| `API_PORT` | API 端口（默认 43011）|
| `WEB_PORT` | Web 端口（默认 43012）|
| `MCP_PORT` | 内嵌 MCP hub 端口（默认 43013，仅 127.0.0.1）|
| `WEB_DIST_DIR` | web 构建产物目录；设置后 api 直接 serve 静态站点 |
| `AGENTS_REMOTE_RUN_DIR` | 运行时目录（token-secret + 会话元数据）|

三种形态的完整手册（compose 落点表 / 裸 docker run / systemd / CI 发布 / troubleshooting）：[docs/runbooks/deployment.md](./docs/runbooks/deployment.md)。

### PWA

应用支持安装为 PWA（桌面和移动端），安装后图标为「智控」。Service Worker 用 `precacheAndRoute` 缓存所有构建产物（`index.html` + JS/CSS chunk + 图标 + 字体），`navigateFallback: index.html` 让 SPA 导航与 reload 秒开（走 precache、无网络等待）。不缓存 `/api` 与 WebSocket（非导航请求，天然不受影响）。

## 开发

### 质量门禁

```bash
bun run format:check   # oxfmt 格式检查
bun run lint           # oxlint（0 warning 0 error）
bun run typecheck      # TypeScript 类型检查
bun run test           # 单元测试
bun run e2e            # Playwright E2E 测试
```

### 常用命令

```bash
bun run dev             # 并行启动 API dev + Web prod preview
bun run dev:api         # 仅启动 API（dev，43011）
bun run dev:web         # 仅启动 Web（prod preview，43012）
bun run dev:web:hmr     # Web HMR 逃生口（纯 UI 迭代，不代表 PWA 行为）
bun run build           # 生产构建
```

## License

MIT
