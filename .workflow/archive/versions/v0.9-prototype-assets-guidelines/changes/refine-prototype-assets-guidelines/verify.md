# verify

本文件记录当前 change 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：refine-prototype-assets-guidelines
- Roadmap 对应项：v0.9-prototype-assets-guidelines
- 验证对象：`docs/design/prototype/` 下 standalone HTML、shared prototype foundation、overview、guidelines、screenshots/index 与 change implementation artifacts
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-29
- 验证范围：确认 prototype asset refinement 是否满足 specs/design/tasks 中关于 overview page grouping、standalone screenshot source、guidelines token/component/viewport/responsive 规范、shared foundation 和 screenshot refresh 的承诺。
- 使用 harness：静态结构检查、PNG viewport 尺寸检查、截图采集日志复核、`git diff --check`。
- 本轮结论：通过，无 CRITICAL / WARNING。
- 后续动作：可进入 `distill-change`。

## Harness 清单

- 名称：Prototype structure check
  类型：静态结构 / 文档一致性检查
  覆盖承诺：overview 7 个 page sections / 14 个 iframe；overview review-only 文案；guidelines 必备 token、viewport、响应式和边界术语；prototype index 与 screenshots index 关系；7 个 standalone HTML 引用 shared foundation；14 张截图存在且被 index 引用。
  执行方式：Node 脚本读取 HTML/Markdown/screenshot 目录并写入 JSON artifact。
  结果：通过。
  证据：`.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/artifacts/verify-structure-check.json`

- 名称：Screenshot capture replay log
  类型：headless browser 截图证据
  覆盖承诺：正式截图直接打开 standalone HTML，desktop 使用 `1440x1000`，mobile 使用 `390x844`，共 7 页 × 2 viewport = 14 张 PNG。
  执行方式：`artifacts/capture-prototype-screenshots.mjs` 使用 Playwright chromium 打开 standalone HTML 并截图。
  结果：通过。
  证据：`.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/artifacts/capture-prototype-screenshots.log`

- 名称：Screenshot dimension check
  类型：PNG artifact 检查
  覆盖承诺：刷新后的 PNG 尺寸与 guidelines 中正式 viewport 标准一致。
  执行方式：读取 PNG IHDR 宽高并与 desktop `1440x1000` / mobile `390x844` 对比。
  结果：通过，14 张全部匹配。
  证据：`.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/artifacts/verify-screenshot-dimensions.json`

- 名称：Whitespace diff check
  类型：静态 diff 检查
  覆盖承诺：实现变更无 trailing whitespace 或 diff 格式问题。
  执行方式：`git diff --check`。
  结果：通过。
  证据：`.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/artifacts/verify-diff-check.log`

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| specs / tasks 2.2 | `overview.html` 按页面分组展示当前 7 个 standalone page，每页 desktop/mobile 两个 iframe，总计 14 个 iframe，并提供 standalone link。 | `docs/design/prototype/overview.html` | `verify-structure-check.json`：`overviewSections=7`、`overviewIframes=14`、`overviewLinks=7`。 | 通过 |
| specs / design | `overview.html` 只作为总览评审入口，不作为正式截图来源。 | `docs/design/prototype/overview.html` header 文案；`docs/design/prototype/screenshots/index.md` 截图来源说明。 | `verify-structure-check.json`：`overviewReviewOnly=true`、`screenshotIndexSource=true`。 | 通过 |
| specs / tasks 2.1 | 7 个 standalone HTML 均引用公共 prototype foundation，并保持可直接打开。 | `docs/design/prototype/prototype-foundation.css`；7 个 standalone HTML 的 stylesheet link。 | `verify-structure-check.json`：`standaloneRefs` 中 7 个页面 `foundation=true`。 | 通过 |
| specs / tasks 2.3 | `guidelines.md` 在原文件基础上补齐 token、组件、viewport、响应式和公共 foundation 边界，包含 `1440x1000` / `390x844`。 | `docs/design/prototype/guidelines.md` | `verify-structure-check.json`：`guidelineTerms` 覆盖 Design tokens、Viewport 标准、响应式要求、viewport、foundation、overview/source 边界、Files/Git 只读和 runtime input 术语。 | 通过 |
| specs / tasks 3.1 | 直接从 7 个 standalone HTML 采集 desktop/mobile 正式截图，共 14 张 PNG。 | `docs/design/prototype/screenshots/*.png`；`docs/design/prototype/screenshots/index.md` | `capture-prototype-screenshots.log` 记录 14 次 standalone capture；`verify-structure-check.json`：`screenshotCount=14`、无 missing/unindexed；`verify-screenshot-dimensions.json`：14 张尺寸全部匹配。 | 通过 |
| tasks 3.2 | Prototype index 描述 standalone HTML、overview、guidelines、screenshots 和 foundation 的关系。 | `docs/design/prototype/index.md` | `verify-structure-check.json`：`protoIndexTerms` 覆盖 Standalone HTML、overview、guidelines、screenshots、prototype-foundation.css。 | 通过 |
| design / risks | 不修改 React app、API、shared DTO、runtime protocol 或 v0.8 archive；本 change 限定在 prototype docs/assets 与 change artifacts。 | Git diff 范围只涉及 `.workflow/versions/v0.9...` 与 `docs/design/prototype/`。 | `git diff --stat` 人工复核；`git diff --check` 通过。 | 通过 |

## Delta 验证

