# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-08（**全局同构 review 修复批（批 15）三 commit 已完成，待 push + 真机复验**）

## 一句话状态

全局同构 review 修复批（批 15）全流程完成：4 域 subagent 审查 → 用户拍板 A+B+C → 批 A（P1 五项收敛 `cf8ea72`）+ 批 B（死代码清理 `659e9c9`）+ 批 C（helper 收敛 `400a49e`）三 commit 全门禁绿 + 双 reviewer 消化完 + e2e 27/27 + 探针回归绿 + 记档完——**待 push + 用户真机复验**。

## 本 session 焦点（批 15 全流程）

### 关键决策（本阶段不可丢）

- **三批划分**：批 A = P1 五项收敛（实例动作 hook / tab 注册表 hook / 新建上传装配 hook / 历史编排单源 / wiki 桌面 ⋯ 补齐）；批 B = 死代码清理七项；批 C = helper 收敛十项（八实施 + C6/C7 记档跳过——透传空壳/单行共享核违反「无单消费抽象」）。
- **4 处行为漂移修复**（收敛时统一到正确侧）：①mainPage/全局文件页新建 `siblingNames={[]}` → hook 内置真实 sibling query（重名校验恢复）；②历史标题 → `displayTitleOf`（nativeId 前 8 位兜底）；③resume name trim；④桌面 closePanelTab 补 projectKey 守卫。
- **closePanelTab 幂等守卫**：`Array.filter` 恒返回新数组，幂等判定必须按 `next.length === list.length`（reviewer 建议的引用比较写法是错的，已修正）。pin 严格门：`sessionType === "agent" && a.pin` 用原始 sessionType 严格判定，未知类型不渲染 pin 项。
- **批 B+C code-reviewer 结论**：批 C 八项行为逐字等价全部核实；**P2 = 批 B InstanceSwitchRow 图标 15→17px**（ShellIcon 换轨触发批 14 菜单 17px 标准档兜底，字形等价、调用点特异性无法保 15px）——接受 17px + 注释标注 + 交真机确认；C10 isSuccess 快照分歧 / C8 新增 query observer 两项核实不改；useCopyFeedback JSDoc 措辞已修正。
- **C10 设计**：useProjectInstances 返回加 isSuccess（memo 内随 dataKey 快照——refetch 失败窗口与 live 分歧无害，refs 同期冻结 last-good data）；useScopeInstanceOrder project 分支删本地双 query 改派生。
- **m10 三条预存失败断言**：git log -S 考古（`4bb596e`）+ mac-plugins-tab.html 原型权威 + redesign-v2 既有记档两处 → 判定 v1.5 换代欠账，记档不动。

### 进度（已完成 / 待办）

- ✅ 批 A commit `cf8ea72`（14 files +753/-472）+ 批 A 双 reviewer（code 4 项消化 / design 4 项消化）。
- ✅ 批 B commit `659e9c9`（9 files +19/-66）。
- ✅ 批 C commit `400a49e`（9 files +137/-125）+ 批 B+C code-reviewer 消化（P2 注释标注 + 2 处 JSDoc 修正）。
- ✅ 验证：单测 749 / e2e 27/27 / 探针（inspector-row-menus ALL PASS 含 W4 wiki 桌面 ⋯、batch13 18、m5-sheets 83）/ 门禁全绿 ×3 commit / CSS 硬闸 / tokens strict 0。
- ✅ 记档：redesign-v2.md §6.14 批 15 段 + design_spec §4.5 ⋯ 枚举补 wiki 菜单 + gtd next-actions。
- ⬜ **push（含 handoff commit）**。
- ⬜ **用户真机复验**（清单见下）。

## 统一真机复验清单（批 13 8 条 + 批 14 1 条 + 批 15 6 条）

1. **右栏文件树 mtime**：文件行右侧相对时间在场
2. **右栏 FAB**：右下角 ＋ FAB 新建/上传；地址栏行尾无「＋」钮（移动端同构）
3. **全局文件页地址栏**：与搜索框/卡片左右对齐
4. **检视面板 file tab**：渲染⇄源码 toggle 垂直居中；源码态 = CodeMirror
5. **md 内链**：渲染态点相对 .md 链接 → 新 tab 打开目标
6. **分屏**：分屏按钮 = 当前激活 tab 副本双窗格；无 console 报错
7. **插件作用域分段**：桌面标题行内右端固定宽 290、caret = Lucide；移动满宽正常
8. **检视面板底部文字链退役**：新建/上传统一 FAB；行菜单「上传文件…/上传到此」仍可用
9. **【批 14】菜单统一样式**：各菜单条目间分割线 = 全宽直线（无转角）+ 全行带图标；实例切换菜单与 composer 选择器菜单头下无线；移动 sheet 取消项有分组间距
10. **【批 15】实例 ⋯ 菜单两端一致**：桌面 tabstrip ⋯ / 移动 pill 长按（重命名/置顶/关闭）
11. **【批 15】检视面板 tab CRUD 两端一致**：＋ 新建 / ✕ 关 file·wikiread 标签 / 切换
12. **【批 15】四处文件页新建/上传 + 重名校验生效**：桌面 mainPage ＋、全局文件页 ＋（此前缺失）输入既有名 → 红字 + 创建禁用
13. **【批 15】历史行两端标题一致**（含无标题 nativeId 条目）+ 恢复命名预填 + 删除确认文案
14. **【批 15】桌面 wikiread tab ⋯ 新入口**：复制内容 / 查看 diff（开中栏 git diff wiki/{slug}.md）
15. **【批 15】批 C 视觉零变化**（唯一已知例外：实例切换菜单图标 15→17px，批 B 换轨触发菜单标准档，方向正确）

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-08；触发原因：批 15 记档完成，push 前检查点
