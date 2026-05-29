# context

本文件记录单个 change 的看板上下文：它为什么存在、承接了哪些来源、当前已知边界是什么，以及需要如何通过 version shared 与其他 changes 协作。

不要把本文件写成 spec、design、plan 或任务清单；本文件只提供后续阶段开始前必须知道的上下文。

## 来源上下文

### 用户原始意图

- 编号：1
  原始意图：原型资产结构需要调整：每个 prototype 页面应是独立 HTML，`overview.html` 不应把页面内容直接混在一起，而应按页面分组，为每个页面各展示一组 desktop/mobile 两个 iframe；如果有 N 个页面，overview 中就应有 N × 2 个 iframe。overview 需要考虑 iframe 展示尺寸，定位是总览评审入口，不应直接作为截图依据；正式 prototype 截图仍应按约定分辨率直接打开对应单页 HTML 采集。`docs/design/prototype/screenshots/` 下已有截图也需要按最新规范重新采集更新。
- 编号：2
  原始意图：Prototype 设计规范需要在现有 `guidelines.md` 基础上补齐可复用 design token/组件规格，不额外拆散成新的 token/components 文档；需要明确颜色、尺寸、阴影、间隔、圆角、字体、组件形态等具体值，并点明 desktop/mobile 的标准截图分辨率以及响应式要求是什么。凡是跨页面复用的 prototype 结构、样式、组件或 token，都要合理抽象并提取为公共基础，避免每个 HTML 页面各自散写一套。即使当前不做多主题，也应按便于后续主题切换和一致性复用的方式组织。

### 主动规划上下文

- 背景：上一轮 `v0.8-prototype-ui-alignment` 已完成真实 React UI 与现有 HTML 原型的对齐，但用户指出原型资产自身还缺少更适合评审、截图和后续维护的结构。
- 需要解决的问题：当前 prototype `overview.html` 是混合总览，不清晰表达每个页面的 desktop/mobile pair；`guidelines.md` 只描述原则，缺少颜色、尺寸、阴影、间距、圆角、字体、组件形态、viewport 和响应式断点等可复用具体值；跨页面 HTML 原型中的公共结构和样式也需要合理抽象。
- 支撑的后续目标：让后续 UI alignment change 可以直接依赖稳定的 prototype 资产结构、截图基线和设计 token/组件规范，降低误读和视觉漂移。

## 当前已知边界

- 做：调整 `docs/design/prototype/overview.html` 为按页面分组的 desktop/mobile iframe 总览；在现有 `guidelines.md` 基础上补齐 token、组件、viewport、响应式和跨页面公共抽象约定；按标准分辨率重新采集 `docs/design/prototype/screenshots/` 下各单页 prototype 截图；按需更新 prototype 索引。
- 不做：不把 `overview.html` 作为正式截图来源；不新增多主题实现；不改 Web app React 业务 UI；不改变已归档 `v0.8-prototype-ui-alignment` 的运行态证据。
- 尚不确定：具体公共抽象形态需要在 design/implementation 阶段读取现有 HTML 后确定；是否需要把公共 CSS/JS 拆成单独静态文件由后续设计决定。

## 协作与共享上下文

### 同 version 间共享

#### 需要写入 shared

- 路径：无
- 内容：无
- 供谁使用：无

#### 需要读取 shared

- 路径：无
- 用途：无

### 跨 version 间共享

- 需要继承的 docs：docs/project.md；docs/design/prototype/index.md；docs/design/prototype/guidelines.md；docs/design/frontend-ui-architecture.md
- 需要追溯的 archive：.workflow/archive/versions/v0.8-prototype-ui-alignment/
- 用途：继承上一轮 prototype alignment 的页面清单、viewport 约定、artifact 经验和真实能力边界，但本 change 只修改长期 prototype 资产与规范，不修改已归档运行态证据。

### 长期沉淀候选

- 候选 docs 路径：docs/design/prototype/overview.html；docs/design/prototype/guidelines.md；docs/design/prototype/screenshots/；docs/design/prototype/index.md
- 预计沉淀内容：prototype 总览结构、标准截图分辨率、响应式要求、可复用 design token/组件值、跨页面公共原型抽象和更新后的截图基线。

## 背景引用

- version shared：无
- docs：docs/project.md；docs/design/prototype/index.md；docs/design/prototype/guidelines.md；docs/design/prototype/*.html；docs/design/prototype/screenshots/index.md；docs/design/frontend-ui-architecture.md
- archive：.workflow/archive/versions/v0.8-prototype-ui-alignment/
- 外部调研：无
