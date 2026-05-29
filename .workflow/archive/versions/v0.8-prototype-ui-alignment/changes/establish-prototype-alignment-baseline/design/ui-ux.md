# UI/UX Design

## Change

- change-id：establish-prototype-alignment-baseline

## 页面 / 界面范围

- 本 change 不直接修改用户界面，而是设计原型还原的共享验收口径。
- 覆盖后续页面范围：Home、Project Agent workspace、Agent detail、Terminal detail、Files workspace、Git workspace、Terminal workspace。
- 原型参考入口：docs/design/prototype/*.html；截图辅助入口：docs/design/prototype/screenshots/。

## 页面结构

`alignment-contract.md` 应采用以下结构：

1. Purpose
   - 说明本契约是 v0.8 内所有页面还原 change 的共同验收口径。
2. References
   - HTML 原型为主参考。
   - prototype screenshots 为辅助参考。
   - 长期 docs 用于能力边界和安全约束。
3. Viewports
   - desktop：1440x1000。
   - mobile：390x844。
   - 原型 HTML 同时包含 desktop/mobile 时，必须分别截图和核对。
4. Prototype Map
   - `home.html` -> Home / Projects route。
   - `project-detail.html` -> Project Agent workspace。
   - `agent-session-detail.html` -> Agent detail。
   - `terminal-instance-detail.html` -> Terminal detail。
   - `files.html` -> Files workspace and file preview detail。
   - `git.html` -> Git workspace and diff detail。
   - `terminal.html` -> Terminal workspace。
   - 每项记录真实 route/page、desktop 形态、mobile 形态、负责 change、必需 artifacts。
5. Equivalence Rules
   - 视觉、布局、交互、状态语义等价优先。
   - DOM/class/pixel-perfect 不作为硬性要求。
6. Acceptable Differences
   - React/shadcn DOM 包装不同。
   - 少量字体渲染差异。
   - 1-2px 间距/阴影差异。
   - 真实数据长度导致文本差异。
   - 缺失功能使用 empty/staged/future 状态表达。
7. Blocking Differences
   - 导航层级错误。
   - 移动端返回位置错误。
   - detail 页底部导航与输入区冲突。
   - terminal-first 输出区被挤掉。
   - 列表密度明显偏离。
   - 伪造不存在的数据或能力。
8. Artifact Requirements
   - 每个页面 change 保存 prototype desktop/mobile 截图。
   - 每个页面 change 保存 app desktop/mobile 截图。
   - 每个页面 change 保存浏览器检查日志。
   - 最终 verify change 汇总跨页面截图和结构检查。
9. Follow-up Gap Rule
   - 当前 version 不解决的能力缺口写入 `follow-up-gaps.md`。

## 交互模式

- 直接二级 Project workspace 在移动端使用带 Back 项的底部二级导航。
- 深层/contextual detail 使用顶部返回，不显示 Project 二级底部导航。
- Agent detail 的 Files/Git/+Terminal/Meta 是 contextual tools，不是 Project 二级导航。
- Terminal detail 是 focused shell，不显示 Agent-only tools。
- Files/Git 移动端从列表进入 preview/diff detail 后隐藏底部二级导航，只保留顶部返回。
- Terminal workspace 只展示 live Terminal instances 和 create/open/close，不承载 runtime input。

## 页面状态

- 默认态：按原型结构、密度、surface 层级和状态表达展示真实数据。
- 加载态：保持同一 surface/density，不用大块说明占据主工作区。
- 空态：表达真实无数据或未接入，不伪造 sessions/history/output。
- 错误态：保留恢复路径或可见错误，不破坏移动端主内容可达性。
- 成功态：状态不只依赖颜色，应使用文字 status pill 或标签。
- 禁用态：明确不可操作原因，尤其是 runtime ended、stream disconnected 或 capability future 状态。
- 危险态：关闭 session/terminal 等危险动作继续克制表达并保留确认。

## 可用性要求

- 移动端首屏优先展示主内容，不用大段说明、厚卡片或低频入口挤占工作区。
- 文字、路径、session id、diff 行和 terminal output 不得造成页面级横向溢出。
- 底部导航、输入抽屉、滚动区和 safe-area padding 不能互相遮挡。
- 状态表达不只依赖颜色。
- 图标入口必须有一致尺寸、颜色、容器和状态规则；不手写零散 SVG。

## 关键决策

- 用 shared 契约统一“像原型”的判断标准，避免页面 change 各自定义验收口径。
- HTML 原型优先于截图，因为它承载 desktop/mobile 结构和交互状态；截图只辅助判断浏览器渲染观感。
- 接受视觉等价而非 DOM 等价，因为 React 组件抽象和 shadcn/ui 会引入必要包装结构。
- 当前版本只做暗色 Server Agent Console 主题，不设计 light mode。

## 风险与权衡

- 验收不做 pixel-perfect 会降低机械一致性，但更适合 React/shadcn 可维护实现。
- 共享契约过厚会拖慢后续页面实现，因此本 change 只定义薄基线和可回写规则。
- 缺失能力使用 future/empty 状态可能让页面不如原型丰满，但能保护真实能力边界。

## 开放问题

- 每个 HTML 原型的真实 route 细节需在后续页面 change 读取当前 TanStack Router 实现后确认。
- 是否增加平板/窄桌面 viewport 留给最终 verify 根据时间和风险决定。

## 后续沉淀候选

- Prototype Map 和可接受差异规则在验证后可提炼到长期 UI architecture/design system 文档。