- Scope 内变更：新增 change specs/design/plan/tasks/verify/artifacts；新增 `docs/design/prototype/prototype-foundation.css`；更新 7 个 standalone prototype HTML、`overview.html`、`guidelines.md`、prototype index、screenshots index 和 14 张 screenshots。
- Scope 外变更：未发现本 change 新增的 `web/` React app、API、shared DTO、session/runtime protocol、Git/Files/Terminal runtime 行为变更。
- 未被 spec/design 支撑的新行为：未发现。公共 foundation 只抽取 prototype 静态视觉 primitive，不引入构建步骤、外部依赖、真实运行态能力或伪造数据。
- 风险：主要视觉风险已通过截图刷新和 PNG 尺寸检查覆盖；overview iframe 仅作为 review scale，正式截图 source 已在 docs 和 artifacts 中固定为 standalone HTML。
- 结论：通过。

## Scenario 验证

- 场景：Overview 总览评审入口
  路径类型：用户可见
  验证方式：静态解析 `overview.html` 的 page sections、iframe、standalone link 和 review-only 文案。
  证据：`verify-structure-check.json`
  结果：通过。

- 场景：正式截图从 standalone HTML 采集
  路径类型：正常 / 用户可见
  验证方式：复核截图采集日志和 PNG 尺寸；确认 7 个 standalone page 各有 desktop/mobile 一张截图。
  证据：`capture-prototype-screenshots.log`；`verify-screenshot-dimensions.json`；`docs/design/prototype/screenshots/*.png`
  结果：通过。

- 场景：Guidelines 作为后续 UI alignment 的 token/component/viewport/responsive 入口
  路径类型：正常 / 边界
  验证方式：静态检查 `guidelines.md` 是否包含标准 viewport、Design tokens、响应式要求、foundation 边界和 Files/Git/Terminal 能力边界术语。
  证据：`verify-structure-check.json`
  结果：通过。

- 场景：跨页面公共基础复用
  路径类型：正常 / 一致性
  验证方式：检查 7 个 standalone HTML 是否全部引用 `prototype-foundation.css`，并确认 index/guidelines 记录 foundation 职责。
  证据：`verify-structure-check.json`
  结果：通过。

## Evidence 清单

- 类型：日志
  路径或命令：`.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/artifacts/capture-prototype-screenshots.log`
  结果：通过
  说明：记录 7 个 standalone HTML 按 desktop `1440x1000` 与 mobile `390x844` 各采集一张截图。

- 类型：截图
  路径或命令：`docs/design/prototype/screenshots/*.png`
  结果：通过
  说明：14 张正式截图已刷新，来源为 standalone HTML。

- 类型：自动化检查报告
  路径或命令：`.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/artifacts/verify-structure-check.json`
  结果：通过
  说明：结构、文档术语、截图索引和 foundation 引用均满足承诺。

- 类型：自动化检查报告
  路径或命令：`.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/artifacts/verify-screenshot-dimensions.json`
  结果：通过
  说明：14 张 PNG 尺寸均匹配正式 viewport 标准。

- 类型：测试
  路径或命令：`git diff --check`
  结果：通过
  说明：输出写入 `.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/artifacts/verify-diff-check.log`，无 diff 格式问题。

## 交互式 Artifact 清单

- 类型：截图
  路径或命令：`docs/design/prototype/screenshots/home-desktop.png`；`docs/design/prototype/screenshots/home-mobile.png`；`docs/design/prototype/screenshots/project-detail-desktop.png`；`docs/design/prototype/screenshots/project-detail-mobile.png`；`docs/design/prototype/screenshots/agent-session-detail-desktop.png`；`docs/design/prototype/screenshots/agent-session-detail-mobile.png`；`docs/design/prototype/screenshots/terminal-instance-detail-desktop.png`；`docs/design/prototype/screenshots/terminal-instance-detail-mobile.png`；`docs/design/prototype/screenshots/files-desktop.png`；`docs/design/prototype/screenshots/files-mobile.png`；`docs/design/prototype/screenshots/git-desktop.png`；`docs/design/prototype/screenshots/git-mobile.png`；`docs/design/prototype/screenshots/terminal-desktop.png`；`docs/design/prototype/screenshots/terminal-mobile.png`
  结果：通过
  说明：UI 可见行为的正式截图 artifact 已按 standalone source 与标准 viewport 采集。

- 类型：自动化测试报告
  路径或命令：`.workflow/versions/v0.9-prototype-assets-guidelines/changes/refine-prototype-assets-guidelines/artifacts/verify-screenshot-dimensions.json`
  结果：通过
  说明：截图 artifact 的 viewport 尺寸由 PNG header 复核。

## Version Shared 验证记录

- 本 change 未声明需要读写 `.workflow/versions/v0.9-prototype-assets-guidelines/shared/`。
- 验证结论：不适用。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | tasks 1.1、2.1、2.2、2.3、3.1、3.2 均已完成，verify 覆盖 overview、guidelines、foundation、screenshots、index 和 diff hygiene。 |
| Correctness | 通过 | 结构检查、截图采集日志、PNG 尺寸检查和 `git diff --check` 均通过。 |
| Coherence | 通过 | 变更保持 standalone HTML 正式 source、overview review-only、shared foundation 和 prototype docs/index 的一致模型。 |

## 问题清单

### CRITICAL

- （无）

### WARNING

- （无）

### SUGGESTION

- （无）

## 回流建议

- （无）

## 最终结论

- 结论：通过
- 是否允许进入 distill-change：是
- 条件或阻塞：无
