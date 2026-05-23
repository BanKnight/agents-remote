# intents

本文件记录本 change 的来源：可能来自用户原始意图，也可能来自 roadmap 规划出的铺垫、验证、质量或治理工作。

## 来源意图

- 编号：4
  原始意图：用户希望 `api` 启动时可以通过参数或环境变量指定 `PROJECTS_ROOT`，并把其一级子目录识别为 project。
- 编号：6
  原始意图：用户希望登录成功后进入 Project 列表页，并能从 `PROJECTS_ROOT` 读取和展示 project 列表。
- 编号：7
  原始意图：用户希望 `project` 被定义为 `PROJECTS_ROOT` 下的一级真实目录，而不是需要额外数据库建模的复杂工作空间对象。
- 编号：8
  原始意图：用户希望新建 Project 时只输入路径或文件夹名称，Project 名称自动由最终文件夹名决定。
- 编号：9
  原始意图：用户希望 Project 列表卡片展示项目名称、路径，并可逐步展示 Git 分支、Agent Session 数量、Terminal Session 数量和最近打开时间。
- 编号：33
  原始意图：用户希望所有涉及 project、文件、Git、tmux 启动目录的路径都统一走同一个 `PROJECTS_ROOT` 下的安全解析逻辑，避免每个模块各写一套路径拼接和校验。
- 编号：78
  原始意图：用户希望第一步新建 project 只创建目录或使用已存在目录，不做 git clone、模板初始化或脚手架；这些可以以后作为 project 创建增强。
- 编号：79
  原始意图：用户希望新建 project 时，如果路径在 `PROJECTS_ROOT` 内且目录已存在，就直接把它作为 project 使用；如果不存在则创建；如果是文件或越界路径则报错。
- 编号：80
  原始意图：用户希望由于 project 只来自 `PROJECTS_ROOT` 的一级子目录，第一步不支持嵌套 project，因此 project 名称由一级目录名唯一约束，不需要额外支持不同路径同名 project。
- 编号：81
  原始意图：用户希望最近打开时间可以后续再做；第一步 Project 列表优先展示名称、路径、Agent Session 数量、Terminal Session 数量，Git 分支可按实现成本决定是否显示。
- 编号：108
  原始意图：用户希望第一步可以用 project 的一级目录名作为 URL 参数，但所有 API 内部必须通过 `PROJECTS_ROOT` 安全解析到真实路径；如果名称包含特殊字符，前端负责 URL encode/decode。

## 规划来源

- 类型：工程整理
- 原因：Project 是文件、Git、Terminal 和 Agent Session 的统一作用域，路径安全必须集中实现。
- 支撑目标：提供 Project 列表、新建、进入和后续模块复用的安全路径解析能力。
- 前置关系：依赖 `configure-personal-app-settings`；被 Session Runtime、Files、Git changes 依赖。

## 分配说明

- 所属 version：v0.2-project-console-shell
- 分配原因：Project 模型是登录后控制台和所有项目内能力的入口。
