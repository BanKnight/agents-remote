# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-18 14:20（终端残留修复 `130645b` + 完成横幅换行修复 `e6d291a` 均已提交推送）

## 一句话状态

**terminal 行首残留根因第二轮取证定案并修复**：真根因 = **app 侧 xterm 的 `convertEol: true` 误解析 tmux 的裸 LF**（tmux 用 terminfo `cud1=\n` 做「下移一行」并靠它隐式携带列位；置 true 把 LF 当 CR+LF → 文本左移 2 列 + 行尾残留）。**与 tmux 版本无关，升级 tmux 不能修**——确定性负载 A/B：3.5a 与 3.8 在 `convertEol:true` 下逐行相同的 6 行分歧，置 `false` 后两版都 0 行。修复 = `SessionDetailRoute.tsx` 改 `convertEol:false` + 撤掉上轮按误诊加的 5s 周期 `refresh-client` 层。

## 本 session 焦点

### 关键决策（不可丢）

- **真根因链**（勿再重查）：`ESC[r;3H ESC[K` + **裸 LF** + 文本（tmux 靠 LF 隐式带列位、不重发 CUP）→ `convertEol:true` 把 LF 当 CR+LF → 光标回列 0 → 文本左移 2 列 + `ESC[K` 从列 0 起擦 ≠ pane 从列 2 起擦 → **行首 1-2 列残留**（col1-2 margin 现象由此确切解释，不用再借「diff 跳过未变前缀盲区」）。**字节流完全正确、无失同步**。
- **上轮诊断被推翻**：上轮「tmux client 增量 diff 发射层失同步、只有全重绘能愈合」是**误诊**——错在**回放实验用了同一个 `convertEol:true`**，无法区分「流坏了」vs「解析器配错了」。教训：凡「同配置回放复现」类实验，必须再做**单变量对照（只改解析器配置）**才能把归因落到流或解析器。
- **#5340 与本 bug 无关**：DECSET 2026 是 tmux **3.7** 才引入（3.5a/3.6b 收到即忽略），claude ≥2.1.200 按「tmux ≥3.4」发同步标记，版本门槛本身错位。**已写入规则：勿再据 #5340 归因**。
- **A/B 方法（可复用）**：确定性负载 = 画 30 行「2 空格缩进 + 长文本」，再交替「自列 3 整行擦空」/「自列 3 重写文本」逼出 `ESC[r;3H ESC[K` + 裸 LF + 文本；用 `@xterm/headless` 按 live 时序（80x24 收前缀 → resize → 收余下）回放，与 pane 真值比对。**只发擦除、不跟文本的负载看不见分歧**（两侧 trim 后同为空串）。
- **tmux 3.8 仍保留在 `/opt/tmux-3.8`（未进 PATH，用户拍板保留）**，本机默认 `/usr/bin/tmux` 仍是 3.5a、**未动**。

### 进度

- ✅ 根因定案 + 修复落地：`web/src/routes/SessionDetailRoute.tsx` `convertEol:false`；`api/src/tmux-runtime.ts` 撤 5s 周期 refresh 层（保留 600ms attach churn 全重绘）
- ✅ 门禁全绿（format:check / lint / typecheck；api 987 / web 826 / shared 10）；CSS 硬闸过；dist 产物已落 `convertEol:!1`（无 `!0` 残留）
- ✅ 规则文档纠正：`.claude/rules/claude-debugging.md` 该节重写（真根因 + A/B 证据 + 「勿再据 #5340 归因」+ 第一轮误诊教训）
- ✅ code-reviewer 审查**通过（无 finding）**——逐项复核：convertEol 引用面全仓 1 处、字节源唯一（terminalWriteRef ← session-stream.ts:136 ← tmux attach data 回调）、删除符号零引用、定时器双路径清理完备。唯一可选建议（`SessionDetailRoute.tsx` 注释「行尾残留旧字」措辞与真根因打架）已修
- ✅ **commit `130645b` + push**（origin/main；`b5353df..130645b`）
- ✅ 一次性诊断产物已清（`/tmp/_diag-ab-*.sh`、`/tmp/abrun`、`/tmp/tmux-build`；保留 `/opt/tmux-3.8` 与 `/tmp/tmux-1000` 非我所有）
- ✅ **完成横幅统计串截断修复 `e6d291a` + push**（用户 2026-10-18 反馈「内容过长被截断」→ 指示「让它换行吧」）：`ClaudeSessionDetailRoute.tsx` `TurnStatsFooter` 的 completed 分支统计 span `truncate`→`break-words`（`.complete`/`.complete .tm` 无 nowrap，故零 CSS 改动）。验证 = 真实产物 CSS 注入 markup 的 DOM 几何 A/B **9/9 通过**（旧版 nowrap+ellipsis 单行 scroll 677 vs client 221 确被截；新版 white-space:normal + overflow-wrap:break-word 4 行换行、不横向溢出、宽度不变）。门禁全绿 + CSS 硬闸过
- ⏳ **待用户真机验收**：terminal 行首残留是否彻底消失（不再需要 5s 自愈）；完成横幅长统计串换行效果；推送通知 title 是否达意
- ⏳ 历史挂起：PWA 通知真机清单剩余项（③-⑪）；ℹ 配置行 terminal 让位 / in-flight ensureRunning 竞态窗
- ⏳ 功能批候选：mod 采集批 / 插件管理 UI / PTY+OSC 7501 / pi/acp 推送

