# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-30 14:10（cbe0b72：resize-window 预设的 manual 副作用修复——折叠 composer 后终端不跟随 resize）

## 一句话状态

**用户真机反馈「terminal 内容没填满，缺口 = 折叠 composer 空间」已修（`cbe0b72`）：
根因 = `ad5ec43` 的 attach 前 resize-window 预设把 tmux session 的 window-size 覆写成
manual（探针实证），window 锁死在首帧预设尺寸、后续 resize 上行全部不跟随。修复 = 预设
后立即 set-option window-size latest 恢复自动跟随（探针实证展开/折叠全程跟随 + 首开零
reflow 收益保留）。门禁全绿（api 1228 / shared 11 / web 1009），ar-dev 已 respawn 交付。**
此前 `ad5ec43` 两项（placeholder 按 provider + 首开尺寸）保持完成态，待真机验收（清单 13 条）。

## 本 session 焦点

### 关键决策（不可丢）

- **resize-window 的 manual 副作用（勿再犯，2026-10-30 真机反馈取证）**：`tmux resize-window
  -x/-y` 会把 session 级 `window-size` option 从 latest 覆写成 **manual**（display-message
  `#{window_size}` 可验）——window 尺寸从此固定，latest 的「跟随 client resize」自动行为整个
  失效。任何用 resize-window 预设尺寸的地方，**预设后必须紧跟 set-option window-size latest
  恢复**（attach 预设场景：无 client 时 latest 不改尺寸，预设值保持到 attach 同值覆盖）。
- **诊断方法论**：第一轮探针（静态点折叠/展开，Chromium）全绿没复现——因为探针的 localStorage
  无持久化态、首帧折叠 = 预设 = 后续同值，锁死不可见。用户场景（localStorage 存了展开态 →
  首帧矮容器预设 → 折叠变高）才触发。**tmux window 真值必须量**（runtimeKey 不在 DTO，用
  `tmux list-sessions` create 前后快照差找新会话名；before 快照必须在 create 之前取）。
- **terminal 首开重排根因（`ad5ec43`，仍有效）**：tmux window 以 new-session 固定起步尺寸
  （-x 200 -y 50）排版旧屏，attach（window-size=latest）瞬间才跳 client 尺寸 → reflow 前旧
  尺寸帧先到。修复 = attach 前 resize-window 预设（-y-1 = status line 占 client 底行），
  cbe0b72 补上恢复 latest。600ms churn refresh 层已撤，勿按旧根因加回（代码注释有锚）。
- **placeholder 拆分原则**：每个 provider 一把 key（`claude/codex/pi/acp.inputPlaceholder`），
  `claude.disconnected`（"正在建立连接中…"）中性复用保留。ACP 是通用协议无具名 agent →
  "Ask Agent..." 中性文案。
- **i18n 类型单源是 en.ts**（`TranslationKey = keyof typeof en`）：加 key 两文件都要加。

- **terminal 首开重排根因（探针取证，勿再误诊）**：`terminalSizeRef` 机制一直正常（首连
  URL 实测带 147x37）。真根因 = tmux window 以 `new-session -d -x 200 -y 50` 固定起步尺寸
  排版旧屏，attach（window-size=latest）瞬间才跳到 client 尺寸 → reflow 前按旧尺寸排版的
  帧先到客户端。修复 = 服务端 attach 前 `resize-window -t <key>: -x cols -y rows-1` 预设
  （-y-1 = status line 占 client 底行，实测 37→36 实证；ar 会话恒 status on），attach 覆盖
  同值零 reflow。失败容错 = 忽略（退化现状行为）。600ms churn refresh 层（PTY 80x24 旧时代
  补救层）随之撤除；勿按旧根因加回（代码注释有锚）。
- **placeholder 拆分原则**：每个 provider 一把 key（`claude/codex/pi/acp.inputPlaceholder`），
  `claude.disconnected`（"正在建立连接中…"）中性复用保留。ACP 是通用协议无具名 agent →
  "Ask Agent..." 中性文案。
- **i18n 类型单源是 en.ts**（`TranslationKey = keyof typeof en`）：加 key 两文件都要加。

### 进度

- ✅ 诊断探针三轮（`scripts/_diag-terminal-collapse.mjs`，工作区留存未入库）：① 静态折叠/
  展开 Chromium 全绿（复现不了）；②③ 补量 tmux window 真值（修 before 快照时序）→ 实锤
  window-size 被覆写 manual、展开 147x35 上行后 window 锁死 41 行不跟随
- ✅ `cbe0b72` 修复（预设后 set-option latest 恢复）：探针复验展开 147x35 → window 147x34、
  折叠回 147x42 → 147x41、reload 同值，全程跟随；首开零 reflow 收益保留
- ✅ 门禁全绿：format/lint/typecheck；api 1228 / shared 11 / web 1009 全过
- ✅ ar-dev api 已 respawn（web 无改动）
- ✅（前批）`ad5ec43` 两项修复 + 受影响 e2e 同步 + 产物实证

