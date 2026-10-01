# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-01（**第十二批收口，最新 `386533a`**。用户两项拍板落地：①global 右栏 = 当前项目内容（lastProject 记忆优先/列表首个回退，真无项目才空态）；②右栏宽度拖拽修复（ColumnResizeGutter 死代码——恒 null 从未生效）。探针 27 pass + m9-d 64 pass。第八~十二批均待真机复验。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第十二批「global 右栏内容 + 右栏拖拽」收口（`386533a`）：①`rightPanelProjectKey = project ? scope.key : (lastProject || projectNames[0] || null)` + 独立 rightCtx（useCreateSession 语义不变）——global 右栏显示当前项目 files 标签，projectKey=null 才落「暂无内容」空态；②ColumnResizeGutter 原 `{rightOpen ? null : …}` 位于仅 rightPanel 非空才渲染的 aside 内恒 null（拖拽从未生效的死代码）→ aside 在即渲染。probe-v2-m9-multi-device 27 pass（Part 5 新增：真空态 + gutter 拖 60px 352→412）+ m9-d 64 pass + 全门禁绿。

## 本 session 焦点（第八~十二批真机反馈修复循环）

1. 第八批：嵌套原型页图标看不到 → 静态水合（`3665264`）。
2. 第九批：全局文件预览返回不是全局文件 → MobileFileFocus back pop 优先（`9bbf351`）。
3. 第十批：桌面右栏折叠后展开按钮不见了 → RailButton 视觉可发现性（`5e06b5d`）。
4. 第十一批：左栏切「全部」右栏直接消失 → global 会话页 scope gate 蒸发（`e9e9c87`）。
5. 第十二批：global 右栏 = 当前项目内容 + 右栏拖拽修复（`386533a`）。

## 关键决策（本阶段不可丢）

- **global 右栏语义（第十二批拍板，覆盖第十一批「空态占位」表述）**：global 右栏 = 当前项目内容（lastProject 记忆优先，无记忆回退 projectNames[0]），**一个项目都没有才完全空态**。rootBrowse 下沉仍是后续增强（多项目浏览）但不再阻塞 global 右栏有内容。
- **右栏开合机制不变**：可见性真相 = panelOpen（批3 融合），rightCollapsed 仅为 mount 恢复用记忆；mainPage 整页态（footnav 文件/插件/设置）右栏蒸发保留。
- **定位教训（连续两批）**：①headless `visible=true` 只证 DOM 非隐藏不证人眼可辨（第十批）；②用户复现路径第一手三事实（消失对象/恢复动作/URL 变化）比代码穷举更快收敛（第十一批）。
- **返回类导航统一 pop 优先**（useWorkbenchBack）；静态等效水合（第八批）；iframe 内联 srcdoc（第七批）。
- **file tab 状态（用户拍板）**：桌面中栏 file tab 后续规划要恢复发挥作用，当前暂时保持——暂缓非弃案。
- 历史拍板继续有效：三栏第一行同一水平线；跨页一致优先；多端同构；「侧边栏」= 检视面板。

## 进度（已完成 / 进行中 / 待办）

- ✅ 第八批 `3665264` + 第九批 `9bbf351` + 第十批 `5e06b5d` + 第十一批 `e9e9c87` + 第十二批 `386533a`
- ✅ 记档 §6.13 第八~十二批段齐 + handoff 滚动
- ⬜ **交用户真机复验**（第八~十二批清单见下）
- ⬜ reviewer 补审：API 恢复后补审 `60dc9e3`~`386533a`（第六~十二批）
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉（global 右栏多项目浏览增强）；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（第八批~第十二批）

**第八批**（agents-remote 项目 `docs/design/index.html` 渲染态）：
1. 嵌套原型页图标恢复（搜索放大镜、行内功能图标）；`svg[data-symbol]` 手绘兜底不变

**第九批**（移动端）：
2. 底 nav「文件」→ 进项目 → 点文件预览 → 返回 → 应回**全局文件页**且 cwd 记忆保持

**第十批**（Mac 桌面）：
3. 折叠右栏后中栏右缘实底竖条唤出钮可见（已确认）+ 唤出/折叠循环正常

**第十一批**（Mac 桌面）：
4. 项目页右栏展开态 → 直达 `/projects` → 右栏保持展开不蒸发；折叠态到达则唤出钮在场

**第十二批**（Mac 桌面）：
5. **global 右栏 = 当前项目内容**：`/projects` 唤出右栏 → 显示 lastProject（或列表首个项目）的 files 标签（非空态）
6. **真无项目才空态**：把项目全删（或无项目环境）→ global 唤出右栏 → 「暂无内容」
7. **右栏拖拽**：右栏展开态，左缘（与中栏交界）出现 col-resize 光标，向左拖 → 右栏变宽（clamp 256–640px），刷新后宽度记忆保持

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过（183426 字节，content-type text/css）。
- **router22 残留进程待用户处理**：21 天前的 chromium 两棵进程树（PID 1989432/1989916，user-data-dir=/tmp/router22-fb31-diag3，remote-debugging-port=9781）——kill 被权限分类器拦截（跨项目资源），需用户自己清或授权；本项目探针无残留。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **pre-commit 快速通道**：staged 全为纯文档面 → 只跑 format:check+lint；任一命中代码面 → 全门禁。
- **右栏装配链（第十二批后终态）**：WorkbenchRoute rightPanelProjectKey/rightCtx → RightPanelTabs；workbench-shell gutter 无条件渲染（aside 内）； RailButton 收起态唤出。探针覆盖：probe-v2-m9-multi-device Part 4（global 连续性六断言）+ Part 5（真空态 + 拖拽七断言）。
- **MobileFileFocus back 契约**（第九批）：pop 优先回来源 + 深链兜底 /files。
- **inlineLocalHtmlAssets 契约**（第七/八批）：四类 job 并行；水合导出件均可测。
- 记档位置：§6.13「真机反馈修复」第八~十二批段齐（第十/十一/十二批为完整根因记录）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-01；触发原因：第十二批「global 右栏跟随当前项目 + 右栏拖拽修复」收口（`386533a`）+ /handoff save
