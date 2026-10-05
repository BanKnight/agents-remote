import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

/**
 * file nav（设计 §4.2 决策 16 + workbench-stable-refactor Phase 3）。
 *
 * §6.12j 批次 3 检视 IA 收敛：左栏 middle tab [文件] 已删除（项目内文件检视归右栏 Inspector，
 * 只读浏览语义，不开中栏 tab）；「点文件开中栏 file tab」桌面链路走全局文件页。
 * §6.12k 合并 side：footnav 三项（All Files/Plugins/Settings）成唯一一级导航——4 目的地
 * 活动栏退役，[文件] 入口 = footnav All Files（en）。
 */

test("file nav: footnav 全局文件 → 全局树点文件 → 主区推入态预览 + /files/file/$ 全路径 URL", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // footnav [All Files] → /files 全局文件视图（rootBrowse 根目录列项目目录）。
  await page.locator("nav.side .footnav button", { hasText: "All Files" }).click();
  await expect(page).toHaveURL(/\/files$/);

  // 全局文件树（§6.10-9：/files = main 整页 mainPage 的 GlobalFilesOverview，side 恒定）。
  // 根层 = 10m 卡形态（§6.12j 批次 4）：项目行可访问名 = 项目名 + 统计副行（如
  // "demo 2 instances · active just now"，overview candidates 按项目聚合）——同一套 e2e 跑内
  // 前序 spec（terminal-session/drag-source）建的实例泄漏进本 spec 环境，后缀随实例数浮动，
  // 禁 exact（单跑干净环境恰好命中 "demo" 是 order-dependent 假绿，全套实测挂过）。
  // substring + "Project files" 容器限定（隔离环境项目唯一）足够。
  // ⚠️ 点文件后 focusId 生效、mainPage 失效（§6.12k：中栏 = InstanceArea file tab，mainPage
  // 树整体消失）；此测试后续不再消费 files locator，追加断言须重新限定区域防 strict violation。
  const files = page.getByLabel("Project files");
  await expect(files.getByRole("button", { name: projectName })).toBeVisible();

  // 进项目目录 → 进 src → 点 index.ts。
  await files.getByRole("button", { name: projectName }).click();
  await files.getByRole("button", { name: /src/ }).first().click();
  await files
    .getByRole("button", { name: /index\.ts/ })
    .first()
    .click();

  // URL 切到 /files/file/$ 全路径（_splat = demo/src/index.ts；v1.5 批 4 起 sticky 透传
  // leftMode=files = 10m2 主区推入态）。
  await expect(page).toHaveURL(new RegExp(`/files/file/${projectName}/src/index\\.ts(\\?|$)`));

  // v1.5 批 4（10m2，mac-files-global-preview）：/files mainPage 点文件 = 主区推入预览
  //（mback + h1 mono 文件名 + FilePreviewPane；不写中栏 layout，「在工作台打开」才进中栏
  // tab）。与项目文件 tab 同组件，resolveRootBrowseTarget 解析项目名。
  await expect(page.locator("h1.font-mono")).toHaveText("index.ts");
  await expect(page.locator('[data-role="file-preview-pane"]')).toContainText("fileBrowserE2e");
});
