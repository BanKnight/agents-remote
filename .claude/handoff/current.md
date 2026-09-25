# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-26（**SessionDetailHeader 死 UI 整片删除完成 `2c59ed7`——用户拍板 A 执行**。深度优化四批全闭环：批次 1 `f3482bb` / 2 `13bc633`+`9dd796e`+`4d77a2d` / 3 `77c24c3`+`06b2c7f`+`347dda2`+review `21111f1` / 4 `2bf5e55`+终审 `658e61c` + 死 UI 删除 `2c59ed7`。**下一步：①待用户拍板两片同类死态（ChatHeader / SessionDetail embedded 壳）②真机复验清单（见下）**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

深度优化四批全闭环后，用户拍板 A 整片删除 SessionDetailHeader 死 UI（§6.12m 条 8）：header + 操作区 + DetailWorkspace + detailView 全链 + closeSession/createTerminal mutation + useConfirm + 透传链收缩 + i18n 孤儿 9 key（854→845），6 文件 +43/−571，全部自动化验证绿。

## 本 session 焦点

拍板 A 删除收尾闭环：删组件三块（SessionDetailHeader/SessionDetailActions/DetailWorkspace ~340 行）→ mutations/state 链清理 → instance-panel/instance-area 透传收缩（ChatPanel→ClaudeChat 链保留）→ i18n 孤儿批删（方法论复用：只读脚本 → 无模板拼接判定 → 确定性删行脚本 → typecheck 双向护栏兜底）→ §6.12m 条 8 更新 → 全套验证 → commit。

## 关键决策（本阶段不可丢）

- **拍板 A 已执行（2026-09-26 `2c59ed7`）**：操作去向依据 §11——检视=注册表、close=tab ✕、开终端=左总览 CreateSessionBar、Retry=错误横幅 Notice。保留的活 key：backToProject/close/closing/closeConfirm/retry。
- **⚠️ 待用户拍板两片同类死态（§6.12m 条 8 尾）**：① ClaudeSessionDetailRoute 的 ChatHeader——全挂载点恒传 embeddedHeader，同款死分支；② SessionDetail 的 `embedded` prop + ShellLayout 壳分支（挂载路径唯一 = PanelRouter 恒传 embedded，壳分支不可达）。
- **精简轮验证责任在 Claude**（用户反馈）：行为等价重构不交用户测，自动化门禁+e2e+探针全覆盖；只交产品决策和有 UI 变化的批次。
- **多端同构 = 代码同一份**（用户拍板）；精简方法论：优先删除其次合并最后才提取。
- rootBrowse 单独立项（不在本轮）；GitFileDiffPanel 中栏保留；`docs/design2/` 是用户目录不动。

## 进度（已完成 / 进行中 / 待办）

- ✅ 深度优化四批全闭环（详见 §6.12m 十条 + snapshots/20260925-1905.md）
- ✅ **拍板 A：SessionDetailHeader 死 UI 整片删除（`2c59ed7`）**：SessionDetailRoute 1800→~1290 行；验证 = 四门禁 + CSS 硬闸 + e2e 24/24 + 探针 desktop-instance-info ALL、m4-tools-l3 43/43、inspector-row-menus ALL、m9-b 16/16、m9-d 63/63
- ✅ handoff save（本文件）
- ⬜ **待用户拍板**：ChatHeader 死态（①）+ SessionDetail embedded ShellLayout 壳（②）——删或留
- ⬜ **交用户真机复验**（清单见下）
- ⬜ 单独立项（不在本轮）：rootBrowse 下沉；i18n 动词级 key 收敛；存量探针欠账；probe-chat-e2e 2 存量 FAIL

## 用户真机复验清单（深度优化四批 + 死 UI 删除）

**编辑链（新能力，重点）：**
1. 桌面右栏 files 段点文本文件 → 预览 →「编辑」→ 改内容 → 保存（「已保存」反馈 + ⌘S + mtime 刷新）；不保存切换文件 → dirty 丢弃确认
2. 移动 iPhone 项目工具态文件预览：meta 行「编辑 / 查看 diff ›」**贴行右缘**；编辑态保存/完成流同上
3. md/html 文件：渲染态 ⇄「源码」/编辑切换正常
4. L3 图片文件预览 → ImageViewer；超大文件 → 提示文案

**检视换装（形态变化，属预期）：**
5. 移动会话 focus 态 files/git tab = 工具面板形态；git 改动行 → 栏内 diff → 返回
6. Wiki：列表 → 阅读态（右栏/移动同一份 L3WikiReader）→ 返回
7. 审批中心「全部允许」两段确认（桌面 Popover / 移动 sheet 一致）

**杂项：**
8. chat 行菜单取消按钮显示「取消」；新建文件夹 prompt 两入口一致
9. 双主题下上述全部形态正常
10. **本轮新增**：agent/terminal 会话面板（工作台中栏/移动聚焦态）顶部不再有标题/操作条——tab chip 即标识，关闭走 tab ✕（死 UI 删除，属预期）

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活 43011/43012；`2c59ed7` 后已 touch main.tsx rebuild，CSS 硬闸过。
- token 机检 report 模式存量 HEX（`#6b7280` 等）非本轮引入，M1 收紧时清。

## 易丢的关键上下文

- **探针跑法**：`bun scripts/probe-*.mjs`；跑前 touch main.tsx 完整 rebuild + sleep 16；e2e 用 `systemd-run --scope --user -p MemoryMax=2G bun run e2e "正则"`。
- **agent-browser 密码**：`PW=$(awk '/password:/ {print $2; exit}' ~/.agents-remote/config.yaml)` 进 shell 变量，不进上下文；断言用类名/aria 不用文案（探针须设 locale zh-CN）。
- **Edit 注入防护（本 session /tmp 脚本两次写坏：readdirDirReaddirSync、" SyntaxError;）**：长内容输出有残渣风险——脚本写完先跑一次再用；连续两次失败改方案（如 rg 拿文件清单）不再手写递归。
- **i18n 批删方法论（可复用）**：只读脚本生成零引用清单（corpus 子串判定，无假阳性）→ 无模板拼接判定 → 确定性删行脚本（9 key 单行格式 rg -A1 核实）→ TranslationKey/zh Record 双向护栏兜底。
- **route mock LIFO**：后注册先匹配；探针 mock 别挂宽泛 `git/.*`。preview 响应必带 mtimeMs。
- **右栏默认收起**：探针/e2e 加InitScript `localStorage.setItem("workbenchRightCollapsed","false")`。
- **基线对照法**：`git worktree add /tmp/ar-probe-baseline <旧 commit>` + 43099 独立端口 preview。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-26 00:50；触发原因：拍板 A 删除完成 + commit `2c59ed7` + handoff save
