# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-26（**§6.12n 移动 sheet 收敛完成 `39a8aca`**：三套实现收敛 MobileSheet 单源，七处消费方全迁，design-reviewer 7 条 + 自查 1 条全部消化，验证全绿。深度优化四批全闭环 + 死 UI 两轮 `2c59ed7`/`66f6b70`。**下一步：真机复验清单（见下）**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

§6.12n 移动 sheet 形态统一完成（`39a8aca`，12 文件 +304/−267）：MobileSheet（`.msheet` 悬浮卡片）成为全系统移动 sheet 唯一底座，菜单/prompt/confirm/pages/实例信息/运行配置七处消费方全迁；scrim 全走 `bg-scrim`（含桌面 modal）；`SHEET_UNMOUNT_DELAY_MS` 单源化。全部门禁 + e2e 24/24 + 探针 8 个全绿。

## 本 session 焦点

1. 用户报「浮层样式不一」→ 调研出三套移动 sheet 实现并存 → 用户拍板「彻底把（统一）」。
2. MobileSheet 增强（`trigger?`/`title` 可选/`ariaLabel` sr-only Title）+ 七处消费方迁移 + `mobileSheetClasses` 删除。
3. design-reviewer 7 条全部消化（P1-1 runtime-config 第七处漏迁 / P2-2 菜单 ariaLabel 误用「取消」/ P2-3 status 行 mt-0.5 / P2-4 pages open 桥 / P2-5 无标题 sheet 下拉热区 / P3-6 按钮间距 16px / P3-7 scrim 统一 bg-scrim）+ 自查 1 条（info-sheet modal 分支漏绑 open state）。
4. `SHEET_UNMOUNT_DELAY_MS`（300ms）提取至 mobile-sheet.tsx 单源（5 处私有同值常量收敛）。

## 关键决策（本阶段不可丢）

- **移动 sheet 唯一底座 = MobileSheet**（§6.12n 记档见 redesign-v2.md）：新浮层一律走它，禁止再手写贴底 sheet/class 串。
- **scrim 收敛边界 = 全部 Dialog 封装**（不只移动 sheet）：`bg-scrim` 两态 token、无 blur（原型 .dim）；drawer/reader/桌面 modal 一并对齐。
- **pages 保存成功路径刻意保留立即收起**：父级 onSuccess 驱动卸载无 DismissableLayer 竞态风险，仅剩 polish 级动画截断；为避免 ref 命令式通道复杂化接受（记档 §6.12n）。
- **受控浮层关闭范式**：内部 open 桥（setOpen(false) 播 exit 动画）+ 延迟 `SHEET_UNMOUNT_DELAY_MS` 通知父级卸载——立即卸载 = 截断动画 + DismissableLayer 竞态（body 残留 pointer-events:none）。
- **多端同构 = 代码同一份**（用户拍板）；精简方法论：优先删除其次合并最后才提取。
- rootBrowse 单独立项（不在本轮）；GitFileDiffPanel 中栏保留；`docs/design2/` 是用户目录不动。
- **精简轮验证责任在 Claude**（用户反馈）：行为等价重构不交用户测，自动化门禁+e2e+探针全覆盖；只交产品决策和有 UI 变化的批次。

## 进度（已完成 / 进行中 / 待办）

- ✅ 深度优化四批全闭环（§6.12m 十条）+ 死 UI 两轮（`2c59ed7`+`66f6b70`）
- ✅ **§6.12n 移动 sheet 收敛（`39a8aca`）**：验证 = 四门禁（format/lint/typecheck/test 673）+ CSS 硬闸 + token 机检 + e2e 24/24 + 探针 m10/inspector-row-menus/desktop-instance-info/m9-b 16/16/m9-c 15/15/m9-d 63/63/m9-e 14/14（死断言顺手修）/m4 43/43 全绿
- ✅ handoff save（本文件）
- ⬜ **交用户真机复验**（清单见下，重点新增浮层形态变化项）
- ⬜ 单独立项（不在本轮）：rootBrowse 下沉；i18n 动词级 key 收敛；存量探针欠账（probe-chat-e2e 2 存量 FAIL 等）

