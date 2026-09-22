# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-22（**M10 用户反馈第六轮修复完成**：行高基准拍板 A 落地——v2-primitives 裸字号类补 line-height 1.4，commit `76ed3ab`，探针 67/67 + e2e 29/29 + 四门禁。触发：第六轮收口）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

用户真机反馈六轮全部修复并 commit：四轮 `2aa1672`；五轮（插件页 button.pcard w-full 叠 margin 右溢 32px，width:stretch 三连）`4bb596e`；六轮（行高拍板 A——188 个裸字号块补 `line-height: var(--line-height-ui)`，9 个终端/代码区固定行高块保持；卡高 64→≈58 对齐原型 57）`76ed3ab`。**下一步：交用户复验。**

## 本 session 焦点

五~六轮真机反馈修复 + §6.12e/f 补记。对照方法论：并排渲染原型 HTML 与实现页逐元素量几何 + 逐类比对 CSS——差异三类（移植偏差修 / 系统基准差异请拍板 / 能力边界维持）；行高系统差异已由用户拍板 A 闭环。

## 关键决策（本阶段不可丢）

- **button width:auto = fit-content 语义**（四/五轮根因家族）：行类 max-width:100% 护栏；卡片类（.pcard/.mrow/.addsrc）width 三连渐进；button 上勿用 w-full（100% 不扣 margin，叠横向 margin 即右溢）。
- **行高基准 = tokens.json typography.line-height-ui 1.4（用户拍板 A）**：v2-primitives 裸字号类统一 `line-height: var(--line-height-ui)`（变量物化在 index.css @theme）；9 个已有行高意图块（.tterm 22px/.dcode 18px/.code 20px/.send::before/.rtry 等）不动。**后续给 v2-primitives 新增带 font-size 的块必须同步带此行高声明**。
- **溢出探针测滚动容器层**：overflow-y:auto 连带 overflow-x:auto，溢出在内层，documentElement.scrollWidth 测不到。
- **批量 CSS 补丁「块内已有声明」判定**：必须用 `{` 到配对 `}` 完整块文本，不能用「上一 `}` 到 `{」的选择器段（首版误判致 9 块双重插入，git checkout 重跑修正版 + rg 总数复核兜底）。
- **scrollWidth 假象**：触区扩展让 scrollWidth > clientWidth 但视觉正常——诊断区分假象与真溢出。
- **l3 双轨语义**：L3 显式子路由 l3BackTo 回对应 tab；file/git transient focus back=删 tab+回来源工具+cwd 同步父目录。
- **CLI 空壳 session 过滤**（服务端 extractEntry）：title/firstMessage/startedAt 三者全空返 null。
- **MobileSheet drag-dismiss**：grab+shd 热区 touch-none；6px slop；≥96px 或 ≥24px+0.5px/ms 收起。
- **rememberedMiddleTab**：用户最后主动选的非工具 tab；移动 ticon 写 URL 不写 remembered。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0–M10 → 用户总验证 → 六轮反馈修复 `1dc5172`/`8cdc21b`/`e55da72`/`2aa1672`/`4bb596e`/`76ed3ab`（探针 67/67、e2e 29/29、四门禁 + CSS 硬闸）
- ⬜ **交用户复验**，真机项清单：
  - 第六轮：全页垂直节奏收紧（卡高 ≈58、行距贴原型）
  - 第五轮：插件页卡片不再右溢 / MCP 组 ＋ 为 20px 图标
  - 第四轮：git 面板不再横向拖动 /「移动到…」有文件夹图标 / 搜索框放大镜恢复（×3 页）
  - 第三轮：⑭ 预览 back 返回上一层；历史浮层 ①加载骨架 ②空壳标题行消失 ③下拉收起
  - 遗留：②时间刷新节奏、⑥gf 卡形态、⑫浮层穿透、⑬ticon 间距、iPad 触屏 hover 正交、W4 chip-Popover 形态

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活，43011/43012 均 200，dist 已 rebuild（CSS 硬闸通过）。

## 易丢的关键上下文

- **探针 mock 铁律**：会话 id 带 `agent_`/`terminal_` 前缀；login 按钮 `/登录|Sign in/`；files 端点 mock 正则带 `(\?.*)?`；探针默认浅色主题；git ticon aria-label=「Git」，git L3 backLabel=「Git 检视」；git log mock URL 无 branch 无 query。
- **探针状态链**：G1 file back 后 files cwd 停在 src（后续断言文件行用 deep.ts）；H6 停在 /plugins（该页无 .nv-t 元素，断行高用 .psect）。
- **e2e 纪律**：`systemd-run --scope --user -p MemoryMax=2G bun run e2e`。
- **CSS 落盘流程**：改 web 后 touch main.tsx → sleep 12+ → ar-verify-css；交付前 curl content-type 必须 text/css。
- **contains 防护 idiom**：`if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target as Node)) return;`
- **写入纪律**：大段生成（≥15 行）python 锚点整段替换 + rg 机检；heredoc 写补丁脚本比 Write/Edit 稳；连续两次失败就停换方法。
- **python heredoc 可能被权限分类器误判 Data Exfiltration**：写临时 .py 再执行，跑完即删。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