### 阻塞 / 风险

- 无阻塞。
- **推送通知跳转偶发打不开**（用户 2026-10-18 报「大部分可以、小部分不行」，拍板继续观察）：已核 deep-link 构造链（`push-notifier.ts` `deepLink` → `sw.ts` `notificationclick`→`focusOrOpen`）与路由/tab id 口径**结构正确、非 id 错配**。剩余候选（按可能度）：① 跳转前会话已被关闭/删除 → 详情 404；② SW `focusOrOpen` 选中 client 的 `navigate` 失败且 `openWindow` 兜底也失败；③ 项目名含非 ASCII（如中文）在 `encodeURIComponent` 链路上的边界。**未修，等用户第一手数据**（失败那次的 project/session + 地址栏 URL）再定位。
- **`convertEol:false` 的行为面**：该 xterm 实例的字节源唯一（`message.type === "output"` = tmux attach PTY），仓库内 `convertEol` 仅此 1 处消费、无测试依赖、无别处依赖 true 的行为——故 `false` 严格正确。若将来出现非 tmux 的纯文本流喂进这个终端，需重新评估。
- **composer「无故被抬高」**（用户 2026-10-18 报、随即自愈，拍板「不用管了」）：诊断结论 = 唯一能抬升底边且能自愈的变量是 `--composer-keyboard-offset`（`keyboard-inset.ts:46` 的 `visible = vvHeight < innerHeight` 宽口径启发式，无法区分「软键盘」与「浏览器 chrome 动画/缩放/键盘残留导致的视口瞬态」）。**未修、未埋探针**——若日后再现，按 frontend-notes §22 埋默认常开的浮层打 `vv.height / innerHeight / vv.offsetTop / vv.scale` + 该 CSS 变量。

## 易丢的关键上下文

- **本 session 唯一 web 改动**曾只有 `8cbe266`（`.complete` 类名补齐，落在消息流 `TurnStatsFooter` 内，不在 composer 区）；composer 抬高与该改动无关。
- **A/B 证据已抄进规则文档（`.claude/rules/claude-debugging.md`），一次性产物已清**（`/tmp/_diag-ab-*.sh` / `/tmp/abrun` / `/tmp/tmux-build`）。若需复现：规则文档内含确定性负载配方（画 30 行「2 空格缩进 + 长文本」→ 交替「自列 3 擦空」/「自列 3 重写」逼出 `ESC[r;3H ESC[K` + 裸 LF + 文本）+ `@xterm/headless` 按 live 时序回放法。
- **隔离 tmux server 已全部收掉**（ab35/ab38/render）；生产 `ar-dev`/`novels-dev`/`router22` 全程未受影响（前后 `tmux list-sessions` 一致）。
- **本仓 jsdom 测试三坑**（`settings-notifications.test.tsx` 内注释）：matchMedia stub / 顶层 DOM 全局被清 / 无 `screen`。
- **探针/e2e/单测跑法**：`systemd-run --scope --user -p MemoryMax=2G bun …`；探针用 `bun` 跑不用 node。
- 验证用 PROJECTS_ROOT/test 项目；web=prod build 43012、api=dev 43011（ar-dev tmux）；改 vite.config 后 respawn web。

## 提醒

- 开干前读 `.claude/gtd/next-actions.md`；守 `.claude/constitution.md` 底线。
- 到达里程碑或感知将 compact 时，主动 `/handoff save`。

---
最后更新：2026-10-18 14:20（触发原因：完成横幅截断修复提交推送 e6d291a + 一次性探针清理）
