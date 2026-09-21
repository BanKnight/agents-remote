# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-22（M8 缺口功能完成，待 commit；下一步 M9 多端。触发：里程碑完成）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

UI v2 重构 M8（缺口功能）已完成：a–e 批次全落（文件搜索 / 移动到 / 上传队列冲突三选 / 拖拽多文件 / 08 采用已有目录 / root 上传写边界 / 子 agent 概览条 / merged 置灰 / .count 取消+fire / 03n 单一管道 / MobileSheet Description / .sd 消歧 / 76dvh 派生）。探针抓到 5 个真 bug 并修复（`?q=` 参数、`.sfield` 无 CSS、prompt holder 未挂载、ActionMenu 长按 fiber 冒泡+contextMenuPoint 双 bug、jotai store 读写分裂）+ code-reviewer P2（pump break→continue）。三 reviewer：security 通过（3 P3 记档）、code 修复后通过、design 修复后通过（P1 `.btn.blue` 未定义变量已修）。M8 探针 65/65、回归 M4 41/M5 46/M6 59/M7 68、e2e 29/29、四门禁全绿（api 814+web 670+shared 9）、CSS 硬闸、token 零新增。§6.9b 收口补记已写。**下一步：commit M8 → M9 多端（iPad 三栏 / Mac 分屏+Inspector+状态栏审批+快捷键；开工前 iP细节先与用户确认——总纲 §6 约定）。**

## 本 session 焦点

M8 收口全程：探针 7 Part 编写与迭代（Part 2 卡 prompt 引出 ActionMenu fiber 冒泡双 bug——CDP 长按→fiber 采样→body dump 三轮定位；Part 3 卡 .upcard 引出 jotai store 分裂——409 POST 出现但卡片空的矛盾一路收窄到 main.tsx Provider）→ M5 探针回归修复（agent-history mock + prompt Enter 确认）→ 四门禁 + reviewer 三份 + 修复 → §6.9b 补记。

## 关键决策（本阶段不可丢）

- 全部决策见 `docs/design/redesign-v2.md` §2（D1–D23）+ **§6.9 M8 开工摊牌** + **§6.9b M8 收口补记**（落地清单 / 三处偏离记档 / 6 个 bug 修复 / reviewer 结果 / 验证证据）。
- **偏离记档三处**：上传进度 = fetch 文件粒度（非 XHR 字节）；冲突三选 = 服务端 409 触发（无 TOCTOU，非入队 HEAD 探测）；root mkdir = 复用创建项目端点（不另立 mkdir）。
- **ActionMenu 教训（§4 新实证）**：portal 内 menuitem 的 click 按 **fiber 树**冒泡到行 onClick；行 `{...lp.bind()}` 的 onPointerDown 会被 menuitem pointerdown 冒泡重置 suppressClick → guardClick 失效。修法 = menuitem onClick 首行 `stopPropagation` + `onContextMenuClose?.()`（受控 point 先清再 onSelect，防层叠抢焦点）。
- **jotai 纪律**：无 prop `<Provider>` 私建 store——模块级 imperative API 用 `getDefaultStore()` 写入的组件树必须 `<JotaiProvider store={getDefaultStore()}>` 显式挂 default store（main.tsx 已修，勿回退）。
- **`.subbar` 形态拍板（design P2）**：取通栏 wrap 泛化（多子 agent 并行），放弃 03e 原型单 chip 浮动圆角条；颜色语义与原型一致。
- **探针方法沉淀**：fiber 上读 `__reactProps.onClick.toString()` / `pendingProps.items[].onSelect` 验证「实际运行的代码」；body.children dump 一眼看穿导航/portal 残留；颜色断言用「临时元素读 var 计算值」做主题无关对比。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0（`3bd16cb`）→ M1 → M2 → M3 → M4 → M5 → M6（`fb49dde`）→ M7 → **M8（本 commit）**
- ⬜ **M9 多端** → M10 总验收（新 e2e 全套 + spec §9 逐项机检 + 用户总验证，Q17 约定）
- **M9 遗留清单（§6.9b 累积）**：iPad/Mac 细节开工前与用户确认；`.setrow`/`.logout`/`.subbar` 等 `focus-visible` 键盘面；`.ar` 12px/ink-3 对比度（原型即此值）；`w-[52px]` 原型示意值真机化；security P3②（resolveCreateTarget 补 realpath——既有代码）、P3①（searchFiles 遍历总量上限）、P3③（keepBoth TOCTOU 记档）；project scope MCP 详情入口；token 吊销（多设备威胁模型时）。

## 阻塞 / 风险

- 无阻塞。
- reviewer 反复 EOF → 直接 `subagent_type: "fork"`（继承上下文免冷启动），本 session 三份 fork 全部一次成功。
- 大段生成垃圾行注入仍是高危：≥15 行用 python 锚点整段替换 + rg 机检（`verification.md`）。

## 易丢的关键上下文

- **M8 关键文件**：`api/src/project-files.ts`（search/rename targetDir/upload conflict/keepBoth/root upload）、`api/src/index.ts`（/files/search、/root/files/upload 路由，686 行注释）、`api/src/claude-auto-retry.ts`（fireNow/pendingStatus）、`web/src/components/files/upload-queue.tsx`（新，队列单源）、`web/src/components/shell/project-setup.tsx`（08 segc）、`web/src/components/ui/action-menu.tsx`（mobile menuitem 修复）、`web/src/main.tsx`（Provider store）、`web/src/lib/format.ts`（新，formatBytes 单源）、`web/src/components/workbench/mobile-project-tools.tsx`（搜索两态+菜单+holder）、探针 `scripts/probe-v2-m8-gaps.mjs`（65 断言 7 Part）。
- **M8 段 CSS 在 v2-primitives.css**：`.wsearch:focus-within`（03x 聚焦描边）、`.brow.merged/.st.mg/.bsub.mg`（03v）、`.upcard` 族、`.count`（.btn.blue 已修 on-accent）、`.subbar`（通栏 wrap）。
- **探针调试经验**：mock FormData 判定用精确 regex（`name="conflict"\r?\n\r?\n`），`includes('name="conflict"')` 会误命中 `name="conflict-a.txt"`；Part 4 sheet 关闭等待用 `waitForSelector(state:"detached")`（受控关闭 ~200ms 动画后才卸载）；`page.evaluate` 里 console.log 不转发 Node 端，用 window 变量带回。
- **dev 服务纪律**：web=prod build+watch，改 web 后 mtime 核对（dist 晚于源码）或 touch main.tsx 强制 rebuild；探针用 bun 跑；e2e 用 cgroup 2G 且输出别接 tail。
- e2e 纪律：md 不进 format 门禁；改 web 包后必跑 `node scripts/ar-verify-css.mjs`；token 机检基线 11 处 HEX（存量）。
- 用户 Q17 约定：所有里程碑完成后跑新 e2e 才交用户验证；期间每里程碑 reviewer + 四门禁。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
