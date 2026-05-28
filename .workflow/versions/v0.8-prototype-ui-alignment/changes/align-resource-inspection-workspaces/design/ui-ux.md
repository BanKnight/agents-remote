# UI/UX Design

## Change

- change-id：align-resource-inspection-workspaces

## 页面 / 界面范围

- Project Files workspace：`?workspace=files` direct secondary page，以及移动端 file preview deep detail。
- Project Git workspace：`?workspace=git` direct secondary page，以及移动端 single-file diff deep detail。
- Project Terminal workspace：`?workspace=terminal` direct secondary page，仅 instance list/create/open/close。
- 共享 Project shell chrome：desktop 二级 sidebar、mobile 二级 bottom navigation、workspace header、content panel、status/action/list row surfaces。

## 页面结构

- Files desktop：左侧 Project 二级导航保持常驻，右侧 workspace 采用紧凑 header + path toolbar + 两栏 `file list / preview`。list 是主扫描区，preview 是只读内容区；两者保持同页并排，不进入 detail chrome。
- Files mobile direct：上方显示 Files workspace context 和 current path toolbar，中间显示 file list；底部保持 Project 二级 bottom nav。文件夹点击在 list 内切换路径；文件点击进入 preview deep detail。
- Files mobile preview：隐藏 Project 二级 bottom nav，顶部显示 `Back to Files list`、文件上下文和 preview content；内容区优先滚动，长文本/图片/unsupported 状态不横向溢出。
- Git desktop：左侧 Project 二级导航保持常驻，右侧 workspace 采用紧凑 header + status toolbar + 两栏 `changed-file list / unified diff`。changed-file list 是主扫描区，diff 是只读内容区。
- Git mobile direct：上方显示 Git workspace context 和 read-only status，中间显示 changed-file list；底部保持 Project 二级 bottom nav。changed file 点击进入 diff deep detail。
- Git mobile diff：隐藏 Project 二级 bottom nav，顶部显示 `Back to changed files`、文件路径和 unified diff；diff 使用 code surface 和局部滚动/换行约束。
- Terminal desktop：左侧 Project 二级导航保持常驻，右侧 workspace 显示 Terminal instances header、New Terminal 主操作、instance list 和状态反馈。
- Terminal mobile direct：上方显示 Terminal workspace context 和 New Terminal，主体显示 Terminal instance list；底部保持 Project 二级 bottom nav。单个 instance 的 runtime input/output 只在 Terminal detail route 出现。

## 交互模式

- Workspace 切换：二级 nav 切换 Agent/Files/Git/Terminal 时，清空 Files/Git deep detail 状态并恢复 bottom navigation。
- Files browse：Root/Up/目录行只改变当前目录；文件行只进入 preview；所有操作保持只读。
- Files preview return：mobile preview 顶部返回只清空 selected file，恢复当前目录 list，不重置 current path。
- Git inspect：Retry 只重新请求只读 diff 数据；changed-file row 进入 diff detail；不提供写操作。
- Git diff return：mobile diff 顶部返回只清空 selected changed file，恢复 changed-file list。
- Terminal actions：New Terminal 创建真实 terminal session；Open detail 跳转到 Terminal Session detail；Close 使用危险确认，确认后调用真实 close。
- Non-happy path：loading/empty/error/unsupported/disabled 状态在当前 surface 内原位出现，不跳出 shell，不占据过多首屏高度。

## 页面状态

- 默认态：显示真实 list/detail 数据；Files/Git 桌面端可展示未选中提示，移动端 direct 页优先显示 list。
- 加载态：使用紧凑 text 或 inset surface，文案短，不占满页面；Files/Git/Terminal 各自保留 workspace chrome。
- 空态：Files empty directory、Git no changes、Terminal no instances 使用 dashed surface 和短说明；不引导范围外写操作。
- 错误态：Files/Git/preview/diff/API 错误使用 danger surface 或短错误文本，保留 Retry/返回路径；错误文案来自真实 error message。
- 成功态：列表/preview/diff/session create/close 成功后通过真实 query data 和 invalidation 更新；不额外展示伪 toast 或虚假状态。
- 禁用/提交态：Terminal New/Close pending 和 Files Up disabled 使用 disabled affordance；危险 close 保持 confirm。
- Unsupported：Files too-large/unsupported preview 使用 warning/inset surface，说明真实限制，不伪造 preview。

## 可用性要求

- 状态必须包含文字，不只依赖颜色；status pill、read-only label、runtime label 均保留可读文本。
- 移动端 bottom navigation 不得遮挡 direct workspace list；deep preview/diff detail 隐藏 bottom navigation 后内容区仍要有 safe-area-aware padding 或滚动余量。
- 长路径、file path、diff line、file content、terminal session id 必须通过 `min-w-0`、truncate、break-all、whitespace/pre-wrap 或局部滚动控制横向溢出。
- 可点击 list row、action button、nav item 必须有 cursor、hover/selected/focus/disabled affordance，并沿用 shared component 行为。
- 移动端触控目标保持紧凑但可点；返回按钮、New Terminal、Open detail、Close 不应挤成不可点击的行内小字。

## 关键决策

- Direct secondary page 和 deep detail 的导航互斥是验收关键：Files/Git list 页显示底部二级 nav，preview/diff detail 隐藏底部二级 nav；Terminal workspace 始终是 direct secondary，不进入 deep detail。
- Files/Git 桌面端不做 route-level detail 切换，因为原型和长期 docs都要求 list + preview/diff split 用于快速扫读。
- Terminal workspace 不复用 runtime detail 的 terminal panel/input drawer，即使原型视觉同属 terminal 语义；这是 direct workspace 和 detail workspace 的能力边界。
- Resource workspace copy 以短句为主，减少顶部说明和厚卡片，优先把首屏让给 list、preview、diff 或 instance row。

## 风险与权衡

- 只用当前 route-local helper 可能继续产生 Files/Git/Terminal 视觉漂移；实现应把重复 surface/action/list/detail header 模式收敛到 shared shell primitives 或明确同一 helper。
- 把 Files/Git selected detail 放入 URL/search 可改善刷新恢复，但会扩大当前 change 范围；本轮保持本地 state，因其仅控制同 route mobile chrome。
- 原型中的 HTML preview、Terminal history/restore 如缺少真实 API 支撑，不应成为阻塞本轮结构对齐的理由；需要 truthful empty/future/gap 表达。

## 开放问题

- 无阻塞开放问题。

## 后续沉淀候选

- Resource workspace 的移动端 direct secondary 与 deep inspection detail 分层规则。
- Files/Git/Terminal list/detail shared surface、status、action 和 mobile return pattern。
