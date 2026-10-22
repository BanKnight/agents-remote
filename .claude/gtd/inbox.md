# Inbox（捕获箱）

> 任何新需求 / 想法先进这里，不评估、不开干，只捕获。`/gtd process` 时再拆解。

# Inbox（捕获箱）

> 任何新需求 / 想法先进这里，不评估、不开干，只捕获。`/gtd process` 时再拆解。

## 2026-10-13 桌面三栏反馈（用户口述三条，待 plan）

> ✅ 已实施完成（三栏批，全套验证绿 + 双 reviewer 消化 + 记档）——三条全部落地；附加发现并修复 grid auto-placement 真 bug（双收态中栏塌缩，frontend-notes §30）。
> 🔄 真机验收反转（2026-10-13）：把手钮遮挡视线被否 → 折叠钮行内化反转批（右栏恢复 glabel2 行内钮 / 左栏项目组 ghead 行尾钮，其余三栏批成果全保留）；同日第二轮真机反馈（图标非规范形制 + 可点区仅 4.7px / 展开钮点不准）→ 可点性修批：折叠钮图标化 + 20×20 热区、RailButton 命中=视觉实底小舌；同日第三轮复核三条（展开钮宽度剪半 → 22×56 / 两栏折叠钮贴中栏镜像对称 → 右栏移行首 / 图标形制 → panel-left/right-close 侧栏面板+折叠方向箭头）。待本版真机验收通过后删除本节。
> ✅ 终端 composer 修（2026-10-14 真机反馈两条，均针对输入框）：①宽度对齐 agent——快捷键条 + composer 卡整组限宽 `max-w-2xl`（672px）居中，不再横跨全宽；②输入框纵向滚动条口径修——textarea 补 `min-h-[2.5rem]` 基线 + 删 `leading-[1.35]`（18.9px 非整数行高是 1px 级滚动量的首要嫌疑，agent 侧整数行高无此现象），随批消除。诊断探针改后实测：card=672 居中、lh=20px、正常步骤滚动量全 0（600 字符 roll=32px 为 max-h 封顶预期）；WebKit 真机复验交用户。
> ✅ 滚动条归因修正 + xterm 滚动条隐藏（2026-10-14 用户指出上批第②条理解错了——滚动条在 **xterm 区域**非输入框）：诊断实证滚动条真身 = xterm 6 内置 vscode 浮层滚动条（`.xterm-scrollable-element > .scrollbar`，se roll=128px/slider 14×89 实锤；折叠消失 = rows 消化溢出的数值巧合），非输入框 sub-pixel（frontend-notes §32）；修复 = CSS 双隐藏（scrollbar display:none + viewport scrollbar-width:none，内部滚动机制不动），守卫 batch7 P1-12b。
> ✅ 发送按钮两端统一（2026-10-14「不做两套规则」）：agent composer（claude/pi/acp）showSend 删 `isMobileComposer` 条件——桌面也有输入即显示 Send（`hasInput && !inputDisabled`）；isMobileComposer 保留驱动 Enter 键分族（移动换行/桌面发送）。探针 D4/C2/H3 反转 + H4 口径校准 3→4（批 8 附件菜单为基线遗留第 4 个 trigger）。**真机验收通过（2026-10-14 用户复核）**。
> ✅ 终端 composer 空隙结构同构 agent（2026-10-14 复核「终端高度明显比 agent 高」）：min-h 数值前批已逐字同款，但空隙结构不同构——agent 72px 含 textarea 自带 14px 纵向 padding、终端 72px 纯内容区，空态卡高 120 vs 108px；修正 = 卡去 `px-3 py-2`、空隙移交 textarea（`px-3.5 pt-2.5 pb-1`）+ 底行（`h-9` + `px-2.5 pb-2 pt-0.5`），卡高 108/76 两端一致。守卫 batch7 P1-9b。**卡形制随批全对齐 agent（用户拍板「除快捷键条外全对齐」）**：rounded-xl 圆角 12 / 描边+浮起衬底+毛玻璃+focus 亮边 = agent 卡骨架逐字同款，原 rounded-2xl / code 面描边 / font-mono 退役；快捷键条常驻保留（整区高 40px 是功能行）。
> ✅ 浮层关闭回焦蓝环修复（2026-10-14「关掉后标题行多出蓝色选中框，点空白消失」）：成因 = Radix 关闭默认 onCloseAutoFocus 程序化回焦 trigger（键盘 a11y 默认）× WebKit 对 tap 后脚本 focus 仍判 :focus-visible（Chromium 不判，桌面无现象）× ▾ trigger 是整行裸 button → 浏览器默认蓝环包整行；点空白焦点移走即消失 = 机制吻合。修法 = InstanceSwitchMenu + MobileSheet 基座统一 `onCloseAutoFocus` preventDefault（结构性免疫引擎分歧，⋯/AddMenu 同机制面随之覆盖）；桌面浮层不拦（键盘回焦是正确 a11y 且无视觉 bug）。守卫 probe-sheet-focus-policy A/B 关闭断言；成因四段式入 frontend-notes §33、spec §5.0「关闭不回焦」成文。**真机验收通过（2026-10-14 用户确认）**。
> ✅ claude-code CLI 升级 2.1.268 → 2.1.299（2026-10-14，用户点名两大能力：插件 Mods + 状态协议）：插件主线 = Claude Mods（2.1.287 引入 hooks 拦 prompt/tool/UI + $.state，mod API 成熟期 288–299）；状态主线 = OSC 7501 Program Status Protocol（2.1.295，working/waiting/done 三态）。headless 消费方协议无破坏性变更（零 SDK 类型 import，解析器按 type 分发且 ping 已处理）。探查实证：**OSC 7501 在 headless pipe（stdout/stderr）下不可达**（两轮一致）——状态能力接线需 PTY 或等 CLI 流内状态事件；**CLI alias 解析表随版本升级**（sonnet→claude-sonnet-5-5，网关不认），但项目 modelMapping（ANTHROPIC_DEFAULT_*_MODEL 注入）实测免疫（带映射 env → result success ok）。后续功能批候选：PTY + OSC 7501 状态权威源 / 插件管理 UI。供应链 <7 天豁免：用户显式指定 + 官方日更 CLI + 消费面窄。
> ✅ **会话标量统一管道 P0——上下文占用显示**（2026-10-14，`c8de11e`；用户两方向讨论定调：①agent 双模式 ②上下文占用）：解析 stream-json assistant 消息 usage（input + cache_creation + cache_read，真实 CLI 2.1.299 字段实证一致）→ api 会话标量 → `context_usage` 广播帧（broadcast-only）+ `seed_init.contextTokens`（回放恢复）→ composer 控制行显示（`128.4k` 形制，桌面/移动同组件）。全门禁绿（单测 1718 / 探针 4/4 / CSS+tokens 闸）。**架构共识（指导后续状态批）**：采集层（per-agent × per-mode）→ 统一 api 标量 → WS 单管道 → 前端统一组件；mod 不写入 stream-json 流（无此 API，走旁路收敛进同一广播）；终端模式状态不用 OSC（tmux 吞未知序列）而靠同一 bridge mod（terminal 下 hooks 照跑）；pi/acp 未来同管道接入。自查抓到并修复真 bug：`normalizeChatStream` system fallback 会把 `context_usage` 渲染成噪音气泡（补 continue 短路 + 单测）。**下一步候选**：双模式切换批（idle-only 可逆视角切换 + 终端模式审批让位 + UI 入口）/ mod 采集批 / 插件管理 UI。未完成验证：真实 WS 端到端诊断被 auto-mode 分类器拦（创建会话负载）——建议真机手动复核一次完整链路。
> ✅ **上下文占用指示重做批**（2026-10-14，`6904d94`；用户反馈 P0「光秃秃没设计感」点名 ZCode 同构）：环形仪表（SVG 弧、环心留空、百分比环外旁注）+ 三档变色（≤70 ok / >70 warn / >85 danger）+ Popover 浮层（进度条/已用窗口汇总/明细四行）+ 控制行右组成组。协议扩 `ClaudeContextUsage` 明细（seed 嵌套/帧平铺双形态）；api `resolveContextWindow`（[1m] ⇒ 1M）+ 切模型补发帧。双 reviewer 消化 7 项（design P1 浮层档位接线断线等）全修。探针 6 断言含档位色继承链 + 右组几何（防双 auto margin 均分回归）。真机清单见 handoff。
> ✅ **Agent 会话双模式（GUI 对话 ↔ TUI 终端）**（2026-10-15，用户 2026-10-15 拍板下一步）：同一 claudeSessionId / runtimeKey 在 chat（headless stream-json pipe）↔ terminal（tmux pane 交互式 CLI）两形态间接力，JSONL 唯一权威。语义基准（均用户拍板）：**严格 idle-only 切换**（working/blocked → 409，绝不丢 turn）、**TUI = CLI 原生形态纯 argv 零 env**（凭证走 CLI 自身配置；用户两次质疑塑造）、**spawn 形态判定 = JSONL 存在性**（`--session-id` 仅全新 id / `--resume` 对不存在 id 硬失败，2.1.299 实测）、**TUI 状态 = hooks 写状态文件旁路**（`--settings` 挂 UserPromptSubmit/Stop/Notification → 纯 shell printf token；api fs.watch 复用 `nextAgentSessionStatus`，关键三态 working/done/blocked，error 态覆盖不到为接受取舍）、**审批让位零代码**（argv 不带 `--permission-prompt-tool`）。落地面：新 `api/src/agent-tui.ts`（切换编排 + watcher + `hydrate` API 重启重挂 + 起 pane 失败回滚）+ runtime 分发按 mode + claude-stream 双守卫（terminal 形态拒拉 headless）+ 路由 `POST /mode` + web 双端 ⋯ 入口（AgentPanelRouter 按 mode 分流，零新组件）。验证：门禁全绿（api 950 / shared 10 / web 803）、`probe-session-mode` 18/18（含 pane 内真实 CLI TUI 状态行实证 argv 全链被接受）、`probe-agent-tui-hydrate` 6/6（真实 API 重启 → watcher 重挂）、新 e2e `session-mode.spec.ts` 2/2 + 既有 27 全绿。（commit `26b0450`）**真机清单待验收**（见 handoff）；**reviewer 面因环境 subagent API 故障（unexpected EOF ×6）未能跑，改主 agent 自审 + fork 自审，建议下 session 补跑**。

