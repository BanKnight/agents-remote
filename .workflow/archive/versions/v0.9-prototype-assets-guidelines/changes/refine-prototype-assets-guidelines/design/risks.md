# Risks Design

## Change

- change-id：refine-prototype-assets-guidelines

## 主要风险

- Overview 被误用为正式截图来源：iframe 外层 chrome、缩放和 overview layout 会污染截图基线。
- 公共 CSS foundation 抽象不足：继续复制 token 和组件样式会让后续 prototype 和 React UI alignment 再次漂移。
- 公共 CSS foundation 抽象过度：把页面特有状态或布局强行合并，会让 Files/Git/Terminal/detail 的真实差异被隐藏。
- Screenshots 更新不完整：只改 HTML/guidelines 但不刷新 14 张 standalone screenshots，会让 docs 同时存在新规范和旧视觉证据。
- Guidelines 写成原则而不是可执行值：如果没有具体颜色、尺寸、阴影、间距、圆角、字体和组件规格，后续实现仍会靠主观判断。
- 响应式规则遗漏 fixed bottom nav/input safe area：移动端可能再次出现内容被导航或输入区遮挡的问题。

## 跨子域权衡

- `guidelines.md` 单文件承载全部规范，降低查找成本，但会变长；通过章节表格维持可读性。
- `overview.html` 展示 14 个 iframe，页面较长，但按页面分组能让评审路径自然；正式细节检查通过 standalone page 解决。
- 共享 CSS foundation 能减少重复，但会造成一次改动影响所有 prototype；使用全量截图验证抵消风险。
- 不引入构建系统保持 prototype 可直接打开，但也意味着共享能力应限制在 CSS 和少量静态 HTML 结构内。

## 依赖与阻塞

- 无外部依赖。
- 无用户取舍阻塞。
- 需要实现阶段确认当前截图采集方式；若缺少既有脚本，可以用最小 Playwright/Bun 临时 harness 采集并在 verify 中记录。

## 验证建议

- 静态检查：`git diff --check`。
- 结构检查：解析 `overview.html`，确认 7 个 page sections、14 个 iframe、每个 standalone page 对应 desktop/mobile label 和 standalone link。
- Guidelines 检查：确认包含 token/组件/viewport/响应式章节，并写明 desktop `1440x1000`、mobile `390x844`。
- Screenshot 检查：确认 7 个 standalone pages 各有 desktop/mobile PNG，共 14 张截图，并更新 screenshots index。
- Browser review：直接打开 standalone HTML 截图，不从 overview iframe 截图；同时打开 overview 检查 page grouping 和 iframe 可读性。
- Regression review：确认 Files/Git 只读、Terminal workspace 不承载 runtime input、mobile direct/deep nav 规则仍和 v0.8 长期 UI architecture 一致。

## 开放问题

- 无阻塞开放问题。

## 后续沉淀候选

- 已验证后的 `guidelines.md`、`overview.html`、`prototype-foundation.css`、screenshots 和索引直接作为长期 docs/prototype 基线保留。
