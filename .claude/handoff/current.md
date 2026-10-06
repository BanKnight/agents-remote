# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-06（**v1.5 批 8 微交互收尾已收口待 commit——9 批全部完成**；下一步 = 统一真机复验清单交用户）

## 一句话状态

**v1.5 换代 9 批（批 0–8）全部实现完毕**：批 8 = ①§7.2 指针规范（`useHScroll` hook 单源：wheel deltaY→scrollLeft 四道闸 + `.hfade` 12px 渐隐 mask，落 ptabs/tabstrip/chips/qkeys 四处）②§5.0 浮层两族对齐（DropdownMenu 三件族A 材质单源 + ActionMenu/OptionMenu 移动档标准档 45px/17px/gap14 单源收口）③附件双路径（`classifyAttachment` 三路分流单源：白名单小文本 ≤1MB 内联 fence / 超限 uploads）④行高对齐。全门禁 + 探针（新 batch8 探针 25 断言）+ e2e 全绿；**design-reviewer 恢复产报（环境恢复），PASS-with-notes**——P0 渲染死循环（reviewer loop check 实抓 runaway 63，已修 + 回归锁）+ P1 OptionMenu 移动档（已修）+ P2×6 记档随下批。§6.14 批 8 记档已落。

## 本 session 焦点（v1.5 换代 9 批计划——已全部完成）

Plan：`/home/deploy/.claude/plans/toasty-sprouting-star.md`。批次 = 0✅`d1210f0` / 1✅`75a88f2` / 2✅`36b2195` / 3✅`3ace270` / 4✅`bb083af` / 5✅`7f949aa` / 6✅`4f6ad1a` / 7✅`b529c12` / **8✅（本 commit）**。

### 批 8 实现摘要（§6.14 已记档）

- **§7.2 指针规范**：`web/src/hooks/use-h-scroll.ts`（新）——wheel `deltaY→scrollLeft`（passive:false）四道闸（Shift / deltaX≠0 / 无溢出 / 已到端 → 放行原生）；fade = scrollLeft 边界判定，scroll + ResizeObserver + 调用方内容 effect `update()` 三驱动；`.hfade`（v2-primitives 新原语）mask-image `--fade-l/--fade-r` 12px、`data-fade-*-off` 压 0px 数学退化。应用 4 处：PanelTabBar / GroupHeader tabstrip（尾部控件在容器外可达天然成立）/ composer chips 行（flex-nowrap 横排）/ QuickKeyBar。
- **§5.0 浮层对齐**：`dropdown-menu.tsx` 三件 = content `rounded-[14px] border-sep-strong bg-menu`（族A 材质单源，components.css:176）+ item `min-h-[45px] gap-3.5` + svg 17px 兜底 + separator `bg-sep`；`action-menu.tsx` mobileSheetItemClasses 同步；`option-menu.tsx` mobileOptionItemClasses 同步（reviewer P1）。浮层容器核查：`.msheet` 10px 侧距既有达标（探针实证）/ push-preview 零距（代码核查）/ 面板三边零距（批 4 已达标）。
- **附件双路径**：`composer-attach.tsx` —— `classifyAttachment` 三路分流**单源**（image 直传 / `isInlineTextFile` 白名单 txt/md/csv/json/log ≤1MB 内联 / 其余 uploads），pick 占位与 addFiles 分流共用；内联 = `file.text()` kind:"text" 消息级不落库，takeSnapshot 组「前导行（i18n 在 hook 内、adapter 零依赖）+ fence」；⌫/Delete 删 chip（tabIndex+focus ring）；chips 行 hfade+wheel；`data-composer-file-input` 定位锚（移动页多 file input 串扰）。
- **i18n**：`claude.attach.textInline`（zh/en）=「附件 {{name}} 内容如下：」。

### 批 8 两个实抓缺陷（都已修 + 防回归）

