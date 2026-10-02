# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-02（**重连增量回放 `d565ba4`**：客户端 WS URL 携带 `?since=<锚 uuid>`，relay 双缓冲定位锚命中 → session_init `replay:"delta"` 只发锚后行，未命中全量回退；客户端 delta 分流不 reset + liveStart 修正防假 running + 新增 turn 淡入。relay 单测 6 项 + hook 54 pass + 探针 8 项全绿。**待真机复验（清单第 19 项）**。第八~十三批仍待真机复验。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

**重连增量回放收口（`d565ba4`）**：claude 会话重连不再大面积重刷——①数据层：cursorRef 锚 → `?since=` → relay locateReplayAnchor（先倒序 live 后 history、顶层 uuid 确认防错锚）→ 命中 `replay:"delta"` 只发锚后行 / 未命中安全回退 full；②体验层：delta 新增 turn 挂 `animate-msg-enter` 淡入（rendered 索引空间 + 封口 600ms 摘除）。双向兼容（缺省 = full）。

## 本 session 焦点（重连增量回放）

1. 用户需求：重连时大面积聊天内容刷新太重量级，两部分优化（数据结构层增量 + 体验层动效）。
2. 拍板：回退场景维持 skeleton 现状不做旧内容保留；范围 claude 先行（pi/acp 事件帧无 uuid 锚不可靠）。
3. 双 reviewer 审查消化：P0（动画 transform 覆盖虚拟列表 translateY → turn 堆叠，改纯 opacity）+ P1（deltaEnter 误用 raw 索引空间，改 rendered）+ P2×2（nested uuid 错锚防护、测试注释/断言）全修；P2#5（replayCursor 与实际追加数发散）接受为注记。
4. 调试实锤：封口 effect 的 per-run cleanup 在 renderedMessages 变化重跑时清掉未触发的摘除 timer 且 early-return 不重建 → timer 挂 ref 一次性调度、卸载清理独立 effect。

## 关键决策（本阶段不可丢）

- **global 右栏语义（第十二批拍板）**：global 右栏 = 当前项目内容（lastProject 记忆优先，无记忆回退 projectNames[0]），一个项目都没有才完全空态。
- **返回类导航统一 pop 优先**（useWorkbenchBack；M13d 核实其判定语义并注释准确化——back 落点=真实来源是设计意图，出站不可能）。
- **inlineLocalHtmlAssets 契约（M13a 后）**：四类 job 替换串必须函数形式（字符串形式 `$&` 会展开）；style/script 段先剥（PUA 占位非 NUL）后回填；escapeSrcdoc = `& → < → "` 三转义（`>` 不转）；PreviewBody promise 按 preview 引用缓存；fetchOnce per-call 不跨调用。
- **RenderModeToggle 单源**（03q3 .mseg）：渲染段在前、on 态 bg-segmented-thumb、位置由调用方 className 注入。
- **file tab 状态（用户拍板）**：桌面中栏 file tab 后续规划要恢复发挥作用，当前暂时保持——暂缓非弃案。
- **重连增量回放（本批拍板）**：①回退场景（锚找不到：API 重启 / compact / cap 截断）维持 skeleton 现状，不做旧内容保留；②范围 claude 先行，pi/acp 维持全量记档后续。
- **增量回放技术要点（防复发）**：锚 = 最后一条带 uuid 消息（到达序 append 保证严格最后已见）；liveStart 修正 = 断线前 raw 基线 + historyBatch.length（replayCursorRef 同步累进——setRawMessages updater 延迟执行，同宏任务连续 batch 读 state.length 不可靠）；淡入范围用 rendered 索引空间（turn.startIndex 是投影索引，raw 空间在有 HiddenDropped/合并会话偏大）；动画 keyframes 纯 opacity（transform 会覆盖虚拟列表定位）。
- 历史拍板继续有效：三栏第一行同一水平线；跨页一致优先；多端同构；「侧边栏」= 检视面板；mainPage 整页态右栏蒸发保留。

## 进度（已完成 / 进行中 / 待办）

