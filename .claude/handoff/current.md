# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-23（**第九轮收口**。第九轮两问题全闭环：①技能详情超长 URL 溢出 `052832a`；②行动钮塌宽 `4bddc6c`。§6.12i 记档。继续等用户复验报数）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第九轮两问题闭环：①超长 URL 溢出 = MARKDOWN_CLASS 容器级 `[overflow-wrap:anywhere]`（`052832a`）；②卸载钮挤成一团 = button width:auto fit-content 塌宽家族收官——`.cta`/`.rm`/`.logout`/`.readbtn` 四类补 width 三连（`4bddc6c`），python 全量交集扫描确认无漏网（237 个 button 挂载类仅 6 候选，.loadmore 设计意图/.ap-row 误报排除）。m6 68/68。**下一步：等用户继续复验报数。**

## 本 session 焦点

第九轮用户复验两问题的修复。塌宽根因 = `.rm`/`.cta` 自 M6（fb49dde）引入即漏 width 三连（.pcard/.addsrc 是 M10 第五轮修的，本批是同家族最后一批）；诊断探针实锤 .rm 41px（应 358px）后系统性扫描收官。

## 关键决策（本阶段不可丢）

- **塌宽判定法（可复用）**：bug 完整前提 = ①宿主是 button（width:auto=fit-content）②原型里是整宽形态（div 的 auto=fill）。修法 = width 三连（`-moz-available`/`-webkit-fill-available`/`stretch`），注释口径「button 实例 fit-content 修正：同 .pcard（width 三连注释）」。**勿用 w-full**（width:100% 不扣 margin，叠 16px×2 margin 即溢出 32px）。`.loadmore`（`16px auto` 居中文字钮）fit-content + auto margin 居中正是设计意图，**不是所有 button 都要修**。
- **系统性扫描脚本**（python，本次收官用）：CSS 全类解析（横向 margin + 无 width）× tsx 全 `<button>` className 交集——237 类只出 6 候选，手工逐个判语义。比逐类 rg 快且不漏。
- **pluginView 深度页范式 / 存量清洗双机制 / bridge registry / RuntimeConfigDialog 诚实取舍 / effort 行口径**：见 §6.12h 记档（第八轮，已固化进 redesign-v2.md，不再赘述）。
- **heredoc 转义链**：JSON→bash→python 三层——`\\n` 到 python 才剩 `\n`；js 字面 `\n` 锚点用 `chr(92)+"n"`；python 括号表达式尾随逗号变 tuple。长 new 字符串写完必须 rg 机检。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0–M10 → 用户总验证 → 九轮反馈修复全闭环（1~8 轮见 snapshots 与 §6.12a–h）
- ✅ 探针：m6 68/68（第九轮 +2：超长 URL 无溢出 / .cta/.rm 整宽 = vw-32）；m10、m9-d、e2e 29/29 均绿（第八轮收口态）
- ⬜ **交用户复验**，第九轮真机项：
  - **技能详情**：正文含超长 URL 不再横向溢出（可断行）
  - **技能详情行动钮**：安装/更新（.cta）与卸载（.rm）恢复整宽描边钮（358px，不再缩成文字宽）
  - 连带受益：设置页退出登录钮（.logout）、wiki 文本预览「已读」钮（.readbtn）同步恢复整宽
  - 第八轮清单（如未复验）：插件详情不积累 tab、浮层会话名置顶、三行 › 可点设置
  - 遗留（历史轮）：②时间刷新节奏、⑥gf 卡形态、⑫浮层穿透、⑬ticon 间距、iPad 触屏 hover 正交、W4 chip-Popover 形态

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活，43011/43012 均 200，dist 已 rebuild（CSS 硬闸 + content-type text/css 均过）。

## 易丢的关键上下文

- **探针跑法**：`bun scripts/probe-*.mjs`（bun 不用 node）+ systemd-run 2G；旧探针 login 选择器是「密码/解锁」，新 UI 是「访问密码/登录」——复活旧探针先修 login。
- **探针 mock 铁律**：route glob 带查询尾 `*`；mock「翻译后形态」按消费端契约；量溢出必须量滚动容器层不只 doc（§6.12e）。
- **e2e 纪律**：`systemd-run --scope --user -p MemoryMax=2G bun run e2e`。
- **CSS 落盘流程**：改 web 后 touch main.tsx → sleep 16 → ar-verify-css；交付前 curl content-type 必须 text/css（dist CSS 文件名是 `style-*.css` 非 `index-*.css`，curl 拼名别用错 glob）。
- **行高纪律**：v2-primitives 新增带 font-size 的块必须同步 `line-height: var(--line-height-ui)`（.cta/.rm 的 line-height 44px/40px 是垂直居中手段，非行高档，不属此纪律）。
- contains 防护 idiom：`if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target as Node)) return;`

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
