# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-22（**M10 用户反馈两轮全部修复**：第一轮 8 问题 `1dc5172` + 第二轮 6 项 `8cdc21b`，探针 37/37 + e2e 29/29 + 四门禁。触发：第二轮收口）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

用户真机反馈两轮全部修复并 commit：第一轮 8 问题（置顶排序/时间实时/详情页入口/info sheet/全局文件卡形态/插件溢出）`1dc5172`；第二轮 6 项（info sheet 动作色/工具态 chips 隐藏/取消工具回原 tab/文件 L3 完整父路径/浮层穿透/ticon 间距）`8cdc21b`。**下一步：交用户复验（真机项清单见下）。**

## 本 session 焦点

两轮真机反馈修复全程 + redesign-v2.md §6.12/§6.12b 补记。第二轮含一次 fork 全项目浮层排查（6 项中 4 项误报——报告必须现场核对后采纳，教训已记档 §6.12b）。

## 关键决策（本阶段不可丢）

- **10-tab 卡形态仅移动 + 仅根层**（globalCard 分支无行内 rename input，子目录层必须退 ListRow）；`rootLevel` 字段已删净。
- **状态行后缀语义分叉**：running = 「已 X」（time.ran*，createdAt 近似运行起点）；其余 = relativeTime「X 前」；time.age* key 已删。
- **rememberedMiddleTab 语义收敛**：= 用户最后一次主动选的**非工具** tab。移动工具 ticon 走 onToolTabChange（写 URL ?tab 不写 remembered）；退出 null = URL 去 tab 维度回退 remembered。桌面左栏 middle tab 仍走 onTabChange 写 remembered。
- **info sheet 动作**：text-error（--color-error=var(--c-danger)）；「加粗」= 原型 .acts span 600 本就如此。
- **ticon**：视觉盒 19×19 原型规格 + after 伪元素 -inset-2 扩热区（35×35 不占布局）；chips 渲染 gate `!tool`。
- **vite 增量 build JS chunk 半新半旧**（§6.12 过程记录 3）：调用点 chunk 新 + i18n 词典 chunk 旧 → t() undefined.replace 崩；ar-verify-css 探不到 JS chunk 不一致——改 i18n 等跨 chunk 共享模块后必要时 dist 全量 rg 新旧 key，处置 = touch main.tsx 完整 rebuild。
- **浮层穿透排查结论**（§4）：真实缺口仅 MobileFilesTool 文件行（已修 contains）；其余全项目已有防护（ListRow primitive actions stopPropagation / 行卡片 contains / 桌面 popover outside 语义）；ClaudeSessionDetailRoute 手写 scrim 低项无实害记档。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0–M10 → 用户总验证 → 两轮反馈修复 `1dc5172` + `8cdc21b`（探针 37/37、e2e 29/29、四门禁 + CSS 硬闸 + token 机检零新增）
- ⬜ **交用户复验**，真机项清单：
  - ② 时间刷新节奏（30s ticker / 10s overview 轮询观感）
  - ⑥ 全局文件 gf 卡形态真机观感
  - ⑪ 文件路径显示（本轮修 backLabel 完整父目录，请复验是否还有别的路径显示问题）
  - ⑫ 浮层穿透（修了文件菜单一处，其余排查已防护——请再点几处浮层确认）
  - ⑬ ticon 间距（真机观感）
  - iPad 触屏 hover 正交（§7 自动化不可达）
  - W4 chip-Popover 形态是否补（M3 遗留）

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活，43011/43012 均 200，dist 已完整 rebuild。

## 易丢的关键上下文

- **探针 mock 铁律**：会话 id 带 `agent_`/`terminal_` 前缀；login 按钮 `/登录|Sign in/`；files 端点 mock 正则必须带 `(\?.*)?`（listProjectFiles 根层无 query）；探针默认浅色主题（danger 色断言双主题值 #ff453a/#ff3b30）。
- **e2e 纪律**：全套走 `systemd-run --scope --user -p MemoryMax=2G bun run scripts/run-e2e.ts`；单 spec 用 run-e2e.ts 透传。
- **CSS 落盘流程**：改 web 后 touch main.tsx → sleep 12+ → ar-verify-css；dist utility 转义形态 rg pattern 双反斜杠。
- **contains 防护 idiom**：`if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target as Node)) return;`（行 onClick 首行；portal scrim fiber 冒泡）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
