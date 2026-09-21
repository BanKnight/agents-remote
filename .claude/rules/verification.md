# 验证纪律

> 来源：原 CLAUDE.md「开发准则」中测试/门禁规则的操性提炼（2026-09-19 harness 改造）。

## 每增量 self-check

- 触发：每次实现改动（写完功能/修复后）。
- 动作：跑与改动层级匹配的最小验证（对应包的 `test` / `typecheck`）；不攒到 commit 才跑。
- 改动分层：shared 协议 → `bun run --filter @agents-remote/shared test`；api → 对应 `api/src/*.test.ts`；web → 相关 `web/src/**/*.test.ts` + 浏览器验证 golden path。

## format 写入必须用项目脚本（2026-09-22 oxfmt 全仓误伤教训）

- **触发**：format 违例需要写入修复时。
- **动作**：只用 `bun run format`（范围限定 package.json + tsconfigs + scripts/e2e/api/packages/web）；**禁 `bunx oxfmt --write .`**——全仓模式会重排 .claude/、docs/（含 54 页原型 HTML）等 200+ 非门禁文件，违反 surgical 原则，只能 git checkout 救回。
- **门禁范围 vs 全仓**：`format:check` 只查 339 个门禁文件，md/html 不在内；全仓写入不影响门禁通过但污染工作区。

## commit 前全门禁（pre-commit hook 自动跑，不豁免）

```bash
bun run format:check && bun run lint && bun run typecheck && bun run test
```

- lint 使用 `--deny-warnings`，0 warning 0 error 才算通过。
- test 必须全部 pass，不允许以"基线就有问题"为由跳过修复。
- 改动影响端到端用户路径时，加 `bun run e2e`。

## CSS 落盘硬闸（改 web 包内任何文件后必跑）

```bash
node scripts/ar-verify-css.mjs
```

- 与 format/lint/typecheck/test 同级，无条件跑——DOM 结构断言对 CSS 完全盲（详见 `frontend-notes.md` §2、§10）。
- 交付 checklist：`curl -sI localhost:43012/assets/<css> | grep content-type` 必须 `text/css`；`text/html` 则 touch `web/src/main.tsx` + 轮询到 text/css 再交付。

## 散落 token 机检（UI v2 起）

```bash
bun scripts/ar-verify-tokens.mjs
```

- 触发：UI v2 重构（`docs/design/redesign-v2.md` M1 换底后）改 web 包内任何 UI 文件后跑；M0 落地脚本，落地前此条 pending。
- 检查：web/src 中散落 HEX（`#0A84FF` 等）与裸 Tailwind 色阶（`bg-cyan-300`、`text-slate-400`）——UI 样式只能走 tokens.json 语义 token；白名单限 `styles/index.css`（token 物化层）等声明文件。
- 模式：M0–M1 过渡期 report-only（报告不计 fail），M1 换底完成后收紧为硬闸（有违例即 fail）。

## 验证证据

- CSS/布局视觉改动用 `getComputedStyle`/`getBoundingClientRect` 硬数据验证，不靠 vision 读截图（用户禁止截图/vision 验证 UI）。
- 消息/协议类问题把客户端日志、服务端日志、原始 JSONL 作为验收材料的一部分（见 `claude-debugging.md`）。
- 仅实时流出现的行为（需 mock WS 帧）不写浏览器探针，交付说明列手动验证 checklist 交用户。

## 大段代码替换的写入纪律（来源：UI v2 M3 实战，2026-09-21）

- **触发**：需要替换 ≥15 行的 JSX/代码块时。
- **动作**：不用 Edit 工具做整段大替换（同 session 实测多次注入乱码——占位词、错路径、残缺行混入 new_string），改用 python 脚本锚点定位整段替换（`src.index(锚点)` 定界 + 切片拼接），替换后 Read 回读 + typecheck 确认。
- **判定**：Edit 报「old_string not found」或 PostToolUse 后文件行为怪异时，先 Read 实际内容再动手；连续两次写入同一文件失败就停，恢复（`git checkout --`）后换方法，不硬试第三次。
- Edit 单行/小步替换（≤5 行）不受此限，仍用内置工具。
