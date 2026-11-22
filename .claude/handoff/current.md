# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-23（**t3code 深调研批完成待提交**——v2 主报告重写 + 四份
> deep 分册落盘 + index.md 更新；prompt 队列 v1/v2 批已全部推送
> （origin/main = `1c3f4900`），剩余待办 = 队列真机清单交用户验证）

## 一句话状态

t3code 调研 v2 重做完成（用户反馈上轮「过于简陋」）：源码完整化（unshallow 至
2026-11-22 HEAD）+ 四路 subagent 并行深挖（体验层/server 机制/社区反馈/演进叙事）
→ 四份分册（`t3code-deep-{ui,server,community,evolution}.md`，全带行级/URL 级证据）
→ 主报告 `t3code.md` 重写为整合版（社区定案 + 体验层三件工程 + 四个可移植原语 +
可学习清单 A/B/C 三档 + 首版错误更正）。docs 面待 commit，push 待用户确认。

## 本 session 焦点

### 本批：t3code 深调研重做（2026-11-23，docs 面待 commit）

- **任务起源（用户 verbatim）**：「上次我们调研过t3code，但是说实话，我觉得你的
  调研过于简陋了，给我的感觉和别的用户反馈的感觉完全不一样，我认为有非常多可以
  向他们学习的地方」。
- **方法**：① 源码完整化（`~/repos/t3code` unshallow + reset 至 origin/main
  2026-11-22 `6972026121`，解决上轮浅克隆+blob 限流硬伤）；② 四路 subagent 并行
  （依赖拆分：ui/server/community/evolution 各自落盘分册）；③ 分册=证据层、
  主报告=整合层的文档结构；④ 证据分级纪律（【源码 文件:行】/【文档】/【社区 强中弱】）。
- **产出五文件**：
  - `t3code.md` 重写 v2（8 节：分册索引/规模更新/社区定案/体验层三件工程/
    机制层四原语/演进主线/可学习清单 A 立即 10 条·B 中期 13 条·C 不跟/
    首版更正记录/一句话对比）。
  - `t3code-deep-ui.md`（139 行）：性能五层基建、消息流三状态机（滚动跟随
    per-input-source/折叠锚定/跨会话记忆）、composer 语义默认值、移动端决策、
    动效哲学、微交互、10 条可移植清单 + 源码索引。
  - `t3code-deep-server.md`：orchestration-v2 全链精读（KeyedLock/命令回执幂等/
    EventSink 单事务/outbox worker）、队列/审批/checkpoint/delegate/settle/
    多端同步/事件修剪八节 + 10 条【真增量】/【已有等价】/【不移植】清单。
  - `t3code-deep-community.md`（143 行）：12+ 轮多源搜索（HN Algolia/App Store
    50 条全文/Google Play/YouTube/博客/中文社区），用户爱八组 + 场景表 + 吐槽
    两层 + 竞品胜负手 + 启示 8 条，全带 URL 与强中弱分级。
  - `t3code-deep-evolution.md`（102 行）：v0.1.7→v0.1.12 逐版 + git 火力分布 +
    docs 目录地图 + AGENTS.md Taste 九条 + 官方叙事 + 启示 8 条。
- **旧调研事实错误更正（重要）**：v1 称「Orchestrator 单 worker 串行化」——
  **不实**（浅克隆限流下误读），实为 per-thread KeyedLock + 命令回执幂等
  （insertIfAbsent 占位 + 重复 commandId 重放已存事件）。deep-server.md 开头
  有方法论更正注记，主报告 §7 有更正表。方法论教训已写入主报告：浅克隆抽样
  会产出「貌似确定的错误结论」，竞品深调研必须完整 clone + 符号级走查。
- **核心发现速记**（汇报用户用）：社区第一名是「不在工位也能继续」（四源交叉），
  ADHD 用户三源点名 settle/snooze 注意力管理；「感觉贵」= 性能基建 + 消息流
  状态机 + 状态语义纪律三件可指认工程；机制层四个可局部移植原语（命令回执
  幂等/重启恢复定案/队列一等化/子任务问题升级——后者是 OPC 方向最值得抄）；
  边界共识「单 harness 用户留官方 app」→ 我们应押多 provider × 远程公式；
  token 5h 窗口计量 1.6-1.7x 偏差是 Anthropic SDK 层问题（我们直 spawn 无此层
  = 真实结构性优势）。
- `docs/research/index.md`：t3code.md 条目重写 + 四份 deep 分册新增条目（L41 起）。

### 上一批：prompt 队列 v1/v2（全部已推送，origin/main = `1c3f4900`）

- v1 排队可视+撤回/编辑（`b6f5025d`）；lifecycle 收编（`1ae76c15`）；
  CLI 2.1.325（`3e745749`）；docs（`e1c1223c`/`005002d6`）；
  v2 服务端化（`0d16d5d9`，code-reviewer P1 种子空洞 + 2 P3 全修后 amend）+
  docs（`58a1be3c`）+ gtd/handoff 同步（`1c3f4900`）。
- v2 技术细节（快照语义/uuid 白名单链/gate 折叠入口/种子无条件发 P1 修复）见
  snapshot `20261123-0248.md` 与 v2 批 commit message；v2 实现要点也已沉淀在
  session-relay/claude-runtime 源码注释。

## 下一步

1. **t3code 调研批收尾**：commit（docs 面，纯文档快速通道）→ push 待用户确认
   → 向用户汇报核心发现（重点：可学习清单 A 组里与队列 v2 直接接续的
   follow-up steer 语义 + 离队 watch 两条）。
2. 真机清单（交用户，队列 v1+v2 合并）：两设备同开会话——A 端 running 中排队 →
   B 端立即见 chip；A 端撤回 → B 端 chip 消失；刷新 B 端 → chip 仍在；撤回
   编辑回填照旧；turn 结束 chip 清空。

## 挂账（非本批）

- 真机验证清单（pages 五条 + 渐进披露五条，gtd @mcp-apps 组）仍待用户。
- checkpoint 批（dad68fe/278289d2/d81b28d9，已推送）待真机验收。
- settle 批（`16c9911`，已推送）待真机验收。
- probe-fab.mjs 过期断言（5 FAIL）待拍板重构/退役。
- 技能更新检测服务端慢（逐 repo 串行拉 GitHub Trees）。
- StatusDot/StatusMarker 休眠死代码待拍板。
- wiki 格式对齐批 → wiki Quartz（先 /check-deps）。
- 会话进行中调度 auto-retry pending 注入计时器（runtime 生命周期遗留）。
- checkpoint 批已知取舍：diff 面板单容器滚动；只做 claude 对话回滚。
- mock 了 overview 的其它 e2e spec 未补 sessions-stream mock（实锤一条修一条）。
- pages 域 + 外部 MCP server 管理批（2026-11-17 完成）待提交 + 真机验证
  （gtd @mcp-apps 组）。
- t3code 调研产出的可学习清单（主报告 §6）待用户拍板排期——A 组 10 条多为
  既有批次（队列 v2/settle/checkpoint）的边界补全，成本低。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

最后更新：2026-11-23 / 触发原因：t3code 深调研批完成（主报告 v2 + 四分册 +
index 更新），docs 待 commit、push 待确认。
