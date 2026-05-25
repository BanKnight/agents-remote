# verify

本文件记录 `implement-file-browser-preview` 的验证轮次、验证 harness、证据、问题分级与最终结论。

## Change 概览

- Change ID：implement-file-browser-preview
- Roadmap 对应项：v0.4-project-inspection-tools / Project 内只读文件浏览、文本预览和图片预览
- 验证对象：shared Files DTO/error codes、API Files service/routes、web API client、Project console Files UI、E2E fixture/spec、workflow artifacts
- 验证结论：通过

## 验证轮次

### Round 1

- 时间：2026-05-25
- 验证范围：规格中的只读浏览、project-safe path、隐藏条目展示、目录优先/名称排序、文本预览、图片预览、unsupported/too-large/error states、Project console integration。
- 使用 harness：unit tests、HTTP handler tests、web client/model tests、Playwright E2E、完整质量门禁。
- 本轮结论：通过；无 CRITICAL/WARNING。
- 后续动作：进入 `distill-change`。

## Harness 清单

- 名称：focused file browser tests
  类型：unit / HTTP handler / web client tests
  覆盖承诺：shared DTO、Files service、route wiring、safe path failures、sorting、preview states、web client URL encoding、console model。
  执行方式：`bun test api/src/project-files.test.ts api/src/index.test.ts web/src/routes/console-model.test.ts web/src/api/client.test.ts packages/shared/src/index.test.ts`
  结果：通过；41 pass，0 fail，133 expect calls。
  证据：命令输出。
- 名称：Project Files E2E
  类型：Playwright E2E
  覆盖承诺：登录、进入 Project、打开 Files、hidden entries、目录排序、进入目录、文本预览、图片预览。
  执行方式：`bun run e2e`
  结果：通过；2 passed。
  证据：命令输出；`e2e/file-browser.spec.ts`。
