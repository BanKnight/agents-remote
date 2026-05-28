# Design Overview

本文件汇总本 change 的设计范围、子域选择和整体设计结论。

## Change

- change-id：establish-prototype-alignment-baseline
- 所属 version：v0.8-prototype-ui-alignment

## 输入依据

- context：.workflow/versions/v0.8-prototype-ui-alignment/changes/establish-prototype-alignment-baseline/context.md
- specs：.workflow/versions/v0.8-prototype-ui-alignment/changes/establish-prototype-alignment-baseline/specs/prototype-ui-alignment-baseline/spec.md
- 相关长期 docs：docs/project.md；docs/design/prototype/index.md；docs/design/prototype/guidelines.md；docs/design/frontend-ui-architecture.md；docs/design/console-shell.md；docs/design/mobile-session-interaction.md
- 技术资料确认：Context7 shadcn/ui Vite + Tailwind v4 docs；Context7 lucide-react docs；npm package metadata checked 2026-05-28

## 设计范围

### 本次覆盖

- 设计 version shared 下三份运行态材料的结构和使用边界：`alignment-contract.md`、`design-system-note.md`、`follow-up-gaps.md`。
- 明确后续页面 changes 如何读取 shared、如何回写修正、如何保存 desktop/mobile 原型与真实页面 artifacts。
- 明确 prototype HTML 与 React/shadcn 实现之间的等价判断：视觉、布局、交互和状态语义优先，不做 DOM/class/pixel-perfect。
- 明确 shadcn/ui、lucide-react、Tailwind CSS 4、React 19、Vite、TanStack Router/Query、Jotai 的使用边界与版本安全注意事项。

### 本次不覆盖

- 不直接实现页面 UI。
- 不安装 shadcn/ui、lucide-react 或其他依赖；安装和代码改动留给后续实现阶段。
- 不新增 API、数据协议、runtime 能力、Files/Git 写操作、light mode 或 PWA 离线/通知能力。
- 不把 shared 运行态材料直接沉淀进 `docs/`。

## 子域选择

| 子域 | 是否创建 | 原因 |
|---|---|---|
| product | 否 | 产品目标和非目标已由 context/spec 覆盖，本 change 不新增用户能力。 |
| ui-ux | 是 | 需要定义原型验收口径、Prototype Map、viewport、可接受差异和视觉/交互基线。 |
| frontend | 是 | 需要定义 shadcn/ui、lucide-react、tokens、primitives、状态管理和工程约束。 |
| architecture | 否 | 不改变系统分层、API、runtime 或数据边界。 |
| api | 否 | 本 change 不定义接口。 |
| data | 否 | 本 change 不定义数据模型。 |
| business-rules | 否 | 本 change 不改变业务规则。 |
| error-handling | 否 | 非 happy path 只作为 UI 状态口径写入 ui-ux/frontend，不需要独立错误设计。 |
| risks | 是 | 需要集中收口跨 change shared 漂移、依赖版本安全和原型/能力冲突风险。 |

## 总体设计结论

- `alignment-contract.md` 是验收契约，面向 specify/design/implement/verify 阶段的对齐判断；它应包含 Prototype Map、viewport、artifacts、可接受差异、不可接受差异、结构断言边界和缺口记录规则。
- `design-system-note.md` 是实现契约，面向 React UI 编写、组件抽象和 review；它应包含暗色 console tokens、surface/density/status/terminal/input drawer/mobile navigation 规则、shadcn/ui 边界、lucide-react 图标体系、不抽象清单和 `vercel-react-best-practices` 加载要求。
- `follow-up-gaps.md` 是缺口登记表，面向本 version 内所有页面 change 和最终 verify；它记录本轮不解决但后续需要查验或规划的原型缺口、能力冲突和缺失 API。
- 后续页面 change 必须先消费 shared，再做页面级 spec/design/implementation；如果页面实现证明 shared 不准确，应回写 shared，而不是在页面 context 中私有化新规则。

## 关键决策

- 原型还原的主参考是 HTML 原型，prototype screenshots 作为浏览器渲染辅助参考。
- 标准 viewport 固定为 desktop `1440x1000` 和 mobile `390x844`，原型文件中的桌面端和手机端形态必须分别记录。
- 验收以视觉、布局、交互和状态语义等价为准，允许 React/shadcn DOM 包装差异、少量字体渲染差异和 1-2px 间距/阴影差异。
- shadcn/ui 只作为交互语义、可访问性和基础组件来源；视觉由本项目从原型提炼的 tokens、variants 和 console primitives 接管。
- lucide-react 作为统一图标来源，但实现前必须按当时 npm 元数据选择满足 7 天安全规则的版本。
- 现有 TanStack Router/Query/Jotai 分工保持不变，只有导航/返回/detail 语义无法表达时才做最小调整。

## 开放问题

- shadcn/ui 初始化时需要的最小组件集需由后续页面 design/plan 根据真实使用决定。
- `shadcn@latest` 与 `lucide-react@latest` 在 2026-05-28 查询时均为 7 天内发布版本，implementation plan 前需要重新确认可用版本或等待窗口。
- 现有页面与 HTML 原型的具体视觉差距尚未逐页核对，留给后续页面 changes。

## 后续沉淀候选

- 经本 version 验证后的原型对齐口径可沉淀到 docs/design/frontend-ui-architecture.md。
- 经本 version 验证后的 design system 基线可考虑沉淀为长期 design system 文档。
