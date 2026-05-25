# project

本文件记录项目认知 big picture。它帮助新成员或 Agent 理解项目是什么、服务谁、有哪些基本领域概念与长期准则。

本文件是渐进式补全的，不要求一次写完整。只写已经确认或可以从项目事实可靠推导的内容。

## 项目定位

<!-- 项目是什么，解决什么问题，为什么存在。 -->

- 构建一个优化版本的 hapi，提供网页控制平面，用于管理与控制服务器上的 Agent 会话与执行。
- 首期必须支持至少两类 Agent：Codex 与 Claude，并为后续扩展其他 Agent 保留统一接入面。

## 用户与场景

<!-- 项目服务的用户、角色、使用场景和核心目标。 -->

- 主要用户是需要远程调度与观察 Agent 的操作者（个人开发者或小团队）。
- 核心场景是在浏览器中发起、控制与查看服务器 Agent 任务，而不依赖本地终端常驻操作。

## 核心领域概念

<!-- 项目中反复出现、影响讨论和设计的领域概念。 -->

- **Web Control Plane**：浏览器端与服务端控制 API 组成的控制层，负责任务发起、状态可视化与操作入口。
- **Console Shell**：登录后的 Web/PWA 控制台外壳，以 Project 为作用域，默认聚焦 Agent Sessions，并提供 Terminal、Git、Files 的辅助入口；当前已接入 Agent/Terminal Session 运行态入口、只读 Files 浏览/预览和只读 Git diff 查看。
- **Session Runtime**：Project-scoped Agent Session 与 Terminal Session 的运行态能力；使用 internal session id、runtime metadata 和明确的 reconnect/close 语义连接浏览器控制面与服务器运行实例。
- **Agent Runtime**：服务器上的 Agent 执行环境，负责 Agent Session 生命周期、provider CLI/adapter 启动与结果回传；当前重点对接 Codex 与 Claude。
- **Project**：`PROJECTS_ROOT` 下的一级真实目录，是控制台、Files、Git、Terminal Session 和 Agent Session 的统一作用域；第一轮不需要数据库注册。
- **PROJECTS_ROOT**：个人部署配置中的绝对路径，是当前服务器内 Project 能力和 project-scoped 路径访问的根信任边界。

## 代码与文档结构

<!-- 开发期需要先建立的目录结构认知。 -->

- `web/` 是 React + Vite 前端控制台，负责路由、PWA 外壳、Project Console、Agent/Terminal/Files/Git 等用户可见交互。
- `api/` 是 Bun 服务端，负责认证、个人配置、Project 模型、安全路径解析、Session Runtime、Files API、Git diff API 和 provider/runtime 入口。
- `packages/shared/` 保存跨 `web`/`api` 边界共享的 DTO、状态 union 和错误码；不要把服务端实现细节或前端组件状态放进 shared。
- `e2e/` 与 `scripts/run-e2e.ts` 维护端到端质量基线：临时 `PROJECTS_ROOT`/runtime dir、自动启动 web/api、真实浏览器路径和真实 tmux/WebSocket Terminal smoke。
- `.workflow/` 是运行态工作区：intents、roadmap、active changes、progress、tasks、verify artifacts 和 archive；它不是长期知识库。
- `docs/` 是长期沉淀区：项目 big picture、长期 specs、design、architecture、ADR、runbooks 和 research；已验证且可复用的知识应在 distill 后进入这里。

## 技术与架构概览

<!-- 技术栈、系统边界、关键模块、集成关系等基本认知。 -->

- Monorepo 使用 Bun workspaces：根包编排 `web`、`api` 与 `packages/*`，常用质量门禁是 `bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`。
- 前端栈是 React 19、Vite、TypeScript、TanStack Router、TanStack Query、Jotai、Tailwind CSS；TanStack Query 负责服务端状态，Jotai 只用于 shell 级共享 UI 状态，局部 section 状态优先留在组件内。
- 服务端运行在 Bun 上，Project-scoped 能力优先使用 Web 标准 `Request` / `Response` 边界和 shared DTO；需要执行系统命令时使用 argv 数组调用 `Bun.spawn`，避免 shell 字符串拼接。
- 系统分为网页控制层与服务器执行层：前者聚焦控制体验，后者聚焦 Agent 调度与执行稳定性。
- 控制层与执行层通过统一的 Agent 控制接口协作，避免将 Codex/Claude 差异暴露到用户操作层。
- Project 模块位于 `api` 内，统一负责 Project 列表、创建/采用和 `PROJECTS_ROOT` 安全路径解析；Files、Git、Terminal 和 Agent 等下游能力必须复用 Project-safe 解析。
- `web` 提供移动端优先的深色 PWA Console Shell；第一轮 PWA 只承诺静态 manifest/icons/meta 和 standalone 外壳，离线缓存、通知和 service worker lifecycle 以后续设计为准；登录后移动端首页以 Project 进入路径为主，Create/Adopt Project 是低频次级入口；Project 工作区移动端以返回/Project 上下文、Files/Git 功能区、Agent Sessions、Terminal Sessions 的顺序组织，不常驻 shell-level runtime input；Agent/Terminal Session detail 使用紧凑 header、主输出区和非遮挡式输入控制区承载真实输入与快捷键。
- Session Runtime 由 `api` 内的 SessionRegistry、runtime metadata、tmux adapter 和 Project-scoped HTTP/WebSocket stream 组成；`packages/shared` 只保存 session DTO、状态、stream envelope 与错误码。

