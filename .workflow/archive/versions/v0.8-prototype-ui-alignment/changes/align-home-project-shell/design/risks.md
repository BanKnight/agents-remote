# Risks Design

## Change

- change-id：align-home-project-shell

## 主要风险

- Home/Project 已有功能接近原型，过度重排可能引入 route/search、query 或 session 行为回归。
- 为了贴近原型而增加 recent output、task summary、provider history 或 metadata，会伪造当前没有的真实能力。
- 引入 shadcn/ui 或 lucide-react 会扩大本 change 的工程范围，因此只能在 npm 7 天安全检查后固定安全版本，并只生成当前页面实际消费的最小 source component。
- 调整 shared primitives 可能影响 Files/Git/Terminal workspace 或 Session detail 的既有视觉与移动端布局。
- 移动端底部导航、Project list、Agent create buttons 和状态反馈可能互相遮挡，尤其在 `390x844` viewport。
- 压缩 copy 和 metadata 可能让错误、禁用、危险确认或 Project-safe 边界提示不够清晰。

## 跨子域权衡

- 越贴近原型密度，越需要克制 metadata；但仍必须保留真实 path/count/status 和恢复路径。
- 统一 primitives 能提高跨页面一致性，但本 change 不应把页面专属 copy 和业务数据转换抽成通用组件。
- 本 change 已按最小必要原则引入 shadcn/lucide 安全版本；收益是 shell wrappers 能复用可访问基础组件，代价是后续新增组件仍必须逐项做版本与使用边界检查。
- Project Agent workspace 的 staged history 保留原型结构，但必须明确 future 状态，避免用户误以为可以恢复真实历史。

## 依赖与阻塞

- 依赖 `establish-prototype-alignment-baseline` 已完成，shared baseline 可用。
- 实现阶段必须加载 `vercel-react-best-practices` skill。
- 后续如继续添加 shadcn components 或实际接入 lucide icons，必须重新检查 npm metadata、发布时间和安全窗口，并说明 wrapper 消费边界。
- 页面级验证依赖可运行 web/app browser harness；如果无法启动浏览器或服务，verify 必须记录阻塞而不是声称通过。

## 验证建议

- 保存 `home.html` prototype desktop/mobile screenshot 和 app desktop/mobile screenshot。
- 保存 `project-detail.html` prototype desktop/mobile screenshot 和 app desktop/mobile screenshot。
- Browser check log 至少检查：Home 一级 active nav、Project list 主内容、create/adopt 低频入口、Project Agent secondary nav、mobile Back/Agent/Files/Git/Terminal 底部导航、Agent instances list、Claude/Codex create buttons、staged history 不伪造数据。
- 运行相关 route/model tests；如果 shared primitive 改动较大，做 Home/Project/Files/Git/Terminal 主要路径的视觉 smoke。
- 检查 long text：Project path、Project name、displayName、session id 不造成横向溢出。

## 开放问题

- lucide-react 已固定为安全版本，但本 change 暂未使用 lucide icons；后续图标接入仍需统一 icon primitive。
- shadcn/ui 已初始化并生成 `Button`、`Badge`、`Card`、`Input`；后续新增 source component 必须证明当前页面实际消费。
- Project row metadata 最终删减程度需由 desktop/mobile 截图验证决定。

## 后续沉淀候选

- 经验证后的 Home/Project shell 密度、低频 setup 入口和 staged history 边界可进入长期 frontend UI architecture。
- 如果本 change 建立了稳定 primitive 调整规则，可作为后续 runtime/resource changes 的长期设计输入。
