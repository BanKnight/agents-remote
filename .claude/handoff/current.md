# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-01（**reviewer 补审修复批 M13a–d 四里程碑收口，最新 `b169aaa`**。补审第六~十二批 8 commit 产出 P1 五条 + P2 九条全修完毕；两条 reviewer premise 经核实推翻（shadow-sm 保留 / back 判定安全）。四批全门禁 + 探针回归绿。第八~十二批 + 第十三批均待真机复验。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

reviewer 补审修复批四里程碑收口：**M13a** 内联管道正确性（`069704c`：`$` 序列函数形式×4 / 剥 style-script 段再水合 / escapeSrcdoc 补 `<` / PreviewBody memo + fetchOnce 去重）；**M13b** RenderModeToggle 单源 + 03q3 `.mseg` 对齐（`07572a4`：bg-segmented-thumb 首次消费、非 md/html 脏 gate、deps `[path]`、touch 热区）；**M13c** shell 杂项（`5b3d527`：Chevron→Lucide 管线 40 图标、RailButton 热区 40px、gutter 键盘可达 role=separator + ←/→ ±1rem）；**M13d** useWorkbenchBack 判定核实**安全**（`b169aaa`：行为零改动，注释准确化）。

## 本 session 焦点（reviewer 补审修复循环）

1. API 恢复 → 双 reviewer 补审 `60dc9e3`~`386533a` → P1×5 + P2×9（P0 零）。
2. 用户拍板「可以全修，用多个里程碑来修复」→ M13a/b/c/d 四里程碑全收口。
3. premise 核实推翻两条：shadow-sm「全站唯一」不成立（4 处，且是第十批刻意加的——保留）；C-P2-4「HTML5 parse error」机制描述不准（`<` 在属性值内合法——补转义无损照做）。
4. M13d 推演实锤：`__TSR_index > 0` 判定安全（pop 优先设计意图），只修注释。

## 关键决策（本阶段不可丢）

- **global 右栏语义（第十二批拍板）**：global 右栏 = 当前项目内容（lastProject 记忆优先，无记忆回退 projectNames[0]），一个项目都没有才完全空态。
- **返回类导航统一 pop 优先**（useWorkbenchBack；M13d 核实其判定语义并注释准确化——back 落点=真实来源是设计意图，出站不可能）。
- **inlineLocalHtmlAssets 契约（M13a 后）**：四类 job 替换串必须函数形式（字符串形式 `$&` 会展开）；style/script 段先剥（PUA 占位非 NUL）后回填；escapeSrcdoc = `& → < → "` 三转义（`>` 不转）；PreviewBody promise 按 preview 引用缓存；fetchOnce per-call 不跨调用。
- **RenderModeToggle 单源**（03q3 .mseg）：渲染段在前、on 态 bg-segmented-thumb、位置由调用方 className 注入。
- **file tab 状态（用户拍板）**：桌面中栏 file tab 后续规划要恢复发挥作用，当前暂时保持——暂缓非弃案。
- 历史拍板继续有效：三栏第一行同一水平线；跨页一致优先；多端同构；「侧边栏」= 检视面板；mainPage 整页态右栏蒸发保留。

## 进度（已完成 / 进行中 / 待办）

- ✅ 第八~十二批 `3665264`/`9bbf351`/`5e06b5d`/`e9e9c87`/`386533a` + 记档齐
- ✅ reviewer 补审 + M13a `069704c` + M13b `07572a4` + M13c `5b3d527` + M13d `b169aaa` + §6.13 第十三批段
- ⬜ **交用户真机复验**（第八~十二批 + 第十三批清单见下）
- ⬜ 阶段一遗留：第五批 reviewer 修复批（`bd7aedc`）真机复验清单仍待用户执行
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉（global 右栏多项目浏览增强）；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线；diff L3 位置架构项；design P2 滚动 5 项

## 用户真机复验清单（第八批~第十三批）

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
7. **右栏拖拽**：右栏展开态，左缘出现 col-resize 光标，向左拖 → 右栏变宽（clamp 256–640px），刷新后宽度记忆保持

**第十三批**（M13a–d，Mac 桌面 + 移动端）：
8. **md/html toggle 形态**：任意 md/html 预览 → 「渲染/源码」分段钮 = 24px 高灰底轨、渲染段在前、on 态深底白字（03q3 原型）；渲染态 meta 行只留时间、源码态显示行数+时间；桌面右栏与移动 L3 两处形态一致
9. **html 内联渲染正确性**：agents-remote 项目 `docs/design/index.html` 渲染态 → 图标/样式/嵌套 iframe 正常（含路径含 `$` 字符的文件若可构造）；重复切「渲染↔源码」无明显卡顿（管道 memo）
10. **gutter 键盘**：右栏展开态 Tab 聚焦左缘分隔条（高亮）→ ← 变宽 / → 变窄，±1rem 步进，clamp 16–40rem
11. **非 md/html 编辑返回**：移动端打开 .ts 文件 → 编辑 → 返回 → 再进不残留「渲染态」（脏 renderMode gate）

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过（184198 字节，content-type text/css）。
- **router22 残留进程待用户处理**：21 天前的 chromium 两棵进程树（PID 1989432/1989916，user-data-dir=/tmp/router22-fb31-diag3，remote-debugging-port=9781）——kill 被权限分类器拦截（跨项目资源），需用户自己清或授权；本项目探针无残留。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- **pre-commit 快速通道**：staged 全为纯文档面 → 只跑 format:check+lint；任一命中代码面 → 全门禁。
- **右栏装配链（第十二批后终态）**：WorkbenchRoute rightPanelProjectKey/rightCtx → RightPanelTabs；workbench-shell gutter 无条件渲染（aside 内，现 role=separator 可聚焦）+ RailButton 收起态唤出。探针覆盖：probe-v2-m9-multi-device Part 4（global 连续性六断言）+ Part 5（真空态 + 拖拽七断言）。
- **MobileFileFocus back 契约**（第九批）：pop 优先回来源 + 深链兜底 /files。
- **本 session 输出管线坑（复发两次）**：生成「反斜杠-u-XXXX」转义文本会退化为真实字符（PUA/NUL）——内置 Edit 匹配不上、markdown 记档也中招；处理用 python/perl 字节级替换，记档表述用纯文字描述占位符。
- 记档位置：§6.13「真机反馈修复」第八~十二批 + reviewer 补审修复批（M13a–d）段齐。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-01；触发原因：reviewer 补审修复批 M13a–d 四里程碑收口（`b169aaa`）+ /handoff save
