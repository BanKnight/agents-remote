import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

/**
 * 拖动源泛化（设计 §7.2，2026-07-19）：文件树文件行拖到中栏 → onCardDragStart → dropIntoLeaf
 * + onDrop navigate 分支（WorkbenchRoute:524）→ 中栏 file tab + /file/$ URL。
 *
 * e2e file-nav spec 覆盖「单击 onSelect 开 tab」（pointerup 未超阈值路径）；本 spec 覆盖 e2e 未触达的
 * 「拖拽 onDrop」新路径：pointerdown → move > DRAG_THRESHOLD_PX(4) → onDragStart（dragState active，
 * DropZoneOverlay 显示）→ move 到 GroupCell data-drop-group 中心（center zone）→ up → onDrop →
 * dropIntoLeaf 加 tab + navigateToFile。验证 tab 数增加 + URL 切到被拖文件（onDrop navigate 分支生效，
 * 而非改前只进 layout 不更新 URL）。
 *
 * demo 项目根目录有 README.md + notes.txt 两文件：先单击 README.md 开首个 file tab（让中栏有
 * GroupCell data-drop-group 作 drop target），再拖 notes.txt 验证 drop。
 */
test("drag-source: 文件行拖到中栏 → onDrop 开 file tab + URL（dropIntoLeaf + navigate）", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();
  await page.getByRole("button", { name: projectName, exact: true }).click();
  await page
    .getByRole("navigation", { name: "Projects", exact: true })
    .getByRole("button", { name: "Files", exact: true })
    .click();

  const files = page.getByRole("complementary").nth(1).getByLabel("Project files");
  await expect(files).toBeVisible();
  await expect(files.getByRole("button", { name: /README\.md/ }).first()).toBeVisible();

  // 先单击 README.md → onSelect 开首个 file tab（中栏有 GroupCell data-drop-group 作 drop target）。
  await files
    .getByRole("button", { name: /README\.md/ })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}/file/README\\.md(\\?|$)`));
  const minBefore = await page.getByRole("button", { name: /^Minimize$/ }).count();

  // 拖 notes.txt：pointer sequence（down → move >4px 触发 onDragStart → move 到 GroupCell 中心 → up）。
  const notes = files.getByRole("button", { name: /notes\.txt/ }).first();
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

  // onDrop navigate 分支：URL 切到 notes.txt（改前只进 layout 不更新 URL）。
  await expect(page).toHaveURL(new RegExp(`/projects/${projectName}/file/notes\\.txt(\\?|$)`));
  // dropIntoLeaf 加 tab：Minimize 按钮数增加。
  const minAfter = await page.getByRole("button", { name: /^Minimize$/ }).count();
  expect(minAfter).toBeGreaterThan(minBefore);
});
