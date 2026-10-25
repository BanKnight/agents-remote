# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-25(composer 附件三改已交付并提交 cc8534d;用户真机复测通过)

## 一句话状态

**composer 附件三改已落地并提交(cc8534d),用户真机复测通过**(8 张全亮、点 + 直达系统面板)。核心修复 = 附件上限 cap 判定误吞满额批(`baseCount = length - entries.length` 按入册序号放行)。三改 = ①多图挂死修复 ②上限 4→8(+ api WS `maxPayloadLength` 48MB)③加号收敛为一键直达系统面板。已过全门禁 + CSS 硬闸 + 探针全绿。**下一任务 = composer 位置 bug**;`web/src/lib` 三件(keyboard-inset 取证)仍留工作区作该任务工具。

## 本 session 焦点

### 关键决策(不可丢)

- **多图挂死真凶(2026-10-25 实锤)**:addFiles 循环 `attachmentsRef.current.length >= COMPOSER_MAX_ATTACHMENTS` 判定在 pick 已 commit 本批后执行——满额 4 张第一圈 break,零张处理。**修复 = `baseCount = length - entries.length` 按入册序号放行**(pick 的 usable slice 仍保证总量;循环判定只防处理中途追加新批超总量)。验证:真实链路 4 张 12MP 全 ready(角标 `at2 ready 4/4`)/ 探针 37 绿 / 服务端 `[attach-debug]` 收到 batch 4 真实样本。
- **测试纪律(用户拍板强化)**:mock 探针验证逻辑,**交付前必须真实链路测试**(test 项目真实会话页 + 真实数据,零 mock)+ e2e;部署类改动(新 API 路由/埋点上报)验收 = 带鉴权直打真实端点看状态码。mock 探针的拦截式自证会把服务端断点挡在被测路径外(本次 attach-report 404 即此)。
- **今晚 dev 进程假死两起**:①web vite build --watch 假死(6 天进程,touch 无效)→ respawn 全量重建;②api bun --watch 不热重载新路由(attach-report 404,带鉴权验证抓到)→ respawn 后 200。**「写了路由」≠「进程里有路由」;watch 假死第一动作 = respawn-pane,别 touch+轮询。**
- **取证三件套已随 cc8534d 入库**(定案后拆):`web/src/lib/use-attach-debug.ts`(at2 角标+上报)+ composer-attach 打点 + api `/api/debug/attach-report` + `scripts/probe-attach-debug.mjs`。
- **多图挂死根因(2026-10-25,§22 证据纪律成功案例)**:「一直转圈」与 138bf39「20s 必变处理失败」矛盾 → 第一疑点验部署:43012 产物 grep `timeout after` 零命中 → touch main.tsx 180s 无反应(watch 彻底假死,6 天进程)→ `tmux respawn-pane -k -t ar-dev:web 'scripts/ar-dev-web.sh'` 全量重建 → 懒加载 chunk `ChatSessionDetailRoute-D_LHWrrT.js` 含特征串 + CSS 硬闸绿。**教训:验证产物特征串别只扫 index.html 引用的 entry——懒加载 chunk 不在 index.html 里;直接 `rg` dist 目录最可靠。**
- **UI 准则(用户两次表述,永久遵守)**:「避免没必要的次要标签和描述,让布局 do the explaining」→ memory `ui-layout-explains-not-text`;落地:处理中 = 变暗遮罩(`bg-black/45`)+ 右下角 spinner,无文字;可见文字只留数据(百分比/+N)与错误(「处理失败」);aria/title 不受限。
- **图片归一化串行链**(138bf39):`imageChain = imageChain.then(...)` 逐张——iPhone 4 张 12MP 并发 createImageBitmap+canvas 数分钟不完成(WebKit 解码/内存压力);`IMAGE_NORMALIZE_TIMEOUT_MS = 20_000` + `withTimeout`(不取消底层,仅放弃等待);text 并行、file 串行,三组互不等待。
- **失败重试**(43fb3b4,用户拍板「状态操作槽」):`ComposerAttachment.file?` 持原始 File;retry = 重建 objectURL 回 uploading + 重跑归一化;灰底 chip 整块可点(§31 命中区⊇视觉)+ 右下角 ↻。
- **COMPOSER_MAX_ATTACHMENTS = 8**(cc8534d 用户拍板提到 8 张,前提不冲 CF 限制):CF tunnel 代理层对 WS 帧无硬限,真闸是 Bun WS 默认 `maxPayloadLength` 16MB(超限断连 1009)→ api 侧显式 48MB(8 × 5MB ≈ 40MB 最坏 + 包壳余量),两处注释互相指向须联动。超出静默截断 → 行尾「+N」overflow chip(完整说明进 aria/title,chip 只放数字——布局自解释范式)。
- **加号一键直达**(cc8534d,用户 AskUserQuestion 拍板):点 + 不再弹自有 ActionMenu,直接 `input.click()` 触发系统面板。iOS 对 `<input type=file>` 本就强制弹拍照/图库/文件三分支,自有菜单纯重复;input 不设 accept,选中文件统一交 onFiles 分流。
- **lightbox ✕ safe-area**(c47d11b):`top-[calc(env(safe-area-inset-top,0px)+0.75rem)]`——standalone PWA viewport-fit=cover 下裸 top-3 落状态栏被系统吃 =「关不掉」根因(§1 家族);`ImageViewer showDownload` 开关(composer 预览传 false 隐藏「另存」)。
- **× 移除钮命中区分离**(3090bba):触屏默认 36px wrapper,`hover-capable:` 收 20px,盘中心两态重合;zoom 按钮与键盘删除键 `handleDeleteKey`。
- 周期一/前批决策仍有效:objectURL 五出口生命周期、file 上传串行(keepBoth 竞态)、XHR 进度两重收敛、进度条 absolute 防高度塌、「+N」计数任何 remove/clear 清零。

