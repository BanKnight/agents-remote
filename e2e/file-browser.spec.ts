import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("authenticated user can browse Project files and preview text and images", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();

  // Desktop workbench: enter the project, then drive the Files **middle tab**
  // via the URL-visible ?tab=files state. Phase 3: middle tab [文件] renders
  // the project-local file tree in the **left panel** (FilesLeftPanel). The
  // desktop right panel inspection is currently empty (files/git moved to
  // left middle tab + center tab), so "Project files" renders only in the
  // left panel; all file-tree selectors are scoped to the left panel aside
  // (DOM 第 2 个 complementary: 活动栏=0/左栏=1/右栏=2) for precise targeting. File preview 用 getByRole("region")
  //（visibility-aware）：中栏 keep-alive 多 file tab 时，inactive tab 的 FileTabPreview
  // 仍挂载（display:none 保 WebSocket/relay 长连 §7.4），DOM 内多个 <section aria-label=
  // "File preview">；getByLabel 不过滤 hidden 会命中多个（strict mode），而 getByRole
  //("region") 默认排除 hidden → 只命中活动 tab 的可见预览。
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible();
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  await page.goto(`/projects/${projectName}?tab=files`);
  const files = page.getByRole("complementary").nth(1).getByLabel("Project files");
  await expect(files).toBeVisible();

  await expect(files.getByRole("button", { name: /src/ }).first()).toBeVisible();
  await expect(files.getByRole("button", { name: /README\.md/ }).first()).toBeVisible();
  // Dot-files stay visible (fd424ff 最小黑名单：只藏 .git，其余 dot 项让用户能检查
  // 插件配置文件)；.git 是唯一黑名单项，不出现在列表。每行有 row div + actions
  // trigger 两个带名字的 button，用 .first() 规避 strict mode。
  await expect(files.getByRole("button", { name: /\.config/ }).first()).toBeVisible();
  await expect(files.getByRole("button", { name: /\.env\.example/ }).first()).toBeVisible();
  await expect(files.getByRole("button", { name: /\.git$/ })).toHaveCount(0);

  const rootNames = await files
    .locator("[data-list-row-title]")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
  // 目录在前（.config/src），文件按 localeCompare（.env.example 首位）。
  expect(rootNames).toEqual([
    ".config",
    "src",
    ".env.example",
    "logo.svg",
    "notes.txt",
    "README.md",
  ]);

  await files.getByRole("button", { name: /src/ }).first().click();
  await expect(files.getByRole("button", { name: /index\.ts/ }).first()).toBeVisible();
  await files
    .getByRole("button", { name: /index\.ts/ })
    .first()
    .click();
  await expect(page.getByRole("region", { name: "File preview" })).toContainText("fileBrowserE2e");

  await page.getByRole("complementary").nth(1).getByRole("button", { name: "Root" }).click();
  await files
    .getByRole("button", { name: /README\.md/ })
    .first()
    .click();
  await expect(page.getByRole("region", { name: "File preview" })).toContainText(
    "file-browser-e2e-text-ok",
  );

  await files
    .getByRole("button", { name: /logo\.svg/ })
    .first()
    .click();
  await expect(page.getByRole("img", { name: "logo.svg" })).toBeVisible();
});
