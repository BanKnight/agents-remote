# tasks

## 执行顺序

1. 基础/阻塞任务：先审计现有 prototype 页面、重复样式、overview 结构和 screenshots/index 基线。
2. 核心实现任务：先抽 shared prototype foundation 并 refactor standalone HTML，再重构 overview 和扩展 guidelines。
3. 集成与验证任务：在 HTML/CSS/docs 稳定后刷新 screenshots、维护索引并执行结构/静态检查。
4. 清理与横切任务：更新 tasks/progress，确保无未记录阻塞。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 审计 prototype 资产基线
  - 验收标准：确认 7 个 standalone HTML、当前 `overview.html` iframe 结构、现有 screenshots 14 张命名、`guidelines.md` 缺口和跨页面重复 CSS primitive；不修改长期 docs 正文。
  - 结果：已确认 7 个 standalone HTML 与 14 张 screenshot 命名完整；当前 overview 是 7 个单 iframe；重复样式集中在 token、body/page/intro/stage/frame、navigation、surface、row、status、action、input、terminal/code 等 primitive；Files/Git 只读、Terminal direct workspace 无 runtime input、mobile direct/deep navigation 边界继续作为实现约束。
  - 任务承诺清单：
    - 确认 standalone 页面集为 `home.html`、`project-detail.html`、`agent-session-detail.html`、`terminal-instance-detail.html`、`files.html`、`git.html`、`terminal.html`。
    - 确认当前 overview 差距是 7 个单 iframe，而目标是 7 个 page section × 2 iframe。
    - 识别应进入 shared foundation 的 token/primitive 类型：color、typography、spacing、radius、shadow、page/stage/frame、navigation、surface、row、status、action、input、terminal/code。
    - 确认 Files/Git 只读、Terminal workspace 无 runtime input、mobile direct/deep navigation 规则不能被改写。
  - 依据：`plan.md`；`specs/prototype-assets-guidelines/spec.md`；`design/overview.md`；`design/frontend.md`；`design/risks.md`；`docs/project.md`；`docs/design/frontend-ui-architecture.md`
  - 必读上下文：`docs/design/prototype/index.md`；`docs/design/prototype/guidelines.md`；`docs/design/prototype/screenshots/index.md`；`docs/design/prototype/*.html`
  - 修改范围：`.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/tasks.md` 任务状态记录；必要时 change `artifacts/` 中的审计输出
  - 依赖：无
  - 并行：否（阻塞后续抽象和截图刷新）

### 2. 核心实现任务

- [x] 2.1 建立 shared prototype foundation 并 refactor standalone 页面
  - 验收标准：新增或更新 `docs/design/prototype/prototype-foundation.css`；7 个 standalone HTML 均引用该 CSS；跨页面 token、base reset、page/stage/frame、navigation、surface、row、status、action、input、terminal/code 等公共样式不再完整散落在每个页面内；页面仍可直接用浏览器打开。
  - 结果：已新增 `prototype-foundation.css` 并让 7 个 standalone HTML 引用；公共 token、page/stage/frame、navigation、workspace、bottom nav、status、terminal/code 和 input 基础已集中到 foundation；页面特有 Project card、Agent card、Files preview、Git diff、Terminal list 和 Meta popover 等样式保留在各自 HTML。
  - 任务承诺清单：
    - 保留每个 standalone HTML 的独立入口和页面特有信息架构。
    - 抽公共 foundation，但不把 Files/Git/Terminal/detail 的特有状态强行合并或隐藏。
    - 不引入构建步骤、CDN、npm 依赖或外部网络资源。
    - 保留真实能力边界：Files/Git 只读，Terminal direct workspace 不出现 runtime input，detail/input 规则保持原型语义。
    - 保持 desktop shell、phone shell、safe-area、bottom navigation 和 input drawer 的稳定尺寸与滚动边界。
  - 依据：`plan.md`；`specs/prototype-assets-guidelines/spec.md`；`design/frontend.md`；`design/risks.md`；`docs/project.md`；`docs/design/frontend-ui-architecture.md`
  - 必读上下文：`docs/design/prototype/*.html`
  - 修改范围：`docs/design/prototype/prototype-foundation.css`；`docs/design/prototype/home.html`；`project-detail.html`；`agent-session-detail.html`；`terminal-instance-detail.html`；`files.html`；`git.html`；`terminal.html`
  - 依赖：1.1
  - 并行：否（会触碰所有 standalone HTML，需集中避免 class/style 漂移）

