# Frontend Design

## Change

- change-id：refine-prototype-assets-guidelines

## 前端范围

- 范围是长期 prototype 静态资产，不是 Web app React 前端。
- 目标目录：`docs/design/prototype/`。
- 受影响文件类型：standalone HTML、overview HTML、prototype CSS foundation、guidelines markdown、screenshots PNG、prototype index markdown。
- 不引入 npm 依赖，不修改 Vite/React/Tailwind/shadcn app 代码。

## 模块划分

- Standalone page HTML：`home.html`、`project-detail.html`、`agent-session-detail.html`、`terminal-instance-detail.html`、`files.html`、`git.html`、`terminal.html` 仍是正式页面入口和截图入口。
- Overview review entry：`overview.html` 只负责汇总展示 standalone pages 的 desktop/mobile iframe pair。
- Shared prototype foundation：新增或更新一个共享静态 CSS 基础文件，例如 `prototype-foundation.css`，承载跨页面 token、base reset、shell/frame、navigation、surface、row、status、action、input、terminal/code 等公共样式。
- Guidelines：`guidelines.md` 记录 token/组件/viewport/响应式要求；不拆新 token/components markdown。
- Screenshots：`screenshots/*.png` 和 `screenshots/index.md` 记录按标准 viewport 采集的正式截图基线。

## 组件边界

- 公共 CSS foundation 负责：
  - Design tokens：颜色、字体、间距、圆角、阴影、边框、状态色。
  - Shared layout：`.page`、`.intro`、`.stage-grid`、desktop/mobile frame shell。
  - Shared navigation：一级/二级 rail、bottom nav、active item、back/top return。
  - Shared primitives：icon mark、status pill、action button、list row、surface panel、terminal window、code/diff line、input drawer。
- Standalone HTML 负责：
  - 页面特有信息架构和示例内容。
  - 页面特有状态组合，例如 Files preview、Git diff、Agent detail Meta、Terminal focused shell。
  - 对公共 class 的组合，不重复声明公共 token 和基础组件样式。
- Overview 负责：
  - page metadata 列表和 iframe pairing。
  - review chrome 和 standalone link。
  - 不复用为 screenshot capture source。

## 状态管理

- 静态 prototype 不引入运行时状态管理。
- 页面内部如有演示性展开/浮窗/抽屉，优先继续使用静态 HTML/CSS 或极少量内联脚本；若已有交互脚本，应保持仅服务 prototype 展示，不引入真实 app state。
- Screenshot capture 状态由 viewport 和 standalone file path 决定，不由 overview state 决定。

## 路由 / 页面接入

- 所有 standalone page 路径保持不变，避免破坏现有 docs/index、截图脚本和外部引用。
- `overview.html` iframe src 指向同目录 standalone HTML。
- 如果新增 `prototype-foundation.css`，standalone pages 和 overview 都通过相对路径引用它。
- `docs/design/prototype/index.md` 必须说明：standalone HTML 是正式截图和详细评审入口；overview 是总览评审入口；guidelines 是规范入口；screenshots 是正式截图基线。

## 工程约束

- 不新增构建步骤；prototype assets 仍可直接用浏览器打开。
- 不依赖 CDN 或外部网络资源。
- CSS foundation 要保持纯静态、可审查，不引入预处理器。
- 正式截图 viewport 标准写入 guidelines，并在实现/verify 使用同一标准：desktop `1440x1000`，mobile `390x844`。
- 更新截图时应直接打开 standalone HTML，而不是截图 overview iframe。
- 保持文件名稳定，避免无必要破坏历史链接。
- 如果使用脚本采集截图，脚本应记录执行日志或在 verify 中引用命令输出；脚本不需要长期保留，除非 plan/tasks 明确要求。

## 关键决策

- 使用共享 CSS foundation 是最小可维护抽象：比继续复制每页 `<style>` 更一致，也比引入构建系统更轻。
- 不把 prototype 公共基础直接绑定到 React shell primitives：两者角色不同，prototype 是设计输入，React 是产品实现；长期 docs 负责映射语义。
- 不新增多主题文件；但 token 命名按角色设计，让未来主题切换可以替换变量而不是改页面结构。
- Overview 用数据化 page list 或重复 section 都可接受；如果使用内联数据渲染，需要仍保持无依赖、可直接打开。

## 风险与权衡

- 抽 CSS foundation 会触碰所有 prototype 页面，截图差异面较大；必须通过全量 screenshot refresh 和 browser review 把差异显性化。
- 过度抽象可能掩盖 page-specific states；因此公共 foundation 只抽跨页面结构和值，页面特有内容和布局组合保留在 page HTML。
- 手动截图容易遗漏页面；plan/tasks 应要求检查 7 个页面各 desktop/mobile 共 14 张截图全部更新。

## 开放问题

- 无阻塞开放问题。具体 CSS 文件名建议为 `prototype-foundation.css`，但最终可在 implementation 阶段按现有文件组织确认。

## 后续沉淀候选

- `prototype-foundation.css` 作为长期 prototype 公共基础。
- `guidelines.md` 中的 token、组件、viewport 和响应式章节。
- `screenshots/index.md` 中的 viewport/source 说明。
