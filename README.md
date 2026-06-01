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

编辑生成的 `~/.agents-remote/config.toml`，至少填写：

```toml
app_password = "your-password"
projects_root = "/path/to/your/projects"
api_port = 43011
web_port = 43012
```

### 3. 启动开发服务

```bash
# 同时启动 API + Web
bun run dev

# 或分别启动
bun run dev:api   # API on port 43011
bun run dev:web   # Web on port 43012
```

打开 `http://localhost:43012`，输入密码即可使用。

## 生产部署

### 构建

```bash
bun run build
```

构建产物输出到各 package 的 `dist/` 目录。

### 部署架构

```text
浏览器 ──→ Cloudflare Tunnel / 反向代理 ──→ Web 静态资源
                                              ──→ /api/*  → API 服务
                                              ──→ /api/ws/* → WebSocket (需 upgrade 支持)
```

推荐使用 tmux 管理 API 进程，固定端口避免漂移：

```bash
# 创建 tmux session
tmux new-session -d -s ar-dev

# 在 tmux 内启动 API
tmux send-keys -t ar-dev 'bun run --filter @agents-remote/api dev' Enter
```

### 环境变量（可选）

可通过环境变量覆盖 `config.toml` 中的配置：

| 变量 | 说明 |
|---|---|
| `APP_PASSWORD` | 登录密码 |
| `PROJECTS_ROOT` | 项目目录根路径 |
| `API_PORT` | API 端口（默认 43011）|
| `WEB_PORT` | Web 端口（默认 43012）|
| `AGENTS_REMOTE_RUN_DIR` | 运行时目录（默认 /run/agents-remote）|

### PWA

应用支持安装为 PWA（桌面和移动端）。安装后图标为「智控」，支持离线缓存静态资源。Service Worker 仅缓存图标和 manifest，不缓存导航 HTML 和 API 请求。

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
bun run dev             # 启动 API + Web 开发服务
bun run dev:api         # 仅启动 API
bun run dev:web         # 仅启动 Web
bun run build           # 生产构建
```

## License

MIT
