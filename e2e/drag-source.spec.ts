import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

/**
 * 拖动源泛化（设计 §7.2，2026-07-19）：文件树文件行拖到中栏 → onCardDragStart → dropIntoLeaf
 * + onDrop navigate 分支（WorkbenchRoute onDrop file ref → navigateToFile）→ 中栏 file tab +
 * /files/file/$ URL。
 *
 * §6.12j 批次 3 检视 IA 收敛后拖源链路：左栏 middle tab [文件] 已删，桌面上带 onCardDragStart
 * 的全局文件树保留在 leftMode=files 粘性态（/files/file/$ 深链透传 leftMode=files + focusId →
 * mainPageActive 失效 → WorkbenchRoute leftPanel 末分支渲染 GlobalFilesOverview 文件语境）。
 * 深链直接构造该态：中栏 = README.md file tab（GroupCell data-drop-group 作 drop target）+
 * 左栏 = 全局文件树（rootBrowse 根目录，带拖源）。
 *
 * 覆盖 e2e file-nav 未触达的「拖拽 onDrop」路径：pointerdown → move > DRAG_THRESHOLD_PX(4) →
 * onDragStart（dragState active，DropZoneOverlay 显示）→ move 到 GroupCell 中心（center zone）→
 * up → onDrop → dropIntoLeaf 加 tab + navigateToFile（URL 切到被拖文件，而非只进 layout）。
 */
test("drag-source: 文件行拖到中栏 → onDrop 开 file tab + URL（dropIntoLeaf + navigate）", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // 深链 /files/file/$?leftMode=files：file focus tab + 左栏全局文件树拖源态（粘性语义，
  // 见头注释）。左栏树初始在 PROJECTS_ROOT 根目录（列项目）。
  await page.goto(`/files/file/${projectName}/README.md?leftMode=files`);
  await expect(page).toHaveURL(new RegExp(`/files/file/${projectName}/README\\.md`));

  // 左栏 aside（DOM 第 2 个 complementary：活动栏=0/左栏=1/右栏=2）。global scope 右栏
  // Inspector Files 段也是 rootBrowse（同含 "Project files"），限定 nth(1) 防歧义。
  const leftFiles = page.getByRole("complementary").nth(1).getByLabel("Project files");
  await expect(leftFiles).toBeVisible();

  // 进项目目录（目录点击 = onOpenDirectory 内部导航，不改 URL）→ notes.txt 行可见。
  await leftFiles.getByRole("button", { name: projectName, exact: true }).click();
  await expect(leftFiles.getByRole("button", { name: /notes\.txt/ }).first()).toBeVisible();
  const minBefore = await page.getByRole("button", { name: /^Minimize$/ }).count();

  // 拖 notes.txt：pointer sequence（down → move >4px 触发 onDragStart → move 到 GroupCell 中心 → up）。
  const notes = leftFiles.getByRole("button", { name: /notes\.txt/ }).first();
  const sb = await notes.boundingBox();
  const gb = await page.locator("[data-drop-group]").first().boundingBox();
  if (!sb || !gb) throw new Error("拖拽源/落点 boundingBox 为 null");
  const sx = sb.x + sb.width / 2;
  const sy = sb.y + sb.height / 2;
  const tx = gb.x + gb.width / 2;
  const ty = gb.y + gb.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 8, sy + 8); // > DRAG_THRESHOLD_PX(4) → onDragStart → dragState active
  await page.mouse.move(tx, ty, { steps: 6 }); // 到 GroupCell 中心 → DropZoneOverlay center zone
  await page.mouse.up();

  // onDrop navigate 分支：URL 切到 notes.txt 全路径 splat（改前只进 layout 不更新 URL）。
  await expect(page).toHaveURL(new RegExp(`/files/file/${projectName}/notes\\.txt(\\?|$)`));
  // dropIntoLeaf 加 tab：Minimize 按钮数增加。
  const minAfter = await page.getByRole("button", { name: /^Minimize$/ }).count();
  expect(minAfter).toBeGreaterThan(minBefore);
});
