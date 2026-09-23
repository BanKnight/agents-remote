import { expect, test } from "@playwright/test";

/**
 * 拖动源泛化（设计 §7.2）：pointer sequence（down → move > DRAG_THRESHOLD_PX(4) → overlay
 * zone hit-test → up）→ onCardDragStart → DropZoneOverlay zone 高亮 → onDrop → dropIntoLeaf。
 *
 * §6.12k 适配（原「文件树文件行拖到中栏」场景死亡）：v2 桌面 GlobalFilesOverview 只在 mainPage
 * 渲染，与中栏 InstanceArea 二选一（WorkbenchRoute `desktopMainPage ?? instanceArea`）——文件树
 * 源与落点不再同屏；Inspector FilesPanel 不接拖源（只读检视语义）。§7.2 协议 e2e 改走仍同屏的
 * 中栏 tab 拖源：建两个 Terminal（单 tab 拖自身 leaf 边缘 = drop-to-self no-op，设计 §7.2）→
 * 拖第一个 tab 到 GroupCell 左 zone（15% 边带，垂直中部避开上下优先带）→ dropIntoLeaf split
 * → GroupCell 计数 +1。
 */

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("drag-source: tabstrip tab 拖到 GroupCell 左 zone → split（dropIntoLeaf）", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // 建 Terminal ×2（§6.12k 入口：side 实例组头 plus → ActionMenu → menuitem Terminal →
  // 可选名 prompt confirm；createTerminal onSuccess 直达会话 detail，两 tab 同 group）。
  await page.locator(`nav.side .srow2[title="${projectName}"]`).click();
  await page.getByRole("button", { name: "New session" }).click();
  await page.getByRole("menuitem", { name: "Terminal" }).click();
  // prompt「Create」限定 dialog（防撞 side "Create or adopt Project"，同 terminal-session）。
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator(".tabstrip .tb").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "New session" }).click();
  await page.getByRole("menuitem", { name: "Terminal" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  // 单 tab 拖自身 leaf 边缘 = drop-to-self no-op（设计 §7.2）→ 先建满 2 tab 再拖。
  await expect(page.locator(".tabstrip .tb")).toHaveCount(2);

  // 拖第一个 tab → GroupCell 左 zone（15% 边带、垂直中部避开上下优先带）→ split。
  const tab = page.locator(".tabstrip .tb").first();
  const sb = await tab.boundingBox();
  const gb = await page.locator("[data-drop-group]").first().boundingBox();
  if (!sb || !gb) throw new Error("拖拽源/落点 boundingBox 为 null");
  const sx = sb.x + sb.width / 2;
  const sy = sb.y + sb.height / 2;
  const tx = gb.x + gb.width * 0.05;
  const ty = gb.y + gb.height * 0.5;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + 8, sy); // > DRAG_THRESHOLD_PX(4) → onDragStart → dragState active
  await page.mouse.move(tx, ty, { steps: 6 }); // 左 zone → DropZoneOverlay left
  await page.mouse.up();

  // onDrop → dropIntoLeaf edge split：GroupCell 计数 1 → 2。
  await expect(page.locator("[data-drop-group]")).toHaveCount(2);
});
