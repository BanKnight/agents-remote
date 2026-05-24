# Risks Design

## Change

- change-id：setup-monorepo-service-boundaries

## 主要风险

- 直接使用 npm latest 可能违反 7 天供应链安全规则；Vite、Tailwind、TanStack、Vitest 在 2026-05-24 的 latest 均存在发布不足 7 天的情况。
- `packages/shared` 被滥用为业务逻辑共享层，导致路径安全、runtime 控制或 provider 适配逻辑跨边界泄漏。
- Vite dev proxy 与生产部署路径不一致，导致本地可用但生产同域 `/api` 或 WebSocket 转发失败。
- WebSocket proxy 若使用 `rewriteWsOrigin` 可能引入 CSRF 风险。
- 当前 change 只预留测试入口，如果被误解为已完成 E2E 质量基线，会遗漏真实 web/api/runtime 集成验证。
- Cloudflare Tunnel 示例如果写得像应用托管能力，可能误导后续把外部部署资源纳入应用管理。

## 跨子域权衡

- 保持 `web/api` 分离增加本地服务数量，但为未来前端分离、hub 化和独立部署保留边界。
- 同域 `/api` 简化用户配置和认证/CORS，但把正确转发责任放到部署层和 dev proxy 配置上。
- TanStack + Jotai 明确职责后能降低状态混乱，但会比单一 React state 多一层工程约束。
- 不引入 Next.js 降低第一轮复杂度，但放弃 SSR/App Router 一体化能力；这符合当前控制台/PWA 场景。

## 依赖与阻塞

- 本 change 无 roadmap 前置依赖。
- 后续 `configure-personal-app-settings` 依赖本 change 确定配置和服务边界。
- 后续 `build-responsive-pwa-console-shell` 依赖本 change 确定 `web` 技术基础。
- 后续 `setup-e2e-quality-baseline` 依赖本 change 提供测试命令入口和同域 `/api` 代理基础。

## 验证建议

- 验证根 workspace 能发现 `web`、`api`、`packages/shared`。
- 验证 `web` dev server 通过 `/api` 访问本机 `api` HTTP endpoint。
- 验证 `/api` 下 WebSocket upgrade 可以被 dev proxy 转发。
- 验证 `packages/shared` 不依赖 `web` 或 `api` 内部模块。
- 验证脚本入口包含安装、开发、构建、类型检查和基础测试/质量检查入口。
- 实现阶段重新检查 npm 版本发布时间，确保选定版本满足 7 天规则，或获得用户明确确认。

## 开放问题

- 是否把 `/api/health` 纳入本 change 实现，还是留给 `configure-personal-app-settings` 或第一条 API change。
- 是否需要立即引入 Vitest，还是先用 Bun test 作为基础入口。
- 是否需要在当前 change 写部署说明文档，还是 plan-change 中只创建示例配置注释。

## 后续沉淀候选

- `docs/architecture/monorepo-service-boundaries.md`
- `docs/design/frontend-stack.md`
- `docs/runbooks/deploy-path-routing.md`
