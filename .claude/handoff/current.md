# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-22(M1 生成式 UI 完整版收尾:reviewer 收敛批 `183f2b5`，探针 17/17 + e2e 3/3 全绿)

## 一句话状态

**M1 生成式 UI 完整版已完成并提交**（`9e134cb` a/b/c + `f004276` d + `183f2b5` reviewer 收敛）。agent 经 gen-ui skill 生成单文件 HTML → 回复里 `::gen-ui{...}` 标记 → 流内卡片沙箱渲染 + 迷你 `window.zcode` 桥（widgetState 双槽 / setWidgetState 防抖 PUT / sendFollowUpMessage 确认闸 / 主题事件）→ 用户交互状态经 `<gen-ui-context>` 回流进下一轮 prompt。**下一步是 M2 画布批 1（M2.0 excalidraw 打包实验）**。

## 本 session 焦点

### 关键决策(不可丢)

- **槽值类型适配收在桥里**:页面作者直接传 JSON 值(对象/数组),写侧 `normSlot` 自动 JSON.stringify、读侧 `parseSlot` 自动 parse;存储层仍是字符串契约(api 16KiB/单槽 8K 闸),新旧页面都兼容。skill v4 已写明这条。
- **boot 定格**:srcDoc 只在 file+state 双就绪后拼一次(bootRef+bootReady),之后 setWidgetState 只更新 query cache + 防抖 PUT(800ms),**不重建文档**(重建 = 页面重载 = 滑块全丢)。
- **flushPut 读 queryClient 当前值**,不读 set-state 时刻快照——同会话多写者(inline + 全屏第二实例)下旧快照落盘会永久丢更新。mergeWidgetState 32 上限淘汰最旧(api 硬闸 >32 恒 400)。
- **安全边界**:isGenUiRelativePath 排除 `state/` 子树(state JSON 当 HTML 渲染可跨会话串读);回流块边界 token 中性化(前置 U+200B,防伪造 `[/gen-ui-widget]` 拆块);ensureGenUiSkill 拒 symlink、不覆盖无版本标记的手写 skill;CSP 唯一有效层 = web 端 meta 注入(srcdoc 继承宿主 CSP,HTTP 头无效)。
- **回流注入点**:`claude-stream.ts` 的 WS user 分支只对纯文本 user 帧追加回流块(tool_result 上行帧不是用户文本);`composeUserText` 供 REST injectUserPrompt 共用;capability 关闭按预期条件静默。
- **close 会话语义 = 销毁实例+metadata**,之后无回放是正确行为(端到端脚本曾因末尾 close 导致「回放核验失败」误判)。

### 进度

- ✅ M1.a api 基座(gen-ui 文件/state 端点 + 回流组装)
- ✅ M1.b web 投影(`::gen-ui` 标记 → ChatStreamItem, live/replay 同函数零分支)
- ✅ M1.c GenUiWidgetCard + 迷你桥 + 全屏第二实例 + 探针
- ✅ M1.d gen-ui skill 交付(ensureGenUiSkill)+ test 项目端到端 + 真实回放核验
- ✅ reviewer 三报告统一收敛(`183f2b5`):回流注入口径/state 边界/skill 守卫/flushPut 竞态/图标 sparkles/i18n + 6 项新单测
- ✅ 验证:全门禁绿(api 1072 / shared 10 / web 883)、CSS 硬闸、tokens 机检(report 模式仅挂起批 1 处)、探针 17/17、e2e mcp-app-card 3/3

### 待办

- **M2 画布批 1**:0 excalidraw standalone 单文件打包实验(体积 gzip <3MB / 无 React 宿主 / CSP default-src none / 中文字体)→ 1 ar-hub 四工具 + project-canvas.ts 存储(expectedRevision + operationId 幂等)→ 2 CANVAS 模板 + commit_scene 提交链(allowedToolNames 多名)→ 3 验证
- **M3 画布批 2**:updateModelContext + composer chip + 发送时 prompt 注入
- **真机清单(交用户,可随时)**:
  1. 移动端/桌面端各开一次会话,让 agent 生成一个交互页(如「给我一个滑块」),确认卡片渲染、拖动跟手、重开恢复。
  2. 全屏放大 → 追问确认闸压在全屏层上 → ✕ 关闭;卡片内深色/浅色主题跟随切换。
  3. 保留会话 `agent_fe6c6f4663664a8e`(test 项目)可直接看回放卡片。
- 挂起批(工作区,刻意不提交):`api/src/index.ts` inset-report hunk + `web/src/lib` 三件(keyboard-inset.ts/.test.ts + use-composer-inset-debug-badge.ts,composer 第二次埋点等真机数据);根目录 `.mcp.json` untracked(是否提交由用户定)。
- 已知既有失效(不属本批):JSONL 回放 TaskCreate taskId 回填失效(web 读 camel `.task?.id`,camel 是字符串)。

### 易丢的关键上下文

- **探针 lang 坑**:诊断脚本必须 `page.addInitScript(() => localStorage.setItem("lang", "zh"))`。
- **回放批次是 gzipped binary 帧**:裸 WS 客户端必须 `gunzipSync` 再按 \n 分行。
- **Edit 全角标点陷阱**:含全角标点的 old_string 偶发恒定不匹配(模型输出层转 ASCII);失败就改用纯 ASCII 代码行/数字作锚点,或先 Read 再复制。
- **跑测试限内存**:`systemd-run --scope --user -p MemoryMax=2G`(`ulimit -v` 会让 api 测试 SIGSEGV)。
- **探针跑法**:`systemd-run ... bun scripts/probe-*.mjs`;`_diag-` 一次性脚本用后删。
- **tmux**:`ar-dev:api` / `ar-dev:web`;标准重启 `respawn-pane -k`;绝不 kill server。
- **提交手法**:标准 `git add && git commit`;混合 hunk 用 `git diff` + awk 提 hunk + `git apply --cached --recount`(需补 diff header 4 行)。
- **mcp-app-card e2e 选择器**:已从 `iframe[title="MCP app"]` 改为 `iframe[data-testid="mcp-app-frame"]`(title 走 i18n 后不再稳定)。

---
最后更新:2026-10-22(触发原因:M1 里程碑收尾,reviewer 收敛批提交 + 探针/e2e 全绿,handoff save)
