# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-11（**终端快捷输入 v2 两域分离已实现 + 验证链全绿 + 双 review 消化完成，待 commit + 真机清单交付**）

## 一句话状态

终端快捷输入体系 v2「两域分离」（Termius 对标）落地：域 A 按键（内置 8 键显隐排序 + 24 预置终端键启用制）+ 域 B 快捷命令（label/script/group，tap=执行补 \n、长按/右键=仅插入），存量自定义键一次性迁移为命令（默认组、退出按键条）。⚙ 面板双 tab（SegmentedControl），桌面 Dialog 修了超视口溢出真 bug（max-h-[85vh] 内滚）。验证链全绿：typecheck/lint/format 0w + 单测 781 + CSS/tokens/探针 39/39 + e2e terminal-session。code/design 双 review P0 均无，P1/P2 全消化。

## 本 session 焦点

### 关键决策（不可丢）

- **两域分离数据模型**（console-model.ts）：`SessionQuickKey = BuiltinQuickKey | PresetTerminalKey`（CustomQuickKey 退出 union 仅作迁移源）；`QuickCommand = { id, label, script, group }`；`presetTerminalKeys` 24 项全默认停用（Tab/行编辑 Ctrl 系/导航/F 键，键帽名不进 i18n）；`migrateCustomKeysToCommands`（id 复用）+ `groupedCommands`（首现序）纯函数。存储 = `terminalPresetKeysEnabledAtom` / `terminalQuickCommandsAtom`（atomWithLocalOnlyStorage）。
- **存量自定义键一次性迁移**（SessionDetailRoute effect）：函数式按 id 去重，strict 双跑 no-op；迁移后 custom atom 恒空、**条上不再显示自定义键**（行为变化交付时向用户说明——旧键进命令 tab「默认」组）。
- **双发送行为**：tap = 执行（script 尾补 \n 除非自带）；长按（触屏 500ms）/桌面右键 = ActionMenu「仅插入」（原样不带回车）+ 执行/编辑/删除。发送成功关面板（用户要看终端输出）。
- **桌面 Dialog 超视口修复**（探针实抓真 bug）：键盘 tab 8+24 行远超视口高，卡片居中定位溢出视口顶（底部行不可达、tab 栏 out-of-viewport）——照 settings-dialog 高度链 `max-h-[85vh]` + 内滚 + shrink-0 钉 tab 栏。
- **探针方法记档两条**：① CDP 真实鼠标在 Radix Dialog 内拖拽触发焦点链副作用把面板关掉（dialogOpen 翻 false）→ 桌面拖拽断言改合成 pointer 事件序列直驱 handler；② 行选择器须限定主列表 `ul.select-none`（可用按键分区引入第二个 ul 后裸 `ul li` 不可靠）。
- **canSend 透传**（design P2）：命令行 disabled:opacity-40 与 .qkey 键帽同口径（不可发送时命令行禁用反馈）。

### 进度

- ✅ 需求汇总 → 用户四项拍板（呈现结构/按键深度/双发送行为/作用域）→ plan 批准 → 实现
- ✅ 验证链：typecheck/lint/format 0w + 单测 781（+3 新增）+ CSS 硬闸 + tokens 0 违例 + content-type text/css + 探针 39/39 + e2e terminal-session 1 passed
- ✅ 双 review 消化（code P1×1/P2×5 + design P1×2/P2×5，P0 均无）——桌面 DialogTitle/正典弹窗面/text-ink-1/hint 统一/i18n 归族/canSend/探针 D2b-D2c/注释对齐
- ✅ redesign-v2.md §6.12o-2 记档（含 review 消化）
- ⬜ **commit + 真机清单交用户（下一动作）**

### 阻塞 / 风险

- 无阻塞。长按手势（500ms）在真机 iOS 上的手感 Chromium 探针覆盖不了（CDP 合成 touch 无真实按压时序），靠真机清单第 3 条验证。

## 易丢的关键上下文

- **v2 真机清单（待交用户，iPhone PWA + 桌面）**：
  1. ⚙ 面板顶部「键盘 / 命令」双 tab 切换（SegmentedControl）
  2. 键盘 tab「可用按键」分区启用 Tab → 条上出现 Tab 键，点按 = 终端补全（发制表符）
  3. 命令 tab「＋ 新建命令」（名称/分组/脚本）→ 点行 = 终端立即执行；长按命令行 → 菜单「仅插入」→ 内容上屏未执行，可补参数再回车
  4. **旧自定义快捷键出现在命令 tab「默认分组」**（不再占按键条——v2 行为变化）
  5. 桌面：⚙ 面板「Commands」tab → 右键命令行 = 同款菜单（Run/Insert only/Edit/Delete）
  6. （第三轮清单的 5 条仍待复验——编辑光标落点/行高零跳变/⚙ 样式/快捷键增删改〔已并入命令 tab〕/面板开关行为；第 4 条旧流程已被 v2 取代，以本清单为准）
- 本 session 写入损坏顽疾高发（Edit new_string/old_string 乱码/截断、「to be verified」类噪声混入）——修乱码前先 Read/hexdump 确认精确文本；**注释定界符陷阱**：注释文案含 `**/` 形态会截断块注释（TS1127 的真根因，先查注释再怀疑工具链/缓存）。
- 设置二级 5 条 + 第二轮重写版 5 条真机清单仍待用户复验（历史挂起）。
- agent-browser CLI 可用（iPhone 16 设备模拟），一次性 UI 验证优先用它。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-11 15:30；触发原因：终端快捷输入 v2 两域分离实现 + 验证链全绿 + 双 review 消化，commit 前检查点
