# UI/UX Design

## Change

- change-id：refine-prototype-assets-guidelines

## 页面 / 界面范围

- `docs/design/prototype/overview.html`：prototype 总览评审入口。
- 7 个 standalone prototype 页面：Home、Project Agent workspace、Agent detail、Terminal detail、Files、Git、Terminal workspace。
- `docs/design/prototype/guidelines.md`：prototype 视觉、组件、viewport 和响应式规范。
- `docs/design/prototype/screenshots/`：正式 prototype 截图基线。

## 页面结构

- overview 顶部说明当前页面是 review overview，并提示正式截图应打开 standalone HTML。
- overview 主体按页面分组，每个 section 包含：
  - 页面标题和简短用途。
  - standalone page link。
  - Desktop preview iframe。
  - Mobile preview iframe。
- 每个 preview 都应有清晰 label，标明 viewport role，而不是只靠 iframe 尺寸暗示。
- 当前 7 个页面对应 7 个 section 和 14 个 iframe。页面顺序沿用 prototype/index 与上一轮 Prototype Map：Home、Project Agent workspace、Agent detail、Terminal detail、Files、Git、Terminal workspace。

## 交互模式

- overview 支持纵向滚动浏览页面分组。
- 每个 section 的 standalone link 用于打开正式截图/详细评审来源。
- iframe 内页面可以滚动，但 overview 本身不承担最终像素基线；reviewer 需要精确检查时进入 standalone HTML。
- guidelines 中明确两类操作：
  - 总览评审：打开 overview，逐页比较 desktop/mobile 结构关系。
  - 截图采集：直接打开 standalone HTML，使用标准 viewport 捕获。

## 页面状态

- 默认态：所有 page section 和 iframe 加载完成，desktop/mobile label、standalone link 和说明可见。
- 加载态：静态 HTML 无远程数据加载；iframe 未加载完成时浏览器默认空白不作为设计状态。
- 空态：不适用；若未来页面列表为空，应视为文档维护错误而不是用户态。
- 错误态：iframe src 丢失或截图缺失属于 verify failure，应在 verify 中记录，不在 overview 内做运行时错误 UI。
- 成功态：overview 显示 7 组页面 preview，guidelines 可找到具体 token/组件/viewport/响应式规则，screenshots index 可对应每个页面的 desktop/mobile 截图。

## 可用性要求

- overview section 需要让用户一眼看出“这是哪一页”和“哪一个是 desktop/mobile”。
- desktop iframe 要有足够宽度展示左侧导航 + 工作区；mobile iframe 要保持接近真实手机比例，避免被拉伸成平板视觉。
- overview 的 iframe 尺寸可以为评审可读性做缩放或固定外框，但 guidelines 必须说明它不是正式 screenshot viewport。
- guidelines 中的 token/组件值要可执行：颜色应给出角色和具体值；间距、圆角、阴影、字体、组件尺寸应给出具体数字或范围。
- 响应式要求必须覆盖：desktop 左侧导航模型、mobile 直接二级 bottom nav、mobile deep/detail top return、safe area、固定底部导航/输入区不遮挡滚动内容。
- 状态表达不能只靠颜色，status pill、label 或文字必须参与语义表达。

## 关键决策

- `guidelines.md` 继续作为单一设计规范入口，避免读者在多个 token/component 文档间跳转。
- overview 不做截图基线，是为了避免 iframe chrome、缩放和 overview layout 影响正式截图。
- desktop/mobile preview 放在同一 page section 内，提升逐页横向对照效率。
- public token/组件规范按角色组织，例如 background/surface/text/accent/status、shell/navigation/surface/row/action/input/terminal，而不是只列 CSS 变量。

## 风险与权衡

- iframe 太大将让 overview 难以浏览；太小又无法评审细节。设计上接受 overview 服务结构总览，细节评审进入 standalone page。
- 在 guidelines 中补太多数值会增加维护成本；但当前 prototype 已经承担实现对齐基线，缺少数值会继续导致视觉漂移，因此应优先补齐常用角色与组件值。
- 不拆新 token/components 文档降低结构复杂度，但 `guidelines.md` 会变长；通过清晰章节和表格控制可读性。

## 开放问题

- 无阻塞开放问题。实现阶段可根据截图脚本能力决定是否增加一条可重复采集命令或 artifact log。

## 后续沉淀候选

- `guidelines.md` 中的 token/组件/viewport/响应式章节。
- `overview.html` 对页面分组 review 的说明文案。
- 更新后的 screenshots 与 screenshots index 描述。