1. **左栏桌面端可折叠**：左栏（sidebar）目前在桌面端不能折叠，希望与右栏同款支持。
2. **右栏折叠按钮挪位**：右栏（inspector）折叠按钮现在在其右侧，希望挪到右栏**左侧**——与左栏折叠按钮在其右侧形成左右对称。
3. **右栏↔中栏交界双线**：右栏非折叠态与中栏交界处有两条线叠在一起（视觉过粗）；左栏↔中栏交界无此问题——疑似 border 重复叠加，需定位两线来源并收敛为一条。

## 2026-10-13 五联修 review 挂起项

1. ~~**git 写路径的 NOT_CHANGED 空态**~~ ✅ 2026-10-16 P3 清理批收口（中性空态 + invalidate 列表 + 勾选剪枝；`PROJECT_GIT_IDENTITY_MISSING` 专属文案仍待后续，记档 redesign-v2.md）。

## 2026-10-15 agent 状态点 5 态化 review 挂起项(P3,低频)

1. ~~**effort 确认门双数据源不一致**(code-review P3-10)~~ ✅ 2026-10-16 P3 清理批收口（bridge `getSessionStatus` getter，零 prop 透传，与会话页同源）。
2. ~~**config 读改写并发窗口**(code-review P3-11,既有)~~ ✅ 2026-10-16 P3 清理批收口（两 registry patchMetadata 同步段原子 + persistQueue 串行化，全量原子化，并发不变量测试护住）。

