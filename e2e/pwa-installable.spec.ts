import { expect, test } from "@playwright/test";

const password = process.env.E2E_PASSWORD ?? "secret";
const projectName = process.env.E2E_PROJECT_NAME ?? "demo";

test("PWA manifest and service worker meet installability criteria", async ({ page }) => {
  await page.goto("/");

  // Manifest is linked and loadable
  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute("href");

  const manifestHref = await manifestLink.getAttribute("href");
  const manifestResponse = await page.request.get(manifestHref!);
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");

  const manifest = await manifestResponse.json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name).toBeTruthy();
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

  // At least one icon >= 192x192 PNG
  expect(
    manifest.icons.some((icon: { sizes: string; type: string }) => {
      const size = parseInt(icon.sizes.split("x")[0], 10);
      return size >= 192 && icon.type === "image/png";
    }),
  ).toBe(true);

  // Service worker is registered
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock console" }).click();
  // Desktop workbench renders the global project list as buttons in the left
  // panel (no "Projects" heading after the Phase 1 desktop shell rework);
  // gate on the project node being visible instead.
  await expect(page.getByRole("button", { name: projectName, exact: true })).toBeVisible();

  const swReg = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg
      ? { active: reg.active?.scriptURL ?? null, waiting: reg.waiting?.scriptURL ?? null }
      : null;
  });
  expect(swReg).not.toBeNull();
  expect(swReg!.active).toBeTruthy();
});