1. **内联文本静默丢失**（探针 P-D6 帧断言实抓，单测盲区）：pick 占位 kind 二分 → 白名单文本占位 "file" → takeSnapshot 按 kind==="text" 过滤恒空。治本 = classifyAttachment 单源化。
2. **useHScroll 渲染死循环**（reviewer loop check 实抓 runaway 63）：setFade 恒新对象 + 调用方 deps `[hs,…]` 每渲染新字面量 → 无限重渲染；**探针测不出**（死循环 DOM 输出恒同只空转 CPU）。修复 = setFade 函数式 + 值等返回原引用（Object.is bailout）+ 三处调用方 deps 收敛 `[hs.update,…]` + `use-h-scroll.test.ts` 回归锁。

### 批 8 验证面

- 门禁全绿：format:check / lint 0 warning / typecheck 三包 / **test 1645（api 905 + shared 10 + web 730）** / CSS 硬闸 **195882 字节** / tokens strict 0 违例。
- 探针全绿：**probe-v15-batch8-interactions.mjs 新增 25 断言**（Part D 桌面：浮层规格 6 + 附件双路径/⌫/发送帧 fence 全等；Part M 移动：sheet 45px + 10px 侧距 + chips 横滚 wheel/渐隐翻转；Part T 280×568：qkeys hfade/wheel/渐隐）+ 回归 composer-attach 20 / batch7 40 / m5-sheets 82 / m9-d 67。
- e2e：terminal-session 1 + claude-windowing 2（改动面相关）。
- design-reviewer **恢复产报**（批 2/3/7 三批代行后首次）——**PASS-with-notes**：P0×1（已修）P1×1（已修）P2×6（记档 redesign-v2.md §6.14，随下批消化：popover r12→14+radius 单源 / deltaMode 归一 / deltaY===0+ctrlKey 卫生闸 / 菜单行 ink-1 层级化取舍 / 渐隐 stale 窗口 RO 兜底 / chip a11y 语义+uploading 措辞）。

## 关键决策（本阶段不可丢）

- **9 批流程**（§6.13 先例）全部走完：每批独立 commit + 全门禁 + CSS 硬闸 + tokens 机检 + 探针 + reviewer + §6.14 记档 + push。
- **批 8 拍板**：超限自动落 uploads 替代 spec「引导上传」= 用户拍板修订（diverge 记档）；内联 fence 冲突未处理（内容含 ``` 时 UI 渲染乱但 agent 收到完整纯文本——diverge 记档留真机反馈）；wheel 只接管「纵向滚轮+可横滚+未到端」，触控板双指/Shift/捏合恒原生；`data-composer-file-input` 是探针定位契约。
- **reviewer 双实抓证明审查价值**：P0 死循环「探针测不出、单测测不出、只有渲染深度测试能抓」——runaway renders 模式值得沉淀（frontend-notes 候选）。
- **历史拍板继续有效**：密码自读不进上下文；禁截图/vision（DOM 几何硬数据）；探针只删自建数据、用 bun 跑；改 web 文件后必跑 ar-verify-css；format 只用 `bun run format`；React 前加载 vercel-react-best-practices；多端同构；tokens.json 唯一权威；max-sm 是本仓移动断点（sm=1024 覆写）禁 max-md。

## 进度（已完成 / 待办）

- ✅ 批 0–8 全部完成（hash 见 git log；批 8 随本次 commit）。
- ⬜ **统一真机复验清单交用户**（下面第五节）。
- ⬜ reviewer P2×6（redesign-v2.md §6.14 批 8 段有完整清单）随下批/维护批消化。
- ⬜ 批 2/3/7 的「design-reviewer 代行审查补复审」——批 8 已恢复产报，环境 OK，可安排补审。

## 阻塞 / 隐患

- 无阻塞。dev 存活 43011/43012（web build 含批 8；CSS 195882 字节）。
- router22 残留进程仍待用户处理（PID 1989432/1989916）。
- 存量欠账（不动）：probe-desktop-instance-info、probe-v2-m8-gaps Part 2-7、桌面「点第二个实例丢 leaf」、DialogTitle a11y、rootBrowse 下沉、i18n key 收敛、probe-chat-e2e 2 存量 FAIL、probe-m10 H 段 3 处、probe-files-tree-bugs「05e 五项序」、`.tree`/`.growrow` 死代码、diff L3、jotai atomFamily deprecation（需 /check-deps 换 jotai-family）。
- omp-realchain 真实链路探针留真机复验。

## 易丢的关键上下文

- **探针材质断言归一化**：token 原文（`#fff`）vs computed（`rgb(255,255,255)`）格式差会假 fail——用探针元素 `style.color = "var(--x)"` 走浏览器序列化归一（batch8 探针 P-D1d/e）。
- **session_init 必须手动 seed**：mock claude-stream 后页面等 `session_init` 才出 composer——routeWebSocket 收集 sockets + 手动 `socket.send(session_init + 欢迎行)`（probe-composer-attach 先例）。
- **hook 返回对象别进 effect deps**：每渲染新字面量 → effect 每渲染跑；配合 setState 新对象即死循环。稳定引用（useCallback）或值等 bailout 必居其一。
- **探针 fades 时序**：渐隐方向属性在 wheel 前读（wheel 后 scrollLeft>1 即翻转）。
- mock id 前缀契约 `agent_`/`terminal_`；run-e2e.ts 只吃单 spec；诊断脚本放项目 scripts/ 内跑。
- Edit 纪律：old_string 从最新 Read 复制；new_string 写完自查再发（本批又渗入一次 PLACEHOLDER 占位符，立即发现修复）。

