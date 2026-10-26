# Deployment Runbook — Docker / docker compose / systemd 三形态

> 2026-10-27 部署形态批。三种形态共用同一个前提：**api 内置静态 serve**（`WEB_DIST_DIR`）——单进程单端口承载 web 静态 + `/api`（HTTP+WS）+ `/p/` 短路径，无需独立 web 服务器或反代层。Cloudflare Tunnel 留在应用管理之外（`docs/specs/service-access-boundary/spec.md`），只需把流量指向这一个端口。

## 形态一：docker compose（推荐，别人开箱即用）

```bash
git clone https://github.com/BanKnight/agents-remote.git
cd agents-remote
cp .env.example .env      # 唯一必填：APP_PASSWORD（登录密码）
docker compose up -d      # 拉取 ghcr.io 镜像并启动
# 浏览器开 http://<host>:8080
```

| 项 | 值 |
|---|---|
| 入口端口 | `${PORT:-8080}` → 容器内 4311（web 静态 + /api + /p/ 同端口） |
| 自动重启 | `restart: unless-stopped` + healthcheck（`/api/health`，免鉴权） |
| 资源约束 | `MEM_LIMIT`（默认 4g，罩住 claude/tmux 子进程树）+ `PIDS_LIMIT`（默认 512） |
| 升级 | `docker compose pull && docker compose up -d` |
| 本地构建 | 注释 compose 里 `image:`、启用 `build: .`，`docker compose up -d --build` |

### 会话记录落点（容器场景的「指定目录」）

三个 bind mount 收口到 `./data/`，**备份 = 备份整个 `./data/`**：

| 宿主目录 | 容器内 | 内容 |
|---|---|---|
| `./data/home` | `/home/agent` | `~/.claude/`（Claude OAuth 登录态 + `projects/<项目>/<会话>.jsonl` 权威历史）、`~/.codex/`、`~/.agents-remote/`（config.yaml、用户设置含 API key preset、chat 元数据、pi 历史 `chat-sessions/pi-jsonl/`、push 密钥） |
| `./data/run` | `/data/run` | `token-secret`（登录 token 签名密钥）+ `sessions/*.json`（实例/会话元数据，跨重启恢复的权威）+ stderr 日志 |
| `./data/projects` | `/data/projects` | 项目工作区（`PROJECTS_ROOT`，agent 操作的真实文件） |

### 已知取舍

- **容器重启丢容器内 tmux 会话**：运行中的 agent/terminal 实例进程随容器消亡（与「API 重启丢进行中 turn」同语义，Gen 3 刻意取舍）。元数据已持久（`data/run/sessions/`），重启后在 UI 重新拉起即可。
- **token-secret 丢失 = 所有已登录设备掉线**（可接受，重新登录即可）。
- 镜像内置 claude CLI（随 node_modules）与 codex CLI（npm 全局装）；**omp/ACP 未内置**——`docker exec -it agents-remote bash` 自装（装进 `data/home` 的部分随卷持久）。

## 形态二：裸镜像 docker run（自定义拓扑）

```bash
docker run -d --name agents-remote \
  -p 8080:4311 \
  -e APP_PASSWORD=... \
  -v "$PWD/data/home:/home/agent" \
  -v "$PWD/data/run:/data/run" \
  -v "$PWD/data/projects:/data/projects" \
  ghcr.io/banknight/agents-remote:latest
```

## 形态三：systemd 系统 service（裸机自托管）

```bash
cd /home/deploy/workspace/agents-remote
bun run build          # 产出 api/dist/index.js + web/dist/
sudo cp deploy/agents-remote.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now agents-remote
systemctl status agents-remote
```

- 配置走既有 `~/.agents-remote/config.yaml`（无需 env；env 覆盖仍可用）。
- 资源约束：`MemoryMax=4G` + `TasksMax=512`（罩住整棵 agent 子进程树）。
- 自动重启：`Restart=always` + `RestartSec=3`。
- 与本机 ar-dev dev 服务并存时改 `config.yaml` 的 `api_port` 错开（dev 43011/43012）。

## 国内网络补充

### 部署侧：拉取 GHCR 镜像慢/失败

ghcr.io 国内直连通常可用但可能偏慢。镜像仓库（GHCR）不走 Docker Hub，daemon 的 `registry-mirrors` 配置对它**不生效**——用公开代理前缀替换拉取后 tag 回标准名（以代理实际可用性为准，如 `ghcr.nju.edu.cn`）：

```bash
docker pull ghcr.nju.edu.cn/banknight/agents-remote:latest \
  && docker tag ghcr.nju.edu.cn/banknight/agents-remote:latest ghcr.io/banknight/agents-remote:latest
docker compose up -d
```

### 构建侧：本机验证 build 拉基础镜像

Docker Hub 直连可能被重置；本机既有惯例是 mirror 前缀拉取后 tag 回标准名（Dockerfile 保持标准名，不进 git 污染）。CI（GitHub Actions 海外 runner）构建不受此影响：

```bash
docker pull docker.1ms.run/library/node:22-slim && docker tag docker.1ms.run/library/node:22-slim node:22-slim
docker pull docker.1ms.run/oven/bun:1 && docker tag docker.1ms.run/oven/bun:1 oven/bun:1
docker build -t agents-remote:local .
```

## CI 镜像发布流程

- `git tag v<semver> && git push origin v<semver>` → `.github/workflows/docker-image.yml` → `ghcr.io/banknight/agents-remote:{semver, major.minor, latest}`（linux/amd64）。
- 推 tag 是外发动作，执行前确认。
- 首次发布后 GHCR 包默认 private，公开化在 GitHub 仓库 → Packages → 该包 → Package settings → change visibility（想公开分发时做一次）。

## Troubleshooting

| 症状 | 排查 |
|---|---|
| 启动即退，日志 `CONFIG_REQUIRED` | 容器：确认传了 `APP_PASSWORD`（entrypoint 首启引导 config.yaml）；裸机：填 `~/.agents-remote/config.yaml` |
| healthcheck 不通过 | `docker logs agents-remote` 看启动错误；确认 4311 在监听（`docker exec agents-remote bun -e "fetch('http://127.0.0.1:4311/api/health').then(r=>r.text()).then(console.log)"`） |
| 页面 404 / 白屏但 /api 正常 | 确认 `WEB_DIST_DIR=/app/web/dist` 在（compose/unit 已带）；`docker exec agents-remote ls /app/web/dist` |
| 项目目录写不进（权限） | bind mount 宿主目录属主须与容器内 agent（uid 1000）一致：`chown 1000:1000 <dir>` |
| claude 登录态丢失 | 检查 `./data/home/.claude` 挂载是否生效（`docker exec agents-remote ls /home/agent/.claude`） |
