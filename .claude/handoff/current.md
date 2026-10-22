# 当前状态(current.md — 滚动更新)

> 最后更新:2026-10-23(M2 画布批 1 全部完成含 reviewer 收敛批 `1adbacf`;下一步 M3 选区引用循环)

## 一句话状态

**M2 画布批 1(最小闭环)全部完成**:M2.1 四工具+存储 → security 收敛 ×2 → M2.2 模板+提交链 → M2.3 指纹抑制+探针 → **reviewer 收敛批(`1adbacf`)已提交**。探针 `probe-mcp-app-canvas.mjs` 3 轮 23/23;全门禁绿(api 1097 / shared 10 / web 883)。**下一步 M3 画布批 2(ui/update-model-context 选区引用循环)**。

## 本 session 焦点

### 关键决策(不可丢)

- **指纹基线空间统一(baselinePending)**:回声抑制的基线**不能取服务端 face**——excalidraw restore 会给 sparse 元素补默认值,内部形态 onChange 与 sparse face 必错位 → 空转 commit 撞假冲突。基线 = 首个 onChange 的内部形态(`baselinePending` 置位 → commitScene 定基线后 return);commit 回显(提交原样=内部形态)同步基线。
- **requestFullScene 守卫记账在响应侧**:「已向该 revision 要过全量、拿回的仍是 truncated」才停手(斩 truncated→read→又 truncated 循环);**全量成功重置 -1,冲突重载不受限**。若记账放请求侧,同 revision 二次 409 会被误挡拿不到重载(自查发现,探针 truncated 用例验证斩循环)。
- **反向通道不过 48KiB 闸**:`canvasSceneStructuredContent(scene, {full: true})` 仅 HUB_APP_TOOLS 四工具用——48KiB 降摘要闸管 CLI 消息通道的初始 tool-result;卡片反向通道(web 宿主 REST 代理)若也降摘要就形成死循环。
- **commit 串行化**:在途 commit RTT 内防抖到期 → 新编辑排队(最新覆盖),`.then` finally 里以已更新的 docRevision 重发;REVISION_CONFLICT 清队列(服务端为准)。
- **CSP form-action 单列**:form-action 不回退 default-src,七张模板卡基座统一补 `form-action 'none'`(之前注释声称禁 form 实际没禁)。
- **autoFocusFrame 输入保护**:onLoad 抢焦前查 `document.activeElement`(INPUT/TEXTAREA/contentEditable)——卡加载晚于用户点击输入框时不抢焦。
- **excalidraw 0.18 探针三坑**(沉淀在探针注释):工具按钮是隐藏 radio input(DOM `el.click()` 直接触发 change 切工具);顶部工具栏悬浮画布上方 y<50(拖画落点 y≥130);双卡焦点互抢后回卡首次拖画失效(focus 归还等价用户「先点一下卡片」)。

### 进度

- ✅ **M2 全部**:`96d6c0c`(M2.1)→`5542580`/`ae6bfe3`(security 收敛)→`424791f`(M2.2)→`d84d55c`(M2.3)→`1adbacf`(reviewer 收敛批:反向通道 full face/baselinePending/守卫响应侧记账/commit 串行化/CSP form-action/export_diagram 死注册删/探针 20→23)
- ✅ GTD M2 勾选 + 本 handoff
- ⏳ **M3 画布批 2(选区引用循环)**:ui/update-model-context 协议方法 + composer chip + 发送时 prompt 注入

### 待办

- **M3 画布批 2**:McpAppCard dispatcher 加 `ui/update-model-context` 分支(模板选中元素触发)→ web 存「待发画布上下文」(per session bridge state)→ composer chip(可见可删,i18n ×2)→ 发送时序列化进 prompt(`[画布选区]` 块,与 gen-ui-context 同族)→ 探针 + 端到端(画图→选节点→改选区)→ reviewer
- **真机清单(交用户,统一最后验)**:①多卡焦点互抢后回卡首次拖画失效(用户「先点一下卡片」即恢复);②esm.sh 字体被 CSP 拦(系统字体回退)视觉确认;③指纹机制取舍确认;④M1 gen-ui 三条(滑块/全屏/回放);⑤M2 画布端到端(agent 建画布→手改→commit→agent apply→卡刷新)
- 挂起批(工作区,刻意不提交):`api/src/index.ts` inset-report hunk + `web/src/lib` 三件(keyboard-inset.ts/.test.ts + use-composer-inset-debug-badge.ts,composer 第二次埋点等真机数据);根目录 `.mcp.json` untracked(是否提交由用户定)

### 易丢的关键上下文

- **探针 lang 坑**:诊断脚本必须 `page.addInitScript(() => localStorage.setItem("lang", "zh"))`。
- **跑测试限内存**:`systemd-run --scope --user -p MemoryMax=2G`(`ulimit -v` 会让 api 测试 SIGSEGV)。
- **探针跑法**:`systemd-run ... bun scripts/probe-*.mjs`;`_diag-` 一次性脚本用后删。
- **tmux**:`ar-dev:api` / `ar-dev:web`;标准重启 `respawn-pane -k`;绝不 kill server。
- **混合 hunk 提交手法**(本 session 实战修正):`git diff <file> > /tmp/full.diff` → awk 状态机提取目标 hunk(**header 只在 keep=true 时 printf + 打印 @@ 行本体 + 清 header**;print 语句自动附加换行,header 必须 printf 否则多空行)→ `git apply --cached --recount`。
- **Edit 全角标点陷阱复发**:本 session 探针编辑连续两次生成占位符垃圾/不匹配——含全角标点的 old_string 或疲劳期输出,失败就 Read 精确文本再复制;写入后必 Read 回读核对。
- **mcp-app-card e2e 选择器**:`iframe[data-testid="mcp-app-frame"]`(title 走 i18n 不稳定)。

---
最后更新:2026-10-23(触发原因:M2 收敛批 `1adbacf` 提交 + GTD 勾选,M3 开工前 handoff save)
