import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

/**
 * Phase 2b file nav（设计 §4.2 决策 16）：桌面工作台点 ActivityBar [文件] → 左栏文件树 →
 * 点文件 → 中栏开 file tab（与 session tab 同 group+tab）→ FileTabPreview 可编辑预览 →
 * URL 切到 /projects/$key/file/$path splat。回归 session tab 不受影响由其他 spec 覆盖。
 */
test("file nav: ActivityBar [文件] → 树点文件 → 中栏 file tab + 可编辑预览 + /file/$ URL", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();

  // 进项目工作台（桌面）。
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  // 点 ActivityBar [文件] → 左栏切文件树（FilesLeftPanel，enablePreview=false 纯树）。
  await page
    .getByRole("button", { name: /^Files$/ })
    .first()
    .click();

  // 左栏文件树渲染（与 inspection 同源 FileEntryList，aria-label "Project files"）。
  const files = page.getByLabel("Project files");
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

  // URL 切到 file focus splat（_splat = src/index.ts）。
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}/file/src/index\\.ts$`));

  // 中栏 FileTabPreview 渲染（复用 FilePreviewPanel，aria-label "File preview"）。
  // file tab 已被激活（focus effect ensureTabOpenLeaf + setActiveTab），PanelRouter file
  // 分支渲染 FileTabPreview —— 预览可见即证明 tab 开 + active + 面板挂载三态闭环。
  await expect(page.getByLabel("File preview")).toContainText("fileBrowserE2e");

  // file tab 出现在 group tab 栏：TabChip 的 minimize 按钮（aria-label "Minimize"，
  // workbench.tabMinimize 仅 TabChip 使用）。首次点文件只开一个 tab，其可见即证明 tab 已渲染
  //（session tab 此时尚未创建，不会误判）。
  await expect(page.getByRole("button", { name: /^Minimize$/ })).toBeVisible();
});
