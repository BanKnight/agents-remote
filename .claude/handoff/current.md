# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-30（**第五批反馈②③④⑤，最新 `dd49a01`：移动历史 sheet 查询窗口 week→all 对齐桌面**：左栏 dsep→内容间距两档收敛 + 历史态改版 05c（chips 全部/已结束 + 最近 5 展开 +5 + 尾注）。探针 14/14 + 五探针回归全绿 + 四门禁。**等用户真机复验**。）
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第五批反馈②③已 commit（`98183fe`）：反馈① = 组头热区 28→20px + microlabel AGENT mt 6/TERMINAL mt 8 + `.side` pt 2→6（首行中心仍 16）；反馈② = 历史态退役 HistoryRangeControl，改 05c（range 固定 all + chips 全部/已结束 + 最近 5 展开更早每次+5 + 尾注）。探针扩至 14 断言全绿。

## 本 session 焦点（第五批真机反馈收口）

1. **反馈①「第一个分割线距会话实质内容离谱大」**：实现链比原型多两档（组头热区 28px vs 原型 dicon 20px +8；microlabel mt-2.5 vs 原型页私 6/8px +4/+2）。探查曾误判「`.seg4.mini` 缺失」——实已存在（:753）且已消费，作废。
2. **反馈②「历史态沿用旧方案」**：HistoryRangeControl（周/半月/全部）退役 + 4 i18n key 删；HistoryList 改 05c：range 固定 "all"（hook 参数保留，mobile-sheets 03n 仍用 "week"）+ chips（复用 mobile-sheets 现成 key historyFilterAll/Closed）+ 客户端折叠（entries 服务端 lastActivityAt 倒序，slice 即「最近 N」；切过滤重置窗口）+ 尾注 shrink-0 常驻 HistoryList 之后（HistoryList 根 h-full→flex-1 允许兄弟尾注）。

## 关键决策（本阶段不可丢）

- **组头热区 20px = 原型 dicon 规格即行高**（桌面指针语境够用）；`.side` pt 6 + 20/2 = 16 保第一行同线（第五批①拍板链式生效）。
- **历史态已结束 = `!hasActiveSession`**（活跃中的历史 = 已 resume 为活跃实例，ActiveDot 同语义）。
- **chips/折叠 = 视图态不持久化**（§6.10 口径）；切过滤重置窗口防残留大窗口跨过滤。
- 历史拍板继续有效：三栏第一行同一水平线；跨页一致优先于页私原型值；多端同构同一 DOM 分档；「侧边栏」在用户 iPhone 语境 = 检视面板。
- **探针 locale 陷阱**：resolveLang 走 navigator.language，Playwright 默认 en → 中文断言全挂；newContext 须加 `locale: "zh-CN"`。

## 进度（已完成 / 进行中 / 待办）

- ✅ v1.4 对标 9 批 + 真机反馈一至四批 + 第五批①②③全部 commit（最新 `4c7ab9e`）
- ✅ 第五批②③验证：tri-column-firstline 14/14（F0-F5 + H1-H8）、m9-b 19/0、m9-d 64/0、desktop-instance-info ALL PASS、inspector-row-menus ALL PASS、states 13/0、四门禁、tokens strict、CSS 硬闸（182978 字节）
- ⬜ **交用户真机复验**（第五批②③，清单见下）
- ⬜ 存量欠账（不动）：e2e pwa-installable 存量失败（manifest.short_name null，在案）；桌面「点第二个实例丢 leaf」；DialogTitle a11y；rootBrowse 下沉；i18n key 收敛；probe-chat-e2e 2 存量 FAIL；sheet 拖拽真机复验；`.tree`/`.growrow` 死代码清扫；probe-m10-feedback-fixes H 段基线 + 「05e 五项序」排查；右栏栏宽 352 vs 320；diff L3 位置架构项

## 用户真机复验清单（第五批②③，`98183fe`）

1. **桌面左栏**：分割线（项目组下方）到 seg4/实例组/会话行的间距应明显收紧（组头行高 28→20 + microlabel 上距 10→6/8）
2. **桌面左栏历史态**（点实例组头时钟切入）：
   - 分段控件下新增过滤 chips「全部 / 已结束」
   - 列表默认只显最近 5 条，尾部「展开更早」按钮每点一次多显 5 条，全展开后按钮消失
   - 「已结束」chip 过滤掉活跃会话，空态显「无已结束会话」
   - 列表底部常驻尾注「再次点时钟返回活跃实例列表」；再点时钟返回实例列表
   - 周/半月/全部分段切换器已退役
4. **桌面左栏首行「项目」**：仍与中栏 tab 同一水平线（第五批①修复不回退）

## 阻塞 / 风险

- 无阻塞。dev 存活 43011/43012；CSS 硬闸已过。
- **本 session Edit 损坏高发持续**（中文长注释/模板串混入垃圾 token，本次又发生 4 次，均即时 Read 回修复）：对策持续有效——小段写入、锚定英文代码行、照抄 Read 原文不凭记忆、失败即停。

## 易丢的关键上下文

- **探针跑法**：touch web/src/main.tsx + sleep 16 + `bun scripts/probe-*.mjs`；e2e/单测 systemd-run 2G；locale 中文断言须 `locale: "zh-CN"`。
- ListRow DOM 无 `.ListRow` 类，行断言用 `[data-list-row-title]`。
- 05c 组头在 seg4 之前（原型页私顺序），实现组头恒在 panel 顶（seg4 后）——跨态一致优先，未随原型重构。
- 记档位置：§6.13「真机反馈修复·第五批②③」段。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-09-29；触发原因：第五批反馈②③④⑤（最新 `dd49a01` 移动历史窗口对齐） + /handoff save
