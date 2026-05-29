# plan

## Change 目标

- 完成 prototype 静态资产规范化：让 `overview.html` 成为按页面分组的 desktop/mobile 总览评审入口，让 standalone HTML 继续作为正式截图和详细评审来源。
- 在现有 `guidelines.md` 中补齐可执行 token、组件、viewport 和响应式规则，并通过共享 prototype foundation 减少跨页面 HTML/CSS 漂移。
- 刷新 7 个 standalone prototype 页面在 desktop/mobile 标准 viewport 下的正式截图基线，并同步维护 prototype 与 screenshots 索引。

## 局部 big picture

- 本 change 承接已归档 `v0.8-prototype-ui-alignment` 的结果：v0.8 已把 React UI 对齐到现有 HTML prototype，本 change 反过来加固 prototype 资产本身，使后续 UI alignment 不再依赖散落内联样式、隐含 viewport 或容易误用的 overview 截图。
- 本 version 只有当前 change；完成后长期 prototype 入口、规范、截图和公共基础应共同成为后续 Web UI 对齐的设计输入。
- 本 change 修改的是 `docs/design/prototype/` 长期 prototype 资产，不修改 Web app React 业务 UI，也不改写 v0.8 archive 证据。

## 执行策略

- 先审计当前 prototype 页面和截图/索引，确认 7 个 standalone 页面、现有重复 token/primitive、当前 overview 单 iframe 差距和截图命名基线。
- 再新增或更新一个静态 `prototype-foundation.css`，抽出跨页面 token、reset、页面容器、stage grid、frame shell、导航、surface、row、status、action、input、terminal/code 等公共样式。
- 在保留每个 standalone HTML 独立入口的前提下，把 7 个页面改为引用公共 foundation；页面特有布局和状态组合继续留在页面内，避免把 Files/Git/Terminal/detail 的差异抹平。
- 将 `overview.html` 重构为 review overview：7 个 page section，每个 section 包含 standalone link、desktop preview iframe 和 mobile preview iframe，并明确 overview 不是正式截图来源。
- 在现有 `guidelines.md` 内补齐具体 token/组件/viewport/响应式表述，不拆新 token/components markdown。
- 直接打开 standalone HTML 按 desktop `1440x1000`、mobile `390x844` 刷新 14 张 screenshots，并同步 `docs/design/prototype/index.md` 与 `screenshots/index.md`。

## 任务顺序依据

- 1.1 是基础审计，阻塞后续抽象和截图，因为需要先确认当前文件、重复样式和截图基线。
- 2.1 的 shared foundation 会影响所有 standalone 页面，因此必须先于 overview、guidelines 终稿和截图刷新完成。
- 2.2 overview 依赖 standalone 路径稳定，但不依赖截图；可在 foundation 改造后完成并用结构检查验收。
- 2.3 guidelines 需要反映最终 foundation token/primitive，因此应在 2.1 之后完成；可与 2.2 连续执行。
- 3.1 screenshots 必须在 HTML、foundation、overview 说明和 guidelines viewport 标准稳定后刷新。
- 3.2 索引和局部验证收口依赖前面所有资产变更，用于确认 artifact 和文档入口一致。

## 上游承诺投影

- Spec 的 overview 承诺落到 2.2 与 3.2：当前 7 个 standalone 页面必须对应 7 个 page sections、14 个 iframe、desktop/mobile label 和 standalone link。
- Spec/design 的截图来源承诺落到 2.2、3.1、3.2：overview 必须写明 review-only；正式截图必须直接打开 standalone HTML，而不是 overview iframe。
- Spec/design 的 guidelines 单文件补值承诺落到 2.3：具体颜色、字体、间距、圆角、阴影、尺寸、导航、surface、row、status、action、input、terminal/code、viewport 和 responsive 规则都必须能在 `guidelines.md` 找到。
- Spec/design 的跨页面公共基础承诺落到 2.1：重复 token 和公共 primitive 应由 `prototype-foundation.css` 承担；页面特有状态继续由 standalone HTML 保留。
- `docs/project.md` 与 `docs/design/frontend-ui-architecture.md` 的真实能力边界落到 2.1、2.3、3.2：Files/Git 继续只读，Terminal workspace 不承载 runtime input，mobile direct/deep navigation 规则不被 prototype asset refactor 改写。
- v0.8 archive 只作为截图经验、viewport 经验和能力边界追溯来源，不形成需要修改 archive 或写入 version shared 的任务约束。

