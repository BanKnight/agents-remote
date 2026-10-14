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

1. **左栏桌面端可折叠**：左栏（sidebar）目前在桌面端不能折叠，希望与右栏同款支持。
2. **右栏折叠按钮挪位**：右栏（inspector）折叠按钮现在在其右侧，希望挪到右栏**左侧**——与左栏折叠按钮在其右侧形成左右对称。
3. **右栏↔中栏交界双线**：右栏非折叠态与中栏交界处有两条线叠在一起（视觉过粗）；左栏↔中栏交界无此问题——疑似 border 重复叠加，需定位两线来源并收敛为一条。

## 2026-10-13 五联修 review 挂起项

1. **git 写路径的 NOT_CHANGED 空态**：commit/放弃时勾选文件已被外部提交（`project-git-write.ts:210` 抛 PROJECT_GIT_FILE_NOT_CHANGED）仍以通用错误呈现——读路径五联③已做「没有变更」空态，写路径如需同款体验可另开批（来源：code review 顺带发现，五联修范围外）。
