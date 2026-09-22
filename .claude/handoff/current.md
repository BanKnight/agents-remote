# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-23（**第八轮收口 + 第九轮进行中**。第八轮三 commit `762a9c5`/`bd14731`/`153407a`；第九轮第 1 条「技能详情超长 URL 横向溢出」已修 `052832a`——MARKDOWN_CLASS 容器级 overflow-wrap:anywhere + .dmeta/.ddesc 断词，m6 67/67。继续等用户复验报数）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

第八轮三批次 `762a9c5`/`bd14731`/`153407a` 全部落地；第九轮第 1 条（技能详情超长 URL 横向溢出）已修 `052832a`：MARKDOWN_CLASS 容器级 `[overflow-wrap:anywhere]`（可继承，10 消费方全站 markdown 受益）+ `.dmeta/.ddesc` 断词，m6 探针 +1 断言 67/67。**下一步：等用户继续报第九轮问题/复验。**

## 本 session 焦点

第八轮两个问题的三批次实施。核心裁定：①插件详情迁移对齐 market/sources pluginView 范式（focusId=undefined 不进保活 tab 体系），project scope skill tab 保留（既成语义与 file/git 同构）；②浮层三设置行可点 = bridge registry 架构（ℹ 不在 ClaudeBridgeContext Provider 内而切换协议只走 WS）。

## 关键决策（本阶段不可丢）

- **pluginView 深度页范式**（§6.12h）：`/plugins/skill/$`、`/plugins/mcp/$` derive 改 `focusId=undefined + pluginView + pluginName + leftMode 强制 plugins`；URL 路径形态保留（deep link）；渲染层按 pluginView 分流（桌面 MainPageShell 包 SkillTabPreview/MobileMcpDetail，移动并入 pluginView 分流链）。
- **存量清洗双机制**：skill tab 一次性剥离（标记 `workbenchLayoutV4PluginTabCleaned` 防重入）；pluginmcp 存量经 normalizeRef session 兜底分支**防御剔除残缺 ref**（缺 projectName/sessionId → null）——strip 跑在 normalize 之后滤不到，必须在 normalizeRef 拦。
- **bridge registry**：claude-adapter module Map（`claudeBridgeKey/registerClaudeBridge/getClaudeBridge`），ClaudeChat 挂载注册/卸载注销；ℹ 浮层/项目 tab/桌面 TabChip 三入口共用 useInstanceInfoActions 装配，打开时同步取用（非响应式）。
- **RuntimeConfigDialog 诚实取舍**：无会话页 selector 的 spinner/回滚状态机——点选即切换收起，值由 detail invalidate 回填；effort running 复用 `claude.effort.restart*` confirm；选项数据零复制（detail 查询同 queryKey 缓存 + modelDisplayLabel/PERMISSION_MODE_LABELS export + resolveCurrentModelAlias 提取）。
- **effort 行口径**：label「推理 effort」（03k:67 原文），值原样不 i18n（CLI 标识符），缺省 high（对齐 EffortSelector）。
- **旧探针处置先例**：探针断言的 UI 形态已不存在（旧 IA/v1 结构）→ git rm 记档废弃不修；仅 login 选择器过时而功能仍存在 → 修 login 复活（desktop-instance-info 先例）。
- **heredoc 转义链（第九轮教训）**：JSON→bash→python 三层转义——command 里写 `\\n` 到 python 源码才剩 `\n`（曾写 `\\n` 实际到 python 是换行符导致锚点不中）；js 文件里的字面 `\n` 锚点用 `chr(92)+"n"` 构造最稳；python 括号包裹表达式的**尾随逗号会变单元素 tuple**（count() TypeError 的真因）。长 new 字符串写完必须 rg 机检。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0–M10 → 用户总验证 → 八轮反馈修复全闭环（1~7 轮见 snapshots；§6.12h 记档）
- ✅ 探针：m10 全过（C 段 +7 断言：displayName/无名称行/effort 行/三行 chevron/双层 dialog/check 选中/收起）；m6 66/66；m9-d 24/24（B3 改恰 1）；e2e 29/29
- ⬜ **交用户复验**，真机项清单：
  - **插件详情**：全局技能/MCP 详情打开后工作台 tab 不再累积（存量 tab 已自动清洗，老用户首刷剥离）；项目内技能 tab 机制不变（预期保留）
  - **会话浮层**：顶部 = 会话名；模型/权限/推理 effort 三行带 › 可点，点开选择面即选即切（effort 切换 running 中会弹重启确认）；名称不再出现在行里
  - **模型选择面**：选项 = settings 映射的 alias 集，选中行带 ✓；无 spinner（切完收起，值稍后回填）
  - 遗留（历史轮）：②时间刷新节奏、⑥gf 卡形态、⑫浮层穿透、⑬ticon 间距、iPad 触屏 hover 正交、W4 chip-Popover 形态

## 阻塞 / 风险

- 无阻塞。dev 服务 tmux ar-dev 存活，43011/43012 均 200，dist 已 rebuild（CSS 硬闸 + content-type text/css 均过）。

## 易丢的关键上下文

- **探针跑法**：`bun scripts/probe-*.mjs`（bun 不用 node）+ systemd-run 2G；旧探针 login 选择器是「密码/解锁」，新 UI 是「访问密码/登录」——复活旧探针先修 login。
- **探针 mock 铁律**：route glob 带查询尾 `*`；mock「翻译后形态」按消费端契约。
- **e2e 纪律**：`systemd-run --scope --user -p MemoryMax=2G bun run e2e`。
- **CSS 落盘流程**：改 web 后 touch main.tsx → sleep 16 → ar-verify-css；交付前 curl content-type 必须 text/css。
- **写入纪律**：大段生成 heredoc + python 锚点 + rg 机检；本 session python heredoc 的 new 字符串两次混入垃圾内容（`spread: 0`/`components: 1`）靠 assert/rg 拦截——**长 new 字符串写完必须 rg 机检异常标识符**；Edit 小步（≤5 行）在 Bash 分类器不可用时是可靠替代。
- **行高纪律**：v2-primitives 新增带 font-size 的块必须同步 `line-height: var(--line-height-ui)`。
- contains 防护 idiom：`if (e.target !== e.currentTarget && !e.currentTarget.contains(e.target as Node)) return;`

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
