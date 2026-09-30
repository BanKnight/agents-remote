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
- **快速通道（2026-09-30 用户拍板「提速」，hook 自动判定）**：staged 文件全部为纯文档面（.md / .claude/** / docs/** 等非代码文件）→ 只跑 format:check + lint（~3s），跳过 typecheck/test；任一文件命中代码面（`web/ api/ packages/ scripts/ e2e/` 前缀或代码扩展名）→ 全门禁。反向判定、宁可漏放行；混合 commit 一律全门禁（见 `scripts/githooks/pre-commit`）。

## 回归验证按改动面裁剪（2026-09-30 用户拍板「提速」）

- **触发**：小批次功能改动后的回归验证。
- **动作**：探针/e2e 只跑与改动面直接相关的（改动文件被哪些 probe/e2e 覆盖就跑哪些）；全套回归留到里程碑收尾统一查漏补缺。
- **边界**：裁剪只针对「与改动无关的面」的回归；每增量 self-check（对应包单测/typecheck）与 CSS 硬闸、tokens 机检不裁剪——那是改动自身的正确性验证，不是回归面。

## 探针定位写法（2026-09-30 用户拍板「提速」，减少返工轮次）

- **触发**：写/改 Playwright 探针涉及按钮点击或 lazy 挂载组件。
- **动作**：① 按钮交互一律 `getByRole("button", { name: "…" })` 精确定位——禁 `locator(容器, { hasText })` 后 click：容器 click 落几何中心会误触同容器另一按钮（实证：m4 探针「编辑 + 查看 diff ›」容器，误触打开 diff 让位预览，返工一轮）。② lazy 挂载（CodeEditor/CodeMirror 等）用 `.waitFor()` 等在场，不用固定 sleep——固定延时短了挂、长了浪费。

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

## 文件编辑一律用内置工具（2026-09-24 用户拍板，取代旧「python 锚点」纪律）

- **规则**：编辑文件一律用内置 Read/Edit/Write 工具；不用 python/shell 脚本做文件写入或整段替换。
- **背景**：旧规则（UI v2 M3 实战）曾因 Edit 乱码前科要求 ≥15 行替换走 python 锚点脚本；2026-09-24 用户明确「编辑文件还是要使用内置工具才好」，废除此做法。
- **判定**：Edit 报「old_string not found」或写入后行为怪异时，先 Read 实际内容再动手；连续两次写入同一文件失败就停，恢复（`git checkout --`）后再试，不硬试第三次。
- **兜底**：大段替换后照常 Read 回读 + typecheck 验证内容正确。
