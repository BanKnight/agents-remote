# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-23 20:40（**t3code 深调研批全部推送完成**——v2 主报告 +
> 五份 deep 分册（ui/server/community/evolution + 新增 spec）+ index 更新
> （origin/main = `6bf41f84`）；剩余待办 = 队列 v1/v2 真机清单交用户验证）

## 一句话状态

t3code 调研 v2 重做完成并已全部推送（用户先反馈上轮「过于简陋」、再点名「都是
用户评价，spec 呢」）：源码完整化（unshallow 至 2026-11-22 HEAD）+ 四路 subagent
并行深挖 → 四份分册（ui/server/community/evolution）→ 主报告 `t3code.md` 整合版
→ 用户追补要求后完成第五份分册 `t3code-deep-spec.md`（orchestration-v2 九篇
3293 行逐节精读 + internals 七篇，670 行全带 `文件:行号`）。origin/main = `6bf41f84`。

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

### 追补批：spec 体系深读（2026-11-23，已推送 `6bf41f84`）

- **任务起源（用户 verbatim）**：「我们完全没用wiki，你怎么扯过去的。另外，我发现
  进度中，你提到的都是用户评价，那spec呢？完全没有吗？」——① 已删 inbox 里
  wiki 相关的瞎扯条目（教训：不做 speculative 建议）；② site 报告页补「⑤½ 他们
  的 spec」节；③ 用户批准后逐篇精读 orchestration-v2 剩余 8 篇。
- **产出**：`docs/research/t3code-deep-spec.md`（670 行）。结构：§1 体系总览
  （README 宣言 / 8 Goals / 10 Invariants / 七层图 / 最小心智模型 / 六条
  probe-derived requirements）§2 图模型（七类 durable 实体 + 三对分离 + sequence
  游标 + Run/RunAttempt + root 独占完成权 + turnItems 双投影）§3 实体 ID（十家族 /
  scoped correlation / IdentityBinding / 六 ordinal 轴）§4 生命周期（steer 四模式 /
  fork 稳定源点 / Stop holdQueue / 恢复三义）§5 能力系统（11 组 + resume 是必备
  primitive 非能力 + 八条降级映射）§6 上下文迁移三件套（五级策略阶梯 / staleness
  七信号 / handoff include 9·do-not 4）§7 编排 MCP server（16 工具 / child 不复制
  parent 历史 / 特权天花板 / clientRequestId 幂等 / 14 typed 失败码）§8 测试策略
  （replay 边界 / 四层契约 / 首批十测试 / 测试基建先于生产重写）§9 internals 文档
  形态 §10 对我方启示三档（A 直接可用 6 / B 结构性参考 6 / C 不适用）§11 索引。
- **最直接接续点（下一步可用）**：① Stop 带 `holdQueue`（冻结队列、结束 watch、
  丢弃 wake）——队列 v2 的「停止时队列怎么办」答案；② Run/RunAttempt——运行中
  注入 = 打断 + 同 RunId 换 attempt，不依赖 provider 原生 steering；③
  resume 为必备 adapter primitive（与我们 --resume 底线同构，三种触发统一路径）；
  ④ child 只拿 task prompt（OPC 委派纪律）；⑤ completion barrier（先收敛投影
  再发布终态）。
- **诚实记录**：spec 内部两处字段名级不一致（ProviderThread 摘要字段 / Run 的
  countsForConversation 引用）已标在分册 §2.12；不影响模型级结论。
- **执行中教训**：该批两个 subagent 会话因「Auto mode safety check 不运行」的
  环境故障无法自行写文件，全文经 handback 无损回收（tool-results 持久化文件），
  主 agent 直接 Read 收回。subagent 两次请求「代为落盘 /tmp 切片」均按
  permission-laundering 纪律拒绝（内容已够用，无需中间产物）。

### 上一批：prompt 队列 v1/v2（全部已推送，origin/main = `1c3f4900`）

- v1 排队可视+撤回/编辑（`b6f5025d`）；lifecycle 收编（`1ae76c15`）；
  CLI 2.1.325（`3e745749`）；docs（`e1c1223c`/`005002d6`）；
  v2 服务端化（`0d16d5d9`，code-reviewer P1 种子空洞 + 2 P3 全修后 amend）+
  docs（`58a1be3c`）+ gtd/handoff 同步（`1c3f4900`）。
- v2 技术细节（快照语义/uuid 白名单链/gate 折叠入口/种子无条件发 P1 修复）见
  snapshot `20261123-0248.md` 与 v2 批 commit message；v2 实现要点也已沉淀在
  session-relay/claude-runtime 源码注释。

## 下一步

1. **t3code 调研批已完成并推送**（`6bf41f84`）。后续可选：主报告 `t3code.md`
   的「四份分册」字样顺手改五份（纯文案）；spec 分册 §10 A 组前两条
   （Stop holdQueue、interrupt ack≠终态）可作为队列 v2 后续批立项。
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

最后更新：2026-11-23 20:40 / 触发原因：t3code spec 体系深读追补批完成并推送
（第五分册 670 行 + index + 报告页 → `6bf41f84`）；阶段收尾 handoff。
