import { expect, test, type Page } from "@playwright/test";

/**
 * §6.12k 合并 side（第十一轮问题 2：4 列 → 3 列，05/04 原型恒定 side 单栏）桌面结构断言。
 *
 * side 自上而下：项目组（ghead「Projects」+ srow2 项目行：可访问名 = 名称 + live 徽章，title
 * 属性 = 项目名）→ seg4 mini（tab Project/All，仅 project scope）→ 实例区（组头
 * `Instances · <name>` + 时钟 View session history + New session plus + srow2 inst 行）→
 * footnav 三项（All Files / Plugins / Settings，active = .on class，无 aria-current）。
 *
 * 已退役断言对象（勿复活）：middle tab bar（Overview/History/Plugins 切左栏主体）、4 目的地
 * 活动栏（Projects/Workbench/Files/Plugins 按钮列）。原型 05 工作台态 footnav 0 项 active；
 * mainPage 三页才各有 .on。
 */

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
});

// §6.12k side nav（aria-label = nav.primaryAria = "Primary navigation"，aria 语义沿用）。
const side = (page: Page) => page.locator("nav.side");

// 项目行定位器：title 属性 = 项目名，项目行独有（实例行/组头无 title）。
const projectRow = (page: Page) => page.locator(`nav.side .srow2[title="${projectName}"]`);