### 阻塞 / 风险

- 无阻塞。**留观（不计 fail）**：
  - terminal 首屏无重排的真机效果未经真机确认（探针只证机制链路：预设→attach 同值零
    reflow 的推理链 + 服务端真值）；真机验收清单第 12 条。
  - placeholder 新文案的真机观感，验收清单第 13 条。
  - design P3 继承项：弹层行 description 对比度用户拍板保持现状。
  - code 备注：`atRequestIdRef` 计数器与 waiter Map 生命周期不同步（当前无触发路径）。
  - pre-commit test 阶段偶发 flaky（chat-idle-recycler / agent-tui 真实 sleep 时序敏感，
    单跑必绿；重试即过）。
  - 探针 DELETE 自建 terminal 会话返回 500——根因已查：`DELETE /api/projects/:name/terminal-sessions/:id`
    在 handleSessionRoutes 无处理器，穿透到 index.ts:1190「DELETE /api/projects/ 前缀 = 删项目」
    兜底 → deleteProject("test/terminal-sessions/xx") → validateProjectName 500。web 产品路径
    不受影响（走 `POST .../close`）；仅 RESTful DELETE 直调（第三方/探针）踩中。修复选项 =
    兜底分支收窄（encodedName 含 `/` 时 404）或补 DELETE session 分支，待用户拍板。
  - test 项目残留 tmux 会话 `ar-terminal-test-9f86d081-terminal_bf9`（创建于 2026-10-30
    11:40，与 4 次探针自建 id 均不匹配、时间窗口与用户真机测试吻合）——归属不明未删，
    待用户确认后清理。

## 下一步

1. **真机验收**：清单 13 条（下方，12/13 为本批新增）。
2. codex 接入开发任务全部完成（批 1/2/A–G）；后续按真机反馈修问题。
3. 探针 DELETE 500 待查（低优先）。

### 真机反馈修复（2026-10-30）

- **`0435ef6` 自动重试开关入口泛化到 codex**（用户实测「codex 缺乏自动重试」）：
  api 侧批 D 已全泛化、缺口是 4 个开关 UI 入口 claude-only 门；已全部放宽到 codex
  chat 形态（terminal 排除保留，claude 行为零变化）。
- **`ad5ec43` 两项优化**（用户实测「placeholder 同一句话」+「terminal 首开一次重排」）：
  placeholder 按 provider 拆 key（详见关键决策）；terminal 首开重排根因修复（详见关键决策）。

## 真机验收清单（批 D + E + F + G）

**批 G（composer 智能感应）**：
1. codex 会话 composer 输 `/` → 弹 skills 目录（名称+描述），Enter 直发 `/name`；
   无 skills 时无弹层；skills 文件增删后 `skills/changed` 自动刷新；删光后弹层清空。
2. composer 输 `@` + 片段 → 弹项目内文件路径（fuzzy、file/directory 图标一致），Enter
   只插入 `@path`（尾随空格）不发送；无命中不弹空面板。
3. 托管 apiKey（settings 填 key）会话能看到用户级 skills（home skills symlink 生效）。

**批 F（历史列表）**：
4. 项目左栏「View session history」→ 真实 `~/.codex` 会话在列（首条用户消息做标题、
   时间分组、大小副标题）；其它项目会话不串；「全部」段带项目限定符。
5. 点历史行 → 命名框 → Create → 回放历史（外部 codex-tui 会话也能 resume）；活跃行
   点击直接聚焦；删除（二次确认）文件真删；活跃行删除被 409 拒。
6. 已知限制：项目改名后旧 codex 会话在新项目名下不可见（预期）。

**批 D + E（同前）**：
7. codex 托管 CODEX_HOME 凭据 chat/terminal 双形态同源；自动重试 provider 泛化。
8. 上下文占用浮层 → 「压缩上下文」→ 「Compacting」pill → 「Context compacted」块。
9. 运行中发消息并入当前轮（steer）；错误重连 pill；ChatGPT 登录显示额度段。
10. codex 切终端形态带 ar-hub MCP；claude 会话同浮层压缩走 `/compact`。

**真机反馈修复（0435ef6）**：
11. codex chat 会话三处可见自动重试开关（头部 rotate 按钮 / ⋯ 菜单「自动重试」✓ 行 /
    ℹ 信息面行）；打开后 turn 失败自动注入重试消息，面板上方出现待发倒计时条
    （取消 / 立即重试）；终端形态 codex 无开关（预期）。

**两项优化（ad5ec43 + cbe0b72 修订，新增）**：
12. ✅ 已真机验收（2026-10-30 用户确认）：terminal 会话首开一次成形无重排；展开态首帧
    折叠 composer → 终端跟着长高填满无留白。
13. composer placeholder 按 provider 区分：codex「向 Codex 提问...」/ pi（chat 会话）
    「向 pi 提问...」/ ACP「向 Agent 提问...」/ claude 不变「向 Claude 提问...」。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
