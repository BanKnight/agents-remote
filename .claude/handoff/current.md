# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-28 14:20(批次 A/B/C 已 commit da5c9ba;用户新指令三件:
> ①凭证 terminal 支持要竞品调研 ②自动重试缺失 ③全面 parity 检查——调研中)

## 一句话状态

**codex 批次 C(用户三轮真机反馈清单)全部实现并过全门禁:C1 Effort 选择器兜底(模
型不在 model/list 目录时按词表兜底渲染)、C2 加号附件(图片/文件,claude 单源复用)、
C3 切换会话「离线中…」提示(everConnectedRef 防伪门)、C4 对话↔终端双模式(`codex
resume <threadId>` TUI 接力 + SESSION_STATE_CONFLICT WS 守卫 + 多端跟随)、C5
Settings codex 凭据卡全链路(shared 类型→store→PUT 三态→codexSpawnEnv env 注入→UI
卡+i18n)。三 reviewer 并行审查后消化:code P1 图片字段名错位(mediaType vs
mimeType,发图必坏——adapter 一处收口改名+wire 形状 hook 测试钉住)、security
P0-级 mode 路由硬守卫 provider!=="claude"→codex 双模式经 HTTP 不可达(已放开双
provider 准入)、design L1-L3(菜单 accent 语义色/uploading 发送键形态/aria 全角括
号)、P2-1 项目级 codex 缓存清扫漏接线、P3-1 localStorage 兜底只写不删(抽
lib/cached-agent-detail 单源+清理面)、P3-4 凭据注入零测试(补 codexSpawnEnv 纯函
数三态+fake env 回显集成用例)。全门禁绿:format/lint(0)/typecheck/api 1180+
shared 11+web 993/e2e codex 3/3/CSS 硬闸;api+web 已 respawn,content-type text/css,
P1-1 修复特征串进产物。不 commit,等用户确认(批次 A tokenUsage+IDB 缓存、批次 B
config 快照+冷启动骨架、批次 C 本批一起)。**

## 本 session 焦点

### 关键决策(不可丢)

- **C4 服务端入口(security reviewer 附注抓出)**:session-routes mode 路由原本
  硬守卫 `metadata.provider !== "claude"` → 404,agent-tui 的 codex 分支是死代码。
  已改为 profile transport 驱动准入(claude 看 claudeSessionId、codex 看
  codexThreadId→400 SESSION_NOT_CONFIGURED;无 threadId 的存量 tmux 形态被
  keepIfRuntimeExists 判死 → 404 探活自然产生)。
- **C4 codex TUI 形态诚实退化**:codex CLI 无 claude hooks 机制 → 无状态文件/
  watcher 面,TUI 期状态点停更(以 pane 内 TUI 为准);close 广播 closed 被 index
  回调跳过(claude silent 变体不需要)。
- **C5 env 注入**:codexSpawnEnv 白名单 13 键基础上 apiKey→OPENAI_API_KEY、
  baseUrl→OPENAI_BASE_URL(两键刻意不在白名单=settings 唯一来源不继承父 env);每
  次 spawn 前读(热更新,acp resolveCredentials 同时序);读失败 catch 回退。
- **P1-1 教训(再证「mock 按真实协议」)**:composer-attach 产出 `{mediaType,data}`
  (claude 语义),codex 线协议 `{mimeType,data}`——原样透传类型层拦不住(sendToSocket
  参数 unknown);单测以正确形状直调 runtime.write 绕过 wire 边界=盲区。修复=adapter
  一处收口改名,hook 测试经 storeAdapter.onNew→MockSocket 断言真实上行帧形状。
- **shell→workbench 反向依赖**:project-row-actions(shell)需清理 localStorage
  兜底键,helper 必须放 lib(cached-agent-detail.ts),不能 import workbench。

### 进度(批次 C 五项+review 修复全落地)

- ✅ C1:efforts 词表兜底(CodexSessionDetailRoute)+e2e 回归锚(当前模型不在目录)。
- ✅ C2:ComposerAttachMenu/AttachmentChipRow 接入 composer;服务端 sanitizeCodex
  Images(security L3:非数组/坏形状/超 10M base64 项丢弃)。