- 名称：完整质量门禁
  类型：format/lint/typecheck/test/build
  覆盖承诺：工程一致性、类型正确性、测试回归、生产构建。
  执行方式：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`
  结果：通过；format/lint/typecheck/test/build 均通过，workspace tests 共 api 68 pass、shared 5 pass、web 21 pass。
  证据：命令输出。

## Trace 验证矩阵

| 承诺来源 | 承诺内容 | 实现证据 | 测试/验证证据 | 状态 |
|---|---|---|---|---|
| spec: Project files are exposed through read-only browsing | Project console 内浏览目录、进入子目录、选择文件预览，且不提供写操作入口/API | `web/src/routes/ProjectConsoleRoute.tsx:371` 接入 `FilesPanel`；`web/src/routes/ProjectConsoleRoute.tsx:386` 使用本地 path/file state；API 只新增 GET route，见 `api/src/index.ts:151` | `e2e/file-browser.spec.ts:16`-`45` 验证打开 Files、进入目录、预览文本/图片；完整质量门禁通过 | 通过 |
| spec: File browsing uses project-safe relative paths | 所有客户端 path 保持在当前 Project 根目录内，拒绝越界和 symlink escape | `api/src/project-files.ts:42`、`api/src/project-files.ts:80` 在 list/preview 前调用 `resolvePath`；`api/src/project-files.ts:176` 复用 `resolveProjectRelativePath` | `api/src/project-files.test.ts` 覆盖 `../other` 与 symlink escape；focused tests 通过 | 通过 |
| spec: Directory listing includes hidden entries and stable first-round ordering | 显示隐藏条目；目录优先、文件在后、各组按名称排序 | `api/src/project-files.ts:53` 读取 entries；`api/src/project-files.ts:167`-`172` 返回 hidden/size/type；`api/src/project-files.ts:217`-`223` 排序 | `api/src/project-files.test.ts` 覆盖 `.config`、`.env` 与排序；`e2e/file-browser.spec.ts:19`-`33` 验证隐藏条目和顺序 | 通过 |
| spec: Text file preview is bounded and mobile-readable | 支持上限内文本，超限提示，不把二进制乱码展示为文本 | `api/src/project-files.ts:14` 文本上限 256 KiB；`api/src/project-files.ts:116`-`147` bounded read + UTF-8/binary check；`web/src/routes/ProjectConsoleRoute.tsx:597`-`601` 使用 `<pre>` 纯文本渲染 | `api/src/project-files.test.ts` 覆盖 text、binary_text、large.txt；`e2e/file-browser.spec.ts:35`-`42` 验证文本预览 | 通过 |
| spec: Image preview supports common web image formats on mobile | PNG/JPEG/GIF/WebP/SVG 支持；过大提示；移动端适应容器 | `api/src/project-files.ts:15` 图片上限 5 MiB；`api/src/project-files.ts:92`-`113` 返回 image dataUrl；`api/src/project-files.ts:234`-`247` 支持格式；`web/src/routes/ProjectConsoleRoute.tsx:605`-`613` 使用 `<img>` 自适应容器 | `api/src/project-files.test.ts` 覆盖 SVG 和 large.png；`e2e/file-browser.spec.ts:44`-`45` 验证 SVG 图片预览 | 通过 |
| spec: File browser integrates with Project console as an observation tool | Files 共享当前 Project 上下文，错误/空态可恢复 | `web/src/routes/ProjectConsoleRoute.tsx:386` 使用 Project name；`web/src/routes/ProjectConsoleRoute.tsx:414`-`436` 提供 Root/Up/Retry；`web/src/routes/console-model.ts:46`-`50` Files 状态为 Read-only | `web/src/routes/console-model.test.ts` 覆盖 Files Read-only；E2E 通过真实 Project console 路径验证 | 通过 |
| design/task | shared DTO 和错误码跨 API/web 一致 | `packages/shared/src/index.ts:9`-`76` Files DTO/preview union；`packages/shared/src/index.ts:207`-`221` error codes | `packages/shared/src/index.test.ts` 通过；focused tests 通过 | 通过 |
| design/task | Web client 使用同源 `/api` 并正确 encode project/path | `web/src/api/client.ts:74`、`web/src/api/client.ts:81` 新增 Files client；helper 使用 query path encoding | `web/src/api/client.test.ts:108`-`141` 验证 project/path 编码 | 通过 |
| task | E2E fixture 包含隐藏目录、文本和图片 | `scripts/run-e2e.ts:20`-`27` 写入 `.config`、`.env.example`、README、SVG | `bun run e2e` 通过；`e2e/file-browser.spec.ts` 覆盖 fixture | 通过 |

## Delta 验证

- Scope 内变更：新增 shared Files DTO/error codes；新增 API Files service、route wiring 和 tests；新增 web Files client 和 Project console Files UI；新增 Files E2E fixture/spec；创建本 change 的 design/plan/tasks/verify artifacts。
- Scope 外变更：无。Terminal E2E 仅作为现有 suite 继续运行，未改变 Terminal 语义。
- 未被 spec/design 支撑的新行为：无。API/UI 仍不提供编辑、删除、重命名、上传或下载。
- 风险：图片 dataUrl 体积由 5 MiB 上限控制；目录列表仍不分页，符合第一轮不做分页范围。
- 结论：变更与 specs/design/tasks 一致，无超 scope 行为。

## Scenario 验证

- 场景：用户打开 Files 浏览 Project root。
  路径类型：正常 / 用户可见
  验证方式：Playwright E2E。
  证据：`e2e/file-browser.spec.ts:16`-`23`。
  结果：通过。
- 场景：目录包含隐藏条目、目录和普通文件。
  路径类型：正常 / 边界
  验证方式：service test + E2E order assertion。
  证据：`api/src/project-files.test.ts`、`e2e/file-browser.spec.ts:24`-`33`。
  结果：通过。
- 场景：用户进入 `src` 并预览文本文件。
  路径类型：正常 / 用户可见
  验证方式：Playwright E2E。
  证据：`e2e/file-browser.spec.ts:35`-`42`。
  结果：通过。
- 场景：用户预览 SVG 图片。
  路径类型：正常 / 用户可见
  验证方式：Playwright E2E + service test。
  证据：`e2e/file-browser.spec.ts:44`-`45`、`api/src/project-files.test.ts`。
  结果：通过。
- 场景：path parent traversal 或 symlink escape。
  路径类型：失败 / 安全边界
  验证方式：service test + HTTP handler test。
  证据：`api/src/project-files.test.ts`、`api/src/index.test.ts`。
  结果：通过。
- 场景：unsupported、binary text、too-large text/image。
  路径类型：边界 / 用户可见
  验证方式：service tests；UI preview union 渲染由 typecheck/build 覆盖。
  证据：`api/src/project-files.test.ts`、完整质量门禁。
  结果：通过。

## Evidence 清单

- 类型：测试
  路径或命令：`bun test api/src/project-files.test.ts api/src/index.test.ts web/src/routes/console-model.test.ts web/src/api/client.test.ts packages/shared/src/index.test.ts`
  结果：通过；41 pass，0 fail。
  说明：覆盖 focused API/shared/web client/model 行为。
- 类型：e2e
  路径或命令：`bun run e2e`
  结果：通过；2 passed。
  说明：覆盖 Files 浏览/预览和既有 Terminal smoke。
- 类型：质量门禁
  路径或命令：`bun run format:check && bun run lint && bun run typecheck && bun run test && bun run build`
  结果：通过。
  说明：format/lint/typecheck/test/build 均通过。
- 类型：代码引用
  路径或命令：`api/src/project-files.ts`、`api/src/index.ts`、`web/src/routes/ProjectConsoleRoute.tsx`、`packages/shared/src/index.ts`、`e2e/file-browser.spec.ts`
  结果：实现位置可追踪。
  说明：见 Trace 验证矩阵。

## 三维评估

| 维度 | 状态 | 说明 |
|---|---|---|
| Completeness | 通过 | specs 六组 requirement 均有实现和测试/E2E/门禁证据覆盖。 |
| Correctness | 通过 | 目录排序、hidden entries、safe path、text/image/unsupported/too-large/error states 均通过测试。 |
| Coherence | 通过 | 实现沿用 Project safe path resolver、shared DTO、同源 `/api` client、TanStack Query 和单页本地 state；无新依赖。 |

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
- 条件或阻塞：（无）