## 用户真机复验清单（深度优化四批 + 死 UI 删除 + §6.12n）

**编辑链（新能力，重点）：**
1. 桌面右栏 files 段点文本文件 → 预览 →「编辑」→ 改内容 → 保存（「已保存」反馈 + ⌘S + mtime 刷新）；不保存切换文件 → dirty 丢弃确认
2. 移动 iPhone 项目工具态文件预览：meta 行「编辑 / 查看 diff ›」**贴行右缘**；编辑态保存/完成流同上
3. md/html 文件：渲染态 ⇄「源码」/编辑切换正常
4. L3 图片文件预览 → ImageViewer；超大文件 → 提示文案

**检视换装（形态变化，属预期）：**
5. 移动会话 focus 态 files/git tab = 工具面板形态；git 改动行 → 栏内 diff → 返回
6. Wiki：列表 → 阅读态（右栏/移动同一份 L3WikiReader）→ 返回
7. 审批中心「全部允许」两段确认（桌面 Popover / 移动 sheet 一致）

**§6.12n 浮层统一（形态变化，属预期——全部从贴底/手写改为悬浮卡片）：**
8. 移动端所有底部弹层 = 统一悬浮卡片形态（四周 10px、20px 圆角）：行 ⋯ 菜单、chat 行菜单、新建实例/prompt/确认框、pages 新增/编辑、ℹ 实例信息、ℹ 下钻（模型/权限/effort 选择面）；标题上移到卡片头部
9. 所有上述 sheet 均可**下拉收起**（抓头部区域下滑；无标题菜单 sheet 也可拖——热区已扩展）
10. scrim 变化：桌面弹窗背景变纯压暗（40%/45%，无毛玻璃 blur）——对齐原型，属预期
11. agent/terminal 会话面板与 claude 面板顶部均无自带标题/操作条——tab chip 即标识，关闭走 tab ✕（死 UI 两轮删除，属预期）

**杂项：**
12. chat 行菜单取消按钮显示「取消」；新建文件夹 prompt 两入口一致
13. 双主题下上述全部形态正常

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活 43011/43012；`39a8aca` 后已 touch main.tsx rebuild，CSS 硬闸过。
- token 机检 report 模式存量 HEX（`#6b7280` 等）非本轮引入，M1 收紧时清。

## 易丢的关键上下文

- **探针跑法**：`bun scripts/probe-*.mjs`；跑前 touch main.tsx 完整 rebuild + sleep 16（后核对 dist mtime 确认真 build 了）；e2e/单测用 `systemd-run --scope --user -p MemoryMax=2G`。
- **agent-browser 密码**：`PW=$(awk '/password:/ {print $2; exit}' ~/.agents-remote/config.yaml)` 进 shell 变量，不进上下文；断言用类名/aria 不用文案（探针须设 locale zh-CN）。
- **Edit 注入防护（本 session 再犯：ShellIcon import 误删、中文注释残渣 ×2、常量名大小写残渣）**：大块删除用「Read 定位 → sed 行号区间删 → rg 验证」；Edit 前必须从最新 Read 逐字拷贝；new_string 写入后立即 rg 机检 + typecheck 兜底。
- **i18n 批删方法论（可复用）**：只读脚本生成零引用清单（corpus 子串判定，无假阳性）→ 无模板拼接判定 → 确定性删行脚本 → TranslationKey/zh Record 双向护栏兜底。
- **route mock LIFO**：后注册先匹配；探针 mock 别挂宽泛 `git/.*`。preview 响应必带 mtimeMs。
- **右栏默认收起**：探针/e2e 加InitScript `localStorage.setItem("workbenchRightCollapsed","false")`。
- **基线对照法**：`git worktree add /tmp/ar-probe-baseline <旧 commit>` + 43099 独立端口 preview；注意 stash 只动源码不动 dist，对照探针结论无效（本轮踩过）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-26 15:58；触发原因：§6.12n 移动 sheet 收敛 commit `39a8aca` + review 7 条消化完成 + handoff save