## 容易犯错的边界

<!-- 开发中反复容易出错、需要先提醒自己的稳定约束。 -->

- `roadmap.md` 只保存活跃 version/change 索引和当前焦点；单个 change 的阶段状态只看 `progress.md`，原始意图只看 change 自己的 `intents.md`。
- `docs/project.md` 必须作为开发期 big picture 入口主动维护；当 change 暴露出项目结构、技术栈、运行约束、易错边界或 workflow 准则时，distill 阶段不能只更新 capability docs，还要判断是否补充本文件。
- 一个 change 完成 distill 后，如果它是所在 version 的最后一个未完成 change，应立即触发 version 归档检查；不要让已完成 version 长时间停留在活跃 roadmap。
- UI 或浏览器可见能力的 verify 不能只记录测试通过；应保存截图、trace、日志或 Playwright artifact，并把 artifact 路径写入 `verify.md`。
- 移动端登录后页面应以动态视口高度、明确局部滚动区域、`min-w-0`、长文本截断/换行和克制固定区域避免页面级横向溢出；不要只靠全局隐藏 overflow 掩盖不可达内容。Project 工作区尤其不要常驻固定底部 runtime input；真实输入应进入 Agent/Terminal Session detail 后出现。Session detail 的输入控制区也不应 fixed/floating 遮挡输出，应参与全高布局，并把 quick keys 放在文本输入框上方。
- 开发和验证时不要反复启动新的 web/api 端口；长驻服务必须优先复用或重启明确命名的 tmux session，避免端口递增、孤儿进程和日志丢失。
- Project-scoped API 不得信任客户端传入路径；涉及文件系统、Git、Terminal 或 Agent 工作目录时，必须通过 `PROJECTS_ROOT` 和 Project-safe resolver 收敛到 Project 边界内。
- Files/Git inspection 当前都是只读能力；不要在这些入口中引入 edit/delete/upload/download/stage/reset/checkout/commit/push/pull/rebase/merge 等写操作。

## 开发准则

<!-- 代码风格、API、UI、数据、测试、安全、文档等长期准则。 -->

- 业务实现与工作流优化并行推进：每个业务 change 应明确对应的 workflow 改进点或复用经验。
- 先保证可控性与可观测性，再扩展能力：涉及 Agent 控制的功能应优先提供状态可见、操作可回溯。
- 跨 Agent 能力优先抽象到统一控制语义，尽量避免把供应商特性直接固化到控制面交互。
- 新增跨边界 API 时，先定义 shared DTO/error，再实现 api service/route/test，最后接入 web client/UI/e2e；shared 只表达协议，不承载业务实现。
- 前端 section 的 server state 优先用 TanStack Query；文件选择、当前路径、当前 diff 文件等局部交互状态优先用组件 state，不要扩大到全局状态。
- Git、tmux、provider CLI 等系统命令必须使用 argv 数组执行，并将 Project path、scope、file path 等输入先做边界校验。
- 开发和验证过程中，长驻服务进程应优先使用 `tmux` 管理，例如 `web`、`api`、E2E 依赖服务或调试用 runtime；用明确的 tmux session 名区分不同服务，便于后台常驻、查看日志、重启和有序关闭，避免依赖临时 shell 或用杀进程方式清理。该准则只约束开发/验证工作流，不等同于产品内 Agent/Terminal Session 的 runtime 设计决策。

## 文档与知识沉淀规则

<!-- 哪些内容需要沉淀到 docs，change 完成后如何提炼长期认知。 -->

- change 完成并通过 verify 后，应检查是否有长期项目认知需要提炼到本文件；如果不更新 `docs/project.md`，应在 distill 输出或 progress 记录中说明原因。
- `docs/project.md` 应优先沉淀跨 change 复用的 big picture：项目结构、技术栈、架构边界、易错点、开发/验证准则和长期术语。
- 不把单次实现细节、临时问题或任务状态写入本文件。

## 待补充

<!-- 明确记录还缺哪些项目认知，不伪装成已知。 -->

- （待补充）