- ✅ C3:everConnectedRef→offlineCap(VirtualizedThreadContent 离线条防伪门)。
- ✅ C4:agent-tui switchCodexToTerminal/ToChat(mode 先落盘 fail-closed+失败回滚重
  拉)+codex-stream terminal 守卫+socketsByRuntimeKey+closeSessionSockets+前端
  modeConflictRef(不重连+invalidate detail)+双端 gate(instance-area/mobile-
  workbench)+PanelRouter 面板路由(mode!==terminal)。
- ✅ C5:shared CodexCredentials/Masked 类型+store normalize/mask+PUT 三态路由+code
  xSpawnEnv+index 装配(resolveCredentials)+client updateCodexRuntime+设置卡
  CodexRuntimeSection+设置行+i18n 7 键。smoke PASS(masked 形状合法,密码脚本自读)。
- ✅ 三 reviewer 消化:P1-1(媒体字段收口)、mode 路由准入、L1(accent 三色语义:
  model=user/eff=assistant/perm=permission)、L2(showSend 摘 uploading gate 对齐
  claude)、L3(aria-label 恒 label)、P2-1(clearProjectCodexReplayCache 接线
  rename/delete)、P3-1(lib/cached-agent-detail 读校验+写/删单源)、P3-4(凭据注入
  测试)、security L1(baseUrl typeof 守卫防 500)。

### 阻塞 / 风险

- 无阻塞。**留观/待办(记入下批)**:①security L2 terminal TOCTOU 窗口(claude 同
  基线记档);②pi-stream images 同病未校验(统一收紧另批);③settings update() 无
  串行化 last-writer-wins(全部路由同病,加 promise 队列另批);④apiKey/baseUrl 长
  度上限(acp 同病);⑤CredentialsCardSection 抽取(ACP/Codex 卡 ~100 行复制,第三
  张卡出现时抽);⑥design P2-2 pending 圆点对比度真机留观。

### 易丢的关键上下文

- **已 commit da5c9ba**(批次 A/B/C 一个 feat commit,handoff 单独 docs commit 跟随)。
- **用户三条新指令(本 window 主任务)**:①terminal 形态凭证支持要竞品调研后实现
  (约束:key 不暴露进 ps——tmux -e 未采纳原因);②自动重试缺失(codex 无,claude 有
  ClaudeApiRetry/autoRetry destroySession 机制);③系统性检查 codex vs claude 功能
  缺失全清单。
- **terminal 形态凭证链差异(交付说明必写)**:tmux 内 `codex resume` TUI 不继承
  settings 注入的 OPENAI_API_KEY(env 注入只覆盖 app-server spawn);仅配置 settings
  凭据时 terminal 形态走 codex 自身凭证链(auth.json)。
- **测试内存**:systemd-run --scope --user -p MemoryMax=2G;探针 bun 跑;编辑内置
  工具;e2e 入口 bun run e2e。
- **本 window Edit payload 损坏仍有**:中文标点全/半角差异致 old_string 不匹配(锚
  用纯代码行);多次 found 2 matches(codex/acp 同构代码)要加 codex 特有锚。

### 真机验收清单(批次 C,交用户)

1. **C1**:旧 thread(账号默认模型如 gpt-5.4)打开 → composer 三个选择器都在,推理
   深度可选可切换(pending 圆点=下轮生效)。
2. **C2**:加号发图片(选图/拍照/粘贴)→ 缩略图 chip → 发送 → 消息带图;纯图无文本
   也可发;上传中发送键不抖动(点击被暂缓,形态保持)。
3. **C3**:切换会话 → 恢复窗口显「离线中…」条,连接后消失;首连(无历史)显骨架。
4. **C4**:⋯ 菜单「切到终端」→ tmux 起 `codex resume`(历史完整);终端菜单「回到
   对话」→ app-server 复位+回放;另一端打开同会话跟随换形态;TUI 期状态点停更是
   诚实退化非 bug。
5. **C5**:Settings → Codex 卡 → 填 apiKey(可选 baseUrl)保存 → 新建 codex 会话
   走自定义端点(key 掩码回显,原始 key 不出 api);清空 baseUrl=删除回退官方。
6. 回归面:claude 会话选择器/缓存/模式切换不受影响。

---
最后更新:2026-10-28 13:49(触发原因:批次 C 收尾——三 reviewer 消化完成全门禁绿+
handoff save;待用户确认 commit)

## 提醒
- 开干前读 .claude/gtd/next-actions.md;守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时,主动 /handoff save。
