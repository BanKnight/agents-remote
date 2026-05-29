# Design Overview

本文件汇总本 change 的设计范围、子域选择和整体设计结论。

## Change

- change-id：refine-prototype-assets-guidelines
- 所属 version：v0.9-prototype-assets-guidelines

## 输入依据

- context：.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/context.md
- specs：.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/specs/prototype-assets-guidelines/spec.md
- 相关长期 docs：docs/project.md；docs/design/prototype/index.md；docs/design/prototype/guidelines.md；docs/design/prototype/screenshots/index.md；docs/design/frontend-ui-architecture.md
- 当前 prototype 资产：docs/design/prototype/home.html；project-detail.html；agent-session-detail.html；terminal-instance-detail.html；files.html；git.html；terminal.html；overview.html

## 设计范围

### 本次覆盖

- 重构 `overview.html` 的信息架构：从单列混合 iframe 列表改为按页面分组的 desktop/mobile iframe pair 总览。
- 将 `overview.html` 明确为评审入口，不作为正式截图来源。
- 在现有 `guidelines.md` 内补齐 token、组件、viewport、响应式和公共抽象规范，不拆新 token/components 文档。
- 将跨页面重复的 prototype 颜色、字体、布局、shell、navigation、surface、row、status、action、input、terminal/code 等基础抽为公共 prototype foundation。
- 更新 `docs/design/prototype/screenshots/` 的 7 个单页 prototype desktop/mobile 截图和 screenshots index。
- 按需更新 `docs/design/prototype/index.md` 对 overview/guidelines/screenshots 的关系描述。

### 本次不覆盖

- 不修改 Web app React 业务 UI。
- 不新增真实多主题功能或 theme switcher。
- 不把 `overview.html` 的 iframe 渲染作为正式截图依据。
- 不改写已归档 `v0.8-prototype-ui-alignment` 的运行态 evidence。
- 不改变 prototype 表达的产品能力边界，例如 Files/Git 只读、Terminal workspace 不承载 runtime input 等。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 用户目标和非目标已由 context/spec 明确，本 change 不新增产品能力。 |
| ui-ux | 是 | 需要定义 overview 评审体验、viewport、响应式、截图来源和 token/组件规范的用户可理解形态。 |
| frontend | 是 | 需要明确静态 HTML/CSS 资产结构、公共 prototype foundation、截图采集和索引维护的工程边界。 |
| architecture | 否 | 不改变系统架构、Web app 架构或运行协议；公共 prototype foundation 属于静态前端资产组织，放在 frontend design 足够。 |
| api | 否 | 不涉及 API。 |
| data | 否 | 不涉及数据模型。 |
| business-rules | 否 | 不改变业务规则。 |
| error-handling | 否 | 不涉及运行时错误处理；截图/资产风险在 risks 中收口。 |
| risks | 是 | 需要集中记录 overview 被误用为截图源、公共抽象过度/不足、截图漂移等跨子域风险。 |

## 总体设计结论

- 采用单 change 完成 prototype 资产规范化：同一设计与实现路径覆盖 overview、guidelines、公共 foundation、screenshots 和索引，避免分散 change 造成规范和资产不同步。
- `overview.html` 采用页面分组结构，每个 page section 包含 desktop preview 与 mobile preview 两个 iframe；对于当前 7 个 standalone prototype 页面，总 iframe 数必须为 14。
- 正式截图流程不经过 overview iframe；截图脚本或人工采集必须直接打开 standalone HTML，并使用 guidelines 中声明的标准 viewport：desktop `1440x1000`，mobile `390x844`。
- 跨页面公共基础优先用静态 prototype CSS foundation 表达，例如 `prototype-foundation.css`。每个 standalone page 仍保持独立 HTML entry，但不再复制完整 token、shell、navigation、surface、component 基础样式。
- `guidelines.md` 作为现有设计规范继续承载具体值和规则，不额外拆分 token/components 文档；后续如规范明显膨胀，再由新的 change 评估文档拆分。

## 关键决策

- 页面分组优先于 viewport 分组：reviewer 的自然任务是逐页比较 desktop/mobile，而不是先看所有 desktop 再看所有 mobile。
- overview iframe 应有固定可读的外框尺寸和标签，但只能服务总览；如果 iframe 被截图，会混入 overview chrome，不符合正式基线。
- 公共抽象放在 prototype 资产层，而不是直接借用 Web app shell components；prototype 是设计基线，Web app 是实现，两者需要可对照但不互相耦合。
- 保持 standalone HTML entry：每个页面仍能被浏览器直接打开和截图，公共 CSS 只是被引用的静态基础。
- screenshots 更新必须和 index 更新绑定，防止截图文件存在但读者无法判断 viewport、页面状态或用途。

## 开放问题

- 无阻塞开放问题。公共 CSS 文件名和具体拆分粒度可在 plan/implementation 中根据现有重复样式确定。

## 后续沉淀候选

- `docs/design/prototype/guidelines.md`：长期 design token、组件、viewport 和响应式规范。
- `docs/design/prototype/overview.html`：长期 prototype review entry。
- `docs/design/prototype/screenshots/`：长期 prototype screenshot baseline。
- `docs/design/prototype/index.md` 与 `docs/design/prototype/screenshots/index.md`：长期索引说明。
