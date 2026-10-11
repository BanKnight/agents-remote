# 当前状态（current.md — 滚动更新）

> 最后更新：2026-10-11（**真机反馈 6+1 条修复完成并提交 `8114ae9` + 记档 `c6b1047`，待交重写版真机清单**）

## 一句话状态

任务 C 加载态审查收口后用户真机反馈 7 条已全部修复提交（骨架 mirror / 两段加载合并 / 终端遮罩统一 / globalCard 防三段翻转 / ⚙ 键位自定义落地 / header 钉高 / html 渲染态 tap-to-edit 通路），验证链全绿。**下一步 = 按 iPhone 实际导航重写真机清单交用户复验**（第一版清单曾被批评：桌面术语混入 + PWA/移动端分组混乱，承诺重写为「从哪进、做什么动作、应该看到什么」）。

## 本 session 焦点

### 关键决策（不可丢）

- **7 条修复根因与方案**（详见 redesign-v2.md §6.12o 段「2026-10-10 真机反馈 6+1 条」）：①骨架 mirror 到容器壳+行+分隔三层；②ChatSkeleton 搬 shell-primitives 单源、AgentPanelRouter 首段直接显骨架；③终端遮罩统一 `bg-[var(--bg-codeblock)]` 全屏、删 scrim 维度；④globalCard `pending` 门防「骨架卡→通用树→卡」三段翻转；⑤⚙ 键位自定义 = terminalQuickKeysHiddenAtom（localStorage）+ ActionMenu 8 键勾选 + SessionInputDrawer quickKeysCustomize slot（diverge 被用户推翻后落地）；⑥mainPage header 钉高 h-11（原型不一致，一致性优先 diverge）；⑦html 渲染态 iframe 点击不冒泡 = 结构性无事件通路，PreviewBody onActivate 经 onFocus 接 tap-to-edit（headless 下真实点击不派发宿主 focus，通路保留待真机验证；兜底动线 = 切源码再点正文）。
- **tap-to-edit 实测结论**：md 渲染态双端（桌面 file tab + 移动面板 tab）均支持，agent-browser iPhone 16 模拟实测通过；用户反馈的「不支持」锁定 html 文件场景。
- **SessionInputDrawer slot 模式**：quickKeysCustomize 由调用方（SessionDetail）构造，drawer 只摆位置——配置逻辑不进抽屉组件。

### 进度

- ✅ 任务 C 五 commit（ca965a5/6224f99/6fd7a1c/118c8c8/cd037aa）+ §6.12o 记档。
- ✅ 真机反馈 7 条修复：`8114ae9`（代码）+ `c6b1047`（记档）。
- ✅ 验证链：四门禁 + CSS 硬闸 + tokens 机检 + e2e（file-browser 2 / terminal-session 1 / mobile-nav 6）+ 单测 774 全绿。
- ⬜ **重写版真机清单交用户**（下一动作）。
- ⬜ 用户真机复验后按反馈迭代；html 渲染态 onFocus 通路真机验证结果待回收。

### 阻塞 / 风险

- html 渲染态点击进编辑：headless CDP 实测宿主不派发 focus（activeElement=IFRAME 但无事件），真浏览器/WebKit 真机行为未确证——清单里单独列一条请用户注意观察，不通则走兜底动线（渲染⇄源码 toggle）。

## 易丢的关键上下文

- **keyboard-debug.ts 仍在**（tokens 机检唯一豁免）——批 18 键盘取证完成后整文件连 main.tsx 挂载点一并删。
- tmp/ 未跟踪目录不入库。
- 设置二级换代真机清单 5 条（任务 A 交付）仍待用户复验。
- agent-browser CLI 可用（iPhone 16 设备模拟 + 真实输入事件），一次性 UI 验证优先用它而非写一次性探针脚本（本轮探针文件三连写入损坏后改用它完成实测）。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。

---
最后更新：2026-10-11 00:05；触发原因：真机反馈 7 条修复提交 + 记档 + handoff save
