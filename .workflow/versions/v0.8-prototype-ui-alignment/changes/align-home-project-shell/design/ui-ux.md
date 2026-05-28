# UI/UX Design

## Change

- change-id：align-home-project-shell

## 页面 / 界面范围

- Home / Projects route，对照 `docs/design/prototype/home.html`。
- Project Agent workspace，对照 `docs/design/prototype/project-detail.html`。
- 覆盖 desktop `1440x1000` 和 mobile `390x844` 两个最低验收 viewport。
- 只覆盖直接一级/二级 shell 和 Agent workspace 列表区；不覆盖 Agent detail、Terminal detail、Files/Git/Terminal workspace 内部页面。

## 页面结构

### Home / Projects

- Desktop 使用一级左侧导航 + Projects 工作区。
- Mobile 使用底部一级导航 + Projects 工作区。
- Header 保持短上下文，避免大块说明；Projects 列表是主工作区核心。
- Project setup 入口保持低频：已有 Projects 时以轻量按钮或折叠/条件面板出现；无 Projects、提交中或错误时可以提升为恢复主路径。
- Project row 采用紧凑 list row：Project marker、名称、短路径/真实状态、少量真实 metadata、Open 行为。

### Project Agent Workspace

- Desktop 使用 Project 二级左侧导航 + Agent workspace。
- Mobile 使用底部二级导航：Back、Agent、Files、Git、Terminal；Agent active 可见。
- 直接二级 Project Agent 页顶部不重复返回一级 Back。
- Workspace header 只展示 Project 名称、当前 workspace 和少量真实 summary；避免 path、summary badges 和说明文案共同挤占移动端首屏。
- Agent panel 顶部展示 `+ Claude`、`+ Codex` 创建入口和短标题；当前 Agent instances 列表是主体。
- Agent history / future restore 区域保持轻量 staged/future，不与当前 instances 列表混合。

## 交互模式

- 从 Home Project row 进入 Project 时，默认进入 `workspace=agents`。
- Mobile Project Agent workspace 通过底部二级导航的 Back 回到 Home，不在 header 重复一级返回。
- Files/Git/Terminal 作为二级导航入口可见，但本 change 不改变它们内部内容。
- Claude/Codex 创建入口在 pending 时禁用或表达提交中；失败时在 Agent workspace 内显示可见错误。
- 关闭 Agent Session 继续保留确认，不因视觉压缩去掉危险操作保护。

## 页面状态

- 默认态：展示真实 Project list、真实 Agent instances、真实 counts/status 和当前 active navigation。
- 加载态：保持相同 shell surface 和密度，用短状态反馈替代大块占位说明。
- 空态：Home 无 Project 时提升 create/adopt；Agent 无 sessions 时提示创建 Claude/Codex，不伪造实例。
- 错误态：保留错误文本和恢复路径，不用视觉对齐隐藏 API/Project/Agent 错误。
- 成功态：Project/Agent active 状态可见，状态不只依赖颜色。
- 禁用态：创建中、provider unavailable 或操作不可用时明确禁用；不展示不存在的可点击能力。
- 危险态：关闭 Agent session 保留确认，危险文案克制但可识别。

## 可用性要求

- Mobile 首屏优先展示主内容：Home 优先 Projects list，Project 优先 Agent creation + current instances。
- 长 Project path、Project name、Agent displayName、session id 必须截断、换行或局部处理，不能造成页面级横向溢出。
- 底部一级/二级导航必须预留 safe-area padding，并且不遮挡列表、状态反馈或 create buttons。
- 文字状态必须与颜色状态同时存在，例如 active、Soon、Read-only、Running、Waiting for input、Staged。
- Home 和 Project 的说明文案应更短、更像 console 操作界面，不使用 dashboard 式长解释。

## 关键决策

- 结构优先级高于微小色值差异：先确保 navigation level、workspace 主任务、list density 和 mobile bottom nav 正确。
- 保留 staged Agent history 区域，但它必须明确是 future capability，不能看起来像真实历史数据。
- Home create/adopt 在有项目时降级，在无项目或错误恢复场景提升，符合原型低频入口原则。
- 本 change 不要求 DOM 与 HTML 原型一致，验收按 shared alignment contract 的视觉、布局、交互和状态语义等价判断。

## 风险与权衡

- 压缩 header 和 metadata 可以提升原型密度，但可能减少用户判断信息；保留真实 path/count/status 的最低可识别信息。
- 保留 staged history 能维持原型结构，但必须通过 copy 和状态 pill 明确它不是可恢复历史能力。
- `lucide-react` 已固定为安全版本但本 change 暂未使用真实图标；后续如替换 text markers，应通过统一 icon primitive 接入，避免 route 内散用。

## 开放问题

- Desktop header 中 Project path 与 summary badges 的最终排列需要实现阶段结合截图判断。
- Project row 的 metadata 数量需要在 mobile screenshot 中确认是否过密。
- 是否把部分 Home/Project row 统一到 `ListRow` primitive，需要看实现时是否能减少重复且不牺牲页面 nuance。

## 后续沉淀候选

- 经验证后的 Home/Project list density、low-frequency setup entry 和 Project Agent workspace header 规则，可沉淀到长期 frontend UI architecture。
