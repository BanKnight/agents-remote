# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-29（**第四批真机反馈四条修复 commit `f93b2b6` + 记档 `55bc49d`**：三页搜索框对位 + Lucide 图标全量换代 + 侧栏间距 + 窗格圆角退役 + 右栏「＋」缺口补齐。探针 23/23 + e2e 13 spec + 四门禁全过。**下一步：交用户真机复验（清单见下），随后存量欠账**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第四批真机反馈四条修复已 commit（`f93b2b6`，48 文件）+ 记档（`55bc49d`）：①三页 psearch 统一 mt-2.5（页私 8/12/10 各异是跳动根因）②Lucide 全量换代（37 手绘 SVG 删、TO_LUCIDE 35 映射 + 38 白名单生成物、品牌件 2 个保留）③workbench-side wrapper pt-2 删（26→18px = 原型值）④GroupShell 圆角白卡 p-1 退役（平面拼接 border-right）⑤右栏 toolChip 装配 AddMenu「＋」补桌面新建/上传入口。

## 本 session 焦点（第四批真机反馈收口）

1. **反馈①「是哪个没有遵守规范」**：没有谁违规——三页原型页私 margin 各异（8/12/10），实现忠实照抄页私值，页私值彼此不一致 → 跨页跳动。修 = 延续「跨页一致优先」拍板，三页统一 10px。
2. **反馈② Lucide 换代架构**：ShellIcon 保持 SF 名契约（调用点零改动），svgMap 换源 = `TO_LUCIDE`（SF 名→lucide 名 35 项）+ `LUCIDE_ICONS` 生成物（build-icons.mjs 白名单 38 名）。37 手绘 SVG 删除；anthropic/openai 品牌 fill 型保留（Lucide 无对应物）；menu/skills-nav 零消费删。frontend-notes §15 已收口单轨。
3. **反馈③**：dsep→seg4 26px vs 原型 18px = wrapper `pt-2` 实现自加多余一档（原型 = dsep mb 8 + .seg4 mt 10），删。
4. **反馈④**：GroupShell `rounded-lg` + workspace 白卡 + 根容器 `p-1` = VSCode 浮动卡片形制；原型 `.pane` = 平面拼接 border-right。修 = 去 p-1 + `border-r border-neutral-line`（radius 12→0 几何实锤）。
5. **⑤ 右栏「＋」缺口**（第二批回归发现）：`.links` 行 lg:hidden 后桌面新建/上传入口断 → right-panel-tabs toolChip 行尾装配 AddMenu 单源（05e:54 搜索行右端主色「＋」）。

## 关键决策（本阶段不可丢）

- **三基础常驻的选择器污染范式**：非激活标签 body = `invisible`（visibility 保活仍在 DOM）——`.frow` 全局选择器会捞到 Git 面板变更行 → e2e/探针断言必须限定 `[data-panel-tab-body="files"]`。
- **「是哪个没有遵守规范」类问题的答案模式**：实现忠实照抄了原型页私值，但原型页私值彼此不一致 → 用户已拍板跨页一致优先。
- 第二/三批关键决策继续有效：「侧边栏」在用户 iPhone 语境 = 检视面板；同构整改同一 DOM + 分档；「同语境跨页一致 + 同一 DOM 形态」优先于页私原型值。
- **探针基线适配纪律**：行为变化后探针断言随之适配（本次 inspector-row-menus S2/S5 三常驻 + G2 放弃更改 3 项 + G7「历史列表」文案）。

## 进度（已完成 / 进行中 / 待办）

- ✅ v1.4 对标 9 批（批1 `62cb980` … 批9 `98328ca`）+ 真机反馈一至四批（`aa95081`/`5c8f831`/`a4e9e69`/`f93b2b6`）+ 记档 `55bc49d` 全部 commit
- ✅ 第四批验证：inspector-row-menus 23/23、m4 65/0、m9-b 19/0、m9-d 64/0、states 22/0、mobile-project-header 25/0、projects-home 21/0、m6-plugins 87/0、desktop-instance-info ALL PASS；e2e 13 spec（file-browser 三处适配 + git-diff 两处适配）；四门禁 + CSS 硬闸 + tokens strict
- ⬜ **交用户真机复验**（清单见下）
- ⬜ 存量欠账（不动）：**e2e pwa-installable 存量失败（manifest.short_name null，stash 对照证实，新增在案）**；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线 + 「05e 五项序」排查；右栏栏宽 352 vs 320；diff L3 位置架构项

## 用户真机复验清单（第四批，`f93b2b6`）

1. **iPhone 底部导航三页**（项目/插件/全局文件）：来回切换时搜索框位置恒定不跳动（三页统一 top = 51.5px）
2. **图标形态**：全站图标为 Lucide 24 网格统一形态（stroke 2px 圆头），无 20 网格旧图标残留；Claude/Anthropic、OpenAI 品牌 logo 保持原样
3. **桌面左侧栏**：分割线到「会话」段（seg4 项目/全部分段）的间距收窄到原型 18px
4. **桌面中栏多 tab 会话**：窗格无圆角矩形、无浮动缝，窗格间为 1px 分隔线平面拼接
5. **桌面右栏 files 标签**：toolChip 搜索行右端有主色「＋」，点开可新建文件/文件夹、上传

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；`f93b2b6` 后 CSS 硬闸已过（182787 字节 text/css）。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- Lucide 换代后新增图标流程：`scripts/build-icons.mjs` ICONS 白名单加名 → `bun scripts/build-icons.mjs` 重新生成 `web/src/assets/icons.ts` → `TO_LUCIDE` 加映射（icons/index.tsx）。不新增 .svg。
- e2e `.frow` 断言一律限定 `[data-panel-tab-body="files"]`（三基础常驻 invisible 保活，全局选择器捞到 Git 变更行）。
- 记档位置：§6.13「真机反馈修复·第四批」段（第三批段之后）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-29；触发原因：第四批真机反馈四条修复 commit `f93b2b6` + 记档 `55bc49d` + /handoff save
