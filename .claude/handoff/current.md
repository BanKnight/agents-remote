# 当前状态（current.md — 滚动更新）

> 最后更新：2026-09-22（M9 批次 d 已 commit `2ce3531`；批次 e 实现完成：探针 14/14 三连 + api 816 全过 + 四门禁过，§6.10 补记已落，**reviewer 三份待跑** → commit。触发：批次 e 收尾）。
> 用法：`/handoff save` 更新本文件并把旧版归档到 `snapshots/`。compact 与 session 启动时由 hook 自动注入。

## 一句话状态

UI v2 重构 M9 批次 e（安全与键盘杂项收尾）实现完成：①`resolveCreateTarget` realpath 复核（symlink 逃逸堵死，测试覆盖）②searchFiles 遍历总量上限 FILE_SEARCH_VISIT_LIMIT=20000 + options.visitLimit 测试注入 ③project-files.ts 字面控制字节 → \uXXXX 转义（rg binary 附带修复 + oxlint disable）④focus-visible 统一环五类行组件 ⑤.setrow .ar「›」ink-3→ink-2（1.86/1.68 <3:1 → 5.94/3.26 达标）⑥seg4 aria-controls/tabpanel ⑦w-[52px] 静态核对 ✓ 真机交用户。探针 `probe-v2-m9-e-focus-a11y.mjs` **14/14 三连**；api 816（+2 新测试）全过；四门禁 + CSS 硬闸 + token 机检过。**下一步：reviewer（security/code/design）→ commit → M10 总验收。**

## 本 session 焦点

批次 d commit（`2ce3531`：reviewer 1 高 3 中全闭环——快捷键 deps stale closure 一行修复 + NOOP 常量 + MainPageShell 补 mhead）→ 批次 e 全程。批次 e 三次工具层事故均按纪律兜住：①Edit 大段 new_string 注入乱码（`matches: 5`/`dirPath:每个:`）→ old_string 不匹配未落盘，转 python 锚点；②python heredoc 断言边界设计失误（end 选到 walk 内 guard 而非 for 内 guard）→ readdir 重复三行，typecheck 抓住删除；③探针 Write 注入乱码（`"application onClickHandler"`）→ python 替换 route 块。**probe 断言要在 write 前拦（本次 probe "readdir" 设计失误反而拦截了坏替换，双重校验有效）**。

## 关键决策（本阶段不可丢）

- 全部决策见 `docs/design/redesign-v2.md` §2（D1–D23）+ §6.10 摊牌 + 批次 b/c/d/e 落地补记。
- **探针 mock 铁律（四条）**：①形状对齐 shared；②完备覆盖 prune 数据源；③approvals/stream abort；④preview 响应 `name` 字段决定 md/html render 分支。
- **批次 e 安全语义**：resolveCreateTarget realpath 复核（ENOENT=新目录放行；根内 symlink 放行不逃逸）；searchFiles visitLimit truncated 语义与结果上限一致（结果可能不完整）；oxlint no-control-regex disable 是「检测二进制」职责本身非输入校验。
- **focus-visible 启发式**：探针实测须先 keyboard Tab 一次激活键盘启发式，再 el.focus() 才 matches(":focus-visible")。
- reviewer 用 `subagent_type: "fork"`（继承上下文，M8/M9 各批全一次成功）。

## 进度（已完成 / 进行中 / 待办）

- ✅ M0–M7 → M8（`4ae8098`）→ M9 批次 a+b（`4681642`）→ 批次 c（`d59e1ad`）→ **批次 d（`2ce3531`）**
- ⏳ M9 批次 e（未 commit，等 reviewer 三份）
- ⬜ **M10 总验收**：新 e2e 全套（`systemd-run --scope --user -p MemoryMax=2G bun run e2e`）+ spec §9 逐项机检 + 用户总验证（Q17 约定：全做完才交用户）
- **M9 遗留（已收口→交用户）**：`w-[52px]`/⌘1..9 浏览器抢占/iPad 触屏 hover 正交 = 真机项，M10 交用户；代码侧全部落地

## 阻塞 / 风险

- 无阻塞。**基线 flaky 甄别记录**：claude-auto-retry 全量偶发红（单跑稳定）不修；M9b 探针首跑偶发红 = dist 半新半旧（touch 后 30s 不稳），复跑甄别。
- **大段生成注入持续活跃**：本 session Edit ≥15 行 new_string 注入 2 次、Write 大文件注入 1 次（settings mock contentType 变 `"application onClickHandler"`）、python heredoc 字符串被改字 1 次（趣过/每个）。**对策已验证有效**：短 Edit（≤5 行）+ python 锚点断言（write 前校验）+ 写完必 rg 机检。
- 探针 G2 教训：index.css :root 是**浅色**（#8e8e93），.dark 块才是深色（#98989f）——computed 色断言别想当然默认深色。

## 易丢的关键上下文

- **批次 e 改动文件**（8 文件）：`api/src/projects.ts`（realpath + import）、`api/src/projects.test.ts`（symlink 拒绝测试）、`api/src/project-files.ts`（VISIT_LIMIT + searchFiles options + \uXXXX 正则 + disable 注释）、`api/src/project-files.test.ts`（visitLimit 测试）、`web/src/styles/v2-primitives.css`（.ar ink-2 + 五类 focus-visible）、`web/src/components/workbench/instance-area.tsx`（aria-controls ×2 + tabpanel id/role）、`scripts/probe-v2-m9-e-focus-a11y.mjs`（新建 14 断言）、`docs/design/redesign-v2.md`（批次 e 补记）。
- **07m 设置 IA / mainPage 三条件 / ` / ` 纯跳板 / prune 约定** 等批次 d 语义见批次 d 补记（redesign-v2.md 422 行区）。
- **dev 服务纪律**：改 web 后 touch main.tsx + `node scripts/ar-verify-css.mjs`；探针 bun 跑；e2e/test 用 `systemd-run --scope --user -p MemoryMax=2G`。
- 用户 Q17 约定：所有里程碑完成后跑新 e2e 才交用户验证；期间每里程碑 reviewer + 四门禁。

## 提醒

- 开干前读 .claude/gtd/next-actions.md；守 .claude/constitution.md 底线。
- 到达里程碑或感知将 compact 时，主动 /handoff save。
