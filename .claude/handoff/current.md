# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-16（左栏布局 + CLI 2.1.299 新协议批——实现/review/门禁全绿，**未 commit**）

## 一句话状态

两项用户反馈已实现并经 code/design 双 review 消化：**①桌面左栏项目列表** `max-h-[40%]`+内部滚动（项目多时列表自滚、会话区保底 ≥8 行，探针 7/7）；**②CLI 2.1.299 四类新协议**全接入单管道——`cost-state` → 标量 state + ℹ 信息面「累计费用」行（第四标量）、`system/permission_check_status` → 投影 skip（客户端全隐身，纯内部信号）、attachment `remote_session_change`/`environment` → ATTACHMENT_CONFIG 可读卡片（rendered body）。门禁全绿（format/lint/typecheck + api 953 + web 809 + shared 10 + CSS 硬闸 + tokens 机检）、session-mode e2e 3/3、左栏探针 7/7。**未 commit（等用户指令）**。

## 本 session 焦点

### 关键决策（不可丢）

- **cost-state = 统一会话标量管道第四标量**（同族 contextUsage/sessionStatus）：Pass 1 `applyMessageScalarState` latest-wins 整帧覆盖（`totalCostUSD` 数字守卫）；Pass 2 normalize skip（不落兜底 = 不刷屏）；消费面 = ℹ 信息面一行（`bridge.getCostState` 打开瞬间快照；bridge 身份稳定，闭包经 `costStateRef` 读最新）。**无数据不落行**。
- **ℹ 信息面行序（design review P2-1 已修）**：恢复 ID → 会话目录 → **累计费用（最后一行，两份原型位）**；原插入位置在会话目录之前，与紧邻注释矛盾，已移到 `if (project)` 块之后。
- **单标量子集 diverge 记档**：原型「6 轮 · $1.28 · 52k tok」→ 现只显 `$X.XX`（modelUsage/时长/行数已在 ClaudeCostState，待 UI 扩展，不伪造推算值）。
- **costState 恢复缺口（code review P2-1，记档接受）**：relay 在 compact_boundary 清空 history+live 缓冲 → compaction 后断线重连若 JSONL 未落该帧，ℹ 累计费用行暂缺，直到下一帧自愈；治本需 relay 持久 last frame + seed_init 回种（对标 contextUsage），属后续批次。已写入协议文档 `#### cost-state` 处理方法 §1。
- **attachment 两个新子类型不列 case（code review P3-2 消化）**：`handleAttachment` default 同为 `makeAttachmentBubble`，显式 case 零行为差异 → 删除，真实契约落在 `ATTACHMENT_CONFIG` 两个条目（badge = pr→commit→url / cwd 尾段；body = `renderedBody` 提取 `rendered[].content`）；测试改写为断言 config 条目（含 badge 值 + body 非空 + 无 rendered 时 null 优雅降级）。`ATTACHMENT_CONFIG` 因此 export。
- **api `knownSubtypes` 收编 `permission_check_status`**（code review P3-3）：免每次权限检查打 `[relay] unknown system subtype` 日志。
- **zh 标签 `claude.attachment.environment` = 「环境信息」**（design P3-1）：一手样本既有启动快照帧又有 changes 帧，「变更」不覆盖快照语义。
- **session-mode e2e test 1 是负载敏感竞态（非本批引入）**：pending 细条窗口 ≈ POST 往返（mock 300ms），断言原排在「菜单关闭 + poll」之后，高负载时被甩出窗口（高负载 4/4 挂、同代码低负载复绿 + HEAD 基线对照实锤）。修复 = **pending 断言紧接 click**（竞态免疫），非改产品。

### 进度

- ✅ 左栏：`workbench-side.tsx:405` wrapper `shrink-0` → `shrink-0 max-h-[40%] overflow-y-auto`；探针 `scripts/probe-side-projects-scroll.mjs`（mock /api/overview 撑 40 项目）7/7
- ✅ 协议四类：shared 类型（`ClaudeCostModelUsage`/`ClaudeCostState`/两个 Attachment 子类型）、adapter（标量分支 + 两处 skip + getCostState）、attachment-bubble（两 config 条目 + `renderedBody`）、instance-area（ℹ 累计费用行）、i18n zh/en 三 key、协议文档（cost-state 专节 + permission_check_status 小节 + attachment 两子类型 + 26 种子类型）
- ✅ 双 review 消化：code 1×P2 + 9×P3（P2-1 记档、P3-2/P3-3/P3-9 已修，P3-5/6/7/8 判定不动/接受）；design P2-1 已修 + P3 三项处理
- ✅ 门禁全绿 + e2e 3/3 + 探针 7/7；ar-verify-css 通过（content-type text/css）+ tokens 0 违例
- ⏳ **未 commit**（个人项目直接 main；等用户指令）
- ⏳ **本批真机清单（交用户）**：
  1. 多项目下左栏项目列表**内部滚动**，下方会话列表仍可点选/操作（40% 上限是否合适留调参口，改一个类名）
  2. 跑一轮会话看 ℹ 信息面「累计费用」行随 API 调用增长（恢复 ID → 会话目录 → 累计费用 的行序）
  3. 触发远程会话变更 / 环境帧，attachment 卡片显示可读正文（badge = PR/commit 或目录尾段）
  4. 权限检查不再出 `system · permission_check_status` 调试气泡
- ⏳ 历史挂起：前两批真机清单（5 态化 + 上下文占用）与新批清单未验收；长期测试项用户后续给结果
- ⏳ 功能批候选：mod 采集批 / 插件管理 UI / PTY+OSC 7501
- ⏳ P3 挂起：git 写路径 NOT_CHANGED 空态 / effort 确认门双数据源 / config 读改写并发窗口 / ℹ 配置行 terminal 让位 / in-flight ensureRunning 竞态窗（~1s，记档）

### 阻塞 / 风险

- 无。左栏 40% 上限的实际观感需真机确认（唯一留口）。

## 易丢的关键上下文

- **`ℹ 信息面` 是打开瞬间快照**（非响应式）：新增字段一律经 bridge getter + ref 镜像读取，不改 bridge 身份（deps 仅 [sendToSocket]）。
- **探针阈值纪律（§29）**：栏内 chrome 区 ≈180px 不随栏高缩放 → 会话区保底用**绝对地板**（8×34px）而非栏高百分比。
- **`ATTACHMENT_CONFIG` 现为 export**：新增 attachment 子类型的真契约 = config 条目（icon/labelKey/badge/body），不再加 handleAttachment case。
- **协议文档 cost-state 节**：JSONL 是否落盘未证实（仅 WS 帧实证）；compact 清缓冲缺口已记档。
- 探针跑法：`systemd-run --scope --user -p MemoryMax=2G bun scripts/X.mjs`；e2e 同法 + `-- e2e/xxx.spec.ts`；验证用 PROJECTS_ROOT/test。
- **e2e/单测高负载会假挂**（本次实测：session-mode test 1 + api 2 例），判「本批引入 vs 环境」先降负载复跑或用 stash 基线对照，别在源码层空转。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-16（左栏布局 + CLI 2.1.299 新协议批，未 commit）
