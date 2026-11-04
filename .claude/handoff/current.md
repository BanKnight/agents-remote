# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-04 22:30（**通用诊断基建全量落地**：web 基建 `693ce92`
> + api 端点 `0d094af`，端到端探针 8 断言全过；七批已 push）

## 一句话状态

22router 回放缺陷已修复（`a0750b4`，真机确认生效）。用户授权重启 api 后，
**通用客户端诊断基建两批全部落地**：web 侧（diag-log 基建 + 全局 DiagBanner
+ 设置开关）+ api 侧（POST /api/diag 接收端点），upload 全链路端到端验证通过。

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **范围拍板**（用户）：开关**全部默认关**（稳态零开销）+ **同时做服务端接收**
  + **项目级**（挂 App shell，不限会话页）。
- **api 端点落地**（`0d094af`）：POST /api/diag 挂 requireHttpAuth 已认证段
  （push-routes 同段结构）；entries 形状/数量/长度校验（拒绝不截断）+ 64KB
  护栏（413）；落盘 `~/.agents-remote/diag-uploads/<ts>-<rand>.json`（机器
  本地运行时数据惯例，push-subscriptions 同款，gitignore 已覆盖）；日志只记
  元信息不回显 entries 内容。shared ApiErrorCode 增 DIAG_* 三码。
- **端到端验证**（8 断言）：cookie 直连 200 → 服务端文件内容完整 → localStorage
  注入 reload 后横幅显示（跨刷新持久化路径）→ UI upload ✓ → 第 2 个文件含
  注入行。缓冲空时 upload 按钮 disabled（空数组上传无意义）。
- **写入可靠性**：本批 Write/Edit 多次输出损坏（残片/占位符/吞行），靠读回
  验证 + 立即修复救回（writeFile 吞行、重复声明、乱码标识符各一次）——长
  new_string 生成的可靠性边界要记住。

### 进度

- ✅ web 批 `693ce92`：diag-log（9 单测）+ DiagBanner + 设置开关 + adapter
  迁移（4 接线 + 2 审计 gate）+ 会话页横幅删除 + i18n
- ✅ api 批 `0d094af`：/api/diag 端点（6 单测）+ upload disabled 修补（amend）
- ✅ api/web 已 respawn；api 健康检查 ok；产物验证全过
- ✅ 端到端探针 8 断言 ALL PASS（探针已删，服务端探针文件已清，localStorage
  还原默认关）
- ✅ **七批已 push**（用户授权）：`6a835b0` `c340f25` `257a5ce` `b37ee5c`
  `a0750b4` `693ce92` `0d094af`

### 阻塞 / 风险

- 无当前阻塞。用户 CLI 进程被 api respawn 杀掉（用户授权过）；会话进程按需
  resume 即可恢复。

## 下一步

1. 用户真机验收：设置 → 通用 → 诊断日志 → 开 → 屏顶横幅 → 开 22router 会话
   看 replay 审计行 → copy/upload/clear。
2. 遗留：脱壳批真机验证 checklist 反馈；v1.7 真机清单；wiki/ git 归属；
   swap 扩容（建议级）。

## 易丢的关键上下文

- **diag-log localStorage keys**：`ar-diag-log`（缓冲）/ `ar-diag-enabled`
  （开关，"1"/"0"）；旧 `ar-replay-debug` key 不迁移。
- **diag-uploads 服务端目录**：`~/.agents-remote/diag-uploads/`；文件名
  `<ISO 时间戳冒号转杠>-<rand4>.json`。
- **web chunk 布局**：claude-adapter 打进 `ChatSessionDetailRoute-*.js`；
  产物验证 `rg "特征串" web/dist/assets/` 直查。
- api/web 标准重启 = `respawn-pane -k -t ar-dev:0|1`；重启 api 前必须用户
  确认（杀 CLI 子进程）。
- 大文件扫描：2G ulimit -v 会挂 bun——systemd-run cgroup MemoryMax。

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

