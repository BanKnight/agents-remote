# 会话注意力生命周期（settle）交互设计稿

> 状态：**v1.0 已拍板并已实现验证（2026-11-13）**。三个开放问题均按推荐定案（见 §7）；
> 本稿为 settle 交互契约单源（索引见 `docs/design/index.md`，`design_spec.md` 以本稿为引用源）。
> 来源：T3 Code 调研学习点 3（`docs/research/t3code.md` L129-132）+ 本仓会话列表现状取证。

## 1. 痛点（现状取证）

「agent 说完 ≠ 事办完」——但我们没有任何「这件事我确认办完了」的表达动作，导致：

- `/api/overview` 的 `listAllCandidates` **不按状态过滤**：runtime 存活或带原生 resume id 的会话
  **恒保留**在候选集（done/idle/error 与 working 同权同列）；
- 状态机 `done`/`error` 只是「最近一轮结果态」（下一轮 user_input 即翻回 working），是机器视角
  「这轮跑完了」，不是人的视角「这件事结束了」；
- 于是会话越用越多，「活跃的」被「已了结的」淹没——桌面侧栏、移动 ▾ 菜单（最近/项目/foreign
  三组）、移动项目首页、全局视图全线受影响。

## 2. 语义定义（与既有概念划界）

| 概念 | 视角 | 语义 | 现状 |
| --- | --- | --- | --- |
| **status = done/error** | 机器 | 本轮 turn 跑完了（自动翻转，不代表事办完） | 已有 |
| **close（关闭会话）** | 销毁 | 杀进程 + registry 移除，不可继续 | 已有 |
| **pin（置顶）** | 注意力前置 | 会话钉在列表顶部 | 已有（⋯ 菜单 ✓） |
| **settle（了结）** | 注意力后置 | 「这件事我确认办完了」——移出活跃注意力集，**不删除、可继续打开、可恢复关注** | 本稿 |
| snooze（暂离） | 时间后置 | 暂时移出 + 定时回来 | **本版不做**（见 §6） |

**settle 三条铁律**：
1. **正交于 status**：settle 不改变会话状态，settled 会话可继续发消息（发消息 = unsettled，见 §4.3）；
2. **可逆**：「恢复关注」一键回到活跃集，无损；
3. **移出注意力 ≠ 隐身**：搜索/历史/深链仍可达，只是从默认活跃队列出列。

**settle × pin 冲突裁决**：settle 时若已被 pin，**自动取消 pin**（既置顶又了结 = 语义矛盾）；
unsettle 不自动恢复 pin（用户重新决定）。

## 3. 交互设计（双端同构）

### 3.1 入口（⋯ 菜单动作区，双端同构）

- 未 settle：「**标记已了结**」（settle 动作，中性）
- 已 settle：「**恢复关注**」（unsettle 动作，primary）
- 位置：⋯ 菜单动作区「置顶」相邻（桌面与移动同一份菜单装配，多端同构原则）。
- 不做整行滑动/长按第二手势（发现性差、易误触；与现有 ⋯ 菜单统一入口）。

### 3.2 列表呈现（默认活跃集不变，settled 出列）

三处消费面统一语义（同一份 candidates 数据管道，容器各自渲染）：

| 面 | 默认（活跃） | settled 会话 |
| --- | --- | --- |
| 桌面侧栏 | 现状不变 | 移出分段列表 → 底部「已了结」组 |
| 移动 ▾ 菜单 | 最近/当前项目/foreign 三组不变 | 移出三组 → 钉底动作行上方「已了结」折叠组 |
| 移动项目首页 / 全局视图 | 现状不变 | 卡统计不含 settled 的 running（本来就不含）；instances 计数仍含（存在性不撒谎） |

- **「已了结」折叠组**：组头 = 「已了结 · N」（N = settled 数），默认收起；展开后行形态
  与普通行同构，视觉降饱和（`text-ink-3` + 无状态点动画），行尾相对时间（「N 天前了结」）。
- 组位置：列表**最底部**（注意力排最后的自然顺序）；折叠状态不持久化（每次进页面默认收起，
  避免「藏起来的东西」造成困惑）。