## 2026-10-17 PWA Web Push 通知批 ✅ 完成（commit `75890b2` + `591da88`，未 push；真机清单待验）

用户需求：PWA 在「会话状态变更且需要人关注」时发系统通知。已拍板：Web Push 服务端推送（iOS 16.4+ standalone）；三类触发（等待审批/turn 完成/出错）；设置页逐类开关（偏好存服务端 settings.yaml）。计划文件 `~/.claude/plans/toasty-sprouting-star.md`。顺序：Spike 1（web-push Bun 兼容）/ Spike 2（injectManifest 迁移）→ shared 类型 → api 全链 → web SW+设置 UI → e2e → 真机清单。不做/记档：逐会话开关、badge、pi/acp 推送等（见计划）。双 review 消化与 injectManifest 排障见 `docs/design/redesign-v2.md` 本批记档；真机清单见 handoff/current.md（需 HTTPS tunnel）。

## 2026-10-22 生成式 UI（Gen UI）完整版立项

用户拍板：**不做 MVP，按完整版做**——ZCode Gen UI 契约全能力面：①visualize 型 skill（agent 生成单文件 HTML 到会话专用输出目录，标记引用）②标记扫描 live/回放同管道（单一管道原则）③McpAppCard 基座沙箱变体（无 MCP Apps 握手，注入迷你桥；CSP `default-src 'none'` 硬前提不放松）④迷你桥四能力：`widgetState` 读 / `setWidgetState({modelContent, privateContent})` 双槽（合计 ≤16KiB 硬闸，只有 modelContent 进下轮上下文）/ `sendFollowUpMessage` 确认闸（无有效用户操作须确认，失效/只读会话拒发）/ `zcode:set_globals` 主题状态事件 ⑤状态回流（活页 modelContent 组装进下一轮 prompt）⑥回放恢复（标记在 JSONL + 文件在会话目录 + widgetState 按会话存）。ZCode 防线照抄：体积上限、输出目录路径校验（禁 symlink/穿越）、能力收窄（生成页无 callTool/资源/Node/文件）。Tweak 宿主控件体系 = 显式决策点（建议后续增量，依赖页面注册控件协议）。一手材料与契约细节：`docs/research/mcp-apps-hosting.md` §11（visualize 源码精读）+ §12（官方契约 + 立项决策）。