- ✅ 第八~十二批 `3665264`/`9bbf351`/`5e06b5d`/`e9e9c87`/`386533a` + 记档齐
- ✅ reviewer 补审 + M13a `069704c` + M13b `07572a4` + M13c `5b3d527` + M13d `b169aaa` + §6.13 第十三批段
- ✅ 第十三批②文件预览扩展名修复 `2e9eac8`（白名单反转二进制黑名单；dev api 已 respawn 实证 `.mjs` text）
- ✅ 第十三批③模型链路污染修复（`sanitizePersistedModel`：echo 解析出口 + spawn --model 闸，legacy 形状兼容，dev api 已 respawn、脏 CLI 进程已消亡）
- ✅ 第十三批④编辑态画布对齐 03q2（`0663ddd`：bg-codeblock 全幅去输入框壳，四处单源改，m4 探针 71 pass）
- ✅ 第十三批④续排印/行号对齐（`542686e`：11.5px/20px + lineNumbers()，md 源码 toggle↔编辑同套，m4 探针 72 pass；语法着色收敛 + CodeWithLineNumbers 退役另批）
- ✅ 第十三批⑤模型反引号存量根治（`6529c87`：sanitize 单源下沉 api/src/model-id.ts + parseMetadata 读取归一 + 三写路径闸 + 前端 resolveCurrentModelAlias 兜底；**真机复验已通过**）
- ✅ 第十三批⑥composer 草稿持久化（`04478d5`：lib/composer-draft.ts 单源 hook，persist/hydrate/时序门闩/key 切换四机制，claude+pi+acp 三端接入；探针 5 项 + 单测 4 项全绿）
- ✅ 重连增量回放（`d565ba4`：shared replay 字段 → relay 锚定 → claude-stream 串参 → 客户端 delta 分流 + liveStart 修正 + 淡入；relay 单测 6 项 + hook 54 pass + 探针 8 项；协议文档「重连回放消息序列」段同步更新为现行序列）
- ⬜ **交用户真机复验**（第八~十二批 + 第十三批 + 重连增量清单见下）
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉（global 右栏多项目浏览增强）；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（第八批~第十三批）

**第八批**（agents-remote 项目 `docs/design/index.html` 渲染态）：
1. 嵌套原型页图标恢复（搜索放大镜、行内功能图标）；`svg[data-symbol]` 手绘兜底不变

**第九批**（移动端）：
2. 底 nav「文件」→ 进项目 → 点文件预览 → 返回 → 应回**全局文件页**且 cwd 记忆保持

**第十批**（Mac 桌面）：
3. 折叠右栏后中栏右缘实底竖条唤出钮可见（已确认）+ 唤出/折叠循环正常

**第十一批**（Mac 桌面）：
4. 项目页右栏展开态 → 直达 `/projects` → 右栏保持展开不蒸发；折叠态到达则唤出钮在场

**第十二批**（Mac 桌面）：
5. **global 右栏 = 当前项目内容**：`/projects` 唤出右栏 → 显示 lastProject（或列表首个项目）的 files 标签（非空态）
6. **真无项目才空态**：把项目全删（或无项目环境）→ global 唤出右栏 → 「暂无内容」
7. **右栏拖拽**：右栏展开态，左缘出现 col-resize 光标，向左拖 → 右栏变宽（clamp 256–640px），刷新后宽度记忆保持

**第十三批**（M13a–d，Mac 桌面 + 移动端）：
8. **md/html toggle 形态**：任意 md/html 预览 → 「渲染/源码」分段钮 = 24px 高灰底轨、渲染段在前、on 态深底白字（03q3 原型）；渲染态 meta 行只留时间、源码态显示行数+时间；桌面右栏与移动 L3 两处形态一致
9. **html 内联渲染正确性**：agents-remote 项目 `docs/design/index.html` 渲染态 → 图标/样式/嵌套 iframe 正常（含路径含 `$` 字符的文件若可构造）；重复切「渲染↔源码」无明显卡顿（管道 memo）
10. **gutter 键盘**：右栏展开态 Tab 聚焦左缘分隔条（高亮）→ ← 变宽 / → 变窄，±1rem 步进，clamp 16–40rem
11. **非 md/html 编辑返回**：移动端打开 .ts 文件 → 编辑 → 返回 → 再进不残留「渲染态」（脏 renderMode gate）

**第十三批②**（文件预览扩展名，两端）：
12. **源码文件可查看&编辑**：`.mjs`/`.cjs`/`.sql`/`.ini`/`.htm` 等此前打不开的源码/配置文件 → 看且能编辑保存；`.env`/`Dockerfile`/`Makefile`/无扩展名文件同样可读
13. **二进制仍被拦**：`.zip`/`.png`（图片走 ImageViewer）/`.wasm`/`bun.lockb` → 仍是「无法预览」或图片视图，不出乱码

**第十三批③**（模型链路污染修复，两端）：
14. **模型显示无反引号**：重开之前出问题的会话 → composer 模型 pill 与 ℹ 运行配置浮层显示 `Opus [1m]` 类正常名，两侧无反引号
15. **发消息不再 422**：同一会话发一条消息 → 正常回复，无「model not found」错误气泡

