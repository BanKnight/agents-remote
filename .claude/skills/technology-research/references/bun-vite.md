# Bun / Vite 默认技术基线

## 默认推荐

- Vite 默认适合作为前端应用和库的开发/build 工具，尤其是 React/Vue/Svelte 等现代前端。
- Bun 可以优先作为脚本运行器、包管理器或测试工具评估，但不要仅因速度就替换 Node runtime。
- 如果生产环境是 Node/Edge/serverless，应确认 Bun-only API 不进入运行路径。
- 工具链职责要清楚：runtime、package manager、bundler、test runner、lint/format 不要混用到不可回滚。

## 职责边界

- Bun runtime：执行 JS/TS，需确认 Node API 兼容性。
- Bun package manager：安装、lockfile、workspace。
- Vite：dev server、bundling、plugin ecosystem。
- Test runner：Vitest/Bun test/Jest/Playwright，各自边界不同。

## 常见反模式

- 因为本地快，就把 CI、部署、测试全部切到 Bun，未验证兼容性。
- Bun、pnpm、npm lockfile 混用。
- Vite app 中引入 Node-only 依赖，部署到 edge 后才发现不兼容。
- 用 Bun test 替换成熟测试栈前未确认 mock、coverage、snapshot、watch 需求。

## 需要官方确认的点

- Bun 当前 Node API 兼容性、workspace、lockfile、test coverage 支持。
- Vite 当前 framework plugin、SSR、library mode、Rolldown 相关状态。
- 部署平台是否支持 Bun runtime，或只支持 Node build/runtime。
- CI cache、lockfile、package manager support。

## 何时不适用

- 依赖 native addon、复杂 Node API 或部署平台只支持 Node。
- 团队调试 Node 工具链更成熟，Bun 迁移收益不足。
- 需要高度稳定的企业测试生态，且 Bun test 未覆盖需求。

## 输出落点

- runtime/tooling 选择进入 design-change 的 architecture 子域。
- scripts、lockfile、CI、test/build 验证进入 plan-change。
