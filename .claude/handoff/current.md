# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-14（**claude-code CLI 升级 2.1.299 已 commit `52fc6d0`**；同日：浮层回焦 `7b83976`/`8eb4a4e` 已验收、卡形制 `641e7d5`、空隙同构 `488ad68`、滚动条+发送按钮 `ae2397b`）

## 一句话状态

用户点名两大新能力（插件 Mods + 状态协议）→ claude-code CLI 2.1.268 → 2.1.299 升级完成（`52fc6d0`）：api 单测 905 全绿、真实链路探查通过（stream-json 握手 + modelMapping env 注入实测 `result success ok`）、OSC 7501 headless 不可达实锤（状态接线需 PTY）。功能接入是后续批次。

## 本 session 焦点

### 关键决策（不可丢）

- **claude-code CLI 升级 2.1.299（`52fc6d0`）**：供应链 <7 天豁免 = 用户显式指定 + 官方日更 CLI + 消费面窄（零 SDK 类型 import、协议无破坏性变更——ping 已处理、plugin_errors[].path 增量）。api respawn 后 spawn 即用新 CLI。
- **OSC 7501 状态协议 headless pipe 不可达**（两轮探查实证，stdout/stderr 均无 `\x1b]7501;`）——「状态」能力接线需 **PTY spawn**（Bun 原生 PTY 有先例调研）或等 CLI 提供流内状态事件。这是后续状态功能批的核心设计输入。
- **CLI alias 解析表随版本走**（2.1.299：sonnet→claude-sonnet-5-5，网关不认）——项目 modelMapping（`buildSpawnEnv` 注入 `ANTHROPIC_DEFAULT_*_MODEL`）实测免疫（带映射 env → result success ok）；未注入映射的裸 spawn 会 422（探查脚本踩到过）。
- **（沿用）「关闭不回焦」两族通用约定**（spec §5.0，frontend-notes §33）：移动浮层基座统一拦 onCloseAutoFocus，桌面不拦。
- **（沿用）composer 口径以 agent 为标尺**；xterm 滚动条用户多测中。

### 进度

- ✅ claude-code 升级 2.1.299 `52fc6d0`（探查：OSC 7501 pipe 不可达 / 映射免疫 / plugin 子命令面正常）
- ✅ 浮层关闭回焦 `7b83976` 真机验收通过；卡形制 `641e7d5` / 空隙同构 `488ad68` / 滚动条+发送按钮 `ae2397b`
- ⏳ **后续功能批候选（用户「后续我们都要用上」）**：①状态权威源 = PTY + OSC 7501 解析驱动工作台三态显示；②插件管理 UI（settings 管理通道已有 CLI 面：plugin configure/install/marketplace）。均需产品设计先行，未排期。

### 阻塞 / 风险

- 无阻塞。风险：2.1.299 为发布当天版本，真实使用若见异常（回放/权限请求/模型切换）先查 CLI 行为变化（changelog 见 `/tmp/cc-changelog.md`，2.1.269-299 段）。

## 易丢的关键上下文

- **两大能力调研结论**（changelog 2.1.269→299 全量消化的压缩版在 inbox.md ✅ 行）：插件主线 = Claude Mods（2.1.287 引入，hooks 拦 prompt/tool/UI + $.state + mod API 面）；状态主线 = OSC 7501（2.1.295）+ subagentStatusLine.agentType（2.1.293）。
- **2.1.288 后台 Bash 限时 30min（默认）**——仅无人值守 session；长驻交互式 stream-json 会话是否受限待真实使用观察。
- **2.1.285 第三方 provider 下 `-p` 默认 auto mode**——本项目显式传 `--permission-mode` 覆盖；真实权限请求行为交真机观察。
- 探针纪律（沿用）：`systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`；一次性诊断不入库用后删（本批 `_diag-osc7501.mjs` 已删）。
- 验证用测试项目（PROJECTS_ROOT/test），不在正式项目建 session。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-14 11:30；触发原因：claude-code CLI 升级批收尾（commit 52fc6d0 + handoff 滚动）
