# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-10（**任务 C 全项目加载态审查——四批 + review 消化批全部提交，记档完成，待交真机清单**）

## 一句话状态

加载态审查（任务 C）**代码工作全部完成**：四批修复（批 1 骨架单源换代 `ca965a5` / 批 2 错误态收敛+伪值家族 `6224f99` / 批 3 会话现场 `6fd7a1c` / 批 4 路由级 `118c8c8`）+ review 消化批（design/code 双 reviewer P1×4/P2×5/P3×2 全修 `cd037aa`）+ redesign-v2.md §6.12o 记档。验证链全绿：typecheck / lint 0w / CSS 硬闸 / tokens 机检 / probe-loading-states 13/13 / 全套 e2e 27/27 / 单测 905+10+774。**下一步 = 真机清单统一交用户检查**。

## 本 session 焦点（任务 C 收尾）

### 关键决策（不可丢）

- **标尺**：§6.12o 加载态分层标准 + 记档新增的 2026-10-10 审查小节（redesign-v2.md §6.12o 段内「全站加载态审查」段）——四批 commit 链、review 修复、机制层教训全部记档。
- **机制层教训（记档已沉淀）**：①useMemo fingerprint 必须显式纳入 isError（dataUpdatedAt 失败路径恒 0，否则错误态分支不可达）；②isError → isLoadingError（refetch 失败不顶掉已渲染内容，v5 isLoadingError = isError 且 data===undefined）；③骨架容器壳逐行垫壳法（ListRowSkeleton 行 px-3 与卡壳叠加双重内缩；钮位错排 = 卡高差 28px）；④everConnected 门区分首连/断线；⑤scroller 内 flex-1 死属性（§8）。
- **记档豁免**：files 目录导航不加 keepPreviousData（新内容语境 + §13 cwd 回退依赖 error）；defaultPendingComponent 判定不设（移动端 tap 无 hover 预取论据）；lines=1 ±4px diverge；ListRowSkeleton action="button" 死档已删。

### 进度

- ✅ 任务 A/B 闭环（设置二级换代 602daef；全局文件 663ae59/d067ba8/9e073cb/9730ea4）。
- ✅ 任务 C：四区盘点 → 4 批修复（ca965a5/6224f99/6fd7a1c/118c8c8）→ 双 reviewer 审查 → review 消化批（cd037aa）→ redesign-v2.md 记档。
- ⬜ **真机清单统一交用户**（下一动作，锚点指令形态）。

## 真机清单（任务 C，交用户）

**工作台（重点）**：
1. 工作台左栏会话列表 / 文件树 / git 面板首载骨架：单行紧凑条（不再是 v1 双条形），加载完零跳变；
2. 中栏切会话：Agent/Terminal 面板 pending 显「加载会话…」ping 圆点（非空白）；终端首连显「连接中」（曾连上后断线才显「重连中」）；
3. Claude 会话空会话首连：显骨架不闪「离线中」；真断线（曾连上）才显离线反馈且垂直居中；
4. git 面板 diff/log 加载失败显红色错误卡（非「无变更」伪空态）；提交/放弃进行中按钮变「提交中…/放弃中…」；
5. chat 列表加载失败显错误卡（非「暂无会话」）。

**移动端**：
6. 项目总览（/projects）首载骨架卡形 + 失败红卡；插件市场技能/MCP tab 首载骨架三层卡形（名+章/描述/右下安装钮位）；
7. 插件市场搜索失败显轻量红字行；MCP 详情页加载显 ping 圆点、失败显红字行（深链直达验证）；
8. 设置弹窗 Claude/pi/ACP 段值行加载显 shimmer 小条（非空白/伪值）；
9. 移动 L3 提交详情 diff 打开中显「加载 diff…」（不再闪「无法打开此差异」）。

**路由级**：
10. 制造路由错误（如 dev 断 API 后刷新进懒路由页）：居中 token 错误卡 + 本地化文案 + 重试钮（移动端钮 ≥44px 触摸高）。

## 易丢的关键上下文

- **keyboard-debug.ts 仍在**（批 18 键盘取证 DEBUG_ENABLED=true，tokens 机检唯一豁免条目）——批 18 键盘取证完成后整文件连 main.tsx 挂载点一并删除。files-scroll-debug.ts 已随 9e073cb 摘除（handoff 旧条目作废）。
- tmp/ 未跟踪目录（session 内临时产物），不入库。
- 设置二级换代真机清单 5 条（任务 A 交付时已列）+ 批 18 键盘取证仍是背景存量。
- dev 服务 tmux `ar-*`；改 web 后 CSS 交付 checklist（curl content-type text/css）照旧。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-10 20:55；触发原因：任务 C 全部代码工作完成（5 个 commit）+ §6.12o 记档 + handoff save——待交真机清单
