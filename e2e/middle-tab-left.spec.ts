import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3：middle tab bar（实例/历史/文件/git）从中栏顶部移到左栏顶部（project scope），
 * 切换**左栏主体**内容，中栏 group+tab 常驻不随 middle tab 变（设计 activity-bar-redesign
 * §4.2 进入项目层 / §6 决策 26）。
 *
 * 桌面视口（≥lg=1024）下：project scope（/projects/$key）→ ProjectLeftPanel 左栏顶部 middle tab bar
 *（Overview/History/Files/Git）切左栏主体；global scope（/projects）无 middle tab bar；活动栏 [文件]
 * = 全局 rootBrowse（PROJECTS_ROOT 根目录），与 middle tab [文件]（项目内文件）作用域互斥。
 * e2e 默认 en-US → 英文 label（Overview/History/Files/Git/Projects/Primary navigation）。
 *
 * selector 注意：project scope 右栏 RightPanelTabs 始终渲染 files inspection（另一份 FilesPanel），
 * 故 `getByLabel("Project files")` 全局会命中左栏 + 右栏两份。所有左栏文件树断言用 leftPanelFiles
 *（限定左栏 aside = DOM 第 2 个 complementary：活动栏=0/左栏=1/右栏=2）避免歧义。
 */

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();
});

// ProjectLeftPanel nav（aria-label = workbench.projectsAria = "Projects"，en）。作用域限定 middle tab
// 按钮，避免与活动栏 [文件]（aria-label = nav.files = "Files"，ActivityBar nav "Primary navigation" 内）同名歧义。
const projectsNav = (page: Page) => page.getByRole("navigation", { name: "Projects", exact: true });

// 活动栏 nav（aria-label = nav.primaryAria = "Primary navigation"，en）。
const activityBar = (page: Page) =>
  page.getByRole("navigation", { name: "Primary navigation", exact: true });

// 左栏 aside（DOM 第 2 个 complementary：活动栏=0/左栏=1/右栏=2）。限定左栏文件树，避免与右栏
// RightPanelTabs files inspection（project scope 另一份 FilesPanel ListGroup "Project files"）歧义。
const leftPanelFiles = (page: Page) =>
  page.getByRole("complementary").nth(1).getByLabel("Project files");

test("project scope: middle tab bar (Overview/History/Files/Git) in left panel", async ({
  page,
}) => {
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  const nav = projectsNav(page);
  // 4 个 middle tab 按钮（workbench.tabOverview/History/Files/Git）。
  await expect(nav.getByRole("button", { name: "Overview", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "History", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Files", exact: true })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Git", exact: true })).toBeVisible();
});

test("middle tab [Files] switches left body to project file tree", async ({ page }) => {
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await projectsNav(page).getByRole("button", { name: "Files", exact: true }).click();

  // 左栏主体 = FilesLeftPanel scope=project（FilesPanel ListGroup aria-label="Project files"）。
  // 项目内文件树含 README.md / src（run-e2e demo 项目结构）。
  const files = leftPanelFiles(page);
  await expect(files.getByRole("button", { name: /README\.md/ }).first()).toBeVisible();
  await expect(files.getByRole("button", { name: /src/ }).first()).toBeVisible();
});

test("middle tab [Git] switches left body to GitDiffPanel", async ({ page }) => {
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await projectsNav(page).getByRole("button", { name: "Git", exact: true }).click();

  // 左栏主体 = GitDiffPanel（ListGroup aria-label="Git changed files"）。右栏 RightPanelTabs 默认
  // files inspection（非 git），故 Git changed files 全局唯一，无需左栏限定。
  await expect(page.getByLabel("Git changed files")).toBeVisible();
});

test("switching middle tabs swaps left body (Files body unmounts on History)", async ({ page }) => {
  await page.getByRole("button", { name: projectName, exact: true }).click();
  const nav = projectsNav(page);

  // 切 [文件] → 左栏 FilesLeftPanel（Project files）出现。
  await nav.getByRole("button", { name: "Files", exact: true }).click();
  await expect(leftPanelFiles(page)).toBeVisible();

  // 切 [历史] → 左栏主体切到 HistoryList（demo 无历史 session → 空态 null），FilesLeftPanel 卸载
  // → 左栏 Project files 消失。验证 middle tab 切换确实换左栏主体（左栏限定，不受右栏 files 影响）。
  await nav.getByRole("button", { name: "History", exact: true }).click();
  await expect(leftPanelFiles(page)).toHaveCount(0);
});

test("middle column InstanceArea stays mounted across middle tab switches", async ({ page }) => {
  await page.getByRole("button", { name: projectName, exact: true }).click();

  // 空态提示（workbench.emptyInstanceHint = "No active sessions..."）。切 middle tab 前（overview）：
  // 左栏 InstanceLeftOverview（overview tab body 空态）+ 中栏 InstanceArea（空态）各一处 → 2 处。
  const emptyHint = page.getByText("No active sessions");
  await expect(emptyHint).toHaveCount(2);

  // 切 middle tab [文件] → 左栏主体换 FilesLeftPanel（emptyHint 在左栏消失）；中栏 InstanceArea 不变
  //（emptyHint 保留）→ 1 处。count 2→1 精确刻画"左栏换主体 + 中栏 group+tab 常驻不随 tab 变"。
  await projectsNav(page).getByRole("button", { name: "Files", exact: true }).click();
  await expect(leftPanelFiles(page)).toBeVisible();
  await expect(emptyHint).toHaveCount(1);
});

test("global scope: no middle tab bar in left panel", async ({ page }) => {
  // /projects（global scope，[项目] 总览）→ ProjectLeftPanel 左栏无 middle tab（global 无 history/git，
  // files 归活动栏 nav=files）。nav 内只有 GlobalNavNode + 项目列表。
  await page.goto("/projects");
  const nav = projectsNav(page);
  await expect(nav.getByRole("button", { name: "Overview", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Files", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("button", { name: "Git", exact: true })).toHaveCount(0);
});

test("activity bar [Files] shows global rootBrowse, not project-local files", async ({ page }) => {
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  // 活动栏 [文件]（ActivityBar nav "Primary navigation" 内，aria-label = nav.files = "Files"）。
  // 决策 26③：nav=files 固定 FilesLeftPanel scope=global（rootBrowse 全局根目录），不论 WorkbenchScope。
  await activityBar(page).getByRole("button", { name: "Files", exact: true }).click();

  // URL 不变（活动栏 nav 是 atom，不进 URL；仍 /projects/demo）。
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  // 左栏 = rootBrowse 全局根目录（PROJECTS_ROOT 根）。根目录列一级项目目录（demo），**不含**
  // 项目内文件（src/README.md）—— 与 middle tab [文件]（项目内文件）作用域互斥。
  const rootFiles = leftPanelFiles(page);
  await expect(rootFiles.getByRole("button", { name: projectName, exact: true })).toBeVisible();
  await expect(rootFiles.getByRole("button", { name: /README\.md/ })).toHaveCount(0);
  await expect(rootFiles.getByRole("button", { name: /^src$/ })).toHaveCount(0);
});