**第十三批④**（编辑态画布，两端）：
16. **查看↔编辑切换零跳变**：任意文本文件（如 `.ts`）查看 → 编辑 → 画布形态不变（codeblock 全幅背景、上下 10px 边距、无圆角无边框），仅内容层变化；md/html 的 渲染↔源码 切换同验；lazy 加载瞬间无白框闪动
17. **md 源码↔编辑同套**：md「源码」toggle 与点「编辑」→ 同排印（11.5px 等宽/行高 20px）、同有行号列、同画布——只差语法着色（编辑态有着色为预期）；桌面右栏同验

**第十三批⑥**（composer 草稿持久化，两端）：
18. **未发送输入跨刷新保留**：任意会话输入框打字（不发送）→ 刷新 / 关 PWA 重开 → 草稿原样保留；切到别的会话再回来 → 各自草稿独立保留；发送后输入框清空且重开不再恢复；手动删光同上

**重连增量回放**（`d565ba4`，claude 会话，Mac 桌面 + 移动端）：
19. **长会话断网重连**：打开长 claude 会话 → 关 Wifi 几秒再开 → 重连后**内容不闪不重刷**（无 skeleton、既有消息不动）、offlineCap 横幅消失、断线期间新消息补齐且**淡入**；注意手机 PWA 断网期间 WS 语义与桌面一致
20. **全量回退分支**：API 重启（tmux respawn api）后重连 → skeleton + 全量重放正常（现状，预期行为）；pi/acp 会话断网重连 → 行为与之前完全一致（全量）

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过（184198 字节，content-type text/css）。
- **router22 残留进程待用户处理**：21 天前的 chromium 两棵进程树（PID 1989432/1989916，user-data-dir=/tmp/router22-fb31-diag3，remote-debugging-port=9781）——kill 被权限分类器拦截（跨项目资源），需用户自己清或授权；本项目探针无残留。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **pre-commit 快速通道**：staged 全为纯文档面 → 只跑 format:check+lint；任一命中代码面 → 全门禁。
- **右栏装配链（第十二批后终态）**：WorkbenchRoute rightPanelProjectKey/rightCtx → RightPanelTabs；workbench-shell gutter 无条件渲染（aside 内，现 role=separator 可聚焦）+ RailButton 收起态唤出。探针覆盖：probe-v2-m9-multi-device Part 4（global 连续性六断言）+ Part 5（真空态 + 拖拽七断言）。
- **MobileFileFocus back 契约**（第九批）：pop 优先回来源 + 深链兜底 /files。
- **CLI 模型 echo 是显示串**（第十三批③⑤）：CLI 对 set_model 的回应 `<local-command-stdout>Set model to <display></local-command-stdout>` 里 `<display>` = modelDisplayString 显示串（markdown code span 反引号包裹 + (resolved) 注解），非裸 model 名；`sanitizePersistedModel`（**api/src/model-id.ts 叶子模块单源**，claude-runtime re-export）归一链路四处必过：CLI echo 解析出口、spawn --model 传参、metadata 读写边界（parseMetadata/setModel/setClaudeSessionId/createMetadata）、前端 resolveCurrentModelAlias 显示兜底——再遇模型显示怪串先查这条链。
- **本 session 输出管线坑（复发两次）**：生成「反斜杠-u-XXXX」转义文本会退化为真实字符（PUA/NUL）——内置 Edit 匹配不上、markdown 记档也中招；处理用 python/perl 字节级替换，记档表述用纯文字描述占位符。
- **composer 草稿持久化（第十三批⑥）**：`web/src/lib/composer-draft.ts` 单源 hook（loadComposerDraft/saveComposerDraft 纯函数 + useComposerDraft）；key = `composerDraft:<type>:<sessionId>`；**assistant-ui 的 aui state 投影走异步调度**——setText 后订阅不立即回显，测试必须 waitFor/async act，同步断言读不到。
- **重连增量回放链路（`d565ba4`）**：cursorRef（最后带 uuid 消息）→ `claudeStreamUrl(project, session, since)` → `?since=` → handleClaudeStreamUpgrade（≤128 校验）→ relay.addSubscriber opts.sinceUuid → locateReplayAnchor（先倒序 live 后 history + topLevelUuidIs 顶层确认）→ session_init `replay:"delta"|"full"`。客户端 session_init 分流（delta 不 reset）+ history_end liveStart 修正（replayCursorRef 同步累进）+ 封口 effect（deltaClosePendingRef → setDeltaEnter rendered 范围 → 600ms timer 挂 ref 摘除）。探针 `probe-claude-reconnect-delta.mjs` 8 项。
- 记档位置：§6.13「真机反馈修复」第八~十二批 + reviewer 补审修复批（M13a–d）+ 重连增量回放段齐；协议文档「重连回放消息序列」段已更新为现行序列（session_init/seed_init/history/live + replay 字段）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-02；触发原因：重连增量回放（`d565ba4`）+ 记档
