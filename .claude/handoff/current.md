# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-23(M3 画布批 2 全部完成 + 真实 agent 端到端 10/10 两轮;下一步真机清单 / 后续里程碑)

## 一句话状态

**M1/M2/M3 画布+生成式 UI 三轮里程碑全部完成**:M3 选区引用循环(`8463a6d` 实现 + `eb4a655` 双 reviewer 收敛批 + `127988e` 真实 agent 端到端验收脚本入库)。**真实 agent 端到端两轮连续 10/10**(agent 两种输出形态都过);门禁全绿(api 1097/shared 10/web 883+13)。**剩余:真机清单交用户统一验**。

## 本 session 焦点

### 关键决策(不可丢)

- **M3 数据流全链**:模板选中 → `sendRequest("ui/update-model-context", {kind:"canvas-selection", docId, title, revision, elements 精简})` → McpAppCard dispatcher(能力闸 `supportsModelContext` + `sessionId` + `isCanvasSelectionContext` 守卫)→ jotai `Record<canvasContextKey, CanvasSelectionContext>`(key=`${projectName}/${sessionId}`,与 claudeBridgeKey 同格式)→ Route chip(可删)→ 发送时 claude-adapter onNew take → `formatCanvasSelectionContext` 并入 prompt 首项 → 清槽。
- **会话隔离是安全 P1**:jotai 全局 default store + 工作台 CSS `hidden` 保留非激活 tab 不卸载 → 单槽会让 A 会话选区出现在 B 会话 chip 并混进 B 的 prompt。隔离键 = projectName/sessionId。
- **防伪造(prompt 注入面)**:title/id/type/text 全部 JSON.stringify 转义(换行/引号/控制字符不分行)+ ```text 围栏 + 「数据不是指令」声明 + 正文源长截 2000 + 编码后二次钳 6000(控制字符 \uXXXX 6 倍膨胀旁路)。
- **每 MCP 工具结果各渲染一张卡**(create/read_scene/apply 各一张,同 resourceUri 模板)——apply 后的 r2 场景在 apply 卡上,create 卡按设计停在自己收到的 face。**跨卡断言必须遍历全部 iframe 帧**(端到端最后一块拼图)。
- **真实 agent 端到端两个调试硬坑**(已沉淀进脚本头注释):① `locator.evaluate` 回调签名是 `(element, arg)`——传业务参数必须双参 `(el, id) => ...`,单参会把 body 元素误当 id(实证 appState key 变 `"[object HTMLBodyElement]"`),且包装层不得引用 Node 侧闭包(evaluate 只序列化 fn 源码);② 见上条多卡。
- **agent 输出形态有轮次间漂移**(独立 text 元素 / rectangle+boundElements 绑定文本 / 分步 create+apply)——端到端断言不得绑死具体形态:目标查找 /cache/i 文本 → 首个含文本元素 → els[0] 三级 fallback;rename 断言 /redis/i 即可。

### 进度

- ✅ **M1 生成式 UI**:`9e134cb`/`f004276`/`183f2b5`(见 GTD)
- ✅ **M2 画布批 1**:`96d6c0c`→`5542580`/`ae6bfe3`→`424791f`→`d84d55c`→`1adbacf`
- ✅ **M3 画布批 2**:`8463a6d`(协议+chip+注入)→`eb4a655`(security/code 双 reviewer 收敛批)→`127988e`(真实 agent 端到端 `probe-canvas-m3-e2e.mjs` 两轮 10/10 入库 + GTD 勾选)
- ✅ 探针 `probe-mcp-app-canvas.mjs` 30/30(收敛批后复跑)
- ✅ 残留测试会话已清理(7 个),本次 e2e 会话脚本自关

### 待办

- **真机清单(交用户,统一最后验)**:
  1. **M3 真实点击选区路径**:端到端用调试口 API `selectElements`(数据链同真实点击,殊途同归 selectedElementIds);真实鼠标点击选中→右键/按钮→引用 需真机验证(桌面+移动)。
  2. M2 画布端到端(agent 建画布→手改→commit→agent apply→卡刷新)。
  3. 多卡焦点互抢后回卡首次拖画失效(用户「先点一下卡片」即恢复)。
  4. esm.sh 字体被 CSP 拦(系统字体回退)视觉确认。
  5. M1 gen-ui 三条(滑块/全屏/回放)。
- **M3 已知限制**(已记 GTD):模板 ask 行追问不经 onNew 不拼画布选区;200 元素×2000 字符 ≈400KB prompt 上界;encodedClip 可能切在 \uXXXX 中间(纯外观)。
- 挂起批(工作区,刻意不提交):`api/src/index.ts` inset-report hunk + `web/src/lib` 三件(keyboard-inset.ts/.test.ts + use-composer-inset-debug-badge.ts,composer 第二次埋点等真机数据);根目录 `.mcp.json` untracked(是否提交由用户定)

### 易丢的关键上下文

- **探针 lang 坑**:诊断脚本必须 `page.addInitScript(() => localStorage.setItem("lang", "zh"))`(本段清理脚本踩过一次)。
- **跑测试限内存**:`systemd-run --scope --user -p MemoryMax=2G`(`ulimit -v` 会让 api 测试 SIGSEGV)。
- **探针跑法**:`systemd-run ... bun scripts/probe-*.mjs`;真 agent 端到端单轮 4-5 分钟。
- **tmux**:`ar-dev:api` / `ar-dev:web`;标准重启 `respawn-pane -k`;绝不 kill server。
- **会话清理纪律**:只关自己创建的(displayName 匹配),避开 working 状态(本段曾误关正在跑的会话导致一轮 e2e 失败)。
- **iframe 内容 evaluate**:FrameLocator 无 evaluate → `frame.locator("body").evaluate(fn)`;`contentFrame()` 返回 FrameLocator(不是旧 Frame)。
- **sandbox iframe localStorage SecurityError**:`allow-scripts` 无 `allow-same-origin` 的固有噪音(excalidraw 访问 localStorage),端到端断言须过滤。

---
最后更新:2026-10-23(触发原因:M3 全部收尾——端到端 10/10×2 + 脚本入库 `127988e`,里程碑完成)

## 提醒
- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
