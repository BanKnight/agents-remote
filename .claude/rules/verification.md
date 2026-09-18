# 验证纪律

> 来源：原 CLAUDE.md「开发准则」中测试/门禁规则的操性提炼（2026-09-19 harness 改造）。

## 每增量 self-check

- 触发：每次实现改动（写完功能/修复后）。
- 动作：跑与改动层级匹配的最小验证（对应包的 `test` / `typecheck`）；不攒到 commit 才跑。
- 改动分层：shared 协议 → `bun run --filter @agents-remote/shared test`；api → 对应 `api/src/*.test.ts`；web → 相关 `web/src/**/*.test.ts` + 浏览器验证 golden path。

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

## 验证证据

- CSS/布局视觉改动用 `getComputedStyle`/`getBoundingClientRect` 硬数据验证，不靠 vision 读截图（用户禁止截图/vision 验证 UI）。
- 消息/协议类问题把客户端日志、服务端日志、原始 JSONL 作为验收材料的一部分（见 `claude-debugging.md`）。
- 仅实时流出现的行为（需 mock WS 帧）不写浏览器探针，交付说明列手动验证 checklist 交用户。
