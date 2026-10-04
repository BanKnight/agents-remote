# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-04（**插件技能列表对齐原型批收口（`4eef9d3` + `5fcfd58`，已 push）**：列表副行 d2 从安装路径换「描述 · 来源: {锁slug}」（手写 =「来源:本地」）；详情页 dmeta 从 preview realpath 换与列表同源的 installed.source；zh 冒号形态半角无空格逐字符对齐原型。双 reviewer 12 条发现全部消化（2 修 1 采纳注释+抽取，1 不采纳记档）。skill 单测 67 + web 714 pass；probe-v2-m6-plugins **90** + probe-project-plugins **17** 全绿；全门禁绿。**待真机复验**。）

## 一句话状态

**技能列表内容对齐原型落地**：09 列表 d2「描述 · 来源: {锁 slug}」+ 12 详情 dmeta 同源对齐（来源口径用户拍板 = 锁 slug / 手写 = 本地；官方社区分类映射否决）。样式零改动——CSS 类与原型逐条一致，「样式区别」的真实来源 = d2 路径长串内容。决策详见 redesign-v2.md「技能列表对齐原型」小节。

## 本 session 焦点（插件技能列表对齐原型）

1. 用户指令：「优化下插件中的技能列表，样式上和内容上都和原型设计有区别」→ 逐条对比结论 = **样式类（.pcard/.r1/.upd/.d2/.psect）与原型 09 逐条一致**，差异全在内容：①d2 显示安装路径长串（原型 = 描述 · 来源:官方）；②详情 dmeta 显示 preview.realpath（原型 = 来源:官方 · 全局作用域）。
2. 用户拍板（AskUserQuestion）：来源口径 = `来源: {slug}`（锁文件 source；真实数据无官方/社区分类，分类映射否决——白名单脆弱 + 分类不准=伪造语义）；手写（无锁记录）=「来源:本地」；范围 = 列表 + 详情页一并对齐。
3. 数据管道：`InstalledSkill` 加 `description`/`source`；`readSkillLock`/`SkillLockEntry`/`LOCK_FILE_RELATIVE` 下沉 skill-market.ts（skill-update → skill-market 既有方向，反向成环）；scan 循环外读锁一次；全局锁损坏 list 容错降级（来源退化「本地」不让列表失败）；项目锁 name 集合 → 完整 map（manageable 判定语义不变）。
4. 桌面端消费同一 MobilePluginsOverview（hideTitle 复用），一次改动两端生效。
5. 双 reviewer 消化：dmeta 加载窗闪变（未检出 ≠ 本地，不渲染）、zh 冒号形态拍板（半角无空格对齐原型，探针锚前缀）、两探针补 d2 断言 5 条（主交付面此前零断言）、`Object.hasOwn` 防原型链、normalizeLockSkills 抽取、preview mock 拟真 realpath、过时注释修正。**不采纳**：d2 line-clamp（原型无示意 + description 惯例一句话 + MCP 卡共用 .d2 会误伤；真机观感反馈再定）。

## 关键决策（本阶段不可丢）

- **来源口径（2026-10-04 用户拍板）**：`来源: {锁 slug}` / 手写 = `来源:本地`；zh 冒号 = 半角无空格（原型「来源:官方」逐字符标尺，仓内全角惯例让位）；官方/社区分类映射**否决勿再提**（白名单脆弱、分类不准 = 伪造来源语义）。
- **preview.source（realpath）语义保留**：仅详情页改消费口（installed.source）；preview 接口本身不动。探针 mock 已拟真 realpath——**将来谁再消费 preview.source，探针不会再放过**。
- **锁读取单源 skill-market.ts**：readSkillLock（全局，损坏抛）+ readProjectSkillLock（项目，容错）+ normalizeLockSkills 共用归一化；scan 循环外读一次；`manageable: Object.hasOwn(lock, name)`。
- 历史拍板继续有效：motion 仅命令式 animate 消费；「用户的测试操作不是变量」；多端同构（列表改一处两端生效）。

## 进度（已完成 / 进行中 / 待办）

- ✅ 弹层 enter 近瞬时档 + sheet enter motion 化收口（`f5e1436`，真机复验已过 2026-10-04）
- ✅ **插件技能列表对齐原型批（`4eef9d3` + `5fcfd58`，已 push，待真机复验）**：d2「描述 · 来源」+ dmeta 同源 + reviewer 双审消化；probe 90+17 全绿；记档 redesign-v2.md
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（本批，iPhone 优先）

**技能列表副行（核心项，2026-10-04 拍板验收）**：
1. **已安装技能卡**：副行显示「描述 · 来源: <仓库名>」（如「提交前自动审查代码变更 · 来源:anthropics/skills」），不再是安装路径长串；无描述的技能只显示来源段
2. **手写技能**：自建/手动放置的技能（无锁记录）副行 =「来源:本地」
3. **项目作用域段**：切「本项目」后技能卡同款格式（项目锁有记录 = slug；手写 = 本地）
4. **技能详情页**：来源行 =「来源:<仓库名> · 全局作用域」，不再是文件路径；手写技能 =「来源:本地 · 全局作用域」
5. **深链/刷新直达详情页**：加载瞬间不闪「来源:本地」（加载窗只显示「全局作用域」，读到后补来源段）
6. **桌面端**：插件页（hideTitle 复用同一组件）副行同款
7. **搜索融合**：搜技能名 → 已装卡同款副行 + 市场命中行不受影响

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过（188771 字节，content-type text/css）；`4eef9d3` + `5fcfd58` 已 push。
- router22 残留进程仍待用户处理（PID 1989432/1989916，跨项目资源 kill 被拦截）。
- 存量时序 flake（与本批无关）：`probe-claude-reconnect-delta` ③c 偶发，复跑即绿。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **来源数据链**：锁文件（全局 `~/.agents/.skill-lock.json` / 项目 `<project>/skills-lock.json`）`skills[name].source`；无记录 = 手写；description = SKILL.md frontmatter（scan 本就解析）。改锁逻辑时 `Object.hasOwn` 别退回 `in`。
- **zh 冒号形态**：plugins 段新增文案冒号用半角无空格对齐原型；探针 d2/dmeta 断言已锚「来源:」前缀——改文案形态探针会抓。
- **记档位置**：redesign-v2.md「技能列表对齐原型：副行「描述 · 来源」+ 详情 dmeta 对齐（2026-10-04）」小节（含 reviewer 消化全记录）。
- **临时脚本输出退化坑复发**：本 session Write 工具三次内容退化（一次整段残缺、一次 URL 错字、一次单字退化「卿起/堵行」）——Read 回读 + 修正流程有效；连续两次失败即停换路（纪律）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-04；触发原因：技能列表对齐原型批收口（`4eef9d3`+`5fcfd58` 已 push），交真机复验
