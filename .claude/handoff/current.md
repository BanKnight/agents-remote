# 当前状态（current.md — 滚动更新）

> 最后更新：2026-11-08 00:05（**preview 404 毒化链修复** `476d7a0`；本地累计 7 commit
> 未 push；用户报「重装 PWA 后冷启动黑屏明显变长」待真机观察定位）

## 一句话状态

preview 坏 asset 链接改真 404（不 SPA fallback，防 SW precache 被 HTML 毒化，
`476d7a0`）；教训沉淀 frontend-notes §35。本地 7 commit 未 push。**进行中：用户汇报
重装 PWA 后冷启动黑屏「明显非常多」——主假说 = 重装 install 后遗症（3.4MB precache
走 tunnel 从零下载，install 未完成期页面无 SW 控制全走网络），待用户真机观察确认；
次假说 = entry chunk 292KB→573KB 渐增（已查内容干净、非重库误拖，撑不起「明显」量级）。

## 本 session 焦点

### 关键决策 / 发现（不可丢）

- **MIME 打不开毒化链（用户被迫重装 PWA）**：vite preview 对一切 404 fallback
  index.html → 旧 SW precache 旧 hash chunk 404 拿到 200 text/html → workbox install
  对 200 一律缓存不校验 content-type → HTML 毒化 → MIME 死锁。生产形态 api
  static-web.ts 早已做对（末段含扩展名 404 不 fallback），病只在 dev preview。
- **修复 = previewBadAsset404 插件**（`476d7a0`）：configurePreviewServer 挂中间件
  （先于 vite 内部），末段含扩展名且 dist 无此文件 → 真 404 → install 失败 → 旧 SW
  保持 → dist 稳定后刷新自愈。/api、/p/ 放行；relative 判越界防 traversal。
- **Playwright 结构性盲区**：全新 context 无持久 SW，测不出「发版窗口 + 旧 SW 客户端」
  路径——只能靠语义对齐生产防御（已写进 frontend-notes §35）。
- **探针 flaky 根因（上批遗留结论，规则已沉淀）**：sessions-stream WS 透传真实后端
  覆盖 mock overview（applyShellsFrame 整体覆盖 ["overview"] 缓存）→ 探针必须同源
  mock（verification.md）。

### 进度

- ✅ `476d7a0` fix(web): preview 坏 asset 404（验证矩阵全过：坏 asset 404 / 真 asset
  200 / SPA 路由 200 / api+p 代理穿透 / 越界不泄露 / CSS text/css；全门禁 1065 pass）
- ✅ frontend-notes §35 沉淀（毒化链 + 盲区 + 重装黑屏后遗症注记）
- ✅ respawn web 生效（precache 30 entries / 3492 KiB）

## 下一步

1. **黑屏变长定位（等用户真机观察）**：问两件事——①变长是否始于重装 PWA 之后；
   ②现在（距重装一段时间后）仍长吗。install 完成（存储占用 ~3.4MB+ 或连续两次启动
   对比）应恢复；若仍长 → 按第一手数据重新取证（§22 纪律，禁推理修复）。
2. **push 等用户确认**：`5f2da9c..476d7a0` 共 7 commit。
3. **真机 golden path 清单（pages 入口批）**仍待用户验收（见下）。
4. wiki 格式对齐批（排队）→ wiki Quartz（先 /check-deps）。

## 易丢的关键上下文

- **pages 入口批真机 golden path**：① 桌面右栏 [文件 Git 页面 Wiki] 四标签；② 页面
  标签默认根行 `/` → site + 公开徽标；③ 行点击新标签开 `/p/{project}/`；④ 移动检视
  面板同构；⑤ ＋菜单含「页面」；⑥ 移动端「添加根」无入口（缺口，待拍板）。
- **黑屏现象的客观锚点**：precache 30 entries / 3492 KiB；entry index-DW7HeKfC.js
  573KB（历史锚 292KB，内容干净无重库实体，mermaid/WorkbenchRoute 仅 2 处 chunk
  引用名）；entry 静态依赖仅 rolldown-runtime + vendor-assistant（chat 主界面常态）。
- 探针跑法：`bun scripts/X.mjs`（repo 根跑，dev api 43011 / web 43012 在跑）。
- web=prod build + watch（tmux `ar-dev:web`）；改 vite.config 必须 respawn。
- bun test / e2e 内存限制用 systemd-run cgroup（2G / 4G）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