- [x] 2.2 重构 overview 为 page-grouped desktop/mobile iframe 总览
  - 验收标准：`docs/design/prototype/overview.html` 包含 7 个 page sections、14 个 iframe；每个 section 有 page title、用途说明、standalone link、desktop label/iframe、mobile label/iframe；页面说明明确 overview 是 review overview，不是正式 screenshot source。
  - 结果：已重构为 7 个 `page-section`、14 个 iframe、7 个 standalone link、7 个 desktop label 和 7 个 mobile label；顶部说明 overview 只用于总览评审，正式截图需直接打开 standalone HTML 并使用 desktop `1440x1000` / mobile `390x844`。
  - 任务承诺清单：
    - 页面顺序沿用 Home、Project Agent workspace、Agent detail、Terminal detail、Files、Git、Terminal workspace。
    - 每个 standalone page 恰好出现一组 desktop/mobile preview。
    - iframe 尺寸服务 overview 可读性，不被写成正式 screenshot viewport。
    - overview 可直接打开，不依赖构建、网络或运行服务。
  - 依据：`plan.md`；`specs/prototype-assets-guidelines/spec.md`；`design/overview.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`docs/design/prototype/overview.html`；7 个 standalone HTML 文件名和页面用途
  - 修改范围：`docs/design/prototype/overview.html`
  - 依赖：2.1
  - 并行：可与 2.3 连续或并行（不同文件，但共享 page list 和术语，推荐连续执行）

- [x] 2.3 扩展 guidelines 具体 token、组件、viewport 和响应式规则
  - 验收标准：`docs/design/prototype/guidelines.md` 在现有结构基础上补齐具体值；包含 color、typography、spacing、radius、shadow、layout/frame、navigation、surface、row、button/action、status pill、input、terminal/code 等规格；明确 desktop `1440x1000`、mobile `390x844`；明确 desktop、mobile direct secondary、mobile deep/detail、safe area、fixed bottom nav/input padding 和 screenshot source 规则。
  - 结果：已原地扩展 guidelines，补齐 asset/screenshot source、viewport 标准、design token 表、尺寸/圆角/阴影/字体、导航、响应式矩阵、组件规格、配色/密度和 public foundation 边界；关键词检查确认 `1440x1000`、`390x844`、`prototype-foundation.css`、`overview.html`、`standalone HTML`、Files/Git 只读和 `runtime input` 边界均存在。
  - 任务承诺清单：
    - 不拆出新的 token/components markdown 文档。
    - 规范值与 `prototype-foundation.css` 中实际 token/primitive 对齐。
    - 写清 overview review 与 standalone screenshot capture 的区别。
    - 写清跨页面 primitive 应复用 shared foundation，页面特有状态可保留在 standalone HTML。
    - 保留只读 Files/Git、Terminal direct/detail 输入职责和 mobile direct/deep navigation 边界。
  - 依据：`plan.md`；`specs/prototype-assets-guidelines/spec.md`；`design/ui-ux.md`；`design/frontend.md`；`docs/project.md`；`docs/design/frontend-ui-architecture.md`
  - 必读上下文：`docs/design/prototype/guidelines.md`；`docs/design/prototype/prototype-foundation.css`；7 个 standalone HTML
  - 修改范围：`docs/design/prototype/guidelines.md`
  - 依赖：2.1
  - 并行：可与 2.2 连续或并行（不同文件，但需要共享术语，推荐连续执行）

### 3. 集成与验证任务

- [x] 3.1 刷新 standalone screenshots 并更新 screenshots index
  - 验收标准：直接打开 7 个 standalone HTML，按 desktop `1440x1000` 和 mobile `390x844` 各采集一张截图，共 14 张 PNG；不从 overview iframe 截图；`docs/design/prototype/screenshots/index.md` 描述刷新后的截图、viewport 和 source 规则。
  - 结果：已用 `artifacts/capture-prototype-screenshots.mjs` 直接打开 7 个 standalone HTML 并刷新 14 张 PNG；采集日志写入 `artifacts/capture-prototype-screenshots.log`；`screenshots/index.md` 已写明 standalone source、desktop `1440x1000`、mobile `390x844` 和 overview review-only 边界。
  - 任务承诺清单：
    - 截图文件命名沿用现有 `*-desktop.png` / `*-mobile.png` 基线。
    - 采集来源必须是 standalone HTML。
    - 若使用临时 Playwright/Bun harness，命令、日志或脚本输出记录到 change `artifacts/` 或 verify 证据中。
    - 刷新后检查每个 PNG 非空且路径被 index 引用。
  - 依据：`plan.md`；`specs/prototype-assets-guidelines/spec.md`；`design/frontend.md`；`design/risks.md`
  - 必读上下文：`docs/design/prototype/screenshots/index.md`；7 个 standalone HTML；`docs/design/prototype/guidelines.md`
  - 修改范围：`docs/design/prototype/screenshots/*.png`；`docs/design/prototype/screenshots/index.md`；按需 `.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/artifacts/`
  - 依赖：2.1、2.2、2.3
  - 并行：否（必须捕获最终 HTML/CSS 状态）

- [x] 3.2 更新 prototype index 并执行局部结构/静态检查
  - 验收标准：`docs/design/prototype/index.md` 描述 standalone HTML、overview、guidelines、screenshots 的关系；结构检查确认 overview 7 sections/14 iframes/standalone links；guidelines 检查确认 token/组件/viewport/响应式章节和 `1440x1000`、`390x844`；screenshot 检查确认 14 张 PNG 与 index 一致；运行 `git diff --check`。
  - 结果：已更新 `docs/design/prototype/index.md`；结构检查确认 overview sections=7、iframes=14、standalone links=7，guidelines 必备术语存在，14 张 PNG 无缺失且均被 screenshot index 引用；`git diff --check` 通过。
  - 任务承诺清单：
    - index 说明 overview 是总览评审入口，standalone HTML 是正式截图和详细评审入口。
    - 不把 overview iframe 截图写成正式基线。
    - 不引入 Web app React 变更或 v0.8 archive 变更。
    - 若浏览器/截图检查无法完整执行，必须在任务结果和后续 verify 中说明缺失证据。
  - 依据：`plan.md`；`specs/prototype-assets-guidelines/spec.md`；`design/risks.md`；`docs/AGENTS.md`
  - 必读上下文：`docs/design/prototype/index.md`；`docs/design/prototype/overview.html`；`docs/design/prototype/guidelines.md`；`docs/design/prototype/screenshots/index.md`
  - 修改范围：`docs/design/prototype/index.md`；`.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/tasks.md`；`.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/progress.md`
  - 依赖：3.1
  - 并行：否（最终收口任务）

## 依赖图

- 1.1 → 2.1 → 2.2 → 3.1 → 3.2
- 1.1 → 2.1 → 2.3 → 3.1 → 3.2

## 可并行任务

- 2.2 与 2.3 在 2.1 完成后理论上可并行，因为修改不同文件；推荐同一执行轮连续完成，以保持 page list、viewport 和 screenshot source 术语一致。

## 阻塞项

- （无）