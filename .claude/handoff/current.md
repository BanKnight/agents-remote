# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-28 09:00（**Android pad 三问题链收口批**：布局收窄补偿
> 全链闭环 + 诊断通道四字段实锤 + systemd 部署模板修复，9 个 commit 全部
> 推送；问题 1/2 按用户真机反馈收口，问题 3 残余瞬态观察中。下一项 =
> hub 同类接口。）

## 一句话状态

Android pad 三问题：①右侧看不全（几天未复现，收口）②卡顿（WebGL 判据
生效「好了很多」，收口）③布局收窄（收缩补偿闭环，残余瞬态观察中）——
均已在 main（至 a800cc3a）；**下一项 = hub 同类接口**（git 写面 commit/
discard 进 hub + files 写/删/列目录，用户此前排定）。

## 本 session 焦点（Android pad 问题链 + 部署模板）

- **问题 3 布局收窄（三轮修法演进，全闭环）**：
  - 根因实锤：Android pad PWA 外接键盘下 IME 服务随 composer editable
    焦点进出**瞬时占位 ~59px**（不可见、数秒自愈），layout viewport
    （cvh/ih/vv 同步缩）→ 100vh/dvh 基线缩 → 整页收窄。
  - 第一套 meta `interactive-widget=resizes-content` 无效（standalone 窗口
    不受 tab 语义控制）→ 回退（71f3b404）；第二套 px 钉死 Android 有效但
    炸 iPhone（composer 抬高两倍 safe area，真机暴怒回滚）→ 第三套
    **收缩补偿**：viewport-shrink.ts 检测「同宽缩高」占位指纹写
    `--viewport-shrink` 差值，布局 = `calc(100vh/dvh + shrink)` 钉住
    （9f5a9777）。
  - **加法方向实锤**（17:29 真机 main=591=650−59）：vh/dvh 都锚定 layout
    viewport，占位时基准自身已缩，减法=双倍扣；加法=钉回原高。「视口单位
    做补偿先确认基准自身是否随目标状态变化」已记入头注释。
  - 残余瞬态（sb 字段实锤后定案接受，a800cc3a）：占位期间底部 59px
    （.sbar「已连接」28px + composer 底 31px）暂时出视口，操作后随自愈
    弹回。规避方案全部更糟（inputmode=none 禁触屏软键盘 / sbar fixed 盖
    发送钮 / 不钉=整页收窄）。
- **诊断通道**（d12bd3ef + 4bb2f7ec/a986072c/8d2ba200）：layout-geometry-
  diag 七字段（ih/cvh/vv/st/wt/main/sb/avh）+ doc-scroll 监听；sb=「已
  连接」状态栏 rect 实锤了出视口，wt=0/0 排除窗口下压、st=0 排除 reveal
  滚动。**取证使命完成，等用户确认现象不再困扰后按 sheet-debug 先例摘除**。
- **问题 2 卡顿**：dpr=2.125 → DOM 渲染器拖垮主线程 → WebGL 判据放宽
  `Number.isInteger(dpr) || dpr >= 2`（71f3b404），用户复验「好了很多」。
- **问题 1 右侧看不全**：几天未复现，按用户反馈收口（候选机制 = 多端同开
  tmux latest 抢尺寸，未定案就消失了）。
- **systemd 部署模板修复**（8f272edd，外部 AI 反馈「参考非照搬」）：
  - PATH 前置 `node_modules/.bin` + `~/.bun/bin`（claude/tmux 裸名 spawn
    走 PATH，系统服务默认 PATH 落旧版 claude；docker 形态镜像层已解决、
    systemd 模板漏对应项）。
  - run dir 单源：**默认 `AGENTS_REMOTE_RUN_DIR` 持久路径**（比反馈的
    `XDG_RUNTIME_DIR=/run/user/1000` 更稳：无 /run/user/1000 前置条件、
    非 tmpfs 重启不丢 token），注释保留 XDG 写法给 dev/user-session 迁移
    衔接场景。deployment.md 形态三补「环境项三件套」。
- **iPhone 恢复正常为硬底线**：回滚 app-viewport-height.ts 后用户确认；
  收缩补偿对 iPhone 是死代码（iOS 键盘只缩 visual viewport，cvh 永不缩
  → 常态零写入）。

## 关键决策（本阶段不可丢）

1. **composer/键盘抬高领域是雷区**（批 8/17/18 三轮真机调优 + 本批教训）：
   iPhone 好状态是底线；「没有确切证据，那就不修」；外部反馈「参考非
   照搬」（systemd ②修法即例）。
2. **§22 证据纪律**：真机反复失败的 bug 停止推理修复，先埋点拿第一手
   数据（本批 st/wt/sb 字段是成功实践——sb 一个字段实锤机制终结三轮
   推理）。
3. **vh/dvh 都锚定 layout viewport**：Android IME 占位缩的是整个基准，
   凡以视口单位为基准的补偿公式必须用加法。
4. **诊断通道字段设计**：为「切分候选空间」设计字段（st=滚动层、wt=窗口
   层、sb=主角元素层）——一次取证终结所有假设。

## 下一步

- **hub 同类接口**（用户排定的下一项）：git 写面 commit/discard 进 hub +
  files 写/删/列目录——开工前先摸清 hub 域现状（MCP capability 布局、
  git 域只读面、files 域只读面）再提案。
- 挂账观察：**布局收窄残余瞬态**（用户日常确认困扰度）；诊断通道摘除
  （等观察期结束）。
- 挂账保留（上批）：**#11 队列重物化真机清单 6 条**、prompt 队列 v1+v2
  真机验证、渐进披露 + pages/mcp 管理真机清单、#7 wiki（用户「待会再说」）、
  #4 trust、#10 回流编排、#3 checkpoint/settle（用户自测中）。
- B 组真机清单交用户：#11 队列 6 条、prompt 队列、渐进披露、pages/mcp
  管理、mcp-apps 卡片、双模式 GUI↔TUI、插件域。

## 阻塞 / 风险

- 无阻塞。dev api 与 web 产物均最新（web 产物含收缩补偿全批 + 诊断通道
  七字段，特征验证过）。

## 易丢的关键上下文

- **PWA SW 双跳生效**：autoUpdate + onNeedReload 拦截——新代码需重开两次
  PWA（或重开后刷新）才生效；给用户布置真机验证时必须提醒。
- **Android pad 测试形态**：这次日志跨两种形态（浏览器 tab `100dvh` 分支
  / PWA standalone `100vh` 分支），两个分支都验证过；ih=805=横屏、709=竖屏。
- **fit 日志来源**：`[layout] fit NxM container=WxH` 出自 SessionDetailRoute
  xterm 适配（terminalSizeRef 旁），container 是工作台内格子宽度非窗口宽度。
- **「已连接」状态栏** = WorkbenchShell 底部 `.sbar`（28px，≥1024 桌面布局
  渲染）；分屏格 692 宽 < 1024 走移动布局不渲染它。
- **commit 尾行** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- 22router 会话（1.42GB）回放验证素材；api-request 族验证脚本模式不变。
- 全量单测 checkpoint-service 偶发超时 = 时序抖动（隔离跑绿即收口，本批
  api test 一次假 fail 复跑全绿实锤）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

最后更新：2026-11-28 09:00 / 触发原因：Android pad 三问题链收口（1/2 收口、
3 闭环观察中）+ systemd 部署模板修复推送；下一项 hub 同类接口。
