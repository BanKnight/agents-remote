# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-04（**技能列表三连批 + 浮层聚焦策略批全部收口已 push**：`4eef9d3` 描述·来源数据链 → `5fcfd58` reviewer 消化 → `181daaf` line-clamp → `07b3ae5` 来源挪右上角 chip → `8a474be` 浮层打开不自动聚焦。全部门禁/探针绿，待真机复验。）

## 一句话状态

**技能卡来源标注终态 = 右上角中性灰 chip + 副行纯描述**（line-clamp 2）；**浮层打开不再自动聚焦输入框**（MobileSheet 基座统一拦 initial focus + 删 4 处显式 autoFocus，桌面居中 Dialog 保留惯例）。

## 本 session 焦点（插件技能列表批 + 浮层聚焦策略批）

1. 技能列表对齐原型全链：d2「描述 · 来源: {锁 slug}」→ 真实数据否证「description 惯例一句话」补 line-clamp 2 → **用户拍板来源挪右上角 chip，d2 回归纯描述**（终态）。
2. **浮层聚焦策略（用户新拍板）**：「输入是低频且理应是用户的行为」——sheet 升起动画与软键盘同时唤起打架。MobileSheet 基座 `onOpenAutoFocus` preventDefault（覆盖 Radix 默认聚焦面：切换 sheet 搜索框、MCP 添加名称框）+ 删显式 autoFocus 4 处（prompt 移动面/new-item-sheet/pages formBody/rename-dialog isMobile 条件拦）。**桌面居中 Dialog 零改动**（Radix 默认聚焦保留，表单惯例 + 键盘 a11y）。**行内渐进披露保留 autoFocus**（搜索钮/重命名行/新建文件夹行 = 用户点击的直接反馈，不在浮层语义内）。
3. dev api 旧代码事件：etime 1d17h > mtime（bun --watch 偶发不重启复发），respawn-pane 重启后真实数据生效。

## 关键决策（本阶段不可丢）

- **来源口径（2026-10-04 用户拍板）**：右上角 chip = `来源: {锁 slug}` / 手写 = `来源:本地`；zh 冒号半角无空格；官方/社区分类映射**否决勿再提**；详情页 dmeta 维持「来源 · 全局作用域」不动。
- **浮层聚焦策略（2026-10-04 用户拍板）**：移动浮层打开不自动聚焦输入框；桌面居中 dialog 保留自动聚焦；行内渐进披露保留 autoFocus。判定标准 =「输入是否用户主动行为的直接反馈」。
- **锁读取单源 skill-market.ts**：readSkillLock + readProjectSkillLock + normalizeLockSkills；`Object.hasOwn` 防原型链键。
- 历史拍板继续有效：motion 仅命令式 animate 消费；「用户的测试操作不是变量」；多端同构。

## 进度（已完成 / 进行中 / 待办）

- ✅ 技能列表批全链（`4eef9d3` + `5fcfd58` + `181daaf` + `07b3ae5`，已 push）
- ✅ 浮层聚焦策略批（`8a474be`，已 push）：新探针 probe-sheet-focus-policy 4 断言
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（合并批，iPhone 优先）

**技能列表（核心项）**：
1. **技能卡右上角来源 chip**：「来源:<仓库名>」（灰底小 chip，超长 slug 省略号截断）；手写技能 =「来源:本地」
2. **副行 = 纯描述**：超长描述截两行不撑高卡片；无描述技能无副行（不渲染空行）
3. **项目作用域段**：切「本项目」后同款格式
4. **技能详情页**：来源行 =「来源:<仓库名> · 全局作用域」不变；深链/刷新直达不闪「来源:本地」
5. **桌面端**：插件页副行/chip 同款

**浮层聚焦（新批）**：
6. **切换 sheet**：打开后搜索框**不**自动聚焦、键盘不弹
7. **文件新建 / 重命名 / 改名 prompt / MCP 手动添加 / pages 表单**：sheet 打开键盘不弹，点输入框才聚焦
8. **桌面抽查**：桌面居中 dialog（重命名/确认输入）打开仍自动聚焦输入框（惯例保留面，防误伤）
9. **行内渐进披露**：文件/wiki 面板点搜索图标 → 输入框出现即聚焦（应保留，观感自然）

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012（api 已重启跑新代码）；CSS 硬闸 188928 字节；五个 commit 已 push。
- router22 残留进程仍待用户处理（PID 1989432/1989916，跨项目资源 kill 被拦截）。
- 存量时序 flake（与本批无关）：`probe-claude-reconnect-delta` ③c 偶发；**probe-mobile-motion 采样断言高负载下偶发 1 fail（连跑多探针时），复跑即绿**。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **聚焦策略面清单**：浮层打开不聚焦（MobileSheet 基座 + rename-dialog isMobile 拦）；桌面 dialog 聚焦保留；行内渐进披露聚焦保留。改 MobileSheet/radix focus 相关时先读 redesign-v2.md「浮层打开不自动聚焦输入框」小节。
- **来源数据链**：锁文件 `skills[name].source`（全局 `~/.agents/.skill-lock.json` / 项目 `<project>/skills-lock.json`）；无记录 = 手写；description = SKILL.md frontmatter。
- **zh 冒号形态**：plugins 段新增文案冒号半角无空格；探针已锚「来源:」前缀。
- **记档位置**：redesign-v2.md「技能列表对齐原型」小节（含来源挪 chip 二次演化）+「浮层打开不自动聚焦输入框」小节。
- **新 Chromium computed display 序列化**：legacy `-webkit-box` 序列化为 `flow-root`——断言 line-clamp 读 `-webkit-line-clamp`/几何高度，别断 display。
- **Write 内容退化坑**：本 session 多次复发——Read 回读修正；连续两次失败即停换路。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-04；触发原因：来源 chip 批（`07b3ae5`）+ 浮层聚焦策略批（`8a474be`）收口，合并真机复验清单交用户
