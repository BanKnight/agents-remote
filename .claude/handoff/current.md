# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-24（**第十一轮 4 批次全闭环**。桌面 IA 对齐原型（4 列 → 3 列）+ review 修复：`4f82296`/`4a0e61f`/`4cdf2ab`/`7f99411`/`63c64bd`/`1a524a0`，§6.12k 记档。**下一步：交用户真机复验清单，等报数。**）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第十一轮两问题（①移动 terminal 聚焦态高度缺块 ②桌面会话实例合并进侧栏）全闭环：`4f82296` 移动高度链修复；批次 1-3（`4a0e61f`/`4cdf2ab`/`7f99411`）4→3 列 + WorkbenchSide 合并单栏；批次 4 review 修复（`63c64bd` file-nav 假绿修正 + `1a524a0` code/design review 22 条消化——side 恒定、footnav flow 化、高度链断链、workbenchMiddleTabAtom 死态删除、InstanceGrid 死链清理 ~350 行）。**下一步：交用户真机复验清单。**

## 本 session 焦点

批次 3 收尾 + 批次 4（门禁/全套 e2e/双 review/记档/handoff）。批次 3 适配揪出 5 个真问题（①derive leftModeFallback ②WorkbenchSide leftMode 默认 ③§8 高度链两层断链 ④MobileFilesTool §13 404 回退 ⑤**WorkbenchSide 漏挂 create.promptHolder = 桌面建会话入口全断**）；批次 4 全套 e2e 首轮 22/23——file-nav order-dependent 假绿（根层 10m 卡形态可访问名含 overview 统计副行，同套前序 spec 泄漏实例使后缀浮动，exact 禁用）；双 review 消化 22 条修复（1 条误判回滚：DragSourceCard 是 tabstrip tab chip 活拖源，rg 过滤排除 instance-area 后误读零消费——教训：判死代码必须全文件看用点，不能 rg 过滤文件名）。

## 关键决策（本阶段不可丢）

- **side 恒定（review P2③ 拍板）**：mainPage 态（global+文件/插件/设置+无 focus）side 由 `workbenchLastProjectAtom` 驱动项目视图（07m/09m/10m「side 仅遮盖主区」），无记忆项目退 05g 会话视图；global 会话页补「会话」ghead + seg4 mini（05g:32 原文「全部」on + 项目段回 lastProject；时钟/plus 无 global 数据源不伪造）。
- **seg4 与历史态互斥**：seg4 点击均 setHistoryOpen(false)——否则历史态下高亮切换而内容不变 = 控件失灵。
- **「记住上次中栏 tab」atom 已删**：写点随桌面左栏 middle tab 退役断链，残留 localStorage 值会错乱回退（残留 "git" → 退出文件工具直接进 git 态）；URL `?tab` 唯一真相，省略 = overview；移动工具退出回 overview（原「回进工具前 tab」语义随写点消亡）。
- **file-nav 假绿教训**：根层 10m 卡形态项目行可访问名 = 名 + overview 统计副行（"demo 2 instances · active just now"）——同套 e2e 前序 spec 泄漏实例使后缀浮动，断言禁 exact；单跑干净环境恰好命中是 order-dependent 假绿。
- **DragSourceCard 活体实锤**：中栏 tabstrip tab chip 的拖源包装（e2e drag-source 拖的 .tb 即它）——判死代码必须逐文件看全部用点，rg 输出排除定义文件后再过滤会误读。
- **useApprovals 双 WS 订阅**（StatusBar + WorkbenchSide，承接 ProjectLeftPanel 时代）：注释已修正，收敛单一订阅点单独立项待办。
- **不修记档**：历史态头部形制与 05c 独立行差异（P3⑧ 等真机反馈）；右栏渐变底 v1 残留（P3⑬ 随 token 收敛批）；pages 桌面无入口（Inspector 四段无 pages 段，等用户反馈定归属）。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0–M10 + 十一轮反馈修复；第十一轮 4 批次全闭环（§6.12k 逐批记档）
- ✅ 门禁全绿（lint 0 warning/typecheck/web 672 + api 829 单测）；全套 e2e **23/23**；CSS 硬闸 + tokens 机检过；probe m9-d 63/63
- ✅ 双 review（code 8 条 + design 14 条）消化完毕，修复 commit `1a524a0`（+204/−502）
- ⬜ **交用户真机复验**，第十一轮清单：
  - **桌面（Mac 250px / iPad 260px 分档）**：side 单栏（项目行切换/实例行开 tab/时钟切历史再点返回/seg4 项目↔全部/footnav 三项 + .on 跟随）；**建会话入口**（实例组头 + → 选类型 → prompt 出现——promptHolder 漏挂修复验证）；⌘N；aprow 审批橙行点击开审批中心；mainPage（文件/插件/设置）side 恒定不随导航变化；global 会话页「会话」ghead + seg4；分屏拖拽（tab 拖到中栏左/右边缘）
  - **移动**：terminal 聚焦态输入抽屉不再被底部导航盖住（`4f82296`）
  - 遗留（历史轮）：②时间刷新节奏、⑥gf 卡形态、⑫浮层穿透、⑬ticon 间距、iPad 触屏 hover 正交、W4 chip-Popover 形态
  - 记档不做：宽屏中栏 360px、数据依赖 D 批、项目行操作（重命名/删除/置顶）、实例卡拖放源、文件树拖到中栏（桌面）、pages 桌面入口
- ⬜ review 待办（单独立项）：useApprovals 双 WS 订阅收敛；右栏渐变底随 token 收敛批清

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活，43011/43012 均 200，dist 已 rebuild（CSS 硬闸过）。

## 易丢的关键上下文

- **探针跑法**：`bun scripts/probe-*.mjs`（bun 不用 node）+ `systemd-run --scope --user -p MemoryMax=2G`；跑前 touch main.tsx 完整 rebuild + sleep 16。
- **探针 mock 铁律**：route 正则带查询尾 `(?:\?.*)?$`；overview/subtitles/approvals/stream 都要 mock 隔离。
- **e2e 纪律**：`systemd-run --scope --user -p MemoryMax=2G bun run e2e`（全套）；开发期只跑受影响 spec——run-e2e.ts 多 filter 参数只吃第一个，多个 spec 用正则 `"a|b|c"`。
- **项目行定位**：`nav.side .srow2[title="<项目名>"]`（可访问名含 live 徽章，exact 不命中；title 属性项目行独有）。
- **CSS 落盘流程**：改 web 后 touch main.tsx → sleep 16 → ar-verify-css；交付前 curl content-type 必须 text/css。
- **Edit 注入损坏第 6 次**（workbench-model 删 atom 时吞掉下一 JSDoc 的 `/**`）——≥15 行坚持 python 锚点脚本 + 写完 typecheck/rg 机检；Edit 限单行小步且 old_string 尾部不要吞下一声明的开头行。
- contains 防护 idiom：`if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target as Node)) return;`

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
