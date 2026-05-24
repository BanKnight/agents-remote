# personal-app-config spec

本文件记录单个 change 对 `personal-app-config` 的行为契约增量。

## Change 来源

- change-id：configure-personal-app-settings
- 来源意图：
  - 编号：87：第一步必要配置包括 `APP_PASSWORD`、`PROJECTS_ROOT`、`web/api` 本机端口，以及 `web` 访问 `api` 的配置；其他配置先不引入。
  - 编号：115：允许通过环境变量配置 runtime dir，例如 `AGENTS_REMOTE_RUN_DIR`，默认使用 `/run/agents-remote`。
  - 编号：116：`api` 启动时自动创建 runtime dir；权限不足或创建失败时给出明确错误提示。
  - 编号：117：静态/持久化数据放在 `~/.agents-remote` 下，而不是 `/run/agents-remote/`。
  - 编号：118：`~/.agents-remote` 第一轮主要放应用自身持久化配置或轻量状态，不放项目文件或 Agent 输出完整历史。
  - 编号：119：`APP_PASSWORD` 等应用配置可以写入 `~/.agents-remote` 配置文件；不强制只通过环境变量配置。
  - 编号：120：创建或更新配置文件时尽量设置为仅当前用户可读写；权限不安全时给出警告或自动修正。
  - 编号：121：配置文件作为个人部署默认方式；环境变量可以覆盖配置文件。
  - 编号：122：`api` 启动时检查配置；缺少必要配置时给出清晰错误和示例配置路径/内容。
  - 编号：123：`PROJECTS_ROOT` 放在配置文件里作为默认配置；环境变量仍可覆盖。
  - 编号：124：`web/api` 端口和 `web` 访问 `api` 的地址也可以放在配置文件里；环境变量仍可覆盖。
  - 编号：125：配置文件第一步使用 TOML 格式。
  - 编号：126：默认配置文件路径为 `~/.agents-remote/config.toml`。
  - 编号：127：首次启动没有 `config.toml` 时，`api` 自动生成带示例值/注释的模板文件，然后提示填写必要配置后重启；不要用不安全默认密码直接启动。
  - 编号：128：`projects_root` 要求使用绝对路径；相对路径启动时报错并提示改成绝对路径。
- 规划来源：个人私有部署需要安全、可手改、可覆盖的配置入口，并区分运行态目录与持久化配置目录。

## ADDED Requirements

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

## MODIFIED Requirements

- （无）

## REMOVED Requirements

- （无）
