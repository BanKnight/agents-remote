# personal deployment configuration runbook

本手册记录个人私有部署下首次配置、启动失败修正和运行目录调整的可重复操作。

## 适用范围

- 适用于第一轮个人私有部署。
- 适用于 `api` 启动前后发现配置缺失、配置无效或 runtime dir 权限不足的情况。
- 不覆盖 Cloudflare Tunnel 创建、域名配置、Claude/Codex CLI 登录或多用户权限管理。

## 前置条件

- 已在部署机器上准备好项目代码和 Bun 运行环境。
- 已决定本机 `web`/`api` 端口、`PROJECTS_ROOT` 绝对路径和单密码。
- 如果使用默认 runtime dir `/run/agents-remote`，当前用户需要有创建或写入该目录的权限；否则应配置 `AGENTS_REMOTE_RUN_DIR`。

## 首次配置流程

1. 启动 `api`。
2. 如果 `~/.agents-remote/config.toml` 不存在，`api` 会生成配置模板并停止启动。
3. 编辑 `~/.agents-remote/config.toml`，至少填写：
   - `app_password`
   - `projects_root`
   - `api_port`
   - `web_port`
   - `web_api_base_url`
4. 确认 `projects_root` 是绝对路径。
5. 确认配置文件仅当前用户可读写。
6. 重新启动 `api`。

## 环境变量覆盖

临时调试、CI 或容器部署可以用环境变量覆盖配置文件中的同名配置：

- `APP_PASSWORD`
- `PROJECTS_ROOT`
- `API_PORT`
- `WEB_PORT`
- `WEB_API_BASE_URL`
- `AGENTS_REMOTE_RUN_DIR`

环境变量只覆盖当前进程，不要求修改 `~/.agents-remote/config.toml`。

## 常见失败与处理

### CONFIG_REQUIRED

含义：配置文件缺失或必要配置为空。

处理：

1. 查看错误中提示的配置路径。
2. 按模板填写必要配置。
3. 确认没有使用空密码。
4. 重启 `api`。

### CONFIG_INVALID

含义：配置格式或约束无效，例如 `projects_root` 是相对路径或端口号不合法。

处理：

1. 查看错误中提示的字段。
2. 将 `projects_root` 改为绝对路径。
3. 将端口改为 1 到 65535 范围内的整数。
4. 重启 `api`。

### RUNTIME_DIR_UNAVAILABLE

含义：运行态目录无法创建或当前用户无权限访问。

处理：

1. 查看错误中提示的 runtime dir 路径。
2. 如果使用默认 `/run/agents-remote`，为当前用户创建并授权该目录，或改用环境变量覆盖。
3. 在无 root 权限环境中，设置 `AGENTS_REMOTE_RUN_DIR` 到当前用户可写的绝对路径。
4. 重启 `api`。

## 成功判定

- `api` 启动时没有输出 `CONFIG_REQUIRED`、`CONFIG_INVALID` 或 `RUNTIME_DIR_UNAVAILABLE`。
- `/api/health` 可用于基础健康检查，且不会泄露 secret、配置详情或认证状态。
- 受保护 `/api/*` 和 WebSocket 入口需要有效认证状态。

## 参考

- 长期配置规格：`docs/specs/personal-app-config/spec.md`
- 长期认证规格：`docs/specs/private-access-auth/spec.md`
- 验证证据：`.workflow/changes/configure-personal-app-settings/verify.md`
