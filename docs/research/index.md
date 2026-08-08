# research 索引

本层用于沉淀调研资料、调研过程与调研结论，服务后续决策与长期知识复用。

## 子目录

- [inbox/](./inbox/) — 未定型调研区：带调研但方案未定、尚未进入实现期的意图文档。非沉淀结论，定型后须迁出至 `docs/research/` 根或 `docs/specs/`。见 `./inbox/index.md`。

## 文档

- [agent-access-options.md](./agent-access-options.md) — 汇总 hapi、remodex、Codex、Claude 与社区反馈对 Agent 接入路线、第一轮真实可用链路和统一协议设计的调研结论。
- [claude-cli-stream-protocol.md](./claude-cli-stream-protocol.md) — Claude CLI stdio stream-json 协议完整文档：消息类型、system.init 字段、control_request 机制、生命周期和集成方式；三维度运行态配置（model/permission/effort）见 claude-cli-runtime-config.md。
- [claude-cli-runtime-config.md](./claude-cli-runtime-config.md) — Claude CLI 运行态三维度（model/permission/effort）对接：每维度的默认值决策链、spawn 初始值、stream-json 运行时切换，含 TUI vs 无头能力差异、官方二进制字面量与实测证据、竞品方案（hapi fork）与本项目对接现状。
- [claude2-replay-performance.md](./claude2-replay-performance.md) — Claude2 长会话打开慢的性能分析与验收基线：数据流成本模型、实测数字（客户端已排除，主因在传输）、实施路径与验收标准。
- [claude2-ios-keyboard-viewport.md](./claude2-ios-keyboard-viewport.md) — iOS Safari 键盘三症状（页面被推/失焦不恢复/输入框被挡）的根因：双 viewport 模型 + iOS 26 回归 bug，为什么 CSS/meta 救不了，visualViewport JS 方案方向。
- [claude-code-integration-projects.md](./claude-code-integration-projects.md) — 调研 hapi、xylocopa、claude-squad、claude-code-sdk-ts、claude-code-webui 等 5 个 Claude CLI 集成项目的 model 和 permission mode 处理策略对比。
- [xylocopa-analysis.md](./xylocopa-analysis.md) — xylocopa 项目深度分析：多实例 Claude Code 编排系统，tmux + git worktree 隔离，四层消息同步管线，模型硬编码与权限系统的完整剖析。
- [web-terminal-tmux-attach.md](./web-terminal-tmux-attach.md) — Web terminal 共享终端的 attach 模式架构调研：capture-pane 半态根因、竞品对照（ttyd/gotty vs VSCode 系 vs orca）、tmux 多端尺寸协调（window-size/resize-window/aggressive-resize）、Bun 原生 PTY 落地、orca 可丢/可借鉴清单，结论是废弃 capture-pane 改 tmux attach。
- [design-prototyping-tool-research.md](./design-prototyping-tool-research.md) — AI 设计/原型工具赛道调研（OpenDesign 嵌入可行性）：三派竞品全景（设计编辑器派 / Prompt→产物 agent 派 / App builder 派）+ Reddit 社区评价；OpenDesign 源码逐行深剖（DESIGN.md 契约、skills/CLI/MCP 三件套、AG-UI adapter、GenUI surface 两套机制、iframe sandbox 渲染），结论是 npm 上零个可装包、只能 fork，最小复刻切入点为 GenUI declarative surface + iframe sandbox 预览。
- [skill-marketplace.md](./skill-marketplace.md) — Skill 市场/包管理功能调研：skills.sh 公开 search API 实测（只有 name/installs/source，无 description，无公开详情端点）、vercel-labs/skills（npx skills）CLI 能力边界与可 wrap 性（执行类命令可 wrap、查询类走 API）、cc-switch 产品对标（发现页+管理面板+源管理三件套、自实现 GitHub zipball 安装、SHA-256 更新检测、per-app 开关）、Claude/Codex 安装目录映射、agents-remote 现有 reload-skills 闭环/catalog 扫描/markdown 预览的复用点、安全边界（路径穿越 + 执行信任模型）、两条技术路线（wrap CLI vs 自实现）对比与未决问题。
- [pages-static-hosting.md](./pages-static-hosting.md) — pages 静态托管技术方案（已细化，待实现）：per-project 静态目录托管（类 nginx 简化），6 个决策点已定（配置文件位置、URL 路由 + 默认无 auth per-根可选开启、安全边界、弱 ETag 缓存、配置即启用、复用 Files 安全读取原语），参考 Cloudflare Drop 默认无 auth 设计；三个新需求（wiki/pages/browser）统筹排序中 pages 排第一，wiki/browser 调研见 `./inbox/`。
- [pi-access-options.md](./pi-access-options.md) — 第四个 agent runtime「pi」接入调研（决策未做）：pi/omp 本体与 fork 关系、四 entry point（interactive/print/rpc/ACP）+ Node SDK、扩展生态（跨 harness skills 互通 / extensions / 「No MCP」立场 / SDK 定制性）、同类项目接入方式因果（spawn vs 库嵌入的分水岭是「要不要终端形态」非轻重）、MonkeyCode→OhMyAgent 国产案例（含私有边界与推断标注）、与本项目基线对照、接入路径初步倾向（路径 B rpc spawn）与纳入分层（L1 skills / L2 MCP 降级 / L3 extensions）；含证据分级、待 PoC 清单与开放问题，承接 agent-access-options.md。
- [provider-config-comparison.md](./provider-config-comparison.md) — Continue / hapi / Claude Code 如何拆「运行时 · provider · 协议 · 模型」四层的调研（决策未做）：Continue 扁平 model 列表 + provider 属性 + AUTODETECT 自动发现、hapi flavor 注册表（AgentRegistry）、Claude Code env 注入；对 agents-remote「preset 耦合四层」现状的耦合点分析与可借鉴方向；含证据定位、证据分级与开放问题，承接 agent-access-options.md 与 claude-cli-runtime-config.md 的 provider 配置视角。
- [plugin-extension-system.md](./plugin-extension-system.md) — 插件（Plugin）扩展体系方案蓝图：扩展 = skill + mcp 两类 × 全局 + 项目两层作用域，agent 实例消费合并结果；含 7 项已对齐决策记录（wrap claude mcp / 手写技能挂源可更新 / 项目 tab 入口等）、现状盘点（skill 全局层缺口 + mcp 仅内部 hub）、项目插件入口设计、后端能力增量与实现前必做调研（claude mcp 命令行为、npx skills 更新机制）；承接 skill-marketplace.md 与 mcp-hub-positioning.md。
