# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-07（**批 12 实现完成待 commit + push；等用户真机复验**）

## 一句话状态

批 11（`6af7b9d`）push 完毕。**批 12（真机反馈第三轮 5 条）实现 + 验证 + 双 reviewer + 记档全部完成**，工作区已就绪待 commit。五条修复：①PanelTabBar 补 open 依赖（打开工具区滚入视野）②`.hfade` 单源滚动条隐藏 ③终端 composer 换 react-textarea-autosize（对齐 agent）④`.cseg` 居中（2.6px 偏心修零）⑤`.sw` → Lucide chevron-down（单轨收口）。

## 本 session 焦点（批 12 全流程）

### 关键决策（本阶段不可丢）

- **反馈①先探针后修（§22 纪律）**：Chromium 实测三面排除——移动常驻挂载 reload 时已滚（closed 态 translate 不影响 scrollIntoView）；桌面右栏 ptabs 仅 3 结构标签 sw=251 ≤ 右栏最小 256px **无溢出面**；中栏 tabstrip chips flex 收缩不溢出。修法依据 = 代码层可证缺口：PanelTabBar effect deps 不含面板可见性，移动 closed 态（invisible）首滚在 WebKit 可能不生效（§14/§21 同族引擎分歧面）。修 = `open?: boolean` 进 deps（默认 true；桌面 RightPanelTabs 条件挂载不传零改动）。
- **反馈③对齐 agent 家族（用户拍板）**：react-textarea-autosize@8.5.9（原 assistant-ui 传递依赖 → package.json 显式化，零新增包）+ `max-h-32` + **`sm:min-h-[4.5rem]`**（双 reviewer 抓出宽端初始高度回归：minRows=1 全端生效让 iPad/Mac 从 3 行缩 1 行，违反 spec「宽端 ≥3 行」；agent 家族三处先例同款修法）。
- **反馈⑤ LucideIcon 直吃生成物键**：无 ShellIcon SF 名消费点 → 不加 TO_LUCIDE 映射（零冗余）；白名单 + 生成物 + 类型三处同步；显式 `size-3.5`（§15⑤ WebKit 防隐形）+ `text-ink-2` 静息（原型让锚弱于标题，双 reviewer 共识）+ 开态 `text-primary`。`.sw` 三处退役（v2-primitives / components.css 设计包单源 / 消费点）。
- **单测探针回归面**：m4-tools-l3 新 Part 9（9 标签溢出 fixture + 开面板 inView 断言）75/0；mobile-project-header Part 10 改 svg 断言（在场 + size-3.5 + 14px 几何）42/0；batch8-interactions Part T 加 P-T5/T6（scrollbar-width none + 无占高）27/0。

### 进度（已完成 / 待办）

- ✅ 批 0–8（v1.5 九批）+ 批 9（`88feaad`）+ 批 10（`5d9966f`）+ 收尾（`fa973c6`）+ 批 11（`6af7b9d`）。
- ✅ 批 12 全流程：实现 → 探针（4 个全绿）→ 门禁（format/lint 0/typecheck/单测 729）→ CSS 硬闸 + tokens strict 0 → e2e 全量 27/27 → 双 reviewer（code 3 条 + design 4 条，全消化：sm:min-h / text-ink-2 / components.css .sw 退役）→ redesign-v2 §6.14 批 12 段记档 → reviewer 修复后复验（CSS 硬闸 + tokens + header 探针 42/0 + sm:min-h 落盘确认）。
- ⬜ **commit + push**（提交面已核对：13 文件，zip 不入）。
- ⬜ 用户真机复验（清单见下）。
- ℹ️ `~/workspace/test/b4diag-*.txt` 两文件（早于 v1.5）全仓无引用——待用户定夺。

### 阻塞 / 隐患

- 无阻塞。dev 存活 43011/43012。
- `docs/agents-remote-design-v1.5.zip` untracked 不提交（长期约束）。

## 统一真机复验清单（批 12）

1. **打开工具区滚入视野**：工具区（检视面板）多开几个文件标签（>6 个溢出）→ 退出会话页重进 → 打开工具区 → 激活标签应在视野内（本条修复 WebKit closed 态首滚不可靠）
2. **快捷方式条无滚动条**：终端快捷键条横向滚动 → 不再出现常驻滚动条（渐隐提示可滚侧）
3. **终端 composer 增长**：终端输入长命令/多行 → 输入框随内容增高（折行也增长），128px 封顶后内部滚动；桌面初始 3 行（4.5rem）不变
4. **文件树地址栏图标居中**：任意层级地址栏首段项目图标上下居中（修前偏上 2.6px）
5. **顶部切换锚 Lucide 化**：移动工作台标题右侧 ▾ = Lucide chevron-down（14px、静息 ink-2 弱于标题、菜单开态主色），不再是 CSS 手绘旋转盒

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-07；触发原因：批 12 实现完成（含双 reviewer 消化），待 commit + push 交真机清单
