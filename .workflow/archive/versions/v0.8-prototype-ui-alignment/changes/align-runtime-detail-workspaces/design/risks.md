# Risks Design

## Change

- change-id：align-runtime-detail-workspaces

## 主要风险

- **真实能力边界被视觉原型诱导越界**：prototype 中有示例 output、branch、mode、recent output、metadata；实现只能展示真实 session/stream/provider/status 字段，不得补 fake output/history/provider-native data。
- **Agent/Terminal detail 差异被复用抹平**：共享 header/input/output 组件时，Terminal detail 可能误带 Files/Git/+Terminal/Meta 或 provider pill；这是 blocking difference。
- **Input drawer 遮挡 output**：移动端如果使用 fixed/floating 或 safe-area 计算错误，会遮挡 terminal output 或露出背景缝隙。
- **route-local 样式继续漂移**：SessionDetailRoute 现有 private surface class 可能与 Home/Project shared shell 视觉不一致；实现必须复用 shell surface roles。
- **contextual Files/Git 范围膨胀**：Agent detail 中的 Files/Git 是上下文工具，不应抢先实现 resource inspection change 的完整 list/detail mobile 模型。
- **验证数据不足**：真实 Agent provider 可能无法在本地调试环境创建成功，影响 app screenshots 和 browser check 的可信度。

## 跨子域权衡

- **视觉丰满度 vs 真实数据**：宁可展示 waiting/empty/disabled，也不为了接近原型填假 output。
- **组件复用 vs 产品边界**：terminal panel、input drawer、quick keys、status/action/surface 可复用；Agent tools 与 Terminal focused shell 分支必须保留。
- **移动端密度 vs 状态完整性**：runtime status、transport status、close/reconnect 必须可见；可通过短标签、wrap、overlay 降低占用，而不是删除状态。
- **本 change 完整度 vs 后续 resource change**：contextual Files/Git 只保证从 Agent detail 打开的辅助检查体验不崩；完整 Files/Git/Terminal workspace 对齐留给 `align-resource-inspection-workspaces`。

## 依赖与阻塞

- 已满足：`establish-prototype-alignment-baseline` 与 `align-home-project-shell` 已完成，shared contract、design-system note、shell primitives 可作为实现输入。
- 实现前必须读取：`web/src/routes/SessionDetailRoute.tsx`、`web/src/routes/console-model.ts`、`web/src/routes/console-model.test.ts`、`web/src/components/shell/*`。
- 环境依赖：固定 tmux 调试服务 `ar-dev`，API `43011`、Web `43012`，`PROJECTS_ROOT=/home/deploy/workspace`。
- 潜在阻塞：若无法创建真实 Agent/Terminal detail 状态用于 screenshot，应记录 verify 环境限制并回流准备 fixture，而不是伪造 UI 数据。

## 验证建议

- Unit/type checks：`bun run --cwd web typecheck`、`bun run --cwd web test`、必要时单独运行 `bun test web/src/routes/console-model.test.ts`。
- Browser artifacts：分别保存 Agent detail prototype desktop/mobile、Terminal detail prototype desktop/mobile、Agent app desktop/mobile、Terminal app desktop/mobile screenshot。
- Browser check log 至少断言：
  - Agent detail 有顶部返回、provider/status、Files/Git/+Terminal/Meta、terminal output、input drawer/quick keys。
  - Terminal detail 有顶部返回、status、close/reconnect/resize、terminal output、input drawer/quick keys。
  - Terminal detail 没有 Files/Git/+Terminal/Meta/provider metadata。
  - Mobile detail 没有 Project 二级 bottom navigation。
  - Input drawer 与 output 不重叠，collapsed 状态保留恢复入口。
- 交互检查：Close confirmation、Reconnect、quick key disabled/available、drawer collapse/restore。

## 开放问题

- 验证环境是否具备可创建 Claude/Codex Agent session 的 provider CLI；如果不具备，是否已有可用 running Agent fixture。
- 是否需要扩展 capture script 支持 runtime detail 页面自动准备 session；实现/verify 阶段再判断。

## 后续沉淀候选

- 若本 change 验证通过，沉淀 Agent/Terminal detail 的 shared runtime detail primitive 边界。
- 若发现 shared contract 对 safe-area/input drawer 表达不足，回写 version shared 或长期 frontend UI architecture。