### 3.3 搜索与深链

- 深链/历史恢复打开 settled 会话：正常打开（打开 ≠ unsettled——只是看一眼；发消息才 unsettle）。
- **v1 未实现（挂账）**：本地筛选（移动首页 / 项目切换 sheet）在查询前先过滤 settled，输入已了结
  会话的名字零命中，也没有「已了结」行内弱标。恢复入口 v1 统一在「已了结」折叠组与 ⋯ 菜单。
  后续做搜索可达时按「有 query 才纳入 settled + 弱标」形态补齐（不要改成全局包含，避免活跃
  搜索被已了结结果淹没）。

## 4. 数据与自动规则

### 4.1 数据落点（最小字段）

```ts
// SessionMetadata（api/src/session-registry.ts）
settledAt?: string; // ISO 时间；undefined = 未 settle。落盘走既有 patchMetadata 管道。
```

- `/api/overview` 候选投影 + `/api/sessions/stream` 壳帧（`SessionShell`）**同时带 settledAt**
  （单一数据管道，两端同源）；
- 新路由：`POST /api/projects/:key/agent-sessions/:id/settle`（body `{ settled: boolean }`），
  幂等；terminal 会话同款（终端的「事办完了」同样成立）。

### 4.2 自动 settle 规则（server 侧独立 sweeper）

- 规则：`status ∈ {done, error}` 且 `now − updatedAt > 7 天` → 自动 `settledAt = now`。
- 评估时机：**独立定时 sweeper**（`api/src/session-settle-sweeper.ts`，仿 `chat-idle-recycler`
  范式：每 60 分钟扫一次全部元数据，`settledAt` 已有值直接跳过，幂等）。不依赖客户端时钟
  （T3 同款原则）。**不选「读路径惰性」**：会让 `listAllCandidates` / `listAllShells` 从纯读变
  写路径（GET 触发落盘 + 广播），读写职责混淆。
- **只碰 done/error**：idle（新开未用）/ working / blocked 一律不自动 settle。
- 阈值 7 天为固定常量（命名常量，不做配置项——克制新增）。

### 4.3 与 turn 状态机的唯一联动

- **settled 会话有任何活动（用户发消息 / turn 活动 / 审批）→ 自动 unsettle**（用户重新投入 =
  重新进入注意力集）。落点：`SessionRegistry.recordActivity`（claude / codex / acp / terminal /
  approval 的全部活动路径都收敛到这里）——单一清除点，`settledAt` 不存在时零成本短路；不新开
  联动分支，也不依赖 status 迁移表（翻 working 只是活动的一种）。
- done/error 翻回 working 的既有迁移表不动。

## 5. 行为变更（需知晓）

1. **7 天前的 done/error 会话**首次读取时自动进「已了结」组（从活跃列表消失）——有真实数据的
   存量用户可见的最大变化；
2. `/api/overview` 候选与 shells 帧新增 `settledAt` 字段（纯增量，旧客户端忽略无害）；
3. 移动 ▾ 菜单在「有 settled 会话」时多一个折叠组（钉底动作行上方位）。

## 6. 不做（本版明确排除）

- **snooze（暂离 + 定时回来）**：无明确消费场景（T3 有，但其场景是任务队列节奏；我们手动 settle
  已覆盖「移出注意力」，定时回来反而制造惊喜式打扰）；
- **PR merge 自动 settle**：我们无 PR 链接模型（T3 的规则核心依赖 thread↔PR 绑定）；
- settle 理由/备注、settle 后自动 close、统计面板、批量 settle；
- 客户端时钟驱动的任何自动规则。

## 7. 拍板结论（2026-11-13）

| 开放问题 | 定案 |
| --- | --- |
| 自动 settle 规则 | **要**：`status ∈ {done, error}` 且 7 天不活跃 → server 独立 sweeper（每 60 分钟一扫，见 §4.2；不选读路径惰性） |
| settled 会话列表归属 | **底部「已了结 · N」折叠组**（默认收起，展开行形态同构、降饱和） |
| settle 入口位置 | **⋯ 菜单动作区**（与置顶相邻，双端同一份菜单装配） |