test("project scope: side 结构（项目行选中 + seg4 + 实例组头 + footnav 三项）", async ({
  page,
}) => {
  await projectRow(page).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  // 项目行选中态：aria-current="page"（selrow 视觉由 class 承载，aria 语义这里断）。
  await expect(projectRow(page)).toHaveAttribute("aria-current", "page");

  // seg4 mini：恰 2 段（Project 选中 / All），scope 维度非 middle tab。
  const seg4 = side(page).getByRole("tablist", { name: "Instances" });
  await expect(seg4.getByRole("tab", { name: "Project", exact: true })).toBeVisible();
  await expect(seg4.getByRole("tab", { name: "All", exact: true })).toBeVisible();
  await expect(seg4.getByRole("tab", { name: "Project", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // 实例组头：「Instances · demo」（workbench.instancesGroupTitle）+ 时钟 + plus。
  await expect(side(page).getByText(`Instances · ${projectName}`)).toBeVisible();
  await expect(side(page).getByRole("button", { name: "View session history" })).toBeVisible();
  await expect(side(page).getByRole("button", { name: "New session" })).toBeVisible();

  // footnav 三项存在；工作台态 0 项 active（原型 05）。
  const footnav = side(page).locator(".footnav button");
  await expect(footnav.filter({ hasText: "All Files" })).toBeVisible();
  await expect(footnav.filter({ hasText: "Plugins" })).toBeVisible();
  await expect(footnav.filter({ hasText: "Settings" })).toBeVisible();
  const activeCount = await footnav.evaluateAll(
    (els) => els.filter((el) => el.className.includes("on")).length,
  );
  expect(activeCount).toBe(0);

  // 退役对象不在：middle tab 三钮（Overview/History/Plugins）与活动栏 [Workbench] 不在 side。
  await expect(side(page).getByRole("button", { name: "Overview", exact: true })).toHaveCount(0);
  await expect(side(page).getByRole("button", { name: "History", exact: true })).toHaveCount(0);
  await expect(side(page).getByRole("button", { name: "Workbench", exact: true })).toHaveCount(0);
  await expect(side(page).getByRole("button", { name: "Files", exact: true })).toHaveCount(0);
});

test("seg4 切换跟随：点 All 高亮跟随 + body 视图同步（用户复验反馈④：内容变了 tab 不变）", async ({
  page,
}) => {
  await projectRow(page).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  const seg4 = side(page).getByRole("tablist", { name: "Instances" });
  const projectTab = seg4.getByRole("tab", { name: "Project", exact: true });
  const allTab = seg4.getByRole("tab", { name: "All", exact: true });

  // 点 All：高亮跟随（aria + .on 双断言）+ body 切 05g 全部分组（`<name> · <count>`
  // microlabel 遍历全部项目——项目视图的分组只有 Agent sessions/Terminal，无项目名）。
  await allTab.click();
  await expect(allTab).toHaveAttribute("aria-selected", "true");
  await expect(projectTab).toHaveAttribute("aria-selected", "false");
  await expect(allTab).toHaveClass(/on/);
  await expect(projectTab).not.toHaveClass(/on/);
  await expect(side(page).locator(".microlabel").filter({ hasText: projectName })).toBeVisible();

  // 点 Project：反向——高亮回 Project + body 回本项目实例分组（组头不变恒
  // 「Instances · demo」，区分度在 body：Agent sessions 分组或空态引导行）。
  await projectTab.click();
  await expect(projectTab).toHaveAttribute("aria-selected", "true");
  await expect(allTab).toHaveAttribute("aria-selected", "false");
  await expect(
    side(page)
      .getByText(/Agent sessions|No active sessions/)
      .first(),
  ).toBeVisible();
});

test("footnav 三项导航 + active .on 跟随（All Files→/files、Plugins→/plugins、Settings→leftMode）", async ({
  page,
}) => {
  const footnav = side(page).locator(".footnav button");

  // All Files → /files，.on 跟随。§6.12k review P2③：mainPage 态 side 恒定（07m/09m/10m
  // 「side 仅遮盖主区」）——由 workbenchLastProjectAtom 驱动，seg4（Project on）仍在。
  await footnav.filter({ hasText: "All Files" }).click();
  await expect(page).toHaveURL(/\/files$/);
  await expect(footnav.filter({ hasText: "All Files" })).toHaveClass(/on/);
  await expect(side(page).getByRole("tab", { name: "Project", exact: true })).toBeVisible();

  // Plugins → /plugins。
  await footnav.filter({ hasText: "Plugins" }).click();
  await expect(page).toHaveURL(/\/plugins$/);
  await expect(footnav.filter({ hasText: "Plugins" })).toHaveClass(/on/);

  // Settings → /projects?leftMode=settings（mainPage 07m）。
  await footnav.filter({ hasText: "Settings" }).click();
  await expect(page).toHaveURL(/leftMode=settings/);
  await expect(footnav.filter({ hasText: "Settings" })).toHaveClass(/on/);
});

test("scope 优先级：/files mainPage 点项目行回工作台（scope 优先，树消失）", async ({ page }) => {
  // footnav 进 /files mainPage：树在 main 区（side 外）。
  await side(page).locator(".footnav button", { hasText: "All Files" }).click();
  await expect(page).toHaveURL(/\/files$/);
  const tree = page.getByLabel("Project files");
  await expect(tree).toBeVisible();

  // 点 side 项目行 → /projects/demo（scope 优先），mainPage 退出、rootBrowse 树消失。
  await projectRow(page).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));
  await expect(tree).toHaveCount(0);
  await expect(projectRow(page)).toHaveAttribute("aria-current", "page");
});

test("project ↔ /files: WorkbenchShell <main> stays mounted (no WS reconnect)", async ({
  page,
}) => {
  await projectRow(page).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  // 在 WorkbenchShell 根 <main> 上打 marker。DOM 节点若被 React 卸载重建，marker 丢失。
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (main) main.setAttribute("data-e2e-shell-persist", "1");
  });

  // project → /files（footnav All Files）→ 点项目行回工作台。同一 <main> DOM 节点存活
  //（marker 仍在）→ WorkbenchShell 从未卸载 → InstanceArea（含终端 WS/xterm）保活。
  await side(page).locator(".footnav button", { hasText: "All Files" }).click();
  await expect(page).toHaveURL(/\/files$/);
  await projectRow(page).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}`));

  const survived = await page.evaluate(
    () => document.querySelector("main")?.getAttribute("data-e2e-shell-persist") === "1",
  );
  expect(survived).toBe(true);
});
