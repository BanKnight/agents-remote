# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-04（**技能列表批全部收口（`4eef9d3` + `5fcfd58` + `181daaf`，已 push）**：d2「描述 · 来源」+ dmeta 同源 + 双 reviewer 12 条消化 + line-clamp 2 收口。中间实锤 dev api 旧代码（etime 1 天 17 小时 > 源码 mtime，bun --watch 偶发不重启），respawn-pane 重启后真实数据全线生效——「除了来源还有描述」用户追问已解。真实环境几何验证：21 张 d2 高度 max=32px 恰 2 行，钳制生效。**待真机复验**。）

## 一句话状态

**技能列表内容对齐原型全部落地**：09 列表 d2「描述 · 来源: {锁 slug}」（手写 =「来源:本地」）+ 12 详情 dmeta 同源 + 超长描述 line-clamp 2（真实数据否证「description 惯例一句话」后采纳）。决策详见 redesign-v2.md「技能列表对齐原型」小节（含真实数据收口段）。

## 本 session 焦点（插件技能列表对齐原型）

1. 用户指令：「优化下插件中的技能列表，样式上和内容上都和原型设计有区别」→ 逐条对比结论 = **样式类（.pcard/.r1/.upd/.d2/.psect）与原型 09 逐条一致**，差异全在内容：①d2 显示安装路径长串；②详情 dmeta 显示 preview.realpath。
2. 用户拍板（AskUserQuestion）：来源口径 = `来源: {slug}`（锁文件 source；官方/社区分类映射否决）；手写 =「来源:本地」；范围 = 列表 + 详情页一并对齐。
3. 数据管道：`InstalledSkill` 加 `description`/`source`；锁读取下沉 skill-market.ts（skill-update → skill-market 既有方向）；scan 循环外读锁一次；全局锁损坏容错降级；`manageable: Object.hasOwn(lock, name)`。
4. **用户追问「除了来源，不是应该还有其他东西吗」→ 实锤 dev api 跑旧代码**（etime 1d17h > mtime，bun --watch 偶发不重启复发）→ `tmux respawn-pane -k -t ar-dev:api` 重启 → 真实数据全线生效（「描述 · 来源:cloudflare/skills」等实抓确认）。
5. **line-clamp 2 收口（`181daaf`）**：真实数据显示市场技能 description 是 200+ 字符多句长文，无钳制卡片撑到 8+ 行——reviewer P3「不采纳」的前提被否证，采纳 `.pcard .d2` 两行钳制。真实环境几何验证：21 张 d2 max=32px 恰 2 行、computed `-webkit-line-clamp=2`、产物 CSS 四条声明完整。（注：新 Chromium computed `display` 序列化 legacy `-webkit-box` 为 `flow-root`，断言钳制读 `-webkit-line-clamp`/高度，别断 display。）

## 关键决策（本阶段不可丢）

- **来源口径（2026-10-04 用户拍板）**：`来源: {锁 slug}` / 手写 = `来源:本地`；zh 冒号 = 半角无空格（原型逐字符标尺）；官方/社区分类映射**否决勿再提**。
- **preview.source（realpath）语义保留**：仅详情页改消费口（installed.source）；preview 接口不动；探针 mock 已拟真。
- **锁读取单源 skill-market.ts**：readSkillLock + readProjectSkillLock + normalizeLockSkills 共用归一化；`Object.hasOwn` 防原型链键。
- 历史拍板继续有效：motion 仅命令式 animate 消费；「用户的测试操作不是变量」；多端同构（桌面端 hideTitle 复用同一组件，一次改动两端生效）。

## 进度（已完成 / 进行中 / 待办）

- ✅ 弹层 enter 近瞬时档 + sheet enter motion 化收口（`f5e1436`，真机复验已过 2026-10-04）
- ✅ **插件技能列表对齐原型批全部收口（`4eef9d3` + `5fcfd58` + `181daaf`，已 push，待真机复验）**：d2「描述 · 来源」+ dmeta 同源 + line-clamp 2；skill 单测 67 + web 714 pass；probe 90+17 全绿；CSS 硬闸 188856 字节
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（本批，iPhone 优先）

**技能列表副行（核心项，2026-10-04 拍板验收）**：
1. **已安装技能卡**：副行显示「描述 · 来源: <仓库名>」且**超长描述截两行**（line-clamp 2，不撑高卡片）；不再是安装路径长串
2. **手写技能**：无锁记录技能副行 =「来源:本地」
3. **项目作用域段**：切「本项目」后技能卡同款格式（项目锁有记录 = slug；手写 = 本地）
4. **技能详情页**：来源行 =「来源:<仓库名> · 全局作用域」，不再是文件路径；手写技能 =「来源:本地 · 全局作用域」
5. **深链/刷新直达详情页**：加载瞬间不闪「来源:本地」（加载窗只显示「全局作用域」）
6. **桌面端**：插件页（hideTitle 复用同一组件）副行同款
7. **搜索融合**：搜技能名 → 已装卡同款副行 + 市场命中行不受影响
8. **MCP 卡**：d2（url/命令短句）不受钳制影响（一行内无感，顺带看一眼）

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012（**api 已重启跑新代码**，/api/health ok）；CSS 硬闸已过（188856 字节，content-type text/css）；三个 commit 已 push。
- router22 残留进程仍待用户处理（PID 1989432/1989916，跨项目资源 kill 被拦截）。
- 存量时序 flake（与本批无关）：`probe-claude-reconnect-delta` ③c 偶发，复跑即绿。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **dev api 旧代码排查法**：改 api 源码后行为像没改时，先 `ps -eo pid,etime,args | grep` 查 etime vs 源码 mtime；标准重启 = `tmux respawn-pane -k -t ar-dev:api 'bun run --filter @agents-remote/api dev'`（先 list-windows 确认，不 kill tmux server）。
- **来源数据链**：锁文件（全局 `~/.agents/.skill-lock.json` / 项目 `<project>/skills-lock.json`）`skills[name].source`；无记录 = 手写；description = SKILL.md frontmatter。
- **zh 冒号形态**：plugins 段新增文案冒号用半角无空格对齐原型；探针 d2/dmeta 断言已锚「来源:」前缀。
- **记档位置**：redesign-v2.md「技能列表对齐原型」小节 +「真实数据收口（api 重启 + line-clamp 采纳）」段（含 reviewer 消化全记录与否证修正）。
- **Write 内容退化坑**：本 session 多次复发（整段残缺/URL 错字/单字退化）——Read 回读修正；连续两次失败即停换路。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-04；触发原因：line-clamp 收口批（`181daaf` 已 push），技能列表批全链完成交真机复验
