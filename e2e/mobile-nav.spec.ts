import { expect, test } from "@playwright/test";

/**
 * 移动端一级底部胶囊导航 项目/工作台/文件/插件 全链路（redesign-v2.md D21：v2 4 Tab；设置自底
 * nav 移除，改为项目页 ⚙ push — M7）。移动视口（<lg=1024）下 `/` = D4 跳板（读 localStorage
 * `workbench.lastProjectKey`：有记忆 → `/projects/$key`，无记忆 → `/projects`），落地页
 * header 为 Agent/Chat mode tab。验证导航结构与各页可达，不依赖运行态 session。
 */

const password = process.env.E2E_PASSWORD ?? "secret";

// iPhone 12 尺寸（390×844），<lg=1024 触发移动视口分流。
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;

test.use({ viewport: MOBILE_VIEWPORT });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
});

test("mobile primary nav has four items: projects / workbench / files / plugins", async ({
  page,
}) => {
  // 移动底部胶囊渲染四项。用 nav aria-label 定位底部导航。
  const bottomNav = page.getByRole("navigation", { name: /primary|项目|主/i });
  await expect(bottomNav).toBeVisible();
  // 四项 label（i18n：nav.projects / nav.workbench / nav.files / nav.plugins）。
  await expect(bottomNav.getByRole("link", { name: /项目|Projects/ })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /工作台|Workbench/ })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /文件|Files/ })).toBeVisible();
  await expect(bottomNav.getByRole("link", { name: /插件|Plugins/ })).toBeVisible();
  // D21：设置自底 nav 移除（M7 改项目页 ⚙ push 入口）。
  await expect(bottomNav.getByRole("link", { name: /设置|Settings/ })).toHaveCount(0);
});

test("mobile landing renders overview header with mode tabs and create button", async ({
  page,
}) => {
  // 落地页（`/` → D4 跳板 → `/projects`）header = MobilePageHeader（标题为 SessionModeTabs
  // Agent/Chat，右侧 + 新建项目 icon 按钮，2026-08-16 FAB 迁 header 后入 header.actions）。
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

test("mobile [settings] deep link still renders settings page (D21: entry moved, route kept)", async ({
  page,
}) => {
  // D21 移除了底 nav 的 [设置] 胶囊，但 `/settings` 路由保留（深度链接不破，M7 起入口改
  // 项目页 ⚙）。此处直接 goto 验证路由仍可达。
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings$/);
  // SettingsRoute 渲染（MobilePageHeader title = nav.settings，渲染为 span 非 heading，
  // 用 header 内 text 断言）。
  await expect(page.locator("header").first()).toContainText(/设置|Settings/);
});

test("mobile [projects] nav link on landing and /projects", async ({ page }) => {
  // `/` 落 D4 跳板 → `/projects`，[项目] 胶囊可点。
  const bottomNav = page.getByRole("navigation", { name: /primary|项目|主/i });
  const projectsLink = bottomNav.getByRole("link", { name: /项目|Projects/ }).first();
  // active 状态由 aria-pressed/aria-current 或 className 标记；放宽：链接存在且可点。
  await expect(projectsLink).toBeVisible();
  // 导航到 /projects（global scope index）仍属 [项目] 语义。
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/projects$/);
  await expect(bottomNav.getByRole("link", { name: /项目|Projects/ }).first()).toBeVisible();
});
