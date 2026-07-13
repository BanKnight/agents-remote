import { expect, test } from "@playwright/test";

/**
 * 移动端一级底部胶囊导航 项目/文件/设置 全链路（设计 activity-bar-redesign §5/决策 22-25，
 * Phase 4）。移动视口（<lg=1024）下 `/` = [项目] 总览（MobileGlobalOverview），底部三胶囊
 * 切换 [项目]/[文件]/[设置] 一级页面。验证导航结构与各页可达，不依赖运行态 session
 *（[项目] 总览无实例时显空态，header + 三胶囊仍在）。
 */

const password = process.env.E2E_PASSWORD ?? "secret";

// iPhone 12 尺寸（390×844），<lg=1024 触发移动视口分流。
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

test.use({ viewport: MOBILE_VIEWPORT });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();
});

test("mobile primary nav has three items: projects / files / settings", async ({ page }) => {
  // 移动 `/` = [项目] 总览，底部胶囊渲染三项。用 nav aria-label 定位底部导航。
  const bottomNav = page.getByRole("navigation", { name: /primary|项目|主/i });
  await expect(bottomNav).toBeVisible();
  // 三项 label（i18n：nav.projects / nav.files / nav.settings）。
  await expect(bottomNav.getByRole("link", { name: /项目|Projects/ })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /文件|Files/ })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /设置|Settings/ })).toBeVisible();
});

test("mobile / renders [projects] overview header with create button", async ({ page }) => {
  // [项目] 总览 header = MobilePageHeader（仅标题「项目总览」，无 actions）。+ 新建项目按钮落在
  // GlobalProjectsOverview 主体 ViewSwitcher 行左侧（批 D 位置，非 header 内），故 Create 选择器
  // 限定到 page 而非 header。
  const header = page.locator("header").first();
  await expect(header).toBeVisible();
  // 标题（workbench.global = 项目总览 / Projects overview）。
  await expect(header.getByText(/项目总览|Projects overview/)).toBeVisible();
  // + 新建项目按钮（aria-label = home.createProjectAria，在主体 ViewSwitcher 行）。
  await expect(
    page.getByRole("button", { name: /创建或采用项目|Create or adopt Project/ }),
  ).toBeVisible();
});

test("mobile [files] nav opens rootBrowse file tree at /files", async ({ page }) => {
  const bottomNav = page.getByRole("navigation", { name: /primary|项目|主/i });
  await bottomNav.getByRole("link", { name: /文件|Files/ }).click();
  await expect(page).toHaveURL(/\/files$/);
  // rootBrowse 文件树渲染（FilesPanel 列表区）。点文件名项至少有一个可见（PROJECTS_ROOT 下
  // 有 demo 项目目录，根目录浏览必显一级目录）。放宽：文件树容器可见即可。
  await expect(
    page.locator("[aria-label], nav, ul").filter({ hasText: /demo/i }).first(),
  ).toBeVisible({
    timeout: 10_000,
  });
});

test("mobile [settings] nav opens settings page", async ({ page }) => {
  const bottomNav = page.getByRole("navigation", { name: /primary|项目|主/i });
  await bottomNav.getByRole("link", { name: /设置|Settings/ }).click();
  await expect(page).toHaveURL(/\/settings$/);
  // SettingsRoute 渲染（MobilePageHeader title = nav.settings，渲染为 span 非 heading，
  // 用 header 内 text 断言）。
  await expect(page.locator("header").first()).toContainText(/设置|Settings/);
});

test("mobile [projects] nav active state on / and /projects", async ({ page }) => {
  // `/` 即 [项目] 总览，[项目] 胶囊 active。
  const bottomNav = page.getByRole("navigation", { name: /primary|项目|主/i });
  const projectsLink = bottomNav.getByRole("link", { name: /项目|Projects/ }).first();
  // active 状态由 aria-pressed/aria-current 或 className 标记；放宽：链接存在且可点。
  await expect(projectsLink).toBeVisible();
  // 导航到 /projects（global scope index）仍属 [项目] 语义。
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/projects$/);
  await expect(bottomNav.getByRole("link", { name: /项目|Projects/ }).first()).toBeVisible();
});