## 额外上下文

- `docs/project.md`：项目 big picture、能力边界、前端/移动端开发准则和 prototype 入口。
- `docs/design/prototype/index.md`：当前 prototype 页面清单和入口说明。
- `docs/design/prototype/guidelines.md`：本次需要原地扩展的长期规范。
- `docs/design/prototype/screenshots/index.md`：当前 14 张截图命名和描述基线。
- `docs/design/prototype/overview.html` 与 7 个 standalone HTML：实现和截图的直接修改对象。
- `docs/design/frontend-ui-architecture.md`：长期 UI alignment 边界，尤其 mobile direct/deep navigation、真实能力边界和 shared primitive 语义。
- `.workflow/archive/versions/v0.8-prototype-ui-alignment/`：只按需读取 verify/artifacts 经验，不修改。

## 依赖与阻塞

### 阶段依赖

- specs 与 design 已完成；plan/tasks 完成后进入 implementation。
- implementation 完成后需要 verify 产出 `verify.md`，再由 distill 判断长期 docs 是否已经通过实现阶段完成沉淀。

### 任务依赖

- 1.1 → 2.1 → 2.2 / 2.3 → 3.1 → 3.2。
- 2.2 与 2.3 都依赖 2.1，但二者修改不同文件，可在同一轮连续完成。
- 3.1 依赖 2.1、2.2、2.3 的文件稳定，避免截图后又改视觉或规范。

### 外部依赖

- 无外部服务、数据库、权限或人工确认依赖。
- 截图刷新可使用现有 Playwright/Bun 能力或最小临时 harness；如新增临时脚本，优先放在 change `artifacts/` 并在 verify 中记录命令和输出，不要求长期保留。

## 并行机会

- 2.2 overview 结构改造和 2.3 guidelines 文档扩展在 2.1 后可以并行判断，但通常连续执行更稳，因为二者需要共享同一 page list 和 viewport 术语。
- 3.1 截图刷新不能与 HTML/CSS/guidelines 改动并行，否则截图基线可能捕获中间状态。
- 3.2 验证收口不能并行于前序任务，因为它需要检查最终文件和截图资产。

## 风险与验证重点

- Overview 被误当正式截图源：必须在 overview、guidelines、screenshots index 中同时说明 standalone HTML 才是正式截图源。
- CSS foundation 抽象不足会继续漂移；抽象过度会隐藏页面差异。验证时既检查公共 token/primitive 是否集中，也检查页面特有 Files/Git/Terminal/detail 状态仍清楚。
- Screenshot refresh 容易漏页：必须检查 7 个 standalone 页面各 desktop/mobile 共 14 张 PNG 均存在并被 index 描述。
- Guidelines 容易停留在原则：必须检查具体值，包括 desktop `1440x1000`、mobile `390x844`、safe area、fixed bottom nav/input padding、mobile direct/deep navigation。
- 静态 prototype 必须保持可直接打开：不引入构建步骤、CDN、npm 依赖或外部网络资源。

## 不做事项

- 不修改 `web/` React app、API、shared DTO、Session/Git/Files/Terminal 运行协议或 v0.8 archive 证据。
- 不把 `overview.html` 的 iframe 作为正式截图来源。
- 不新增真实多主题功能或 theme switcher。
- 不新增 Files/Git 写操作，不伪造 runtime 输出、历史、文件内容、Git diff 或 provider metadata。
- 不把运行态 workflow plan/tasks/verify 内容直接复制进长期 docs；长期 docs 只保留已实现的 prototype 资产规范。