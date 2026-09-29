# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-29（**第五批真机反馈①修复 commit `73fd9fa`**：桌面三栏第一行与中栏 tabstrip 同一水平线。左栏「项目」首行中心 30 → 16。探针 6/6 + 五个桌面探针回归全绿 + 四门禁。**等用户后续反馈**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第五批反馈①（桌面三栏第一行同高）已 commit（`73fd9fa`）：右栏实测本已齐（glabel2 中心 15.8 vs tab 16，无需改），左栏低 14px = `.side` pt 8 + 首行 ghead mt 8 + 28px 热区行高叠加 → `.side` padding-top 2px + 首行 ghead mt-0。新入库探针 probe-desktop-tri-column-firstline.mjs（6 断言）。

## 本 session 焦点（第五批真机反馈收口）

1. **反馈①「左栏项目标题、右栏检视行应与中栏 tab 同高」**：实测右栏已齐（15.8），左栏 30 偏低 14px。修 = `.side` padding `8px 10px` → `2px 10px 8px` + workbench-side 首行 ghead `mt-0`。原型三行本就不齐（25/16/18.5），用户拍板跨栏第一行对齐优先于原型值。
2. 第四批（`f93b2b6` + 记档 `55bc49d`）全部收口：三页搜索框对位、Lucide 全量换代、侧栏间距、窗格圆角退役、右栏「＋」补齐。

## 关键决策（本阶段不可丢）

- **三栏第一行同一水平线**（第五批拍板）：左 `.side` pt 2 + 首行 ghead mt 0 → 中心 16 = 中栏 tabstrip 中心 = 右栏 glabel2 中心。原型自身三行不齐是原型粗糙处，用户对齐要求优先——与「跨页一致优先」同族范式。
- **v2-primitives 是 @layer components**（utilities > components）——Tailwind utility 可覆写单源类值；但值变更优先改单源 + 注释出处（防止后人「修回原型值」）。
- **`.side` 唯一消费点 = 桌面侧栏**（workbench-side nav），padding 变更零外溢。
- 历史拍板继续有效：「侧边栏」在用户 iPhone 语境 = 检视面板；跨页一致优先；三基础常驻 invisible 保活 → `.frow` 断言限定 `[data-panel-tab-body="files"]`。
- **探针 mock 范式**：tabstrip 渲染需「mock session（m9-d 形状：id+type+provider+projectName+displayName+status+createdAt/updatedAt）+ 点实例行进 tab 视图（data-drop-group 出现）」，URL 正则用 `(?:\?.*)?$`。

## 进度（已完成 / 进行中 / 待办）

- ✅ v1.4 对标 9 批 + 真机反馈一至四批 + 第五批①全部 commit（最新 `73fd9fa`）
- ✅ 第五批①验证：tri-column-firstline 6/6、m9-b 19/0、m9-d 64/0、desktop-instance-info ALL PASS、inspector-row-menus ALL PASS、states 22/0、tokens strict、CSS 硬闸（182791 字节）
- ⬜ **交用户真机复验**（第五批①：桌面左栏「项目」/ 右栏「检视」与中栏 tab 同一水平线）
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败（manifest.short_name null，在案）；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线 + 「05e 五项序」排查；右栏栏宽 352 vs 320；diff L3 位置架构项

## 用户真机复验清单（第五批①，`73fd9fa`）

1. **桌面端**：左栏「项目」标题行、右栏「检视 · 只读」行与中栏 tab 文字处于同一水平线（修复前左栏明显偏低 14px；右栏本已齐）

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过。
- **本 session Edit/Write 损坏高发再现**：一次性诊断脚本两次 Write 混入垃圾字符（已删文件，正式探针用小段 Write 成功）。对策：小段写入、复杂内容分多次、失败即停不硬试第三次。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G。
- 桌面 tabstrip 渲染前提 = 点实例行进 tab 视图；mock 形状照 m9-d（缺 provider/projectName 等字段行不渲染）。
- 记档位置：§6.13「真机反馈修复·第五批」段。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-29；触发原因：第五批反馈①修复 commit `73fd9fa` + 记档 + /handoff save