## 2026-10-22 画布式能力（Excalidraw 型「画布⇄对话」循环）立项

两批推进（2026-10-22 讨论定案，可行性结论：可以复现、代价中等、每段有存量先例）：
- **批 1 画布最小闭环**：ar-hub 四工具照抄 ZCode Excalidraw 工具表（create_diagram / read_scene / apply_operations / export_diagram，`expectedRevision` 版本冲突 + `operationId` 幂等语义）+ 文档存储（api 数据目录，revision 计数）+ excalidraw 富模板（消费 structuredContent 渲染，用户编辑经页面提交）+ callServerTool 代理（ar-hub 进程内 → iframe→postMessage→api 直调链，比外部 server 架构短）。**前置实验（半天）**：excalidraw standalone 单文件打包验证（体积 / 无 React 环境 / 中文字体 fallback）。
- **批 2 选区引用循环**：协议新方法 updateModelContext（页面→宿主选区上下文）+ composer「插件上下文」chip（可见可删）+ 发送时序列化进 CLI stdin prompt 的格式设计（我们上游 Claude CLI 非自控 loop，须 prompt 注入）。
- 架构决策：MVP 流内卡片形态（每次 apply 新版本刷新），侧栏常驻面板（工作台右栏）留升级路径；**明确绕开 registerTool**（模型反调页面工具，反向调用链高成本；迂回 = agent 直调 ar-hub 工具 + 页面随工具结果刷新，ZCode 官方流程 agent 本就只调服务端工具）。
- 一手材料：`docs/research/mcp-apps-hosting.md` §12.2 工具表全录 + §12.5 决策记录。
