# personal-app-config spec

本文件记录 `personal-app-config` 的长期行为契约。它是主线 WHAT，不记录实现方案、任务拆解或单次 change 过程。

## Purpose

- 为个人私有部署提供安全、可手改、可环境变量覆盖的最小配置入口。
- 明确持久化配置目录与运行态目录的边界，避免项目数据、Agent 输出或 runtime socket/lock 混入错误位置。

## Requirements

### Requirement: API loads first-round configuration from config file and environment overrides

系统 SHALL 以 `~/.agents-remote/config.toml` 作为个人部署默认配置文件，并允许环境变量覆盖配置文件中的第一轮必要配置。

#### Scenario: Configuration file provides defaults

- **WHEN** `api` 启动且 `~/.agents-remote/config.toml` 存在并包含必要配置
- **THEN** 系统从该 TOML 文件读取 `APP_PASSWORD`、`PROJECTS_ROOT`、`web/api` 本机端口和 `web` 访问 `api` 的地址等第一轮配置

#### Scenario: Environment overrides configuration file

- **WHEN** 配置文件和环境变量同时提供同一项第一轮配置
- **THEN** 系统使用环境变量的值作为最终配置

#### Scenario: Unsupported configuration is omitted from first round

- **WHEN** 第一轮配置行为被评审
- **THEN** 必要配置范围不包含多用户、角色权限、团队协作、设备管理或 hub/server 连接列表

### Requirement: Missing first-run configuration creates a safe template and stops startup

系统 SHALL 在首次启动缺少默认配置文件时生成示例 TOML 配置文件，并拒绝用不安全默认密码启动。

#### Scenario: Default config file is missing

- **WHEN** `api` 启动且 `~/.agents-remote/config.toml` 不存在
- **THEN** 系统创建带示例值或注释的 TOML 模板文件，并提示用户填写必要配置后重启

#### Scenario: Generated template lacks safe runnable credentials

- **WHEN** 系统生成默认配置模板
- **THEN** 模板不会让 `api` 以不安全的默认 `APP_PASSWORD` 直接进入可用状态

#### Scenario: Required configuration remains missing

- **WHEN** 配置文件存在但缺少 `APP_PASSWORD` 或 `PROJECTS_ROOT` 等必要配置
- **THEN** `api` 启动失败，并显示缺失项、默认配置路径和可参考的配置内容

### Requirement: Projects root must be absolute

系统 SHALL 要求 `PROJECTS_ROOT` / `projects_root` 使用绝对路径。

#### Scenario: Projects root is absolute

- **WHEN** `api` 启动并读取到绝对路径形式的 `PROJECTS_ROOT` / `projects_root`
- **THEN** 该路径可以作为后续 project 安全解析的根目录输入

#### Scenario: Projects root is relative

- **WHEN** `api` 启动并读取到相对路径形式的 `PROJECTS_ROOT` / `projects_root`
- **THEN** `api` 启动失败，并提示用户改为绝对路径以避免启动目录改变导致项目根变化

### Requirement: Persistent application data lives under the user app directory

系统 SHALL 将应用自身的持久化配置或轻量状态放在 `~/.agents-remote` 下，并禁止把项目文件或 Agent 输出完整历史放入该目录作为第一轮行为。

#### Scenario: Persistent config is stored

- **WHEN** 系统需要读取或创建个人部署配置文件
- **THEN** 默认位置位于 `~/.agents-remote/config.toml`

#### Scenario: Project or agent output storage is reviewed

- **WHEN** 第一轮数据存储边界被评审
- **THEN** `~/.agents-remote` 不被用作 project 文件、Agent 输出完整历史或运行中 socket/lock 的存储位置

### Requirement: Config file permissions are restricted or reported

系统 SHALL 在创建或更新 `~/.agents-remote/config.toml` 时尽量限制为仅当前用户可读写，并在权限不安全时给出警告或修正。

#### Scenario: Config file is created

- **WHEN** 系统创建 `~/.agents-remote/config.toml`
- **THEN** 该文件权限尽量设置为仅当前用户可读写

#### Scenario: Config file permissions are unsafe

- **WHEN** `api` 启动时发现配置文件权限对其他用户过度开放
- **THEN** 系统给出明确警告或自动修正权限

### Requirement: Runtime directory is separate from persistent configuration

系统 SHALL 使用运行态目录保存当前运行实例、session metadata、socket/lock 等运行态信息，并允许通过 `AGENTS_REMOTE_RUN_DIR` 覆盖默认 `/run/agents-remote`。

#### Scenario: Runtime dir uses default

- **WHEN** `AGENTS_REMOTE_RUN_DIR` 未设置
- **THEN** 运行态目录默认使用 `/run/agents-remote`

#### Scenario: Runtime dir is overridden

- **WHEN** `AGENTS_REMOTE_RUN_DIR` 已设置
- **THEN** 系统使用该路径作为运行态目录，以支持无权限环境或本地调试

#### Scenario: Runtime dir is created at startup

- **WHEN** `api` 启动且运行态目录不存在
- **THEN** 系统尝试创建运行态目录

#### Scenario: Runtime dir cannot be created

- **WHEN** `api` 启动时运行态目录创建失败或权限不足
- **THEN** `api` 启动失败，并显示明确的目录路径和权限错误信息

#### Scenario: Runtime data boundary is reviewed

- **WHEN** 第一轮运行态数据边界被评审
- **THEN** 运行态目录只用于当前运行实例、session metadata、socket/lock 等运行态信息，不用于长期配置、历史或项目数据

## Notes

- `PROJECTS_ROOT` 的目录遍历、project 安全解析和越界防护属于后续 project 能力，但其根路径输入必须在本 capability 中先校验为绝对路径。
- Web/PWA 登录页面和认证过期跳转体验由后续 UI/PWA change 承接；本 capability 只定义配置、启动与运行目录行为契约。

## 来源

- change：configure-personal-app-settings
- verify 证据：`.workflow/changes/configure-personal-app-settings/verify.md`
