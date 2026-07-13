import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

/**
 * file nav（设计 §4.2 决策 16 + Phase 3 决策 26）：桌面工作台点 middle tab [文件] → 左栏项目内
 * 文件树 → 点文件 → 中栏开 file tab（与 session tab 同 group+tab）→ FileTabPreview 可编辑预览 →
 * URL 切到 /projects/$key/file/$path splat。Phase 3：项目局部文件走 middle tab [文件]（左栏
 * FilesLeftPanel scope=project）；活动栏 [文件] = 全局 rootBrowse（作用域互斥，由 middle-tab-left
 * spec test 7 覆盖）。回归 session tab 不受影响由其他 spec 覆盖。
 */
test("file nav: middle tab [文件] → 树点文件 → 中栏 file tab + 可编辑预览 + /file/$ URL", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();

  // 进项目工作台（桌面）。
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  // middle tab [文件]（projectsNav 内）→ 左栏项目内文件树（FilesLeftPanel scope=project，
  // enablePreview=false 纯树，点文件→中栏开 file tab）。Phase 3：项目局部文件走 middle tab [文件]。
  await page
    .getByRole("navigation", { name: "Projects", exact: true })
    .getByRole("button", { name: "Files", exact: true })
    .click();

  // 左栏文件树渲染（与 inspection 同源 FileEntryList，aria-label "Project files"）。限定左栏
  // aside（DOM 第 2 个 complementary：活动栏=0/左栏=1/右栏=2），避免与右栏 RightPanelTabs files
  // inspection 另一份 FilesPanel 同 ListGroup aria-label 歧义。
  const files = page.getByRole("complementary").nth(1).getByLabel("Project files");
  await expect(files).toBeVisible();
  await expect(files.getByRole("button", { name: /src/ }).first()).toBeVisible();

  // 进 src 目录。
  await files.getByRole("button", { name: /src/ }).first().click();
  await expect(files.getByRole("button", { name: /index\.ts/ }).first()).toBeVisible();

  // 点 index.ts → onOpenFile → 中栏开 file tab + focus /file/$path。
  await files
    .getByRole("button", { name: /index\.ts/ })
    .first()
    .click();

  // URL 切到 file focus splat（_splat = src/index.ts）。middle tab [文件] 的 ?tab=files 进 URL
  // 后被 onOpenFile navigate 保留，故 file focus URL = .../file/src/index.ts?tab=files，pattern
  // 需容许 ?query 后缀（`(\?|$)` 锚定 index.ts 后跟 query 或结尾）。
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}/file/src/index\\.ts(\\?|$)`));

  // 中栏 FileTabPreview 渲染（复用 FilePreviewPanel，aria-label "File preview"）。
  // file tab 已被激活（focus effect ensureTabOpenLeaf + setActiveTab），PanelRouter file
  // 分支渲染 FileTabPreview —— 预览可见即证明 tab 开 + active + 面板挂载三态闭环。
  await expect(page.getByLabel("File preview")).toContainText("fileBrowserE2e");

  // file tab 出现在 group tab 栏：TabChip 的 minimize 按钮（aria-label "Minimize"，
  // workbench.tabMinimize 仅 TabChip 使用）。首次点文件只开一个 tab，其可见即证明 tab 已渲染
  //（session tab 此时尚未创建，不会误判）。
  await expect(page.getByRole("button", { name: /^Minimize$/ })).toBeVisible();
});

/**
 * 全局文件 tab（设计 workbench-stable-refactor Phase 3）：活动栏 [文件] → /files 全局文件树 →
 * 点文件 → 中栏开 file tab（全路径 tabId）→ URL 切到 /files/file/$ 全路径 splat。FileTabPreview
 * 内部 resolveRootBrowseTarget 解析项目名走 project preview API（无需新 endpoint）。
 */
test("file nav: 活动栏 [文件] 全局树点文件 → 中栏 file tab + /files/file/$ 全路径 URL", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();

  // 活动栏 [文件] → /files 全局文件视图（rootBrowse 根目录列项目目录）。
  await page
    .getByRole("navigation", { name: "Primary navigation", exact: true })
    .getByRole("button", { name: "Files", exact: true })
    .click();
  await expect(page).toHaveURL(/\/files$/);

  // 左栏全局文件树（FilesLeftPanel rootBrowse，aria-label "Project files"）。
  const files = page.getByRole("complementary").nth(1).getByLabel("Project files");
  await expect(files.getByRole("button", { name: projectName, exact: true })).toBeVisible();

  // 进项目目录 → 进 src → 点 index.ts。
  await files.getByRole("button", { name: projectName, exact: true }).click();
  await files.getByRole("button", { name: /src/ }).first().click();
  await files
    .getByRole("button", { name: /index\.ts/ })
    .first()
    .click();

  // URL 切到 /files/file/$ 全路径（_splat = demo/src/index.ts）。
  await expect(page).toHaveURL(new RegExp(`/files/file/${projectName}/src/index\\.ts(\\?|$)`));

  // 中栏 FileTabPreview 渲染（与项目文件 tab 同组件，resolveRootBrowseTarget 解析项目名）。
  await expect(page.getByLabel("File preview")).toContainText("fileBrowserE2e");
});
