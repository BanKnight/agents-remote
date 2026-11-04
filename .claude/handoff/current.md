# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-04 21:56（**通用诊断基建落地**：取证通道泛化为 diag-log
> 项目级基建 + 全局 DiagBanner + 设置开关，web 侧全部完成并 commit；api
> /api/diag 端点为第二批——等用户 CLI 空闲窗口）

## 一句话状态

22router 回放缺陷已修复（`a0750b4`，真机确认生效）。用户提出把取证调试手段
做成**通用方案 + 开关**，并指明「不要局限于会话，而是整个项目的」——本批把
replay-debug 取证通道泛化为**项目级通用诊断基建**（web 侧全量落地）：

- `web/src/lib/diag-log.ts`：`recordDiag(scope, text)` 分域环形缓冲（24 条，
  localStorage 持久化 + CustomEvent 广播）+ `isDiagEnabled`/`setDiagEnabled`
  开关（**默认关**，关 = record no-op + 审计计算一并 gate，稳态零开销）。
- `<DiagBanner />`（`components/shell/diag-banner.tsx`）挂 App shell
  （main.tsx，RouterProvider 同级）：开关开时常驻屏顶胶囊（fixed top，
  safe-area 避让），点开面板 = 缓冲全文 + copy all / upload / clear；
  诊断件不进 i18n（英文短字段）。upload 走 `POST /api/diag`（api 未落地前
  点击会失败提示——过渡态可接受，api 第二批落地后即通）。
- claude-adapter 回放 4 处接线迁移 `recordDiag("replay", ...)` 保留；live_end
  两套审计 + v3 rendered effect 加 `isDiagEnabled()` 门控（注释同步改写）。
- 会话页 ReplayDebugBanner 删除（全局横幅接管）；设置 → 通用 → 诊断日志
  开关行（role="switch" + toggle 形态，hint 说明行为）。

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **范围拍板**（用户）：开关**全部默认关**（稳态零开销）+ **同时做服务端接收**
  （/api/diag）+ **项目级**（不局限会话页）。项目级落地 = 挂 App shell 的全局
  横幅 + scope 分域 + 上传端点全局归属。
- **api 改动窗口约束**：api dev 是 bun --watch——改 api（或 shared）源码即热
  重载，会杀掉它 spawn 的 CLI 子进程。22router（6d09c971，etime 13.5h idle
  但进程活着）与 novels CLI 仍存活 → 本批零 api 改动；/api/diag 端点设计已
  定稿放本文件，等 CLI 空闲窗口落地。
- **live_end audit 块整体 gate**：审计跑容器完整投影链（renderChatStream ∘
  normalizeChatStream）有成本，默认关；v3 effect 关闭时清签名并跳过（开关
  切换清签名 + DIAG_ENABLED_EVENT listener，重开后首个 rendered 变化必
  record 最新状态）。
- **写入可靠性**：本批 Write/Edit 多次出现输出损坏（残片/占位符混入），靠
  「读回验证 + 立即修复」救回；连续两次失败必须停手换小步策略（按
  verification.md 纪律执行）。

### 进度

- ✅ diag-log.ts + 9 单测（默认关/环形/持久化/双事件/多 scope/clear/容错）
- ✅ DiagBanner 全局浮层（摘要胶囊 + 面板 copy/upload/clear + 失败态）
- ✅ adapter 4 处接线迁移 + 2 处审计 gate（rg 零残留）
- ✅ 会话页 ReplayDebugBanner 删除；设置开关行 + i18n（zh/en 5 key）
- ✅ 全门禁绿：format/lint/typecheck/1048 tests（+4 净增）/CSS 硬闸/tokens 机检
- ⏳ respawn web + 产物验证（下一步）
- ⏳ handoff current.md 已更新（本文件）

### 阻塞 / 风险

- 用户 CLI（22router etime 13.5h、novels）仍存活（idle 但进程在）——**api
  绝不能动**；/api/diag 端点等 CLI 紧急窗口落地（设计见下）。
- upload 按钮在 api 端点落地前是 404 失败态——过渡态可接受（用户知情）。
- push 待用户确认外发：`6a835b0` `c340f25` `257a5ce` `b37ee5c` `a0750b4`
  + 本批。

## /api/diag 端点设计（第二批，等 CLI 空闲窗口）

- **路由**：api/src/index.ts 全局段（settings 同级，非项目 scope）。
  `POST /api/diag`，鉴权同其它全局端点（cookie session，走现有 auth 中间件）。
- **body**：`{ entries: [{ t: number, scope: string, text: string }] }`；
  校验 entries 数组 + 单条字段类型；**大小上限 64KB**（24 条 × 千字节级行，
  绰绰有余；防滥用）。
- **落盘**：`api/diag-uploads/<ISO 时间戳>-<rand4>.json`（.gitignore 加入）；
  不进 PROJECTS_ROOT（诊断数据非项目数据）。写入前不打印 entries 内容（密钥
  不回显原则——诊断行可能含会话 uuid 等，落盘不回显到日志）。
- **响应**：`{ ok: true }`；失败 4xx/5xx 结构化错误。
- **落地动作**：api/src/index.ts 加路由 + `api/.gitignore` 加 diag-uploads/；
  pre-commit 全门禁 + `respawn-pane -k -t ar-dev:0` 重启 api（**仅在用户
  CLI 全部空闲/退出后**；respawn 会杀 CLI 子进程，必须先确认）。
- **落地后验证**：真机开开关 → 复现 → upload → 服务端文件出现 → 读文件
  确认 entries 完整。

## 下一步

1. respawn web（`tmux respawn-pane -k -t ar-dev:1`）+ 产物验证
   （`rg "recordDiag" web/dist/assets/*.map` + CSS content-type）。
2. 交用户验收：设置 → 通用 → 诊断日志开关 → 横幅出现 → copy/upload/clear。
3. api /api/diag 第二批（等 CLI 空闲窗口；设计见上）。
4. push 六批待用户确认。
5. 遗留：脱壳批真机验证 checklist 反馈；v1.7 真机清单；wiki/ git 归属；
   swap 扩容（建议级）。

## 易丢的关键上下文

- **web chunk 布局**：claude-adapter 打进 `ChatSessionDetailRoute-*.js`；
  产物验证 `rg "recordDiag" web/dist/assets/*.map` 直查（符号名查 .map）。
- **diag-log localStorage keys**：`ar-diag-log`（缓冲）/ `ar-diag-enabled`
  （开关，"1"/"0"）；旧 `ar-replay-debug` key 不迁移（临时取证数据，重开
  开关重新积累即可）。
- **DiagBanner 不走 Radix**：fixed 浮层无需 modal 语义（无 scrim/Esc 需求，
  §4 约定 modal 语义才走 Dialog）；点击胶囊外不关闭是可接受行为（诊断件）。
- **桌面复刻脚本**（历史调查，留档）：`/tmp/proj-fix-verify.mjs`（K2 臂）、
  `/tmp/proj-hypo.mjs`、`/tmp/noouuid-stress.mjs`。
- api/web 标准重启 = `respawn-pane -k -t ar-dev:0|1`；**不能在用户 CLI 运行
  时重启 api**。
- 大文件扫描：2G ulimit -v 会挂 bun——systemd-run cgroup MemoryMax；
  1.2GB JSONL 用「流式 + 尾 8MB 切片」。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
