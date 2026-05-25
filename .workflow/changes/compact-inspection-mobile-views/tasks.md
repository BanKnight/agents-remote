# tasks

## 执行顺序

1. 先压缩 Project workspace 中 Files/Git detail wrapper，建立共享密度基线。
2. 再串行优化 Git changed-file list 与 diff detail。
3. 再串行优化 Files directory list 与 preview detail。
4. 最后执行质量门禁、e2e 和移动端截图验证。

## 任务清单

### 1. 基础/阻塞任务

- [x] 1.1 压缩 Files/Git detail wrapper
  - 验收标准：Project workspace 中 Files/Git section header 不再用大块说明挤占首屏；容器使用移动端友好的 padding、`min-w-0` 和紧凑 header；Files/Git 入口仍可区分当前 section 和只读状态。
  - 依据：`plan.md`；`design/overview.md`；`design/ui-ux.md`
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`；`docs/design/console-shell.md`
  - 修改范围：`web/src/routes/ProjectConsoleRoute.tsx` 的 `SectionDetail` 及必要 className
  - 依赖：无
  - 并行：否（为 Files/Git panel 后续密度提供共享基线）

### 2. 核心实现任务

- [x] 2.1 优化 Git 移动端 changed-file list 与 diff detail
  - 验收标准：Git changed-file list 使用紧凑可扫读 row；status/scope 仍有文字 badge；长路径不造成页面级横向溢出；diff detail header 更紧凑且 unified diff 内容占据主要空间；不新增 Git 写操作入口。
  - 依据：`specs/git-diff-viewer/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`；`docs/design/git-diff-viewer.md`
  - 修改范围：`GitDiffPanel`、`GitFileList`、`GitFileDiffPanel` 及相关 className/markup
  - 依赖：1.1
  - 并行：否（与 2.2 修改同一文件，避免编辑冲突）

- [x] 2.2 优化 Files 移动端 directory list 与 preview detail
  - 验收标准：Files 当前路径和恢复操作更紧凑；目录/文件列表使用 compact row；长文件名/path 不造成页面级横向溢出；文件预览 detail header 更紧凑且内容区域优先；不新增文件写操作入口。
  - 依据：`specs/file-browser-preview/spec.md`；`design/ui-ux.md`；`design/frontend.md`
  - 必读上下文：`web/src/routes/ProjectConsoleRoute.tsx`；`docs/design/file-browser-preview.md`
  - 修改范围：`FilesPanel`、`FileEntryList`、`FilePreviewPanel`、`PreviewBody` 及相关 className/markup
  - 依赖：1.1
  - 并行：否（与 2.1 修改同一文件，串行更安全）

### 3. 集成与验证任务

- [x] 3.1 运行质量门禁并采集移动端 Files/Git artifact
  - 验收标准：`bun run format:check`、`bun run lint`、`bun run typecheck`、`bun run test`、`bun run build` 通过；Files/Git 相关 e2e 通过；保存移动端截图、日志或 Playwright artifact 到本 change 的 `artifacts/`，供 verify 阶段引用。
  - 依据：`plan.md`；`docs/project.md`；`design/frontend.md`
  - 必读上下文：`e2e/file-browser.spec.ts`；`e2e/git-diff.spec.ts`；项目脚本
  - 修改范围：必要时同步 e2e 可访问选择器；`.workflow/changes/compact-inspection-mobile-views/artifacts/`
  - 依赖：2.1、2.2
  - 并行：否（依赖实现完成）

## 依赖图

- 1.1 → 2.1 → 3.1
- 1.1 → 2.2 → 3.1

## 可并行任务

- （无；核心任务集中修改同一前端 route 文件，串行执行更安全。）

## 阻塞项

- （无）
