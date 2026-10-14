# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-14（**上下文占用指示重做批已 commit `6904d94`**——环形仪表+三档+浮层；同日：标量管道 P0 `c8de11e`、claude-code 2.1.299 `52fc6d0`、浮层回焦 `7b83976`/`8eb4a4e`、卡形制/空隙/滚动条/发送钮数批）

## 一句话状态

上下文占用指示显示端重做批已交付（`6904d94`）：P0 文本版升级为**环形仪表 + 百分比 + 三档变色 + Popover 细节浮层**（用户拍板 ZCode 同构），控制行右组成组。全门禁绿（单测 1722、探针 6/6 含档位色继承链+右组几何、CSS/tokens 闸过），双 reviewer 审查消化完毕。**待真机验收**。

## 本 session 焦点

### 关键决策（不可丢）

- **架构共识（讨论定调，指导后续所有状态批）**：采集层（per-agent × per-mode）→ 统一会话标量 state（api）→ WS 单管道 → 前端统一组件。①**mod 不写入 stream-json 流**（协议流由 CLI 内部 writer 管理，无此 API）；其数据走旁路（HTTP/文件）由 api 收敛进同一 WS 广播，前端协议零新增。②**终端模式状态不用 OSC**（tmux 吞未知序列）——正解 = 同一个 bridge mod 在终端交互式会话照跑（官方表格：terminal = hooks Yes）。③未来 pi/acp 双模式 = 各自 runtime 两种进程形态，标量走同一广播，tmux 管理复用 `tmux-runtime.ts`。
- **重做批实现要点（在 P0 骨架上扩展）**：①协议双形态——`seed_init.contextUsage` 嵌套对象（回放恢复全字段）/ `context_usage` 帧平铺（live 广播）；②窗口上限 = `resolveContextWindow` 纯函数（`[1m]` 后缀 ⇒ 1M、alias 经 spawn 时记录的 resolvedAliases 映射查、无 model 回落 sonnet、opusplan 恒判 sonnet——Plan Mode 走 OPUS env 的已知误差注释在案）；③`captureModelFromLine` 切模型重算窗口且**变化即补发帧**（不等下一条 usage 帧，防在线前端分母陈旧）；④环形 SVG 环心留空（双尺寸缩放环心元素不可读，百分比环外旁注——与 plan「环心 gauge」的偏差及理由已写进 spec）；⑤**右组成组**：usage 单独 ml-auto 会与 `.send2` 的 auto 均分剩余空间落正中——usage+Stop/Send 同包一个 ml-auto 容器（容器内 auto 归零）；⑥浮层 `.u-lvl-*` 只管 color（fill 继承），tint 底仅 `.iicn/.ipill` 变体（防浮层面被 tint 污染）。
- **自查抓到真 bug（已在批内修）**：`normalizeChatStream` 的 system 分支尾部 fallback（`messageToThreadLike` 对无 content 帧返回非 null system 摘要）会把 `context_usage` 渲染成噪音气泡——补 `continue` 短路 + 单测锁定。
- **CLI stdout 时序认知（诊断踩坑得出）**：claude CLI 在**收到首条 stdin 消息前不吐任何 stdout**（不主动发 system/init）——产品链路无碍（前端 prompt 驱动），但「等 init 再发 prompt」的探针/诊断脚本会死锁。
- **（沿用）CLI 2.1.299 升级**：OSC 7501 headless pipe 不可达（TTY-only）；modelMapping env 注入免疫 alias 漂移；「关闭不回焦」两族约定（spec §5.0 / frontend-notes §33）。

### 进度

- ✅ **会话标量统一管道 P0** `c8de11e` + **显示端重做（环形仪表+三档+浮层）** `6904d94`（双 reviewer 消化：design P1 浮层档位接线断线 + code P2 补发帧 + P3×5 全修）
- ✅ **spec §4.1-3「上下文占用指示」条目成文**（双形态/三档/浮层/右组/数据契约 + 验收清单项）
- ✅ claude-code 升级 2.1.299 `52fc6d0`；浮层回焦 `7b83976` 真机验收通过
- ⏳ **下一批候选（已拍板方向，待排期）**：①**双模式切换**（idle-only 可逆视角切换、终端模式审批让位、UI 入口「在终端打开」/「回到对话」）；②mod 采集批（bridge mod 旁路 → 同一管道）；③插件管理 UI。

### 阻塞 / 风险

- 无阻塞。**本批真机清单**：①控制行右组形态（usage 环+百分比紧贴 Send 左侧，非正中）；②环弧与百分比一致性；③点开浮层（进度条/汇总/明细四行/档位色）；④窄/宽端双形态（iPhone .iicn 28×28 tint 底 / ≥1024 .ipill）；⑤发一轮消息后数值更新。**未完成验证（沿用）**：真实 WS 端到端链路（分类器拦）——建议真机顺带复核。

## 易丢的关键上下文

- **P0 标量管道骨架**（后续批照此扩展）：shared `ClaudeContextUsageChanged`（平铺明细）+ `seed_init.contextUsage`（嵌套）→ api `captureContextUsageFromLine` + `resolveContextWindow` + `buildSeedInitLine(…, contextUsage)` → session-relay knownSubtypes → web `applyMessageScalarState`（contextUsage 对象）+ normalizeChatStream 短路 → `ContextUsageIndicator`（环形仪表，右组容器）。
- **探针定位口径**：aria-label 现带数值（a11y）——`button[aria-label^="上下文占用"]` 前缀匹配，精确匹配会失配。
- **探针**：`scripts/probe-context-usage.mjs`（4 断言：无标量不渲染 / 帧折算 / 更新 / 重连 seed 恢复）。
- **CLI 探查结论**（延续）：`/tmp/cc-changelog.md`（2.1.269-299）；2.1.288 后台 Bash 限时 30min、2.1.285 `-p` 默认 auto mode 均待真实使用观察。
- 探针纪律（沿用）：`systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`；一次性诊断不入库用后删（本批 `_diag-usage-e2e.mjs` 已删）。
- 会话清理端点 = `POST /api/projects/<p>/agent-sessions/<id>/close`（**不是 DELETE**——DELETE 会命中项目删除路由）。
- 验证用测试项目（PROJECTS_ROOT/test），不在正式项目建 session。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-14（晚）；触发原因：上下文占用指示重做批收尾（commit 6904d94 + 记档）
