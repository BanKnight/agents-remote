# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-30 13:10（两项优化落地：placeholder 按 provider + terminal 首开尺寸根因修复）

## 一句话状态

**用户报的两个体验问题已修（`ad5ec43`）：① composer placeholder 按 provider 区分
（codex/pi/acp 不再借用「向 Claude 提问」）；② terminal 首开尺寸重排根因修复（attach 前
resize-window 预设 + 撤 600ms churn 层）。门禁全绿（web 1009 / api / shared，受影响 e2e
10/10：codex-session 6 + acp 2 + codex-history 2），ar-dev 已 respawn 交付。批 G 及此前
批次保持完成态，待真机验收（清单见下，新增 12/13 两条）。**

## 本 session 焦点

### 关键决策（不可丢）

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

- ✅ 真实链路诊断探针（自建 test terminal 会话 + WS hook + tmux 窗口采样）：URL 尺寸 ✓ /
  resize 上行 1 次同值 ✓ / window 轨迹 200x50→147x36 实锤 / 首帧 ≥ resize 上行 ✓
- ✅ `ad5ec43` 两项修复 + 受影响 e2e 同步（codex「Ask Codex...」4 处、acp「Ask Agent...」1 处）
- ✅ 门禁：format/lint/typecheck 全绿；test web 1009 / api / shared 全过；CSS 硬闸过；
  tokens 机检 report-only（既有豁免项）
- ✅ ar-dev respawn（api+web）；产物 rg 实证含三个新 i18n 值且 chunk 200

### 阻塞 / 风险

- 无阻塞。**留观（不计 fail）**：
  - terminal 首屏无重排的真机效果未经真机确认（探针只证机制链路：预设→attach 同值零
    reflow 的推理链 + 服务端真值）；真机验收清单第 12 条。
  - placeholder 新文案的真机观感，验收清单第 13 条。
  - design P3 继承项：弹层行 description 对比度用户拍板保持现状。
  - code 备注：`atRequestIdRef` 计数器与 waiter Map 生命周期不同步（当前无触发路径）。
  - pre-commit test 阶段偶发 flaky（chat-idle-recycler / agent-tui 真实 sleep 时序敏感，
    单跑必绿；重试即过）。
  - 探针 DELETE 自建 terminal 会话返回 500（两次，未查根因——会话被清理了但状态码异常；
    遗留了一个 tmux 会话可能没杀干净，下批顺手查）。

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

**两项优化（ad5ec43，新增）**：
12. terminal 会话首开：首屏内容一次成形、无「先错乱后重排」的跳变（桌面 + 真机各验一次；
    若仍有重排，可能是预设失败的容错分支，回报现象即可）。
13. composer placeholder 按 provider 区分：codex「向 Codex 提问...」/ pi（chat 会话）
    「向 pi 提问...」/ ACP「向 Agent 提问...」/ claude 不变「向 Claude 提问...」。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
