# Risks Design

## Change

- change-id：build-responsive-pwa-console-shell

## 主要风险

- PWA installability 不完整：manifest 字段或 icons 不满足浏览器要求，导致手机无法安装。
- 占位 UI 误导用户：原型中的 session/terminal 信息如果被做成 mock 数据，用户会误以为 runtime 已接入。
- Project URL 参数特殊字符处理不完整：含空格、中文或 URL-sensitive 字符的 Project 可能无法进入详情。
- service worker 过早引入：缓存实时控制台数据或认证状态会带来难以验证的问题。
- 桌面端布局空洞：只按手机宽度拉伸会导致 PC 可用但低效。

## 跨子域权衡

- 产品上需要“像 App 一样打开”，技术上不必一次性实现完整 PWA lifecycle；选择静态 manifest 平衡范围和可验证性。
- UI 上需要贴近原型，架构上必须避免伪造真实 runtime；优先保留结构位置和空状态。
- 前端可以先做本地 view model，但不能把未验证的 AgentSession 字段推进 `packages/shared`。

## 依赖与阻塞

- `setup-monorepo-service-boundaries` 已完成，提供 `web/api/shared` 和 `/api` 边界。
- `implement-project-model-and-safe-paths` 已完成，提供 Project list/detail/create 和 Project identity。
- 不依赖 `design-session-runtime-boundaries` 即可完成 shell；但真实 session 数据接入受其约束。

## 验证建议

- 运行 `bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`。
- 使用浏览器打开 web，验证根入口、Project 创建/进入、Project console 默认 Agent 焦点。
- 使用移动端或浏览器设备模拟检查窄屏布局和底部 affordance。
- 用 DevTools Application 或 Lighthouse/PWA 检查 manifest、theme_color、icons、standalone。
- 验证 Terminal/Git/Files 入口不会执行真实写操作或 runtime 操作。

## 开放问题

- 真机安装测试是否可在当前环境完成；如果环境不支持，需要在 verify 中明确限制和替代证据。

## 后续沉淀候选

- PWA installability 验证清单可沉淀到 frontend runbook 或 design 文档。