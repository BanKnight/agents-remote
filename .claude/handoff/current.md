# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-04（**composer 发图批收口已 commit**：`68b030c` 功能批 + `675255b` security 消化批 + docs commit，待 push + 真机复验）

## 一句话状态

**claude composer 发图全链落地**：+ 菜单（图片/相机/文件）→ 图片内联 stream-json（5MiB 闸）/文件上传 uploads/ 提及行 → 真管道渲染（user-prompt images → image parts）。探针 15 断言全绿；security-reviewer 1×Medium-Low + 1 加固已消化；真机复验清单待用户执行。

## 本 session 焦点（composer 发图批）

1. **功能批 `68b030c`**：shared `ClaudeUserImageBlock` 类型扩宽（api 零逻辑改动）；composer-attach（新组件：`useComposerAttachments` 草稿 + `ComposerAttachMenu` + `AttachmentChipRow` + 压图纯函数）；发送接线（onNew takeSnapshot 组帧，纯附件 `api.thread().append(" ")` 兜底）；**渲染真管道**（`normalizeChatStream` user 分支 → `user-prompt` item `images?` → `renderChatStream` image parts → `UserImageView`）。
2. **security 消化批 `675255b`**：单图 5MiB 上限（三出口过闸：透传超限落重编码、兜底/产物超限即抛）；`extractUserBubbleContent` media_type 白名单 `image/(jpeg|png|webp|gif)`。
3. **探针 `probe-composer-attach` 15 断言**：菜单/相机两端显隐（`hover-capable:hidden` + 移动常显）/组帧精确比对/纯附件兜底/提及行/下行气泡/× 移除。**首跑抓到真 bug**：pick/addFiles 占位 id 错位（chip 永停上传中）。

## 关键决策（本阶段不可丢）

- **图片 = stream-json 内联**（不落项目目录）；文件 = uploads/（writeUpload 校验/50MiB/keepBoth 复用）；api 零逻辑改动（透传 + echo spread 复用）。
- **渲染接真链教训**：`convertContentToBubble` 是无生产调用者的存量死函数（仅测试引用）——首版误接，探针 Part5 抓包暴露后改接 `normalizeChatStream`/`renderChatStream`，死函数已恢复批前原样。**改渲染语义先核真实调用链**。
- 相机项显隐 = pointer media（`hover-capable:hidden` 默认常显，§7）；压图 = 达标透传（保 PNG 锐度）/否则 canvas JPEG q0.8；**尺寸达标 ≠ 体积达标**（5MiB 闸三出口）。
- 历史拍板继续有效：浮层不自动聚焦；技能来源 chip；「用户的测试操作不是变量」；多端同构。

## 进度（已完成 / 进行中 / 待办）

- ✅ 发图功能批 + security 消化批 + 记档（redesign-v2.md「composer 发图」小节）+ 探针 + dev 抽查，全门禁绿
- ⬜ **本批真机复验清单（交用户，见下）**
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（iPhone 优先；发图批为本批新增）

**发图批（核心项）**：
1. **+ 按钮**：composer 卡片底行最左；点击出菜单（图片/相机/文件；**桌面隐藏相机项、iPhone 显示**）
2. **图片**：相册选图 → chip 缩略图 → 发送 → 气泡显示图片；HEIC 相册图自动转 JPEG；纯图无文本也能发
3. **相机**：菜单「相机」→ 直接唤起后摄（`capture=environment`）→ 拍照发送
4. **文件**：选 PDF/文本 → chip 显示「上传中…→uploads/ 路径」→ 发送 → Claude 能 Read 该路径
5. **边界**：附件上传中按发送应暂缓；>5MiB 图 chip 报「上传失败」；大文件（接近 50MiB）上传
6. **桌面端**：同款 + Enter 发送 + 相机项不可见；下行气泡/历史回放里图片正常显示

**前序遗留（不动）**：技能列表批 + 浮层聚焦批 9 项真机复验清单（见 git 历史 handoff）；第五批 reviewer 修复批真机复验。

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012（web build 含发图批）；CSS 硬闸 189284 字节；探针 15 + 回归 27 全绿。
- router22 残留进程仍待用户处理（PID 1989432/1989916，跨项目资源 kill 被拦截）。
- 存量时序 flake（与本批无关）：probe-claude-reconnect-delta ③c 偶发；probe-mobile-motion 采样断言高负载偶发 1 fail（复跑即绿）。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-composer-attach.mjs`；e2e/单测 systemd-run 2G。
- **渲染链锚**：user 气泡图片 = `normalizeChatStream` user 分支（`extractUserBubbleContent` 单源提取 + media_type 白名单）→ `user-prompt.images` → `renderChatStream` image parts。改渲染先核真实调用链（convertContentToBubble 是死函数教训）。
- **移动端 Enter 语义**：`unstable_insertNewlineOnTouchEnter`（触屏 Enter 换行，卡片内 Send 发送）；桌面 Enter = sendComposer（上传中暂缓 / 纯附件 append(" ") 兜底 / 有文本 composer.send()）。
- **压图闸**：`needsImageReEncode`（类型/尺寸）+ `IMAGE_MAX_BYTES` 5MiB（三出口）——单测锚 `base64Bytes`。
- **zh 冒号形态**：提及行「附件：{path}」全角冒号（对齐既有 zh 文案惯例，与技能批「来源:」半角拍板不同面）。
- **Write/Edit 内容退化坑**：本 session 复发 6 次（丢箭头/坏括号）——Read 回读修正；连续两次失败即停换路。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-04；触发原因：composer 发图批收口（功能批 + security 消化批 + 记档），真机复验清单交用户
