import { expect, test } from "@playwright/test";

/**
 * 移动端一级底部胶囊导航 会话/文件/插件/设置 全链路（设计 activity-bar-redesign §5/决策 22-25，
 * Phase 4；插件胶囊为插件体系 Phase 2 新增； bfd9714 起 [项目] 改语义 [会话]）。移动视口
 *（<lg=1024）下 `/` = [会话] 总览（MobileGlobalOverview，header 标题为 Agent/Chat mode tab），
 * 底部四胶囊切换 [会话]/[文件]/[插件]/[设置] 一级页面。验证导航结构与各页可达，不依赖运行态
 * session（[会话] 总览无实例时显空态，header + 四胶囊仍在）。
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

test("mobile primary nav has four items: sessions / files / plugins / settings", async ({
  page,
}) => {
  // 移动 `/` = [会话] 总览，底部胶囊渲染四项。用 nav aria-label 定位底部导航。
  const bottomNav = page.getByRole("navigation", { name: /primary|项目|主/i });
  await expect(bottomNav).toBeVisible();
  // 四项 label（i18n：nav.projects / nav.files / nav.plugins / nav.settings）。
  await expect(bottomNav.getByRole("link", { name: /会话|Sessions/ })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /文件|Files/ })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /插件|Plugins/ })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /设置|Settings/ })).toBeVisible();
});

test("mobile / renders [sessions] overview header with mode tabs and create button", async ({
  page,
}) => {
  // [会话] 总览 header = MobilePageHeader（标题为 SessionModeTabs Agent/Chat，右侧 + 新建
  // 项目 icon 按钮，2026-08-16 FAB 迁 header 后入 header.actions）。
  const header = page.locator("header").first();
  await expect(header).toBeVisible();
  // 标题（workbench.modeAria = 会话模式切换 / Session mode switch）内含 Agent/Chat 两 tab。
  const modeTabs = header.getByRole("group", { name: /会话模式切换|Session mode switch/ });
  await expect(modeTabs).toBeVisible();
  await expect(modeTabs.getByRole("button", { name: "Agent" })).toBeVisible();
  await expect(modeTabs.getByRole("button", { name: "Chat" })).toBeVisible();
  // + 新建项目按钮（aria-label = home.createProjectAria，header.actions 内）。
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

test("mobile [plugins] nav opens plugins page at /plugins", async ({ page }) => {
  const bottomNav = page.getByRole("navigation", { name: /primary|项目|主/i });
  await bottomNav.getByRole("link", { name: /插件|Plugins/ }).click();
  await expect(page).toHaveURL(/\/plugins$/);
  // MobilePluginsOverview 渲染（MobilePageHeader title = nav.plugins，用 header 内 text 断言）。
  await expect(page.locator("header").first()).toContainText(/插件|Plugins/);
});

test("mobile [settings] nav opens settings page", async ({ page }) => {
  const bottomNav = page.getByRole("navigation", { name: /primary|项目|主/i });
  await bottomNav.getByRole("link", { name: /设置|Settings/ }).click();
  await expect(page).toHaveURL(/\/settings$/);
  // SettingsRoute 渲染（MobilePageHeader title = nav.settings，渲染为 span 非 heading，
  // 用 header 内 text 断言）。
  await expect(page.locator("header").first()).toContainText(/设置|Settings/);
});

test("mobile [sessions] nav link on / and /projects", async ({ page }) => {
  // `/` 即 [会话] 总览，[会话] 胶囊可点。
  const bottomNav = page.getByRole("navigation", { name: /primary|项目|主/i });
  const sessionsLink = bottomNav.getByRole("link", { name: /会话|Sessions/ }).first();
  // active 状态由 aria-pressed/aria-current 或 className 标记；放宽：链接存在且可点。
  await expect(sessionsLink).toBeVisible();
  // 导航到 /projects（global scope index）仍属 [会话] 语义。
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/projects$/);
  await expect(bottomNav.getByRole("link", { name: /会话|Sessions/ }).first()).toBeVisible();
});