### 进度

- ✅ composer 附件 8 commit 全链(主批+3 review 消化+4 真机反馈批);探针 36/36 全绿;redesign-v2.md §6.13 记档
- ✅ cc8534d:composer 附件三改(cap bug 修复 + 上限 8 + WS 48MB + 一键直达 + 取证三件套);全门禁(api/shared/web 全绿)+ CSS 硬闸 + 探针全绿;**用户真机复测通过**(8 张全亮、点 + 直达系统面板)
- 挂起批(工作区,刻意不提交):`web/src/lib` 三件(keyboard-inset.ts/.test.ts + use-composer-inset-debug-badge.ts,composer 抬高 bug 取证等真机数据)

### 待办

- **下一任务(用户明确排序):composer 位置 bug**——App Switcher 截图已有;顶部 `src init-settle visible BODY age 2467ms navigate fb 8x` = 挂起批 keyboard-inset debug badge 输出,可作线索;取证工具 = 工作区 `web/src/lib` 三件 + api `/api/debug/inset-report`
- i18n 孤儿键记档不删:`claude.attach.ready`(「已上传」,更早遗留,非本批产物)
- 临时取证残留(定案后拆):`use-attach-debug.ts` + composer-attach 打点 + api `/api/debug/attach-report` + `probe-attach-debug.mjs`
- e2e 基线:32 直接绿 + mcp-app-card 1 个 flaky(重跑绿,与本批无关)
- 既有真机清单(统一最后验):composer 附件四条(文件百分比/lightbox 手势)/ 插件域五条 / M3 选区引用 / M2 画布 / 键盘 inset 等
- 记档不修:失败态 `text-error` 对比度低于 AA(dangerText token 另批);文件 chip w-36 卡片 vs 原型横向 pill 另批对齐

### 易丢的关键上下文

- **验证产物别只扫 index.html 引用**——懒加载 chunk 不在其中;`rg "特征串" web/dist/assets/` 直查最可靠。
- 探针 lang 坑(addInitScript localStorage lang=zh)、点击后 waitForTimeout(50ms 异步入队)、§18 动画期几何先等 700ms。
- 跑测试限内存 `systemd-run --scope --user -p MemoryMax=2G`;探针用 bun 不用 node。
- tmux `ar-dev:api` / `ar-dev:web`;标准重启 `respawn-pane -k -t ar-dev:<name>`(用 window name 不用 index);绝不 kill server;重启前读 `docs/runbooks/dev-services.md`。
- commit 纪律:标准 `git add && git commit`;尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 改 web 包必跑 `node scripts/ar-verify-css.mjs`;build --watch 漏 emit/假死 → touch main.tsx,再不行 respawn-pane。
- design-reviewer 网络中断重试即可;收敛 prompt(单文件+限定审查点)成功率高。

---
最后更新:2026-10-25(触发原因:composer 附件三改提交 cc8534d + 用户真机复测通过)