## 统一真机复验清单（v1.5 全 9 批，交用户）

**批 8（本批）**：
1. ptabs/tabstrip/chips/qkeys 滚轮横滚手感（纵向滚轮在溢出条上应横滚、到端放行页面滚、触控板双指/Shift 原生）
2. 溢出边缘 12px 渐隐观感（可滚侧出现、滚到头消失、不占布局宽）
3. 附件：txt/md/csv/json/log ≤1MB 选文件 → 不上传直接内联（发送后 agent 能读到内容）；>1MB → uploads 提及行；聚焦 chip ⌫ 删除
4. 菜单新观感：桌面/移动菜单行 45px、图标 17、圆角 14、1px 分隔线（附件菜单/设置选择器/行菜单全族）
5. OptionMenu 设置选择器（模型/权限模式 sheet）行高变化观感

**批 7**：iPad 状态栏审批段 / 终端收起手感（Expand input/收回/reload 保持）/ 子 agent 概览条（计数条展开/行点按跳转/回合边界清空）/ 会话图标 / 插件 puzzlepiece 图标。
**批 6**：项目行菜单（长按/右键）/ 重命名影响提醒 / 删除 sheet（☐ 磁盘文件 + 按钮文案升级）。
**批 5**：历史三段计数筛选 / 搜索 / 五档分组 / 游标分页三态 / 移动左滑删除 / iPad 历史侧栏作用域切换 / 桌面右键行菜单。
**批 4**：桌面中栏 file/wiki 标签 / tabstrip [＋][分屏][最大化][pencil][⋯] / 全局文件推入态 +「在工作台打开」/ 桌面「让 Agent 读这篇」。
**批 3**：移动 .fmeta / pencil 编辑钮 / ⋯ 菜单 / 未知二进制空态 / wiki 面板阅读 / FAB 实心主色。
**批 2**：三 Tab / 登录直达上次会话 / 会话页无 tab bar。
**批 1**：行1 导航（‹项目｜实例名▾●n｜[面板][⋯]）/ ▾ 切换实例 / ⋯ 历史+实例信息 / 迷你条退役回底浮球。
**前序遗留**：发图批 6 项 + 技能列表批/浮层聚焦批 9 项 + 第五批 reviewer 修复批。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-06 19:50；触发原因：批 8 微交互收尾收口（实现 + 全验证链 + reviewer PASS-with-notes 消化 + §6.14 记档，随本批 commit）——v1.5 九批全部完成，下一门 = 统一真机复验
