import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

/**
 * file nav（设计 §4.2 决策 16 + workbench-stable-refactor Phase 3）。
 *
 * §6.12j 批次 3 检视 IA 收敛：左栏 middle tab [文件] 已删除（左栏只留 实例/历史/插件），项目内
 * 文件检视归右栏 Inspector（FilesPanel，只读浏览语义，不开中栏 tab）；「点文件开中栏 file tab」
 * 桌面链路改走全局文件页（下方 test 2，rootBrowse 进项目）。原「middle tab [文件] → 左栏树 →
 * 中栏 tab」链路测试随收敛移除（收敛裁定记 redesign-v2.md §6.12j）。
 */

test("file nav: 活动栏 [文件] 全局树点文件 → 中栏 file tab + /files/file/$ 全路径 URL", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // 活动栏 [文件] → /files 全局文件视图（rootBrowse 根目录列项目目录）。
  await page
    .getByRole("navigation", { name: "Primary navigation", exact: true })
    .getByRole("button", { name: "Files", exact: true })
    .click();
  await expect(page).toHaveURL(/\/files$/);

  // 全局文件树（v2 IA 批次 d §6.10-9：/files = main 整页 mainPage 的 GlobalFilesOverview，
  // 左栏保持 sidewin 项目总览）。mainPage 态 "Project files" 全局唯一在 main 区，不限 aside。
  // ⚠️ 点文件后 focusId 生效、mainPage 失效，leftMode=files 粘性让左栏变回 GlobalFilesOverview
  //（WorkbenchRoute leftPanel 末分支）→ 页面出现第二棵 "Project files"；此测试后续不再消费
  // files locator，追加断言须重新限定区域防 strict violation。
  const files = page.getByLabel("Project files");
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
